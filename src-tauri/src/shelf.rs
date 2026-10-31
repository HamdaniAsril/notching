//! Titipan (design 1 Nov): files kept in the notch, by where they are on disk.
//! Memory only; the same shelf for every screen.

use std::path::{Path, PathBuf};

use base64::Engine;

/// Above this many items the status says "99+".
const STATUS_CAP: usize = 99;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemState {
    Ready,
    /// Being written into the Titipan folder (a file promise, or a file in the
    /// system's temporary folders); not draggable yet.
    Receiving,
    /// Its file was moved or deleted since it was kept: it can only be removed.
    Missing,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ShelfItem {
    pub id: u64,
    pub path: PathBuf,
    pub name: String,
    pub folder: bool,
    pub state: ItemState,
    /// A PNG preview: the Finder icon at first, then a Quick Look thumbnail.
    pub thumb: Option<Vec<u8>>,
}

/// What a drop hands the shelf.
#[derive(Clone, Debug, PartialEq)]
pub struct NewItem {
    pub path: PathBuf,
    pub folder: bool,
    pub receiving: bool,
}

/// Same shape as ShelfState in src/bridge.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfDto {
    pub items: Vec<ShelfItemDto>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItemDto {
    pub id: u64,
    pub name: String,
    pub folder: bool,
    pub state: ItemState,
    /// A data URL, ready for an <img>.
    pub thumb: Option<String>,
}

#[derive(Debug, Default)]
pub struct Shelf {
    items: Vec<ShelfItem>,
    next_id: u64,
}

fn name_of(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned())
}

impl Shelf {
    /// Keeps the new paths, newest last; a path already kept stays where it is.
    /// Returns the ids of the items it added.
    pub fn add(&mut self, entries: Vec<NewItem>) -> Vec<u64> {
        let mut added = Vec::new();
        for e in entries {
            if self.items.iter().any(|i| i.path == e.path) {
                continue;
            }
            self.next_id += 1;
            let state = if e.receiving { ItemState::Receiving } else { ItemState::Ready };
            self.items.push(ShelfItem {
                id: self.next_id,
                name: name_of(&e.path),
                path: e.path,
                folder: e.folder,
                state,
                thumb: None,
            });
            added.push(self.next_id);
        }
        added
    }

    pub fn remove(&mut self, ids: &[u64]) -> bool {
        let before = self.items.len();
        self.items.retain(|i| !ids.contains(&i.id));
        self.items.len() != before
    }

    pub fn clear(&mut self) -> bool {
        let had = !self.items.is_empty();
        self.items.clear();
        had
    }

    /// Ready items whose file is gone become Missing, and back again if it returns.
    pub fn refresh(&mut self, exists: impl Fn(&Path) -> bool) -> bool {
        let mut changed = false;
        for i in &mut self.items {
            let next = match i.state {
                ItemState::Receiving => continue,
                _ if exists(&i.path) => ItemState::Ready,
                _ => ItemState::Missing,
            };
            changed |= next != i.state;
            i.state = next;
        }
        changed
    }

    pub fn set_thumb(&mut self, id: u64, png: Vec<u8>) -> bool {
        match self.items.iter_mut().find(|i| i.id == id) {
            Some(i) => {
                i.thumb = Some(png);
                true
            }
            None => false,
        }
    }

    /// A receiving item is written: it becomes Ready at `path`. None: the copy
    /// failed, and the item goes.
    pub fn received(&mut self, id: u64, path: Option<PathBuf>) -> bool {
        let Some(pos) = self.items.iter().position(|i| i.id == id) else { return false };
        match path {
            Some(path) => {
                let i = &mut self.items[pos];
                i.name = name_of(&path);
                i.path = path;
                i.state = ItemState::Ready;
            }
            None => {
                self.items.remove(pos);
            }
        }
        true
    }

    /// The items that can be dragged out: Ready ones, in shelf order.
    pub fn get(&self, ids: &[u64]) -> Vec<&ShelfItem> {
        self.items.iter().filter(|i| ids.contains(&i.id) && i.state == ItemState::Ready).collect()
    }

    pub fn item(&self, id: u64) -> Option<&ShelfItem> {
        self.items.iter().find(|i| i.id == id)
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn status_text(&self) -> Option<String> {
        match self.items.len() {
            0 => None,
            n if n > STATUS_CAP => Some(format!("{STATUS_CAP}+")),
            n => Some(n.to_string()),
        }
    }

    pub fn dto(&self) -> ShelfDto {
        let b64 = base64::engine::general_purpose::STANDARD;
        ShelfDto {
            items: self
                .items
                .iter()
                .map(|i| ShelfItemDto {
                    id: i.id,
                    name: i.name.clone(),
                    folder: i.folder,
                    state: i.state,
                    thumb: i.thumb.as_ref().map(|png| format!("data:image/png;base64,{}", b64.encode(png))),
                })
                .collect(),
        }
    }
}

/// Files in the system's temporary folders (a screenshot's corner thumbnail, for
/// one) are moved away by their owner soon after: the shelf keeps a copy instead.
pub fn needs_copy(path: &Path) -> bool {
    path.starts_with("/private/var/folders") || path.starts_with("/var/folders")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(p: &str) -> NewItem {
        NewItem { path: p.into(), folder: false, receiving: false }
    }

    fn names(s: &Shelf) -> Vec<String> {
        s.dto().items.into_iter().map(|i| i.name).collect()
    }

    #[test]
    fn add_skips_known_paths() {
        let mut s = Shelf::default();
        assert_eq!(s.add(vec![file("/u/a.txt"), file("/u/b.txt")]), vec![1, 2]);
        assert_eq!(s.add(vec![file("/u/a.txt"), file("/u/c.txt")]), vec![3]);
        assert_eq!(names(&s), ["a.txt", "b.txt", "c.txt"]);
        assert_eq!(s.len(), 3);
    }

    #[test]
    fn remove_and_clear() {
        let mut s = Shelf::default();
        s.add(vec![file("/u/a"), file("/u/b"), file("/u/c")]);
        assert!(s.remove(&[2]));
        assert!(!s.remove(&[2]));
        assert_eq!(names(&s), ["a", "c"]);
        // Ids are never reused.
        assert_eq!(s.add(vec![file("/u/b")]), vec![4]);
        assert!(s.clear());
        assert!(!s.clear());
        assert_eq!(s.len(), 0);
    }

    #[test]
    fn refresh_marks_missing() {
        let mut s = Shelf::default();
        s.add(vec![file("/u/a"), file("/u/b"), NewItem { path: "/t/c".into(), folder: false, receiving: true }]);
        assert!(s.refresh(|p| p != Path::new("/u/a")));
        let states: Vec<ItemState> = s.dto().items.into_iter().map(|i| i.state).collect();
        assert_eq!(states, [ItemState::Missing, ItemState::Ready, ItemState::Receiving]);
        assert!(!s.refresh(|p| p != Path::new("/u/a")));
        assert!(s.refresh(|_| true));
        assert_eq!(s.dto().items[0].state, ItemState::Ready);
        assert_eq!(s.dto().items[2].state, ItemState::Receiving);
    }

    #[test]
    fn received_promotes_or_drops() {
        let mut s = Shelf::default();
        s.add(vec![
            NewItem { path: "/t/Photo".into(), folder: false, receiving: true },
            NewItem { path: "/t/Mail".into(), folder: false, receiving: true },
        ]);
        assert!(s.received(1, Some("/c/titipan/1/IMG_1.heic".into())));
        assert!(s.received(2, None));
        assert!(!s.received(9, None));
        let items = s.dto().items;
        assert_eq!(items.len(), 1);
        assert_eq!((items[0].name.as_str(), items[0].state), ("IMG_1.heic", ItemState::Ready));
        assert_eq!(s.get(&[1])[0].path, PathBuf::from("/c/titipan/1/IMG_1.heic"));
    }

    #[test]
    fn get_returns_ready_only() {
        let mut s = Shelf::default();
        s.add(vec![file("/u/a"), file("/u/b"), NewItem { path: "/t/c".into(), folder: false, receiving: true }]);
        s.refresh(|p| p != Path::new("/u/b"));
        let ids: Vec<u64> = s.get(&[1, 2, 3]).into_iter().map(|i| i.id).collect();
        assert_eq!(ids, [1]);
    }

    #[test]
    fn status_text() {
        let mut s = Shelf::default();
        assert_eq!(s.status_text(), None);
        s.add(vec![file("/a"), file("/b"), file("/c")]);
        assert_eq!(s.status_text().as_deref(), Some("3"));
        s.add((0..97).map(|i| file(&format!("/n{i}"))).collect());
        assert_eq!(s.status_text().as_deref(), Some("99+"));
    }

    #[test]
    fn dto_thumb_is_a_data_url() {
        let mut s = Shelf::default();
        s.add(vec![file("/u/a.png")]);
        assert_eq!(s.dto().items[0].thumb, None);
        assert!(s.set_thumb(1, vec![1, 2, 3]));
        assert!(!s.set_thumb(7, vec![]));
        assert_eq!(s.dto().items[0].thumb.as_deref(), Some("data:image/png;base64,AQID"));
        let json = serde_json::to_value(s.dto()).unwrap();
        assert_eq!(json["items"][0]["state"], "ready");
    }

    #[test]
    fn needs_copy_for_system_temp_only() {
        assert!(needs_copy(Path::new("/private/var/folders/x/T/a.png")));
        assert!(needs_copy(Path::new("/var/folders/x/a.png")));
        assert!(!needs_copy(Path::new("/Users/u/Desktop/a.png")));
        assert!(!needs_copy(Path::new("/private/var/foldersX/a.png")));
    }

    #[test]
    fn name_is_the_last_component() {
        let mut s = Shelf::default();
        s.add(vec![NewItem { path: "/Users/u/Desain".into(), folder: true, receiving: false }, file("/Users/u/laporan.pdf")]);
        let items = s.dto().items;
        assert_eq!((items[0].name.as_str(), items[0].folder), ("Desain", true));
        assert_eq!(items[1].name, "laporan.pdf");
    }
}
