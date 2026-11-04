//! Potong file's rules (design 4 Nov, alat latar §4): which presses matter, when
//! a ⌘V is ours, how many files moved, and the notices' words. Free of AppKit.

use std::path::{Path, PathBuf};

use crate::locale::Lang;

const KEY_X: i64 = 7;
const KEY_V: i64 = 9;
// kCGEventFlagMask*: only these four count; caps lock, fn and the rest don't.
const SHIFT: u64 = 0x0002_0000;
const CONTROL: u64 = 0x0004_0000;
const OPTION: u64 = 0x0008_0000;
const COMMAND: u64 = 0x0010_0000;
const MODS: u64 = SHIFT | CONTROL | OPTION | COMMAND;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Press {
    Cut,
    Paste,
    Other,
}

/// ⌘X and ⌘V with ⌘ alone; anything else is not Potong file's. The key is told
/// by the character it types (`ch`), so Dvorak's X and V count wherever they
/// sit; only an event without a character falls back to the QWERTY places.
pub fn classify(ch: Option<char>, keycode: i64, flags: u64) -> Press {
    if flags & MODS != COMMAND {
        return Press::Other;
    }
    match ch.map(|c| c.to_ascii_lowercase()) {
        Some('x') => Press::Cut,
        Some('v') => Press::Paste,
        Some(_) => Press::Other,
        None => match keycode {
            KEY_X => Press::Cut,
            KEY_V => Press::Paste,
            _ => Press::Other,
        },
    }
}

/// Whether the clipboard took Finder's copy: it changed since `before`, and it
/// holds files.
pub fn copied(before: isize, now: isize, files: usize) -> bool {
    now != before && files > 0
}

/// Whether the focused element is one to type into. An element Finder could
/// not name (`Err`, a timeout) counts as typing, so the key stays as it was;
/// nothing focused at all (the desktop) does not.
pub fn typing(role: Result<Option<String>, ()>) -> bool {
    match role {
        Ok(Some(r)) => is_text_role(&r),
        Ok(None) => false,
        Err(()) => true,
    }
}

/// A focused element one types into: there ⌘X and ⌘V stay as they are, so
/// renaming a file or searching still cuts and pastes text.
pub fn is_text_role(role: &str) -> bool {
    matches!(role, "AXTextField" | "AXTextArea" | "AXComboBox" | "AXSearchField")
}

/// Files waiting to be moved: their paths, and the clipboard's change count
/// right after Finder copied them.
#[derive(Clone, Debug, PartialEq)]
pub struct Cut {
    pub paths: Vec<PathBuf>,
    pub change: isize,
}

/// A ⌘V moves the cut files only while the clipboard still holds them.
pub fn paste_is_ours(cut: Option<&Cut>, change_now: isize) -> bool {
    cut.is_some_and(|c| c.change == change_now && !c.paths.is_empty())
}

/// How many of the cut files are no longer where they were.
pub fn moved(paths: &[PathBuf], exists: impl Fn(&Path) -> bool) -> usize {
    paths.iter().filter(|p| !exists(p)).count()
}

/// A notice title from the module's locale text: `title`, or `titleOne` for one
/// file, with {n} and {folder} filled in. Without the text, a plain fallback.
pub fn fill(title: Option<String>, title_one: Option<String>, n: usize, folder: &str, lang: Lang) -> String {
    let text = if n == 1 { title_one.or(title) } else { title };
    match text {
        Some(t) => t.replace("{n}", &n.to_string()).replace("{folder}", folder),
        None => match (lang, folder.is_empty()) {
            (Lang::Id, true) => format!("{n} file"),
            (Lang::Id, false) => format!("{n} file → {folder}"),
            (Lang::En, true) => format!("{n} file{}", if n == 1 { "" } else { "s" }),
            (Lang::En, false) => format!("{n} file{} → {folder}", if n == 1 { "" } else { "s" }),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CAPS_LOCK: u64 = 0x0001_0000;

    #[test]
    fn only_command_x_and_command_v_matter() {
        assert_eq!(classify(Some('x'), KEY_X, COMMAND), Press::Cut);
        assert_eq!(classify(Some('v'), KEY_V, COMMAND), Press::Paste);
        assert_eq!(classify(Some('x'), KEY_X, COMMAND | CAPS_LOCK), Press::Cut);
        assert_eq!(classify(Some('X'), KEY_X, COMMAND | CAPS_LOCK), Press::Cut);
        assert_eq!(classify(Some('x'), KEY_X, 0), Press::Other);
        assert_eq!(classify(Some('x'), KEY_X, COMMAND | SHIFT), Press::Other);
        // ⌘⌥V is Finder's own move, which Notching itself sends.
        assert_eq!(classify(Some('v'), KEY_V, COMMAND | OPTION), Press::Other);
        assert_eq!(classify(Some('c'), 8, COMMAND), Press::Other);
    }

    #[test]
    fn the_character_decides_on_other_layouts() {
        // Dvorak: the QWERTY X place types Q, and X sits on QWERTY's B (11).
        assert_eq!(classify(Some('q'), KEY_X, COMMAND), Press::Other);
        assert_eq!(classify(Some('x'), 11, COMMAND), Press::Cut);
        // No character: the QWERTY place.
        assert_eq!(classify(None, KEY_X, COMMAND), Press::Cut);
        assert_eq!(classify(None, 8, COMMAND), Press::Other);
    }

    #[test]
    fn a_cut_needs_a_fresh_clipboard_with_files() {
        assert!(copied(10, 11, 2));
        // ⌘C copied nothing: the files from an earlier copy are not cut.
        assert!(!copied(10, 10, 2));
        assert!(!copied(10, 11, 0));
    }

    #[test]
    fn an_unknown_focus_counts_as_typing() {
        assert!(typing(Ok(Some("AXTextField".into()))));
        assert!(!typing(Ok(Some("AXOutline".into()))));
        assert!(!typing(Ok(None)));
        assert!(typing(Err(())));
    }

    #[test]
    fn text_fields_keep_their_keys() {
        for role in ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"] {
            assert!(is_text_role(role), "{role}");
        }
        for role in ["AXOutline", "AXList", "AXGroup", "AXScrollArea", ""] {
            assert!(!is_text_role(role), "{role}");
        }
    }

    #[test]
    fn a_paste_is_ours_only_while_the_clipboard_holds_the_cut() {
        let cut = Cut { paths: vec!["/a".into()], change: 41 };
        assert!(paste_is_ours(Some(&cut), 41));
        // Something else was copied since.
        assert!(!paste_is_ours(Some(&cut), 42));
        assert!(!paste_is_ours(None, 41));
        assert!(!paste_is_ours(Some(&Cut { paths: vec![], change: 41 }), 41));
    }

    #[test]
    fn moved_counts_the_files_gone_from_their_place() {
        let paths: Vec<PathBuf> = vec!["/a".into(), "/b".into(), "/c".into()];
        assert_eq!(moved(&paths, |p| p == Path::new("/b")), 2);
        assert_eq!(moved(&paths, |_| true), 0);
    }

    #[test]
    fn titles_fill_the_count_and_the_folder() {
        let t = |s: &str| Some(s.to_string());
        assert_eq!(fill(t("{n} file dipotong"), t("{n} file dipotong"), 3, "", Lang::Id), "3 file dipotong");
        assert_eq!(
            fill(t("{n} files moved to {folder}"), t("{n} file moved to {folder}"), 1, "Documents", Lang::En),
            "1 file moved to Documents"
        );
        assert_eq!(fill(t("{n} files cut"), None, 1, "", Lang::En), "1 files cut");
        assert_eq!(fill(None, None, 2, "Dokumen", Lang::Id), "2 file → Dokumen");
        assert_eq!(fill(None, None, 1, "", Lang::En), "1 file");
    }
}
