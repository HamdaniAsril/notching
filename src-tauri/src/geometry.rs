//! Screen geometry and pointer routing, free of AppKit so it can be unit tested.
//! Global coordinates follow AppKit: origin at the bottom-left of the main screen, in points.
//! CSS coordinates are the overlay webview's: origin at the window's top-left.

use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    /// Edges are inclusive: a cursor pushed against the top of the screen reports
    /// y == max_y, and that must still count as inside the notch.
    pub fn contains(&self, px: f64, py: f64) -> bool {
        px >= self.x && px <= self.max_x() && py >= self.y && py <= self.max_y()
    }

    pub fn max_x(&self) -> f64 {
        self.x + self.w
    }

    pub fn max_y(&self) -> f64 {
        self.y + self.h
    }
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
pub struct NotchGeom {
    pub width: f64,
    pub height: f64,
}

pub const OVERLAY_W: f64 = 640.0;
pub const OVERLAY_H: f64 = 360.0;

/// The notch is the strip between the two auxiliary top areas, as tall as the top safe inset.
pub fn notch_from_screen(frame: Rect, safe_top: f64, aux_left: Rect, aux_right: Rect) -> Option<NotchGeom> {
    let width = frame.w - aux_left.w - aux_right.w;
    if safe_top <= 0.0 || width <= 0.0 {
        return None;
    }
    Some(NotchGeom { width, height: safe_top })
}

/// Overlay window frame: centred horizontally, touching the top edge of the screen.
pub fn overlay_frame(screen: Rect) -> Rect {
    Rect {
        x: screen.x + (screen.w - OVERLAY_W) / 2.0,
        y: screen.max_y() - OVERLAY_H,
        w: OVERLAY_W,
        h: OVERLAY_H,
    }
}

pub fn css_rect_to_global(overlay: Rect, css: Rect) -> Rect {
    Rect {
        x: overlay.x + css.x,
        y: overlay.max_y() - css.y - css.h,
        w: css.w,
        h: css.h,
    }
}

pub fn global_to_css(overlay: Rect, px: f64, py: f64) -> (f64, f64) {
    (px - overlay.x, overlay.max_y() - py)
}

pub struct OverlayHit {
    pub label: String,
    pub frame: Rect,
    pub css_rects: Vec<Rect>,
}

#[derive(Debug, PartialEq)]
pub struct PointerRoute {
    pub label: String,
    pub inside: bool,
    pub changed: bool,
    pub x: f64,
    pub y: f64,
}

/// Remembers which overlays the cursor is inside, so callers learn about enter and
/// exit once, and about moves only while the cursor is inside.
#[derive(Default)]
pub struct PointerRouter {
    inside: HashMap<String, bool>,
}

impl PointerRouter {
    /// True while the cursor is inside some overlay's hit area.
    pub fn any_inside(&self) -> bool {
        self.inside.values().any(|&inside| inside)
    }

    pub fn route(&mut self, overlays: &[OverlayHit], px: f64, py: f64) -> Vec<PointerRoute> {
        self.inside.retain(|label, _| overlays.iter().any(|o| &o.label == label));
        let mut out = Vec::new();
        for o in overlays {
            let inside = o
                .css_rects
                .iter()
                .any(|r| css_rect_to_global(o.frame, *r).contains(px, py));
            let was = self.inside.insert(o.label.clone(), inside).unwrap_or(false);
            if inside || was {
                let (x, y) = global_to_css(o.frame, px, py);
                out.push(PointerRoute { label: o.label.clone(), inside, changed: inside != was, x, y });
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(label: &str) -> OverlayHit {
        OverlayHit {
            label: label.to_string(),
            frame: overlay_frame(Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 }),
            css_rects: vec![Rect { x: 260.0, y: 0.0, w: 120.0, h: 34.0 }],
        }
    }

    #[test]
    fn notch_is_screen_width_minus_aux_areas() {
        let f = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };
        let l = Rect { x: 0.0, y: 924.0, w: 653.0, h: 32.0 };
        let r = Rect { x: 817.0, y: 924.0, w: 653.0, h: 32.0 };
        assert_eq!(notch_from_screen(f, 32.0, l, r), Some(NotchGeom { width: 164.0, height: 32.0 }));
        assert_eq!(notch_from_screen(f, 0.0, l, r), None);
    }

    #[test]
    fn overlay_is_centred_at_the_top_of_any_screen() {
        assert_eq!(
            overlay_frame(Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 }),
            Rect { x: 415.0, y: 596.0, w: 640.0, h: 360.0 }
        );
        assert_eq!(
            overlay_frame(Rect { x: -1920.0, y: 0.0, w: 1920.0, h: 1080.0 }),
            Rect { x: -1280.0, y: 720.0, w: 640.0, h: 360.0 }
        );
    }

    #[test]
    fn css_and_global_coordinates_round_trip() {
        let o = Rect { x: 415.0, y: 596.0, w: 640.0, h: 360.0 };
        assert_eq!(
            css_rect_to_global(o, Rect { x: 260.0, y: 0.0, w: 120.0, h: 34.0 }),
            Rect { x: 675.0, y: 922.0, w: 120.0, h: 34.0 }
        );
        assert_eq!(global_to_css(o, 735.0, 940.0), (320.0, 16.0));
        // Monitor to the left of the main screen.
        let left = overlay_frame(Rect { x: -1920.0, y: 0.0, w: 1920.0, h: 1080.0 });
        let g = css_rect_to_global(left, Rect { x: 260.0, y: 0.0, w: 120.0, h: 34.0 });
        assert_eq!(g, Rect { x: -1020.0, y: 1046.0, w: 120.0, h: 34.0 });
        assert_eq!(global_to_css(left, g.x + 60.0, g.y + 17.0), (320.0, 17.0));
    }

    #[test]
    fn router_reports_enter_moves_and_exit_once() {
        let mut r = PointerRouter::default();
        let o = vec![hit("notch-0")]; // hot zone in global coordinates: {675, 922, 120, 34}
        assert!(r.route(&o, 100.0, 100.0).is_empty());
        assert_eq!(r.route(&o, 735.0, 940.0)[0].changed, true);
        assert_eq!(r.route(&o, 736.0, 940.0)[0].changed, false);
        let out = r.route(&o, 100.0, 100.0);
        assert_eq!((out[0].inside, out[0].changed), (false, true));
        assert!(r.route(&o, 101.0, 100.0).is_empty());
    }

    #[test]
    fn cursor_pinned_to_the_top_edge_is_inside() {
        let mut r = PointerRouter::default();
        let o = vec![hit("notch-0")];
        let out = r.route(&o, 735.0, 956.0);
        assert_eq!((out[0].inside, out[0].y), (true, 0.0));
    }

    #[test]
    fn router_knows_when_the_cursor_left_every_overlay() {
        let mut r = PointerRouter::default();
        let o = vec![hit("notch-0")];
        assert!(!r.any_inside());
        r.route(&o, 735.0, 940.0);
        assert!(r.any_inside());
        r.route(&o, 100.0, 100.0);
        assert!(!r.any_inside());
    }
}
