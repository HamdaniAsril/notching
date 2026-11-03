//! Screenshot (design 1 Nov): the history, file names and capture picks, free of AppKit.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::geometry::Rect;

/// Screenshot's module id.
pub const MODULE_ID: &str = "screenshot";

/// The 16th screenshot removes the oldest, with its folder.
pub const HISTORY_MAX: usize = 15;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Screen,
    Window,
    Area,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShotItem {
    pub id: u64,
    pub taken_ms: i64,
    pub kind: Kind,
    pub width: u32,
    pub height: u32,
    pub edited: bool,
    pub saved: bool,
    /// Bumped by every edit, so a view can tell its image went stale.
    pub rev: u32,
}

/// What `index.json` holds. `next_id` outlives the items, so a removed id is never reused.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Index {
    items: Vec<ShotItem>,
    next_id: u64,
}

/// The saved screenshots, newest first.
#[derive(Debug, Default)]
pub struct History {
    items: Vec<ShotItem>,
    next_id: u64,
}

impl History {
    /// A missing or unreadable index is an empty history.
    pub fn from_index(json: &str) -> History {
        let Ok(index) = serde_json::from_str::<Index>(json) else {
            return History::default();
        };
        let after_last = index.items.iter().map(|i| i.id).max().map_or(0, |m| m + 1);
        History { next_id: index.next_id.max(after_last), items: index.items }
    }

    pub fn to_index(&self) -> String {
        let index = Index { items: self.items.clone(), next_id: self.next_id };
        serde_json::to_string(&index).unwrap_or_default()
    }

    pub fn items(&self) -> &[ShotItem] {
        &self.items
    }

    pub fn get(&self, id: u64) -> Option<&ShotItem> {
        self.items.iter().find(|i| i.id == id)
    }

    /// Returns the new id and the ids pushed out past `HISTORY_MAX`, oldest first.
    pub fn push(&mut self, taken_ms: i64, kind: Kind, w: u32, h: u32) -> (u64, Vec<u64>) {
        let id = self.next_id.max(1); // 0 is falsy in the webview
        self.next_id = id + 1;
        self.items.insert(0, ShotItem { id, taken_ms, kind, width: w, height: h, edited: false, saved: false, rev: 0 });
        let mut evicted = Vec::new();
        while self.items.len() > HISTORY_MAX {
            if let Some(old) = self.items.pop() {
                evicted.push(old.id);
            }
        }
        (id, evicted)
    }

    pub fn remove(&mut self, id: u64) -> bool {
        let before = self.items.len();
        self.items.retain(|i| i.id != id);
        self.items.len() != before
    }

    /// Drops the items whose folder is gone. True when any went.
    pub fn retain_existing(&mut self, exists: impl Fn(u64) -> bool) -> bool {
        let before = self.items.len();
        self.items.retain(|i| exists(i.id));
        self.items.len() != before
    }

    /// The image changed: it is no longer what was saved to the Desktop.
    pub fn mark_edited(&mut self, id: u64, w: u32, h: u32) -> bool {
        let Some(item) = self.items.iter_mut().find(|i| i.id == id) else {
            return false;
        };
        item.edited = true;
        item.saved = false;
        item.width = w;
        item.height = h;
        item.rev += 1;
        true
    }

    /// The edit was undone: the item is its original again. False when it already was.
    pub fn mark_unedited(&mut self, id: u64, w: u32, h: u32) -> bool {
        let Some(item) = self.items.iter_mut().find(|i| i.id == id && i.edited) else {
            return false;
        };
        item.edited = false;
        item.saved = false;
        item.width = w;
        item.height = h;
        item.rev += 1;
        true
    }

    pub fn mark_saved(&mut self, id: u64) -> bool {
        let Some(item) = self.items.iter_mut().find(|i| i.id == id) else {
            return false;
        };
        item.saved = true;
        true
    }
}

/// `Screenshot 2026-11-01 14.02.05.png`; when `taken` says the name exists, ` (2)`, ` (3)`, …
/// go before the extension. Never a name that is taken.
pub fn desktop_name(local: chrono::NaiveDateTime, taken: impl Fn(&str) -> bool) -> String {
    let stem = format!("Screenshot {}", local.format("%Y-%m-%d %H.%M.%S"));
    let first = format!("{stem}.png");
    if !taken(&first) {
        return first;
    }
    (2u32..)
        .map(|n| format!("{stem} ({n}).png"))
        .find(|name| !taken(name))
        .unwrap_or(first)
}

/// Width and height from the IHDR chunk, which must come first in a PNG.
pub fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    const SIGNATURE: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    if bytes.len() < 24 || bytes[..8] != SIGNATURE || &bytes[12..16] != b"IHDR" {
        return None;
    }
    let be = |at: usize| u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    Some((be(16), be(20)))
}

/// The screen a capture belongs to: where the front window's centre is, else the
/// cursor's, else the first. All in the same (CG global) coordinates.
pub fn pick_screen(screens: &[Rect], front_window: Option<Rect>, cursor: (f64, f64)) -> usize {
    let holding = |x: f64, y: f64| screens.iter().position(|s| s.contains(x, y));
    front_window
        .and_then(|w| holding(w.x + w.w / 2.0, w.y + w.h / 2.0))
        .or_else(|| holding(cursor.0, cursor.1))
        .unwrap_or(0)
}

pub enum Target {
    Screen { rect: Rect },
    Window { number: u32 },
    Area { rect: Rect },
}

/// Arguments for `screencapture`. No `-x`: the Mac's shutter sound is wanted.
/// A window goes by number with `-o`, so it comes without its shadow.
pub fn capture_args(target: &Target, out: &Path) -> Vec<String> {
    let out = out.to_string_lossy().into_owned();
    match target {
        Target::Screen { rect } | Target::Area { rect } => {
            let region = format!("{},{},{},{}", rect.x.round(), rect.y.round(), rect.w.round(), rect.h.round());
            vec!["-R".into(), region, out]
        }
        Target::Window { number } => vec!["-o".into(), "-l".into(), number.to_string(), out],
    }
}

/// Whether Notching's key can be used, for the status the module shows.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum KeyState {
    Ok,
    /// The Mac's own screenshot shortcut is on.
    Mac,
    /// Another of the Mac's shortcuts that is on holds it.
    Shortcut,
    /// Another app holds the key.
    Other,
    Off,
}

const CMD_SHIFT: i64 = 0x120000;
const KEY_3: i64 = 20;
const KEY_4: i64 = 21;

/// Whether the Mac's own Cmd+Shift+3 (hotkey 28) and Cmd+Shift+4 (hotkey 30) are still taken,
/// from `com.apple.symbolichotkeys`. A missing entry is the default, which is on; an entry
/// rebound to another key counts as free.
pub fn parse_key_conflicts(symbolic_hotkeys: &serde_json::Value) -> (bool, bool) {
    let hotkeys = &symbolic_hotkeys["AppleSymbolicHotKeys"];
    let taken = |id: &str, code: i64| {
        let entry = &hotkeys[id];
        if entry.is_null() {
            return true;
        }
        if entry["enabled"].as_bool() == Some(false) {
            return false;
        }
        match entry["value"]["parameters"].as_array() {
            Some(p) => p.get(1).and_then(|v| v.as_i64()) == Some(code) && p.get(2).and_then(|v| v.as_i64()) == Some(CMD_SHIFT),
            None => true,
        }
    };
    (taken("28", KEY_3), taken("30", KEY_4))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Rect;
    use chrono::NaiveDate;
    use serde_json::json;
    use std::path::Path;

    fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    fn pushed(h: &mut History, n: i64) -> (u64, Vec<u64>) {
        h.push(n, Kind::Screen, 100, 50)
    }

    #[test]
    fn push_puts_newest_first_and_evicts_the_16th() {
        let mut h = History::from_index("");
        let mut ids = Vec::new();
        let mut evicted = Vec::new();
        for n in 0..16 {
            let (id, ev) = pushed(&mut h, n);
            ids.push(id);
            evicted.extend(ev);
        }
        assert_eq!(h.items().len(), HISTORY_MAX);
        assert_eq!(evicted, vec![ids[0]]);
        assert!(h.get(ids[0]).is_none());
        assert_eq!(h.items()[0].id, ids[15]);
        assert_eq!(h.items()[0].taken_ms, 15);
        assert_eq!(h.items()[14].id, ids[1]);
    }

    #[test]
    fn index_round_trips_and_keeps_next_id() {
        let mut h = History::from_index("");
        let (a, _) = pushed(&mut h, 1);
        let (b, _) = pushed(&mut h, 2);
        assert!(h.remove(b));
        assert!(!h.remove(b));
        let mut back = History::from_index(&h.to_index());
        assert_eq!(back.items(), h.items());
        assert_eq!(back.items()[0].id, a);
        let (c, _) = pushed(&mut back, 3);
        assert!(c > b, "id {c} reuses {b}");
    }

    #[test]
    fn bad_index_is_empty() {
        assert!(History::from_index("not json").items().is_empty());
        assert!(History::from_index("").items().is_empty());
        assert!(History::from_index("{\"items\":5}").items().is_empty());
    }

    #[test]
    fn retain_existing_drops_missing_folders() {
        let mut h = History::from_index("");
        let (a, _) = pushed(&mut h, 1);
        let (b, _) = pushed(&mut h, 2);
        let (c, _) = pushed(&mut h, 3);
        assert!(!h.retain_existing(|_| true));
        assert!(h.retain_existing(|id| id != b));
        let ids: Vec<u64> = h.items().iter().map(|i| i.id).collect();
        assert_eq!(ids, vec![c, a]);
    }

    #[test]
    fn mark_edited_clears_saved_and_bumps_rev() {
        let mut h = History::from_index("");
        let (id, _) = pushed(&mut h, 1);
        assert_eq!(h.get(id).unwrap().rev, 0);
        assert!(h.mark_saved(id));
        assert!(h.get(id).unwrap().saved);
        assert!(h.mark_edited(id, 80, 40));
        let it = h.get(id).unwrap();
        assert!(it.edited && !it.saved);
        assert_eq!((it.width, it.height, it.rev), (80, 40, 1));
        assert!(h.mark_edited(id, 80, 40));
        assert_eq!(h.get(id).unwrap().rev, 2);
        assert!(!h.mark_edited(999, 1, 1));
        assert!(!h.mark_saved(999));
    }

    #[test]
    fn mark_unedited_goes_back_to_the_original() {
        let mut h = History::from_index("");
        let (id, _) = pushed(&mut h, 1);
        // Never edited: nothing changes, so no view needs a new picture.
        assert!(!h.mark_unedited(id, 100, 50));
        assert_eq!(h.get(id).unwrap().rev, 0);
        h.mark_edited(id, 140, 90);
        h.mark_saved(id);
        assert!(h.mark_unedited(id, 100, 50));
        let it = h.get(id).unwrap();
        assert!(!it.edited && !it.saved);
        assert_eq!((it.width, it.height, it.rev), (100, 50, 2));
        assert!(!h.mark_unedited(999, 1, 1));
    }

    #[test]
    fn desktop_name_formats_and_numbers_clashes() {
        let t = NaiveDate::from_ymd_opt(2026, 11, 1).unwrap().and_hms_opt(14, 2, 5).unwrap();
        let base = "Screenshot 2026-11-01 14.02.05.png";
        assert_eq!(desktop_name(t, |_| false), base);
        assert_eq!(desktop_name(t, |n| n == base), "Screenshot 2026-11-01 14.02.05 (2).png");
        let two = "Screenshot 2026-11-01 14.02.05 (2).png";
        assert_eq!(desktop_name(t, |n| n == base || n == two), "Screenshot 2026-11-01 14.02.05 (3).png");
    }

    #[test]
    fn png_size_reads_ihdr() {
        let png: [u8; 67] = [
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
            0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
            0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
            0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ];
        assert_eq!(png_size(&png), Some((1, 1)));
        let mut wide = png;
        wide[16..20].copy_from_slice(&2940u32.to_be_bytes());
        wide[20..24].copy_from_slice(&1912u32.to_be_bytes());
        assert_eq!(png_size(&wide), Some((2940, 1912)));
        assert_eq!(png_size(b"GIF89a not a png at all, long enough to hold a header"), None);
        assert_eq!(png_size(&png[..20]), None);
        assert_eq!(png_size(&[]), None);
    }

    #[test]
    fn pick_screen_prefers_front_window_centre() {
        let screens = [rect(0.0, 0.0, 1470.0, 956.0), rect(1470.0, 0.0, 1920.0, 1080.0)];
        let win = rect(1600.0, 100.0, 400.0, 300.0);
        assert_eq!(pick_screen(&screens, Some(win), (10.0, 10.0)), 1);
    }

    #[test]
    fn pick_screen_falls_back_to_cursor() {
        let screens = [rect(0.0, 0.0, 1470.0, 956.0), rect(1470.0, 0.0, 1920.0, 1080.0)];
        assert_eq!(pick_screen(&screens, None, (1500.0, 20.0)), 1);
        assert_eq!(pick_screen(&screens, None, (-5000.0, 20.0)), 0);
        // A window whose centre is on no screen also falls back to the cursor.
        let lost = rect(9000.0, 9000.0, 10.0, 10.0);
        assert_eq!(pick_screen(&screens, Some(lost), (1500.0, 20.0)), 1);
    }

    #[test]
    fn capture_args_for_each_target() {
        let out = Path::new("/tmp/o.png");
        let screen = Target::Screen { rect: rect(0.0, 0.0, 1470.0, 956.0) };
        assert_eq!(capture_args(&screen, out), ["-R", "0,0,1470,956", "/tmp/o.png"]);
        let win = Target::Window { number: 42 };
        assert_eq!(capture_args(&win, out), ["-o", "-l", "42", "/tmp/o.png"]);
        let area = Target::Area { rect: rect(10.4, 20.5, 300.6, 199.49) };
        assert_eq!(capture_args(&area, out), ["-R", "10,21,301,199", "/tmp/o.png"]);
        for t in [screen, win, area] {
            assert!(!capture_args(&t, out).iter().any(|a| a == "-x"));
        }
    }

    fn keys(e28: serde_json::Value, e30: serde_json::Value) -> serde_json::Value {
        json!({ "AppleSymbolicHotKeys": { "28": e28, "30": e30 } })
    }

    fn entry(enabled: bool, code: i64) -> serde_json::Value {
        json!({ "enabled": enabled, "value": { "parameters": [code - 1, code, 1179648] } })
    }

    #[test]
    fn parse_key_conflicts_reads_ids_28_and_30() {
        let defaults = json!({"AppleSymbolicHotKeys":{
            "28":{"enabled":true,"value":{"parameters":[51,20,1179648]}},
            "30":{"enabled":true,"value":{"parameters":[52,21,1179648]}}}});
        assert_eq!(parse_key_conflicts(&defaults), (true, true));
        assert_eq!(parse_key_conflicts(&keys(entry(false, 20), entry(true, 21))), (false, true));
        assert_eq!(parse_key_conflicts(&keys(entry(true, 20), entry(false, 21))), (true, false));
        assert_eq!(parse_key_conflicts(&json!({"AppleSymbolicHotKeys":{"28":entry(true, 20)}})), (true, true));
        assert_eq!(parse_key_conflicts(&json!({})), (true, true));
        assert_eq!(parse_key_conflicts(&keys(entry(true, 20), entry(true, 99))), (true, false));
        let other_mods = json!({"enabled":true,"value":{"parameters":[51,20,1048576]}});
        assert_eq!(parse_key_conflicts(&keys(other_mods, entry(true, 21))), (false, true));
    }
}
