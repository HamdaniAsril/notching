//! Titipan's native side (design 1 Nov): the one shelf every overlay shows, its
//! status beside the notch, previews, and the Titipan folder that holds files
//! the shelf had to receive rather than point at.

use std::ffi::OsStr;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::AllocAnyThread;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage, NSWorkspace};

use objc2_core_graphics::CGImage;
use objc2_foundation::{NSDictionary, NSError, NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_quick_look_thumbnailing::{
    QLThumbnailGenerationRequest, QLThumbnailGenerationRequestRepresentationTypes, QLThumbnailGenerator,
    QLThumbnailRepresentation,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::app_core::CoreState;
use crate::shelf::{needs_copy, ItemState, NewItem, Shelf, ShelfDto};
use crate::status::{self, Activity};

pub const MODULE_ID: &str = "shelf";
/// Broadcast to every window with a ShelfDto after each change.
pub const SHELF_EVENT: &str = "notching://shelf";
/// Previews are asked for at this size in points, at 2× scale.
const THUMB_PT: f64 = 64.0;

pub struct ShelfState(pub Mutex<Shelf>);

/// True while a drag out of the shelf runs (shelf_drag.rs), so the notch does
/// not take that drag for a new drop.
pub static DRAG_OUT: AtomicBool = AtomicBool::new(false);

static CACHE_ROOT: OnceLock<PathBuf> = OnceLock::new();
// Changes come in bursts (an icon, then a preview, for every file dropped): the
// windows hear about them at most once per COALESCE.
static PENDING: Coalesce = Coalesce::new();
const COALESCE: std::time::Duration = std::time::Duration::from_millis(60);
// The count last shown beside the notch.
static STATUS_SHOWN: Mutex<Option<String>> = Mutex::new(None);

/// One flag: the first request asks the caller to schedule the work, the rest
/// wait until it is taken.
#[derive(Default)]
pub struct Coalesce(AtomicBool);

impl Coalesce {
    pub const fn new() -> Self {
        Coalesce(AtomicBool::new(false))
    }

    pub fn request(&self) -> bool {
        !self.0.swap(true, Ordering::SeqCst)
    }

    pub fn taken(&self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

pub fn status_changes(last: &Option<String>, next: &Option<String>) -> bool {
    last != next
}
static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

/// `<app cache>/titipan`: the only place the shelf writes to.
pub fn cache_root(cache_dir: &Path) -> PathBuf {
    cache_dir.join("titipan")
}

/// Where a received file goes: a folder of its own, so two files with one name
/// never meet.
pub fn copy_target(root: &Path, n: u64, name: &OsStr) -> PathBuf {
    root.join(n.to_string()).join(name)
}

pub fn empty_cache(root: &Path) -> io::Result<()> {
    match std::fs::remove_dir_all(root) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

fn copy_all(from: &Path, to: &Path) -> io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_all(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(from, to).map(|_| ())
    }
}

/// The shelf module switched off or removed empties the shelf.
pub fn on_module_gone(shelf: &mut Shelf, id: &str) -> bool {
    id == MODULE_ID && shelf.clear()
}

fn root() -> PathBuf {
    CACHE_ROOT.get().cloned().unwrap_or_else(|| std::env::temp_dir().join("notching-titipan"))
}

fn next_dir() -> u64 {
    NEXT_DIR.fetch_add(1, Ordering::Relaxed)
}

/// A fresh folder in the Titipan folder for one received file.
pub fn receive_dir() -> PathBuf {
    root().join(next_dir().to_string())
}

/// The shelf module is installed and switched on.
pub fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

/// Tells every window, and sets or clears the count beside the notch, once for
/// a burst of changes.
fn changed(app: &AppHandle) {
    if !PENDING.request() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(COALESCE);
        PENDING.taken();
        publish(&app);
    });
}

fn publish(app: &AppHandle) {
    let (dto, text) = {
        let shelf = app.state::<ShelfState>();
        let shelf = shelf.0.lock().unwrap();
        (shelf.dto(), shelf.status_text())
    };
    let _ = app.emit(SHELF_EVENT, dto);
    {
        let mut shown = STATUS_SHOWN.lock().unwrap();
        if !status_changes(&shown, &text) {
            return;
        }
        shown.clone_from(&text);
    }
    match text {
        Some(text) => {
            if let Err(e) = status::set(app, MODULE_ID, Activity::Running, Some(&text)) {
                eprintln!("notching: shelf status: {e}");
            }
        }
        None => status::clear(app, MODULE_ID),
    }
}

fn update(app: &AppHandle, f: impl FnOnce(&mut Shelf) -> bool) {
    let did = f(&mut app.state::<ShelfState>().0.lock().unwrap());
    if did {
        changed(app);
    }
}

/// Keeps dropped files. Files in the system's temporary folders are copied into
/// the Titipan folder first; every new item gets the Finder icon at once and a
/// Quick Look preview when one comes.
pub fn add_paths(app: &AppHandle, entries: Vec<NewItem>) -> Vec<u64> {
    let entries: Vec<NewItem> = entries
        .into_iter()
        .map(|e| NewItem { receiving: e.receiving || needs_copy(&e.path), ..e })
        .collect();
    let (ids, copies, previews) = {
        let shelf = app.state::<ShelfState>();
        let mut shelf = shelf.0.lock().unwrap();
        let ids = shelf.add(entries);
        let mut copies = Vec::new();
        let mut previews = Vec::new();
        for item in ids.iter().filter_map(|id| shelf.item(*id)) {
            match item.state {
                ItemState::Receiving if needs_copy(&item.path) => copies.push((item.id, item.path.clone())),
                ItemState::Receiving => {} // a promise: previewed once received
                _ => previews.push((item.id, item.path.clone())),
            }
        }
        (ids, copies, previews)
    };
    for (id, from) in copies {
        let app = app.clone();
        std::thread::spawn(move || {
            let to = copy_target(&root(), next_dir(), from.file_name().unwrap_or(OsStr::new("file")));
            let done = copy_all(&from, &to).map(|_| to);
            if let Err(e) = &done {
                eprintln!("notching: shelf copy {}: {e}", from.display());
            }
            received(&app, id, done.ok());
        });
    }
    preview(app, previews);
    changed(app);
    // One line per drop, so a check on the Mac can be matched against the log.
    eprintln!("notching: shelf kept {} new item(s)", ids.len());
    ids
}

/// A receiving item's file is written (Some), or could not be (None).
pub fn received(app: &AppHandle, id: u64, path: Option<PathBuf>) {
    update(app, |s| s.received(id, path.clone()));
    if let Some(path) = path {
        preview(app, vec![(id, path)]);
    }
}

fn set_thumb(app: &AppHandle, id: u64, png: Vec<u8>) {
    update(app, |s| s.set_thumb(id, png));
}

// The Finder icon now, on the main thread; the Quick Look thumbnail later.
fn preview(app: &AppHandle, items: Vec<(u64, PathBuf)>) {
    if items.is_empty() {
        return;
    }
    // Queued, never run inside a drop: on the main thread run_on_main_thread runs
    // at once, and a drop of many files would hold AppKit up.
    let handle = app.clone();
    std::thread::spawn(move || {
        let app = handle.clone();
        let _ = app.run_on_main_thread(move || preview_now(&handle, items));
    });
}

fn preview_now(app: &AppHandle, items: Vec<(u64, PathBuf)>) {
    for (id, path) in items {
        let icon = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(&path.to_string_lossy()));
        if let Some(png) = image_png(&icon) {
            set_thumb(app, id, png);
        }
        quick_look(app, id, &path);
    }
}

fn quick_look(app: &AppHandle, id: u64, path: &Path) {
    let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
    let request = unsafe {
        QLThumbnailGenerationRequest::initWithFileAtURL_size_scale_representationTypes(
            QLThumbnailGenerationRequest::alloc(),
            &url,
            NSSize::new(THUMB_PT, THUMB_PT),
            2.0,
            QLThumbnailGenerationRequestRepresentationTypes::Thumbnail,
        )
    };
    let app = app.clone();
    let done = RcBlock::new(move |rep: *mut QLThumbnailRepresentation, _err: *mut NSError| {
        // SAFETY: Quick Look hands a valid representation or nil.
        let Some(rep) = (unsafe { rep.as_ref() }) else { return };
        let cg = unsafe { rep.CGImage() };
        if let Some(png) = cg_png(&cg) {
            set_thumb(&app, id, png);
        }
    });
    unsafe { QLThumbnailGenerator::sharedGenerator().generateBestRepresentationForRequest_completionHandler(&request, &done) };
}

/// An NSImage as a PNG of about 128 px.
pub fn image_png(image: &NSImage) -> Option<Vec<u8>> {
    let side = THUMB_PT * 2.0;
    let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(side, side));
    let cg = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
    cg_png(&cg)
}

pub(crate) fn cg_png(cg: &CGImage) -> Option<Vec<u8>> {
    let rep: Retained<NSBitmapImageRep> = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), cg);
    let data = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()) }?;
    Some(data.to_vec())
}

pub fn module_gone(app: &AppHandle, id: &str) {
    update(app, |s| on_module_gone(s, id));
}

/// An empty Titipan folder at start: anything there is from a run that ended.
pub fn start(app: &AppHandle) {
    let Ok(dir) = app.path().app_cache_dir() else { return };
    let root = cache_root(&dir);
    if let Err(e) = empty_cache(&root) {
        eprintln!("notching: shelf cache: {e}");
    }
    let _ = CACHE_ROOT.set(root);
}

pub fn quitting(_app: &AppHandle) {
    if let Some(root) = CACHE_ROOT.get() {
        let _ = empty_cache(root);
    }
}

/// Marks items whose file is gone, and back.
pub fn refresh(app: &AppHandle) {
    update(app, |s| s.refresh(|p| p.exists()));
}

/// The shelf for the notch; `refresh` first checks that every file is still there.
#[tauri::command]
pub fn shelf_state(app: AppHandle, refresh: bool) -> ShelfDto {
    if refresh {
        self::refresh(&app);
    }
    app.state::<ShelfState>().0.lock().unwrap().dto()
}

#[tauri::command]
pub fn shelf_remove(app: AppHandle, ids: Vec<u64>) {
    update(&app, |s| s.remove(&ids));
}

#[tauri::command]
pub fn shelf_clear(app: AppHandle) {
    update(&app, |s| s.clear());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copy_target_keeps_the_name() {
        let root = Path::new("/c/titipan");
        assert_eq!(copy_target(root, 3, OsStr::new("a.png")), PathBuf::from("/c/titipan/3/a.png"));
    }

    #[test]
    fn empty_cache_dir_removes_only_titipan() {
        let dir = tempfile::tempdir().unwrap();
        let root = cache_root(dir.path());
        std::fs::create_dir_all(root.join("1")).unwrap();
        std::fs::write(root.join("1/a.png"), b"x").unwrap();
        std::fs::write(dir.path().join("keep.txt"), b"y").unwrap();
        empty_cache(&root).unwrap();
        assert!(!root.exists());
        assert!(dir.path().join("keep.txt").exists());
        // Already gone is fine.
        empty_cache(&root).unwrap();
    }

    #[test]
    fn copy_all_copies_folders_whole() {
        let dir = tempfile::tempdir().unwrap();
        let from = dir.path().join("Desain");
        std::fs::create_dir_all(from.join("sub")).unwrap();
        std::fs::write(from.join("sub/b.txt"), b"isi").unwrap();
        let to = dir.path().join("out/Desain");
        copy_all(&from, &to).unwrap();
        assert_eq!(std::fs::read(to.join("sub/b.txt")).unwrap(), b"isi");
        assert!(from.join("sub/b.txt").exists());
    }

    #[test]
    fn coalesce_asks_once_until_taken() {
        let c = Coalesce::default();
        assert!(c.request());
        assert!(!c.request());
        c.taken();
        assert!(c.request());
    }

    #[test]
    fn status_is_sent_only_when_the_count_changes() {
        assert!(status_changes(&None, &Some("1".into())));
        assert!(!status_changes(&Some("3".into()), &Some("3".into())));
        assert!(status_changes(&Some("3".into()), &None));
        assert!(!status_changes(&None, &None));
    }

    #[test]
    fn module_gone_empties_shelf() {
        let mut s = Shelf::default();
        s.add(vec![NewItem { path: "/u/a".into(), folder: false, receiving: false }]);
        assert!(!on_module_gone(&mut s, "timer"));
        assert_eq!(s.len(), 1);
        assert!(on_module_gone(&mut s, MODULE_ID));
        assert_eq!(s.len(), 0);
    }
}
