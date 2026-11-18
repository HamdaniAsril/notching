//! Fokus jendela (design 18 Nov): its setting, which windows stay clear, and
//! which window a peek shows. Free of AppKit so it can be unit tested.

use crate::geometry::Rect;

/// How dark the blur gets (design §6): a thin black layer over it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dim {
    None,
    Much,
    /// Last, so serde can take any unknown choice as this one.
    #[default]
    #[serde(other)]
    Little,
}

impl Dim {
    /// The black layer's opacity.
    pub fn alpha(self) -> f64 {
        match self {
            Dim::None => 0.0,
            Dim::Little => 0.15,
            Dim::Much => 0.35,
        }
    }
}

/// Fokus jendela's settings. A missing field takes its default, an unknown choice too.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusSettings {
    pub dim: Dim,
}

pub type WinId = u32;

/// A window: the window server's number and its app.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Win {
    pub id: WinId,
    pub pid: i32,
}

/// What the service heard. Front, Focused and Created come only from the active
/// app, Gone from any app that has a picked window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    /// ⌃⌥F, with the active app's focused window.
    Toggle(Option<Win>),
    /// ⌃⌥⇧F.
    Add(Option<Win>),
    /// A click on the peeked window.
    Click(Win),
    /// A ⇧-click on the peeked window.
    ShiftClick(Win),
    /// The active app or the Space changed. None: no window here, or full screen.
    Front(Option<Win>),
    /// AXFocusedWindowChanged in the active app.
    Focused(Win),
    /// AXWindowCreated in the active app.
    Created(Win),
    /// Closed or minimized.
    Gone(WinId),
}

/// What the screen shows.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Layer {
    Off,
    Paused,
    /// Raise in this order; the layer goes right below `raise[0]`. The last is the one in use.
    Shown { raise: Vec<WinId> },
}

/// At most this many windows stay clear (design §4.1).
pub const MAX_PICKED: usize = 2;

/// Which windows stay clear (design §4). In memory only.
#[derive(Default)]
pub struct Focus {
    on: bool,
    paused: bool,
    /// In the order they were used, the one in use last.
    picked: Vec<Win>,
    /// The window a move of focus last replaced, for ⌃⌥⇧F.
    previous: Option<Win>,
    /// Windows the focused app opened since the last pick (design §4.3).
    fresh: Vec<WinId>,
}

impl Focus {
    pub fn is_on(&self) -> bool {
        self.on
    }

    pub fn picked(&self) -> Vec<WinId> {
        self.picked.iter().map(|w| w.id).collect()
    }

    /// The picked windows with their apps, the one in use last.
    pub fn picked_wins(&self) -> Vec<Win> {
        self.picked.clone()
    }

    /// The apps of the picked windows, each once, for their observers.
    pub fn pids(&self) -> Vec<i32> {
        let mut out: Vec<i32> = Vec::new();
        for w in &self.picked {
            if !out.contains(&w.pid) {
                out.push(w.pid);
            }
        }
        out
    }

    /// What the screen should show now.
    pub fn layer(&self) -> Layer {
        if !self.on {
            Layer::Off
        } else if self.paused || self.picked.is_empty() {
            Layer::Paused
        } else {
            Layer::Shown { raise: self.picked() }
        }
    }

    /// None: nothing on screen changes.
    pub fn step(&mut self, e: Event) -> Option<Layer> {
        match e {
            Event::Toggle(None) | Event::Add(None) if !self.on => None,
            Event::Toggle(Some(w)) | Event::Add(Some(w)) if !self.on => {
                *self = Focus { on: true, picked: vec![w], ..Focus::default() };
                Some(self.layer())
            }
            _ if !self.on => None,
            Event::Toggle(None) => self.off(),
            Event::Toggle(Some(w)) if self.has(w.id) => self.off(),
            Event::Toggle(Some(w)) => self.replace(w),
            Event::Add(active) => {
                if let Some(w) = active.filter(|w| !self.has(w.id)) {
                    self.picked.push(w);
                } else if let Some(p) = self.previous.filter(|p| !self.has(p.id)) {
                    self.picked.insert(0, p);
                } else {
                    return None;
                }
                self.trim();
                self.paused = false;
                Some(self.layer())
            }
            Event::Click(w) => self.replace(w),
            Event::ShiftClick(w) => {
                if !self.has(w.id) {
                    self.picked.push(w);
                    self.trim();
                }
                self.paused = false;
                Some(self.layer())
            }
            Event::Front(None) => {
                if self.paused {
                    return None;
                }
                self.paused = true;
                Some(Layer::Paused)
            }
            Event::Front(Some(w)) if self.picked.iter().any(|p| p.pid == w.pid) => {
                // ⌘Tab to an app of the pair keeps the pair; its window goes on top.
                let (mut others, mut mine): (Vec<Win>, Vec<Win>) = self.picked.iter().partition(|p| p.pid != w.pid);
                others.append(&mut mine);
                self.picked = others;
                self.paused = false;
                Some(self.layer())
            }
            Event::Front(Some(w)) => self.replace(w),
            Event::Focused(w) if self.has(w.id) => {
                if self.paused {
                    self.paused = false;
                    return Some(self.layer());
                }
                None
            }
            Event::Focused(w) if self.fresh.contains(&w.id) => None,
            Event::Focused(w) => self.replace(w),
            Event::Created(w) => {
                if self.picked.iter().any(|p| p.pid == w.pid) && !self.fresh.contains(&w.id) {
                    self.fresh.push(w.id);
                }
                None
            }
            Event::Gone(id) => {
                self.fresh.retain(|&f| f != id);
                if self.previous.is_some_and(|p| p.id == id) {
                    self.previous = None;
                }
                if !self.has(id) {
                    return None;
                }
                self.picked.retain(|p| p.id != id);
                if self.picked.is_empty() {
                    self.paused = true;
                }
                Some(self.layer())
            }
        }
    }

    fn has(&self, id: WinId) -> bool {
        self.picked.iter().any(|p| p.id == id)
    }

    fn off(&mut self) -> Option<Layer> {
        *self = Focus::default();
        Some(Layer::Off)
    }

    /// Focus moves to `w` alone; the one in use becomes the previous.
    fn replace(&mut self, w: Win) -> Option<Layer> {
        if let Some(&last) = self.picked.last() {
            self.previous = Some(last);
        }
        self.picked = vec![w];
        self.fresh.clear();
        self.paused = false;
        Some(self.layer())
    }

    /// The oldest go first when there are too many.
    fn trim(&mut self) {
        while self.picked.len() > MAX_PICKED {
            self.picked.remove(0);
        }
    }
}

/// A window under the layer, from the window server's list (CG points, top-left of the main screen).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Below {
    pub id: WinId,
    pub pid: i32,
    pub frame: Rect,
}

/// The top fifth of a peeked window is clear (owner, 18 Nov, after trying it)…
pub const PEEK_CLEAR: f64 = 0.2;
/// …then a short fade back to blur (owner: "lebih tegas").
pub const PEEK_FADE: f64 = 0.08;
/// How long a peek takes to open or close.
pub const PEEK_FADE_MS: u64 = 120;

/// The topmost window under the point; `below` is front to back.
pub fn peek_target(x: f64, y: f64, below: &[Below]) -> Option<Below> {
    below.iter().find(|b| b.frame.contains(x, y)).copied()
}

/// Where the blur opens for a peek, in CG points.
#[derive(Clone, Debug, PartialEq)]
pub struct PeekHole {
    /// The top of the window: clear, then fading.
    pub open: Rect,
    /// The fading band at the bottom of `open`.
    pub fade: Rect,
    /// Parts of `open` that other blurred windows cover: they stay blurred (owner, 18 Nov).
    pub covers: Vec<Rect>,
}

/// The overlap of two rects, if any.
fn overlap(a: Rect, b: Rect) -> Option<Rect> {
    let (x, y) = (a.x.max(b.x), a.y.max(b.y));
    let (w, h) = (a.max_x().min(b.max_x()) - x, a.max_y().min(b.max_y()) - y);
    (w > 0.0 && h > 0.0).then_some(Rect { x, y, w, h })
}

/// The hole over `target`; `in_front` are the blurred windows above it.
pub fn peek_hole(target: Below, in_front: &[Below]) -> PeekHole {
    let f = target.frame;
    let clear = f.h * PEEK_CLEAR;
    let fade = f.h * PEEK_FADE;
    let open = Rect { h: clear + fade, ..f };
    PeekHole {
        open,
        fade: Rect { y: f.y + clear, h: fade, ..f },
        covers: in_front.iter().filter_map(|b| overlap(b.frame, open)).collect(),
    }
}

/// The screens to blur: the one holding most of each picked window, else the
/// nearest (owner, 18 Nov: other monitors stay as they are). Sorted, each once.
pub fn blur_screens(screens: &[Rect], picked: &[Rect]) -> Vec<usize> {
    let mut out: Vec<usize> = Vec::new();
    for w in picked {
        let area = |s: &Rect| overlap(*s, *w).map_or(0.0, |o| o.w * o.h);
        let (cx, cy) = (w.x + w.w / 2.0, w.y + w.h / 2.0);
        let distance = |s: &Rect| {
            let dx = (s.x + s.w / 2.0 - cx).abs();
            let dy = (s.y + s.h / 2.0 - cy).abs();
            dx * dx + dy * dy
        };
        let best = screens
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| area(a).total_cmp(&area(b)).then(distance(b).total_cmp(&distance(a))))
            .map(|(i, _)| i);
        if let Some(i) = best.filter(|i| !out.contains(i)) {
            out.push(i);
        }
    }
    out.sort_unstable();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focus_settings_default_and_survive_bad_fields() {
        let f: FocusSettings = serde_json::from_str(r#"{"dim":"nonsense"}"#).unwrap();
        assert_eq!(f, FocusSettings::default());
        assert_eq!(serde_json::to_value(FocusSettings::default()).unwrap(), serde_json::json!({"dim":"little"}));
        assert_eq!([Dim::None.alpha(), Dim::Little.alpha(), Dim::Much.alpha()], [0.0, 0.15, 0.35]);
    }

    const A: Win = Win { id: 1, pid: 10 };
    const B: Win = Win { id: 2, pid: 10 };
    const C: Win = Win { id: 3, pid: 20 };
    const D: Win = Win { id: 4, pid: 30 };
    const N: Win = Win { id: 5, pid: 10 };

    fn shown(raise: &[WinId]) -> Option<Layer> {
        Some(Layer::Shown { raise: raise.to_vec() })
    }

    /// Runs every event, returning what the last one did.
    fn run(f: &mut Focus, events: &[Event]) -> Option<Layer> {
        let mut last = None;
        for &e in events {
            last = f.step(e);
        }
        last
    }

    #[test]
    fn toggle_on_picks_the_active_window() {
        let mut f = Focus::default();
        assert_eq!(f.step(Event::Toggle(Some(A))), shown(&[1]));
        assert!(f.is_on());
    }

    #[test]
    fn toggle_without_window_stays_off() {
        let mut f = Focus::default();
        assert_eq!(f.step(Event::Toggle(None)), None);
        assert!(!f.is_on());
    }

    #[test]
    fn toggle_on_the_picked_window_turns_off() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Toggle(Some(A))]), Some(Layer::Off));
        assert!(!f.is_on());
    }

    #[test]
    fn toggle_on_a_new_window_picks_it_alone() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Created(N), Event::Toggle(Some(N))]), shown(&[5]));
        assert_eq!(f.picked(), vec![5]);
    }

    #[test]
    fn click_moves_focus() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Click(C)]), shown(&[3]));
    }

    #[test]
    fn add_after_a_click_brings_back_the_previous() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Click(C), Event::Add(Some(C))]), shown(&[1, 3]));
    }

    #[test]
    fn shift_click_adds() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C)]), shown(&[1, 3]));
    }

    #[test]
    fn a_third_replaces_the_oldest() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C), Event::ShiftClick(D)]), shown(&[3, 4]));
    }

    #[test]
    fn add_when_off_turns_on() {
        let mut f = Focus::default();
        assert_eq!(f.step(Event::Add(Some(A))), shown(&[1]));
    }

    #[test]
    fn front_of_another_app_moves_focus() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Front(Some(C))]), shown(&[3]));
    }

    #[test]
    fn front_of_a_pair_app_keeps_the_pair() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C), Event::Front(Some(A))]), shown(&[3, 1]));
    }

    #[test]
    fn front_none_pauses_then_resumes() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Front(None)]), Some(Layer::Paused));
        assert_eq!(f.step(Event::Front(Some(D))), shown(&[4]));
    }

    #[test]
    fn a_new_window_stays_clear() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Created(N), Event::Focused(N)]), None);
        assert_eq!(f.picked(), vec![1]);
    }

    #[test]
    fn an_old_window_of_the_same_app_moves_focus() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Focused(B)]), shown(&[2]));
    }

    #[test]
    fn focused_picked_is_nothing() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Click(C), Event::Focused(C)]), None);
    }

    #[test]
    fn gone_picked_with_partner_keeps_partner() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C), Event::Gone(1)]), shown(&[3]));
    }

    #[test]
    fn gone_last_pauses_and_the_next_focus_resumes() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Gone(1)]), Some(Layer::Paused));
        assert_eq!(f.step(Event::Focused(B)), shown(&[2]));
    }

    #[test]
    fn a_new_window_gone_changes_nothing() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Created(N), Event::Gone(5)]), None);
    }

    #[test]
    fn another_apps_new_window_is_not_fresh() {
        let mut f = Focus::default();
        assert_eq!(run(&mut f, &[Event::Toggle(Some(A)), Event::Created(D), Event::Focused(D)]), shown(&[4]));
    }

    #[test]
    fn off_ignores_everything_but_the_keys() {
        let mut f = Focus::default();
        for e in [Event::Front(Some(A)), Event::Click(A), Event::Gone(1), Event::Focused(A), Event::Created(A), Event::ShiftClick(A)] {
            assert_eq!(f.step(e), None);
        }
        assert!(!f.is_on());
    }

    #[test]
    fn picked_wins_carry_their_apps_in_order_of_use() {
        let mut f = Focus::default();
        run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C)]);
        assert_eq!(f.picked_wins(), vec![A, C]);
    }

    #[test]
    fn pids_name_the_apps_of_the_picked_windows() {
        let mut f = Focus::default();
        run(&mut f, &[Event::Toggle(Some(A)), Event::ShiftClick(C)]);
        assert_eq!(f.pids(), vec![10, 20]);
    }

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    #[test]
    fn peek_target_is_the_topmost_under_the_point() {
        let front = Below { id: 7, pid: 1, frame: r(0., 0., 400., 300.) };
        let back = Below { id: 8, pid: 2, frame: r(200., 100., 400., 300.) };
        let below = [front, back];
        assert_eq!(peek_target(250., 150., &below), Some(front));
        assert_eq!(peek_target(500., 350., &below), Some(back));
        assert_eq!(peek_target(900., 900., &below), None);
    }

    #[test]
    fn peek_hole_opens_the_top_fifth_with_a_short_fade() {
        let target = Below { id: 7, pid: 1, frame: r(100., 50., 400., 500.) };
        let hole = peek_hole(target, &[]);
        assert_eq!(hole.open, r(100., 50., 400., 140.));
        assert_eq!(hole.fade, r(100., 150., 400., 40.));
        assert!(hole.covers.is_empty());
    }

    #[test]
    fn peek_hole_keeps_what_lies_in_front_blurred() {
        let target = Below { id: 8, pid: 2, frame: r(0., 0., 400., 500.) };
        let front = Below { id: 7, pid: 1, frame: r(300., 50., 400., 300.) };
        let away = Below { id: 9, pid: 3, frame: r(900., 0., 100., 100.) };
        let hole = peek_hole(target, &[front, away]);
        assert_eq!(hole.covers, vec![r(300., 50., 100., 90.)]);
    }

    #[test]
    fn blur_only_the_screens_of_the_picked_windows() {
        let screens = [r(0., 0., 1440., 900.), r(1440., 0., 1920., 1080.)];
        assert_eq!(blur_screens(&screens, &[r(1800., 100., 600., 400.)]), vec![1]);
        // Most of it on the first screen, a little on the second.
        assert_eq!(blur_screens(&screens, &[r(900., 100., 700., 400.)]), vec![0]);
        assert_eq!(blur_screens(&screens, &[r(100., 100., 600., 400.), r(1800., 100., 600., 400.)]), vec![0, 1]);
        // Off every screen: the screen nearest still blurs, never none.
        assert_eq!(blur_screens(&screens, &[r(-900., 100., 600., 400.)]), vec![0]);
        assert_eq!(blur_screens(&screens, &[]), Vec::<usize>::new());
    }
}
