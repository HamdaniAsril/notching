//! Atur jendela's rules (design 4 Nov, alat latar §5): the nine keys, where each
//! puts a window, and which screen a window is on. Free of AppKit. Rects here are
//! in screen coordinates with the origin at the top left of the main screen.

use crate::geometry::Rect;

/// A cell of the 3×3 key grid, ⌃⌥ with Q W E / A S D / Z X C.
#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
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
}

impl Cell {
    /// In key order, row by row.
    pub const ALL: [Cell; 9] = [
        Cell::TopLeft,
        Cell::Top,
        Cell::TopRight,
        Cell::Left,
        Cell::Center,
        Cell::Right,
        Cell::BottomLeft,
        Cell::Bottom,
        Cell::BottomRight,
    ];

    /// The macOS virtual key code of its letter.
    pub fn code(self) -> u32 {
        match self {
            Cell::TopLeft => 0x0C,     // Q
            Cell::Top => 0x0D,         // W
            Cell::TopRight => 0x0E,    // E
            Cell::Left => 0x00,        // A
            Cell::Center => 0x01,      // S
            Cell::Right => 0x02,       // D
            Cell::BottomLeft => 0x06,  // Z
            Cell::Bottom => 0x07,      // X
            Cell::BottomRight => 0x08, // C
        }
    }

    /// Its hot key id: the index in ALL plus one.
    pub fn id(self) -> u32 {
        Cell::ALL.iter().position(|&c| c == self).unwrap() as u32 + 1
    }

    pub fn from_id(id: u32) -> Option<Cell> {
        Cell::ALL.get((id as usize).checked_sub(1)?).copied()
    }
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

    #[test]
    fn keys_are_the_grid_and_ids_round_trip() {
        let codes: Vec<u32> = Cell::ALL.iter().map(|c| c.code()).collect();
        assert_eq!(codes, vec![0x0C, 0x0D, 0x0E, 0x00, 0x01, 0x02, 0x06, 0x07, 0x08]);
        for c in Cell::ALL {
            assert_eq!(Cell::from_id(c.id()), Some(c));
        }
        assert_eq!(Cell::from_id(0), None);
        assert_eq!(Cell::from_id(10), None);
    }
}
