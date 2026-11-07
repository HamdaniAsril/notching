//! Notching's own glass under the peek card and the window switcher (design
//! 7 Nov): the owner's numbers, how the edge bends, what part of the screen is
//! pictured, when this glass is used instead of macOS's, the state of one
//! picture, and how the glass opens with the page. Free of AppKit so it can be
//! unit tested.

use std::time::Duration;

use crate::geometry::Rect;
use crate::peek_rules::{Material, SwitchPlace};

/// How the glass looks, in points and fractions (design §2 and §5).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GlassLook {
    /// The card's colour over the glass, 0..1 (the page draws it).
    pub tint: f64,
    /// Gaussian blur of what is behind, sigma in points.
    pub blur: f64,
    /// How far out the very edge reaches for what it shows, in points.
    pub bend: f64,
    /// How deep the bending edge is, in points.
    pub rim: f64,
    /// How much sharper the edge is than the middle, 0..1.
    pub crisp: f64,
    /// The rainbow at the edge, 0..1 (the kernel uses half of it).
    pub rainbow: f64,
    /// The shine on the edge, 0..1.
    pub shine: f64,
    /// Colour strength of what is behind, 1 = as it is.
    pub saturation: f64,
}

impl Default for GlassLook {
    /// The owner's numbers from the prototype (7 Nov 2026).
    fn default() -> Self {
        GlassLook { tint: 0.40, blur: 3.5, bend: 18.0, rim: 26.0, crisp: 0.35, rainbow: 0.35, shine: 0.50, saturation: 1.30 }
    }
}

/// The look, with `tuned` (NOTCHING_GLASS_LOOK, e.g. "bend=22,blur=4") over
/// the owner's numbers, for trying values on the Mac with a relaunch. Broken
/// pairs, unknown keys and negative numbers are left out; the fractions stay
/// within 0..1.
pub fn look(tuned: Option<&str>) -> GlassLook {
    let mut l = GlassLook::default();
    for pair in tuned.unwrap_or("").split(',') {
        let Some((key, value)) = pair.split_once('=') else { continue };
        let Ok(v) = value.trim().parse::<f64>() else { continue };
        if !v.is_finite() || v < 0.0 {
            continue;
        }
        let unit = v.min(1.0);
        match key.trim() {
            "tint" => l.tint = unit,
            "blur" => l.blur = v,
            "bend" => l.bend = v,
            "rim" => l.rim = v,
            "crisp" => l.crisp = unit,
            "rainbow" => l.rainbow = unit,
            "shine" => l.shine = unit,
            "saturation" => l.saturation = v,
            _ => {}
        }
    }
    l
}

/// How far out a point `depth` points in from the edge reaches for what it
/// shows: all of `bend` at the edge, none from `rim` inward, along a quarter
/// circle (design §5 step 3). The kernel in glass_draw.rs draws this curve
/// in CIKL; here it is written out so it is tested.
#[cfg_attr(not(test), allow(dead_code))]
pub fn bend_at(depth: f64, look: &GlassLook) -> f64 {
    if look.rim <= 0.0 {
        return 0.0;
    }
    let u = (depth / look.rim).clamp(0.0, 1.0);
    look.bend * (1.0 - (1.0 - (1.0 - u) * (1.0 - u)).sqrt())
}

/// How much of the screen around the panel the glass reads: the bend, and
/// the blur's reach (three sigma).
pub fn margin(look: &GlassLook) -> f64 {
    look.bend + 3.0 * look.blur
}

/// The part of the screen to read for a panel: the panel and `margin` round
/// it, never past the screen's edges. Points, CG (top-left) like `panel`.
pub fn crop(panel: Rect, screen: Rect, look: &GlassLook) -> Rect {
    let m = margin(look);
    let x = (panel.x - m).max(screen.x);
    let y = (panel.y - m).max(screen.y);
    let max_x = (panel.max_x() + m).min(screen.max_x());
    let max_y = (panel.max_y() + m).min(screen.max_y());
    Rect { x, y, w: (max_x - x).max(0.0), h: (max_y - y).max(0.0) }
}

/// Whether Notching's own glass can be drawn at all: Liquid glass chosen,
/// Screen Recording given, "Reduce transparency" off, macOS 14 or later.
/// Otherwise the look of today (design §4).
pub fn own_possible(material: Material, can_capture: bool, reduce_transparency: bool, macos_major: i64) -> bool {
    material == Material::Glass && can_capture && !reduce_transparency && macos_major >= 14
}

/// Where one panel's picture of the screen stands.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Snap {
    None,
    Waiting,
    Ready,
    Failed,
}

/// One panel's picture: one taken at a time, kept for its screen while the
/// panel is open, and a late or forgotten one dropped by its ticket.
#[derive(Clone, Copy, Debug, Default)]
pub struct Slot {
    ticket: u64,
    waiting: bool,
    ready: bool,
    failed: bool,
    screen: Option<Rect>,
}

impl Slot {
    /// A ticket for a new picture of `screen`, or None when this screen's
    /// picture is already there, coming or given up on; `force` takes a new
    /// one anyway (after a window button, or the pointer reaching the card).
    pub fn begin(&mut self, screen: Rect, force: bool) -> Option<u64> {
        if !force && self.screen == Some(screen) && self.state() != Snap::None {
            return None;
        }
        self.ticket += 1;
        self.waiting = true;
        self.ready = false;
        self.failed = false;
        self.screen = Some(screen);
        Some(self.ticket)
    }

    /// A picture came back (`ok`) or failed: true when it is the one waited for.
    pub fn finish(&mut self, ticket: u64, ok: bool) -> bool {
        if ticket != self.ticket || !self.waiting {
            return false;
        }
        self.waiting = false;
        self.ready = ok;
        self.failed = !ok;
        ok
    }

    /// Still no picture after GIVE_UP: this opening keeps today's look.
    pub fn give_up(&mut self, ticket: u64) {
        if ticket == self.ticket && self.waiting {
            self.waiting = false;
            self.failed = true;
        }
    }

    /// The panel hid: nothing is kept and a picture on its way is dropped.
    pub fn forget(&mut self) {
        self.ticket += 1;
        self.waiting = false;
        self.ready = false;
        self.failed = false;
        self.screen = None;
    }

    pub fn state(&self) -> Snap {
        if self.waiting {
            Snap::Waiting
        } else if self.ready {
            Snap::Ready
        } else if self.failed {
            Snap::Failed
        } else {
            Snap::None
        }
    }

    pub fn screen(&self) -> Option<Rect> {
        self.screen
    }
}

/// How the glass opens with the page (design §4 "Animasi membuka").
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Opening {
    /// The card: fades in rising 8 pt.
    Rise,
    /// The switcher in the middle: fades in.
    Fade,
    /// The switcher from the notch: drops open.
    Drop,
}

pub fn opening(switcher: Option<SwitchPlace>) -> Opening {
    match switcher {
        None => Opening::Rise,
        Some(SwitchPlace::Center) => Opening::Fade,
        Some(SwitchPlace::Notch) => Opening::Drop,
    }
}

/// As peek.css and switcher.css animate the page (tested against them).
pub const RISE_MS: u64 = 160;
pub const RISE_PT: f64 = 8.0;
pub const FADE_IN_MS: u64 = 120;
pub const DROP_MS: u64 = 260;
pub const DROP_CURVE: [f64; 4] = [0.2, 0.9, 0.3, 1.15];
/// Where the drop starts: inset top, right, bottom, left, as parts of the panel.
pub const DROP_FROM: [f64; 4] = [0.0, 0.40, 0.92, 0.40];
/// A picture that comes after the panel is up fades in this long.
pub const LATE_FADE_MS: u64 = 150;
/// No picture by then: today's look for this opening.
pub const GIVE_UP: Duration = Duration::from_secs(1);
/// How dark the peek layer makes the screen (stage.css).
pub const STAGE_SHADE: f64 = 0.55;

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };
    const A: Rect = SCREEN;
    const B: Rect = Rect { x: 1470.0, y: 0.0, w: 1920.0, h: 1080.0 };

    fn near(a: f64, b: f64) -> bool {
        (a - b).abs() < 0.01
    }

    #[test]
    fn default_look_is_the_owners_pick() {
        let l = GlassLook::default();
        assert_eq!(
            l,
            GlassLook { tint: 0.40, blur: 3.5, bend: 18.0, rim: 26.0, crisp: 0.35, rainbow: 0.35, shine: 0.50, saturation: 1.30 }
        );
    }

    #[test]
    fn tuned_look_takes_good_pairs_only() {
        let l = look(Some("bend=22, blur=4,x=1,shine=9,rim=-3"));
        assert_eq!(l.bend, 22.0);
        assert_eq!(l.blur, 4.0);
        assert_eq!(l.shine, 1.0);
        assert_eq!(l.rim, 26.0);
        assert_eq!(l.tint, 0.40);
        assert_eq!(l.saturation, 1.30);
        assert_eq!(look(None), GlassLook::default());
        assert_eq!(look(Some("nonsense,=,tint=abc")), GlassLook::default());
    }

    #[test]
    fn bend_is_full_at_the_edge_and_gone_past_the_rim() {
        let l = GlassLook::default();
        assert!(near(bend_at(0.0, &l), 18.0));
        assert!(near(bend_at(26.0, &l), 0.0));
        assert!(near(bend_at(40.0, &l), 0.0));
        assert!(near(bend_at(13.0, &l), 2.412));
        let depths = [0.0, 5.0, 10.0, 20.0];
        for pair in depths.windows(2) {
            assert!(bend_at(pair[0], &l) > bend_at(pair[1], &l), "{pair:?}");
        }
    }

    #[test]
    fn margin_covers_bend_and_blur() {
        assert!(near(margin(&GlassLook::default()), 28.5));
    }

    #[test]
    fn crop_grows_by_the_margin_and_stays_on_screen() {
        let l = GlassLook::default();
        let mid = crop(Rect { x: 500.0, y: 600.0, w: 636.0, h: 210.0 }, SCREEN, &l);
        assert!(near(mid.x, 471.5) && near(mid.y, 571.5) && near(mid.w, 693.0) && near(mid.h, 267.0), "{mid:?}");
        let edge = crop(Rect { x: 4.0, y: 700.0, w: 300.0, h: 240.0 }, SCREEN, &l);
        assert!(near(edge.x, 0.0) && near(edge.y, 671.5), "{edge:?}");
        assert!(near(edge.w, 332.5) && near(edge.max_y(), 956.0), "{edge:?}");
    }

    #[test]
    fn own_glass_needs_glass_capture_full_transparency_and_macos_14() {
        assert!(own_possible(Material::Glass, true, false, 27));
        assert!(own_possible(Material::Glass, true, false, 14));
        assert!(!own_possible(Material::Solid, true, false, 27));
        assert!(!own_possible(Material::Glass, false, false, 27));
        assert!(!own_possible(Material::Glass, true, true, 27));
        assert!(!own_possible(Material::Glass, true, false, 13));
    }

    #[test]
    fn slot_keeps_one_picture_per_screen() {
        let mut s = Slot::default();
        assert_eq!(s.state(), Snap::None);
        let t1 = s.begin(A, false).expect("first picture");
        assert_eq!(s.state(), Snap::Waiting);
        assert_eq!(s.screen(), Some(A));
        assert_eq!(s.begin(A, false), None);
        assert!(s.finish(t1, true));
        assert_eq!(s.state(), Snap::Ready);
        assert_eq!(s.begin(A, false), None);
        let t2 = s.begin(A, true).expect("a forced new picture");
        assert_ne!(t1, t2);
        assert!(s.begin(B, false).is_some());
        assert_eq!(s.screen(), Some(B));
    }

    #[test]
    fn slot_drops_late_and_forgotten_pictures() {
        let mut s = Slot::default();
        let t1 = s.begin(A, false).unwrap();
        s.forget();
        assert!(!s.finish(t1, true));
        assert_eq!(s.state(), Snap::None);
        assert_eq!(s.screen(), None);

        let t1 = s.begin(A, false).unwrap();
        let t2 = s.begin(A, true).unwrap();
        assert!(!s.finish(t1, true));
        assert_eq!(s.state(), Snap::Waiting);
        s.give_up(t2);
        assert_eq!(s.state(), Snap::Failed);
        assert!(!s.finish(t2, true), "a picture after giving up is not used");

        let t3 = s.begin(B, false).unwrap();
        assert!(!s.finish(t3, false));
        assert_eq!(s.state(), Snap::Failed);
    }

    #[test]
    fn opening_maps_card_center_and_notch() {
        assert_eq!(opening(None), Opening::Rise);
        assert_eq!(opening(Some(SwitchPlace::Center)), Opening::Fade);
        assert_eq!(opening(Some(SwitchPlace::Notch)), Opening::Drop);
    }

    #[test]
    fn opening_follows_the_pages_animations() {
        let peek = include_str!("../../src/peek/peek.css");
        let switcher = include_str!("../../src/peek/switcher.css");
        assert!(peek.contains("rise .16s") && RISE_MS == 160);
        assert!(peek.contains("translateY(8px)") && RISE_PT == 8.0);
        assert!(switcher.contains("fade .12s") && FADE_IN_MS == 120);
        assert!(switcher.contains("drop .26s cubic-bezier(.2, .9, .3, 1.15)") && DROP_MS == 260);
        assert_eq!(DROP_CURVE, [0.2, 0.9, 0.3, 1.15]);
        assert!(switcher.contains("inset(0 40% 92% 40%"));
        assert_eq!(DROP_FROM, [0.0, 0.40, 0.92, 0.40]);
        assert_eq!(LATE_FADE_MS, 150);
        assert_eq!(GIVE_UP, Duration::from_secs(1));
    }

    #[test]
    fn stage_shade_matches_the_peek_layer() {
        assert!(include_str!("../../src/peek/stage.css").contains("rgba(0, 0, 0, .55)"));
        assert_eq!(STAGE_SHADE, 0.55);
    }
}
