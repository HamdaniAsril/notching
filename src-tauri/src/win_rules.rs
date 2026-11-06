//! Atur jendela's rules (design 4 Nov, alat latar §5; design 4 Nov tombol atur
//! jendela): the nine keys, as one sets them in Settings, where each puts a
//! window, and which screen a window is on. Free of AppKit. Rects here are in
//! screen coordinates with the origin at the top left of the main screen.

use serde::{Deserialize, Serialize};

use crate::geometry::Rect;
use crate::shot_keys::{Combo, ShotKeys, CONTROL, OPTION};

/// Where a key puts the window: a cell of the 3×3 grid, or the whole screen.
/// ⌃⌥ with the arrows for the sides, ; ' . / for the corners, \ for the centre
/// and Return for the whole screen, until changed (owner, 4 Nov).
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Cell {
    TopLeft,
    Top,
    TopRight,
    Left,
    Center,
    Right,
    BottomLeft,
    Bottom,
    BottomRight,
    Fill,
}

impl Cell {
    /// The grid row by row, then the whole screen.
    pub const ALL: [Cell; 10] = [
        Cell::TopLeft,
        Cell::Top,
        Cell::TopRight,
        Cell::Left,
        Cell::Center,
        Cell::Right,
        Cell::BottomLeft,
        Cell::Bottom,
        Cell::BottomRight,
        Cell::Fill,
    ];

    /// The macOS virtual key code of its key until changed, with ⌃⌥.
    pub fn code(self) -> u32 {
        match self {
            Cell::TopLeft => 0x29,     // ;
            Cell::Top => 0x7E,         // ↑
            Cell::TopRight => 0x27,    // '
            Cell::Left => 0x7B,        // ←
            Cell::Center => 0x2A,      // \
            Cell::Right => 0x7C,       // →
            Cell::BottomLeft => 0x2F,  // .
            Cell::Bottom => 0x7D,      // ↓
            Cell::BottomRight => 0x2C, // /
            Cell::Fill => 0x24,        // Return
        }
    }

    /// The key before 4 Nov: ⌃⌥ with Q W E / A S D / Z X C.
    fn old_code(self) -> Option<u32> {
        Some(match self {
            Cell::TopLeft => 0x0C,
            Cell::Top => 0x0D,
            Cell::TopRight => 0x0E,
            Cell::Left => 0x00,
            Cell::Center => 0x01,
            Cell::Right => 0x02,
            Cell::BottomLeft => 0x06,
            Cell::Bottom => 0x07,
            Cell::BottomRight => 0x08,
            Cell::Fill => return None,
        })
    }

    /// Its hot key id: the index in ALL plus one.
    pub fn id(self) -> u32 {
        Cell::ALL.iter().position(|&c| c == self).unwrap() as u32 + 1
    }

    pub fn from_id(id: u32) -> Option<Cell> {
        Cell::ALL.get((id as usize).checked_sub(1)?).copied()
    }
}

/// The ten keys, one combo per cell; a cell missing from the settings keeps its
/// key until changed.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowKeys {
    pub top_left: Combo,
    pub top: Combo,
    pub top_right: Combo,
    pub left: Combo,
    pub center: Combo,
    pub right: Combo,
    pub bottom_left: Combo,
    pub bottom: Combo,
    pub bottom_right: Combo,
    pub fill: Combo,
}

impl Default for WindowKeys {
    fn default() -> Self {
        let d = |cell: Cell| Combo { code: cell.code(), mods: CONTROL | OPTION };
        WindowKeys {
            top_left: d(Cell::TopLeft),
            top: d(Cell::Top),
            top_right: d(Cell::TopRight),
            left: d(Cell::Left),
            center: d(Cell::Center),
            right: d(Cell::Right),
            bottom_left: d(Cell::BottomLeft),
            bottom: d(Cell::Bottom),
            bottom_right: d(Cell::BottomRight),
            fill: d(Cell::Fill),
        }
    }
}

impl WindowKeys {
    fn slot(&mut self, cell: Cell) -> &mut Combo {
        match cell {
            Cell::TopLeft => &mut self.top_left,
            Cell::Top => &mut self.top,
            Cell::TopRight => &mut self.top_right,
            Cell::Left => &mut self.left,
            Cell::Center => &mut self.center,
            Cell::Right => &mut self.right,
            Cell::BottomLeft => &mut self.bottom_left,
            Cell::Bottom => &mut self.bottom,
            Cell::BottomRight => &mut self.bottom_right,
            Cell::Fill => &mut self.fill,
        }
    }

    pub fn get(mut self, cell: Cell) -> Combo {
        *self.slot(cell)
    }

    /// Keys saved before 4 Nov that were never changed (all nine still ⌃⌥ Q–C)
    /// move to the new keys; keys someone set stay theirs.
    pub fn upgraded(self) -> WindowKeys {
        let untouched = Cell::ALL.iter().all(|&c| match c.old_code() {
            Some(code) => self.get(c) == Combo { code, mods: CONTROL | OPTION },
            None => true,
        });
        if untouched { WindowKeys::default() } else { self }
    }

    /// The cell whose key `combo` is.
    pub fn cell_of(self, combo: Combo) -> Option<Cell> {
        Cell::ALL.into_iter().find(|&c| self.get(c) == combo)
    }
}

/// Why a key recorded for a cell was refused.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WinKeyError {
    /// Not a key that can be recorded, or no ⌘, ⌃ or ⌥.
    Invalid,
    /// Another cell's key.
    Duplicate { cell: Cell },
    /// One of Screenshot's two keys while Screenshot is on.
    Shot,
    /// Keep awake's or Shelf's key while its module is on (Pintasan, owner 4 Nov).
    App,
    /// Intip jendela's switcher key while it is on (design 5 Nov).
    Peek,
}

/// One cell set to `combo`. `shot` is Screenshot's keys while it is on.
pub fn set_key(keys: WindowKeys, cell: Cell, combo: Option<Combo>, shot: Option<ShotKeys>) -> Result<WindowKeys, WinKeyError> {
    let combo = combo.ok_or(WinKeyError::Invalid)?;
    if let Some(other) = keys.cell_of(combo).filter(|&c| c != cell) {
        return Err(WinKeyError::Duplicate { cell: other });
    }
    if shot.is_some_and(|s| s.screen == combo || s.pick == combo) {
        return Err(WinKeyError::Shot);
    }
    let mut next = keys;
    *next.slot(cell) = combo;
    Ok(next)
}

// One axis: 0 the first half, 1 the second, None the whole length.
fn span(start: f64, len: f64, part: Option<u8>) -> (f64, f64) {
    let first = (len / 2.0).floor();
    match part {
        None => (start, len),
        Some(0) => (start, first),
        // The second half takes what rounding left, so the halves tile exactly.
        Some(_) => (start + first, len - first),
    }
}

/// Where a cell puts `window` inside the screen's visible area. The centre keeps
/// the size; a window larger than the area goes to its top left, so its title
/// bar stays in sight.
pub fn place(cell: Cell, window: Rect, visible: Rect) -> Rect {
    let visible = Rect { x: visible.x.round(), y: visible.y.round(), w: visible.w.round(), h: visible.h.round() };
    let (col, row) = match cell {
        Cell::TopLeft => (Some(0), Some(0)),
        Cell::Top => (None, Some(0)),
        Cell::TopRight => (Some(1), Some(0)),
        Cell::Left => (Some(0), None),
        Cell::Center => {
            let x = visible.x + ((visible.w - window.w) / 2.0).max(0.0).round();
            let y = visible.y + ((visible.h - window.h) / 2.0).max(0.0).round();
            return Rect { x, y, w: window.w, h: window.h };
        }
        Cell::Right => (Some(1), None),
        Cell::BottomLeft => (Some(0), Some(1)),
        Cell::Bottom => (None, Some(1)),
        Cell::BottomRight => (Some(1), Some(1)),
        Cell::Fill => (None, None),
    };
    let (x, w) = span(visible.x, visible.w, col);
    let (y, h) = span(visible.y, visible.h, row);
    Rect { x, y, w, h }
}

fn overlap(a: Rect, b: Rect) -> f64 {
    let w = (a.x + a.w).min(b.x + b.w) - a.x.max(b.x);
    let h = (a.y + a.h).min(b.y + b.h) - a.y.max(b.y);
    if w > 0.0 && h > 0.0 { w * h } else { 0.0 }
}

/// The screen holding the largest part of the window; the main screen (0) when
/// it touches none.
pub fn screen_for(window: Rect, screens: &[Rect]) -> usize {
    screens
        .iter()
        .enumerate()
        .map(|(i, s)| (i, overlap(window, *s)))
        .filter(|&(_, area)| area > 0.0)
        .fold(None, |best: Option<(usize, f64)>, (i, area)| match best {
            Some((_, a)) if a >= area => best,
            _ => Some((i, area)),
        })
        .map_or(0, |(i, _)| i)
}

/// An AppKit rect (origin at the bottom left of the main screen) in screen
/// coordinates, with the main screen `primary_height` tall.
pub fn flip(appkit: Rect, primary_height: f64) -> Rect {
    Rect { x: appkit.x, y: primary_height - appkit.y - appkit.h, w: appkit.w, h: appkit.h }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shot_keys::{CONTROL, OPTION, SHIFT};

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    // A 1441 × 875 visible area under a 25-point menu bar: odd sizes on purpose.
    const VIS: Rect = Rect { x: 0.0, y: 25.0, w: 1441.0, h: 875.0 };
    const WIN: Rect = Rect { x: 100.0, y: 100.0, w: 800.0, h: 600.0 };

    #[test]
    fn halves_fill_half_and_tile_exactly() {
        assert_eq!(place(Cell::Left, WIN, VIS), r(0.0, 25.0, 720.0, 875.0));
        assert_eq!(place(Cell::Right, WIN, VIS), r(720.0, 25.0, 721.0, 875.0));
        assert_eq!(place(Cell::Top, WIN, VIS), r(0.0, 25.0, 1441.0, 437.0));
        assert_eq!(place(Cell::Bottom, WIN, VIS), r(0.0, 462.0, 1441.0, 438.0));
    }

    #[test]
    fn corners_fill_a_quarter() {
        assert_eq!(place(Cell::TopLeft, WIN, VIS), r(0.0, 25.0, 720.0, 437.0));
        assert_eq!(place(Cell::TopRight, WIN, VIS), r(720.0, 25.0, 721.0, 437.0));
        assert_eq!(place(Cell::BottomLeft, WIN, VIS), r(0.0, 462.0, 720.0, 438.0));
        assert_eq!(place(Cell::BottomRight, WIN, VIS), r(720.0, 462.0, 721.0, 438.0));
    }

    #[test]
    fn the_centre_keeps_the_size() {
        assert_eq!(place(Cell::Center, WIN, VIS), r(321.0, 163.0, 800.0, 600.0));
    }

    #[test]
    fn a_window_larger_than_the_area_is_centred_to_its_top_left() {
        let big = r(-50.0, 0.0, 2000.0, 1200.0);
        assert_eq!(place(Cell::Center, big, VIS), r(0.0, 25.0, 2000.0, 1200.0));
        // Only too wide: still centred top to bottom.
        let wide = r(0.0, 0.0, 2000.0, 475.0);
        assert_eq!(place(Cell::Center, wide, VIS), r(0.0, 225.0, 2000.0, 475.0));
    }

    #[test]
    fn a_second_screen_left_of_the_main_one_keeps_its_own_area() {
        let vis = r(-1920.0, -200.0, 1920.0, 1080.0);
        assert_eq!(place(Cell::Right, WIN, vis), r(-960.0, -200.0, 960.0, 1080.0));
    }

    #[test]
    fn the_screen_is_the_one_with_most_of_the_window() {
        let screens = [r(0.0, 0.0, 1440.0, 900.0), r(-1920.0, -180.0, 1920.0, 1080.0)];
        assert_eq!(screen_for(r(-300.0, 100.0, 800.0, 600.0), &screens), 0);
        assert_eq!(screen_for(r(-600.0, 100.0, 800.0, 600.0), &screens), 1);
        assert_eq!(screen_for(r(5000.0, 5000.0, 10.0, 10.0), &screens), 0);
        assert_eq!(screen_for(WIN, &[]), 0);
    }

    #[test]
    fn appkit_rects_flip_to_the_top_left() {
        // The menu bar is at the top: AppKit's visible frame ends 25 below 900.
        assert_eq!(flip(r(0.0, 0.0, 1440.0, 875.0), 900.0), r(0.0, 25.0, 1440.0, 875.0));
        // A screen above the main one.
        assert_eq!(flip(r(0.0, 900.0, 1920.0, 1080.0), 900.0), r(0.0, -1080.0, 1920.0, 1080.0));
    }

    fn ctl_opt(code: u32) -> Combo {
        Combo { code, mods: CONTROL | OPTION }
    }

    #[test]
    fn window_keys_default_to_control_option_with_arrows_and_punctuation() {
        let keys = WindowKeys::default();
        let labels: Vec<String> = Cell::ALL.iter().map(|&c| crate::shot_keys::label(keys.get(c))).collect();
        assert_eq!(labels, ["⌃⌥;", "⌃⌥↑", "⌃⌥'", "⌃⌥←", "⌃⌥\\", "⌃⌥→", "⌃⌥.", "⌃⌥↓", "⌃⌥/", "⌃⌥↩"]);
        assert_eq!(keys.cell_of(ctl_opt(0x24)), Some(Cell::Fill));
        assert_eq!(keys.cell_of(Combo { code: 0x24, mods: CONTROL }), None);
    }

    #[test]
    fn untouched_old_keys_move_to_the_new_ones_and_changed_ones_stay() {
        let old: WindowKeys = serde_json::from_str(
            r#"{"topLeft":{"code":12,"mods":6144},"top":{"code":13,"mods":6144},"topRight":{"code":14,"mods":6144},
               "left":{"code":0,"mods":6144},"center":{"code":1,"mods":6144},"right":{"code":2,"mods":6144},
               "bottomLeft":{"code":6,"mods":6144},"bottom":{"code":7,"mods":6144},"bottomRight":{"code":8,"mods":6144}}"#,
        )
        .unwrap();
        assert_eq!(old.upgraded(), WindowKeys::default());
        let mut mine = old;
        *mine.slot(Cell::Top) = Combo { code: 0x11, mods: CONTROL | SHIFT };
        assert_eq!(mine.upgraded(), mine);
        assert_eq!(WindowKeys::default().upgraded(), WindowKeys::default());
    }

    #[test]
    fn window_keys_read_per_cell_and_missing_cells_keep_theirs() {
        let keys: WindowKeys = serde_json::from_str(r#"{"top":{"code":17,"mods":4608}}"#).unwrap();
        assert_eq!(keys.get(Cell::Top), Combo { code: 17, mods: CONTROL | SHIFT });
        assert_eq!(keys.get(Cell::Left), ctl_opt(0x7B));
        assert_ne!(keys, WindowKeys::default());
        let json = serde_json::to_value(WindowKeys::default()).unwrap();
        assert_eq!(json["topLeft"], serde_json::json!({"code":41,"mods":6144}));
        assert_eq!(json["fill"], serde_json::json!({"code":36,"mods":6144}));
    }

    #[test]
    fn set_key_refuses_another_cells_key_and_screenshots() {
        let keys = WindowKeys::default();
        let t = Combo { code: 0x11, mods: CONTROL | OPTION };
        let next = set_key(keys, Cell::TopLeft, Some(t), None).unwrap();
        assert_eq!(next.get(Cell::TopLeft), t);
        assert_eq!(next.get(Cell::Top), keys.get(Cell::Top));
        // Its own key again is fine.
        assert_eq!(set_key(keys, Cell::Top, Some(ctl_opt(0x7E)), None), Ok(keys));
        assert_eq!(set_key(keys, Cell::TopLeft, Some(ctl_opt(0x2C)), None), Err(WinKeyError::Duplicate { cell: Cell::BottomRight }));
        assert_eq!(set_key(keys, Cell::TopLeft, None, None), Err(WinKeyError::Invalid));
        let shot = ShotKeys::default();
        assert_eq!(set_key(keys, Cell::Top, Some(shot.pick), Some(shot)), Err(WinKeyError::Shot));
        // Screenshot off: its keys are free.
        assert!(set_key(keys, Cell::Top, Some(shot.pick), None).is_ok());
    }

    #[test]
    fn errors_name_the_cell() {
        let e = serde_json::to_value(WinKeyError::Duplicate { cell: Cell::BottomLeft }).unwrap();
        assert_eq!(e, serde_json::json!({"kind":"duplicate","cell":"bottomLeft"}));
        assert_eq!(serde_json::to_value(WinKeyError::Shot).unwrap(), serde_json::json!({"kind":"shot"}));
    }

    #[test]
    fn keys_are_the_grid_and_ids_round_trip() {
        let codes: Vec<u32> = Cell::ALL.iter().map(|c| c.code()).collect();
        assert_eq!(codes, vec![0x29, 0x7E, 0x27, 0x7B, 0x2A, 0x7C, 0x2F, 0x7D, 0x2C, 0x24]);
        for c in Cell::ALL {
            assert_eq!(Cell::from_id(c.id()), Some(c));
        }
        assert_eq!(Cell::from_id(0), None);
        assert_eq!(Cell::from_id(11), None);
    }
}
