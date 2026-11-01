// Cleaner's removals (design 1 Nov §5.3–§5.4, §7, §8). Every item is checked
// again just before it goes, then removed for good or moved to the Trash, and
// every outcome is written to the log. The Trash is a trait so tests never touch
// the real one.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::cleaner_rules::{check, log_line, Category, Exclusions, Method, Purpose, Roots, Skip};
use crate::cleaner_scan::{du, ident, Item};

pub trait Trash {
    fn trash(&self, p: &Path) -> Result<(), String>;
}

#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub id: u64,
    pub result: Result<u64, Skip>,
    pub detail: Option<String>,
}

/// The scan-time judgement, again (§7): same rules, same file (device and
/// inode; for the Trash route also its date), and its owner not running.
pub fn recheck(item: &Item, purpose: &Purpose, roots: &Roots, excluded: &Exclusions, running: &dyn Fn(&str) -> bool) -> Result<(), Skip> {
    check(&item.path, item.category, purpose, roots, excluded)?;
    let (Some(then), Some(now)) = (item.ident, ident(&item.path)) else { return Err(Skip::Changed) };
    if then.dev != now.dev || then.ino != now.ino || (item.method == Method::Trash && then.mtime_ms != now.mtime_ms) {
        return Err(Skip::Changed);
    }
    if item.owner.as_deref().is_some_and(|o| !o.is_empty() && running(o)) {
        return Err(Skip::InUse);
    }
    Ok(())
}

/// Removes one item; returns the bytes freed. A folder removed for good keeps
/// itself and loses its contents; a link is removed as a link.
pub fn remove_one(item: &Item, trash: &dyn Trash) -> Result<u64, (Skip, Option<String>)> {
    let never = AtomicBool::new(false);
    let before = du(&item.path, &never);
    if item.method == Method::Trash {
        trash.trash(&item.path).map_err(|e| (Skip::Failed, Some(e)))?;
        return Ok(before);
    }
    let meta = fs::symlink_metadata(&item.path).map_err(|e| (Skip::Failed, Some(e.to_string())))?;
    if !meta.is_dir() {
        fs::remove_file(&item.path).map_err(|e| (Skip::Failed, Some(e.to_string())))?;
        return Ok(before);
    }
    let entries = fs::read_dir(&item.path).map_err(|e| (Skip::Failed, Some(e.to_string())))?;
    let mut error = None;
    for e in entries.flatten() {
        let path = e.path();
        // `file_type` does not follow links; remove_dir_all never does either.
        let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let result = if is_dir { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
        if let Err(err) = result {
            error = Some(err.to_string());
        }
    }
    let freed = before.saturating_sub(du(&item.path, &never));
    match error {
        Some(e) if freed == 0 => Err((Skip::Failed, Some(e))),
        _ => Ok(freed),
    }
}

pub struct RunCtx<'a> {
    pub roots: &'a Roots,
    pub excluded: &'a Exclusions,
    pub running: &'a dyn Fn(&str) -> bool,
    pub trash: &'a dyn Trash,
    pub other_copy: &'a dyn Fn() -> bool,
    pub stop: &'a AtomicBool,
    pub log: &'a mut dyn FnMut(String),
    pub now: &'a dyn Fn() -> String,
}

/// Removes the items in order (for an uninstall, the app first), stopping
/// before the next item once `stop` is set. Every item gets a log line.
pub fn run(items: &[Item], purpose: &Purpose, ctx: RunCtx, mut on_each: impl FnMut(usize, &Outcome)) -> Vec<Outcome> {
    let mut ordered: Vec<&Item> = items.iter().collect();
    ordered.sort_by_key(|i| i.category != Category::App);
    let mut outcomes = Vec::with_capacity(ordered.len());
    // Set once the app is gone and a second copy shows up, or the app stayed.
    let mut halt: Option<Skip> = None;
    for (index, item) in ordered.into_iter().enumerate() {
        let (result, detail) = if ctx.stop.load(Ordering::Relaxed) {
            (Err(Skip::Stopped), None)
        } else if let Some(skip) = halt {
            (Err(skip), None)
        } else {
            match recheck(item, purpose, ctx.roots, ctx.excluded, ctx.running) {
                Err(skip) => (Err(skip), None),
                Ok(()) => match remove_one(item, ctx.trash) {
                    Ok(bytes) => (Ok(bytes), None),
                    Err((skip, detail)) => (Err(skip), detail),
                },
            }
        };
        if item.category == Category::App && matches!(purpose, Purpose::Uninstall { .. }) {
            halt = match result {
                Ok(_) if (ctx.other_copy)() => Some(Skip::Protected),
                Ok(_) => None,
                Err(_) => Some(Skip::Failed),
            };
        }
        let bytes = *result.as_ref().unwrap_or(&0);
        (ctx.log)(log_line(&(ctx.now)(), ctx.roots.test_mode, item.category, item.method, result.map(|_| ()), bytes, &item.path));
        let outcome = Outcome { id: item.id, result, detail };
        on_each(index, &outcome);
        outcomes.push(outcome);
    }
    outcomes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cleaner_rules::{method, Category};
    use crate::cleaner_scan::ident;
    use std::cell::RefCell;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::Ordering;

    struct FakeTrash {
        dir: PathBuf,
        fail: bool,
        moved: RefCell<Vec<PathBuf>>,
    }

    impl Trash for FakeTrash {
        fn trash(&self, p: &Path) -> Result<(), String> {
            if self.fail {
                return Err("admin".into());
            }
            fs::create_dir_all(&self.dir).unwrap();
            fs::rename(p, self.dir.join(p.file_name().unwrap())).map_err(|e| e.to_string())?;
            self.moved.borrow_mut().push(p.to_path_buf());
            Ok(())
        }
    }

    struct T {
        _d: tempfile::TempDir,
        roots: Roots,
        trash: FakeTrash,
    }

    fn sample() -> T {
        let d = tempfile::tempdir().unwrap();
        let roots = Roots::test(d.path());
        fs::create_dir_all(&roots.apps[0]).unwrap();
        let trash = FakeTrash { dir: d.path().join("fake-trash"), fail: false, moved: RefCell::new(vec![]) };
        T { _d: d, roots, trash }
    }

    fn file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![1u8; bytes]).unwrap();
    }

    fn item(id: u64, path: PathBuf, cat: Category, owner: Option<&str>) -> Item {
        Item {
            id,
            category: cat,
            label: String::new(),
            detail: None,
            ident: ident(&path),
            path,
            bytes: 0,
            method: method(cat),
            ticked: true,
            in_use: false,
            confidence: None,
            owner: owner.map(str::to_string),
        }
    }

    fn go(t: &T, items: &[Item], purpose: &Purpose, stop_after: Option<usize>, other_copy: bool) -> (Vec<Outcome>, Vec<String>) {
        let stop = AtomicBool::new(false);
        let mut lines = Vec::new();
        let mut log = |l: String| lines.push(l);
        let ctx = RunCtx {
            roots: &t.roots,
            excluded: &Exclusions::default(),
            running: &|_| false,
            trash: &t.trash,
            other_copy: &|| other_copy,
            stop: &stop,
            log: &mut log,
            now: &|| "T".to_string(),
        };
        let out = run(items, purpose, ctx, |i, _| {
            if Some(i) == stop_after {
                stop.store(true, Ordering::Relaxed);
            }
        });
        (out, lines)
    }

    #[test]
    fn permanent_dir_keeps_folder_empties_contents() {
        let t = sample();
        let c = t.roots.home.join("Library/Caches/com.x.y");
        file(&c.join("a/b.bin"), 10_000);
        file(&c.join("top.bin"), 10_000);
        let (out, _) = go(&t, &[item(1, c.clone(), Category::AppCache, None)], &Purpose::Clean, None, false);
        assert!(matches!(out[0].result, Ok(b) if b >= 20_000));
        assert!(c.is_dir());
        assert_eq!(fs::read_dir(&c).unwrap().count(), 0);
    }

    #[test]
    fn remove_contents_keeps_link_target() {
        let t = sample();
        let doc = t.roots.home.join("Documents/penting.txt");
        file(&doc, 100);
        let c = t.roots.home.join("Library/Caches/com.x.y");
        fs::create_dir_all(&c).unwrap();
        std::os::unix::fs::symlink(&doc, c.join("tautan")).unwrap();
        std::os::unix::fs::symlink(t.roots.home.join("Documents"), c.join("folder")).unwrap();
        go(&t, &[item(1, c.clone(), Category::AppCache, None)], &Purpose::Clean, None, false);
        assert_eq!(fs::read(&doc).unwrap().len(), 100);
        assert!(!c.join("tautan").exists() && fs::symlink_metadata(c.join("tautan")).is_err());
    }

    #[test]
    fn replaced_item_is_skipped() {
        let t = sample();
        let c = t.roots.home.join("Library/Caches/com.x.y");
        file(&c.join("old"), 10);
        let it = item(1, c.clone(), Category::AppCache, None);
        fs::remove_dir_all(&c).unwrap();
        file(&c.join("new"), 10);
        let (out, lines) = go(&t, &[it], &Purpose::Clean, None, false);
        assert_eq!(out[0].result, Err(Skip::Changed));
        assert!(c.join("new").exists());
        assert!(lines[0].contains("skip:changed"));
    }

    #[test]
    fn trash_route_uses_trash_and_failure_keeps_item() {
        let mut t = sample();
        let dmg = t.roots.home.join("Downloads/a.dmg");
        file(&dmg, 10);
        let (out, _) = go(&t, &[item(1, dmg.clone(), Category::Installer, None)], &Purpose::Clean, None, false);
        assert!(out[0].result.is_ok());
        assert_eq!(t.trash.moved.borrow().as_slice(), &[dmg.clone()]);
        file(&dmg, 10);
        t.trash.fail = true;
        let (out, _) = go(&t, &[item(2, dmg.clone(), Category::Installer, None)], &Purpose::Clean, None, false);
        assert_eq!(out[0].result, Err(Skip::Failed));
        assert_eq!(out[0].detail.as_deref(), Some("admin"));
        assert!(dmg.exists());
    }

    #[test]
    fn stop_flag_halts_after_current() {
        let t = sample();
        let a = t.roots.home.join("Library/Caches/com.a.a");
        let b = t.roots.home.join("Library/Caches/com.b.b");
        file(&a.join("x"), 10);
        file(&b.join("x"), 10);
        let items = [item(1, a.clone(), Category::AppCache, None), item(2, b.clone(), Category::AppCache, None)];
        let (out, lines) = go(&t, &items, &Purpose::Clean, Some(0), false);
        assert!(out[0].result.is_ok());
        assert_eq!(out[1].result, Err(Skip::Stopped));
        assert!(b.join("x").exists());
        assert_eq!(lines.len(), 2);
        assert!(lines[1].contains("skip:stopped"));
    }

    #[test]
    fn every_item_is_logged() {
        let t = sample();
        let a = t.roots.home.join("Library/Caches/com.a.a");
        file(&a.join("x"), 10);
        let bad = item(2, t.roots.home.join("Documents"), Category::AppCache, None);
        let (_, lines) = go(&t, &[item(1, a, Category::AppCache, None), bad], &Purpose::Clean, None, false);
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("T\tcoba\tappCache\tpermanent\tok\t"));
        assert!(lines[1].contains("skip:protected"));
    }

    #[test]
    fn excluded_after_scan_is_skipped() {
        let t = sample();
        let a = t.roots.home.join("Library/Caches/com.a.a");
        file(&a.join("x"), 10);
        let it = item(1, a.clone(), Category::AppCache, None);
        let ex = Exclusions { paths: vec![a.clone()] };
        assert_eq!(recheck(&it, &Purpose::Clean, &t.roots, &ex, &|_| false), Err(Skip::Excluded));
        assert_eq!(recheck(&it, &Purpose::Clean, &t.roots, &Exclusions::default(), &|n| n == "com.a.a"), Ok(()));
        let owned = item(1, a, Category::AppCache, Some("com.a.a"));
        assert_eq!(recheck(&owned, &Purpose::Clean, &t.roots, &Exclusions::default(), &|n| n == "com.a.a"), Err(Skip::InUse));
    }

    #[test]
    fn uninstall_moves_app_first_and_stops_on_a_second_copy() {
        let t = sample();
        let app = t.roots.apps[0].join("Coba.app");
        file(&app.join("Contents/Info.plist"), 10);
        let pref = t.roots.home.join("Library/Preferences/id.coba.app.plist");
        file(&pref, 10);
        let purpose = Purpose::Uninstall { bundle_id: "id.coba.app", app: &app };
        let items = [item(2, pref.clone(), Category::Leftover, None), item(1, app.clone(), Category::App, Some("id.coba.app"))];
        let (out, _) = go(&t, &items, &purpose, None, true);
        assert_eq!(out[0].id, 1);
        assert!(out[0].result.is_ok());
        assert_eq!(out[1].result, Err(Skip::Protected));
        assert!(pref.exists());
    }

    #[test]
    fn uninstall_keeps_leftovers_when_the_app_stays() {
        let mut t = sample();
        t.trash.fail = true;
        let app = t.roots.apps[0].join("Coba.app");
        file(&app.join("Contents/Info.plist"), 10);
        let pref = t.roots.home.join("Library/Preferences/id.coba.app.plist");
        file(&pref, 10);
        let purpose = Purpose::Uninstall { bundle_id: "id.coba.app", app: &app };
        let items = [item(1, app.clone(), Category::App, None), item(2, pref.clone(), Category::Leftover, None)];
        let (out, _) = go(&t, &items, &purpose, None, false);
        assert_eq!(out[0].result, Err(Skip::Failed));
        assert_eq!(out[1].result, Err(Skip::Failed));
        assert!(pref.exists() && app.exists());
    }
}
