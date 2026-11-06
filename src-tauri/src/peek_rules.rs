//! Intip jendela's rules (design 5 Nov), with no AppKit: its settings, the order
//! of an app's windows, what a Dock click does, where the peek panel sits, and
//! the pictures kept in memory.

use std::sync::Arc;

use crate::geometry::Rect;

/// What a click on an app's Dock icon does (design §2.2).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockClick {
    /// Left to macOS.
    Mac,
    /// Minimize every window of the app in front, else bring them all back.
    #[default]
    #[serde(other)]
    Toggle,
}

/// The cards' colour: the Mac's light or dark, or always one of them.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardColor {
    Light,
    Dark,
    #[default]
    #[serde(other)]
    System,
}

/// Solid cards, or Liquid glass that shows what is behind them, blurred.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Material {
    Glass,
    #[default]
    #[serde(other)]
    Solid,
}

/// Intip jendela's settings on Pintasan (design §4). A missing field takes its
/// default, an unknown choice too.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PeekSettings {
    /// Peek from the Dock.
    pub dock: bool,
    pub dock_click: DockClick,
    pub card: CardColor,
    pub material: Material,
    /// Minimized windows shown too, marked.
    pub minimized: bool,
}

impl Default for PeekSettings {
    fn default() -> Self {
        PeekSettings { dock: true, dock_click: DockClick::Toggle, card: CardColor::System, material: Material::Solid, minimized: true }
    }
}

/// One window of an app as the peek shows it. `frame` is in global CG points
/// (origin top-left of the main screen), like `notify::window_list`.
#[derive(Clone, Debug, PartialEq)]
pub struct WinInfo {
    pub id: u32,
    pub pid: i32,
    pub title: String,
    pub minimized: bool,
    pub frame: Rect,
}

/// A standard window as Accessibility lists it, in its order.
#[derive(Clone, Debug, PartialEq)]
pub struct AxWin {
    pub id: u32,
    pub title: String,
    pub minimized: bool,
    pub frame: Rect,
}

/// An app's windows newest first (design §6): the shown ones in the window
/// server's front-to-back order `z` (window numbers), then the minimized ones in
/// Accessibility's order. A shown window missing from `z` is on another Space
/// and left out.
pub fn merge(pid: i32, ax: Vec<AxWin>, z: &[u32]) -> Vec<WinInfo> {
    let info = |w: AxWin| WinInfo { id: w.id, pid, title: w.title, minimized: w.minimized, frame: w.frame };
    let (minimized, shown): (Vec<AxWin>, Vec<AxWin>) = ax.into_iter().partition(|w| w.minimized);
    let mut shown: Vec<(usize, AxWin)> =
        shown.into_iter().filter_map(|w| z.iter().position(|&n| n == w.id).map(|i| (i, w))).collect();
    shown.sort_by_key(|(i, _)| *i);
    shown.into_iter().map(|(_, w)| info(w)).chain(minimized.into_iter().map(info)).collect()
}

/// The window with this id, if it is still there.
pub fn find_window(list: &[WinInfo], id: u32) -> Option<&WinInfo> {
    list.iter().find(|w| w.id == id)
}

/// What a click on an app's Dock icon does (design §6).
#[derive(Clone, Debug, PartialEq)]
pub enum ClickPlan {
    /// Left to the Dock: the app has no window.
    Pass,
    MinimizeAll(Vec<u32>),
    ShowAll(Vec<u32>),
}

/// The app in front with windows shown: minimize those. Otherwise bring every
/// window of the app back, minimized ones too, in the order of `windows`.
pub fn click_plan(pid: i32, windows: &[WinInfo], front_pid: Option<i32>) -> ClickPlan {
    if windows.is_empty() {
        return ClickPlan::Pass;
    }
    let shown: Vec<u32> = windows.iter().filter(|w| !w.minimized).map(|w| w.id).collect();
    if front_pid == Some(pid) && !shown.is_empty() {
        ClickPlan::MinimizeAll(shown)
    } else {
        ClickPlan::ShowAll(windows.iter().map(|w| w.id).collect())
    }
}

/// A press held this long on an icon is the Dock's own long press (its menu).
pub const LONG_PRESS_MS: u64 = 350;
/// Moving this far with the button down is a drag (rearranging the Dock).
pub const DRAG_SLOP: f64 = 4.0;

/// A left-button event over the Dock, as the click tap sees it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PressEvent {
    /// `on_app`: the pid of a running app with windows under the press, when the
    /// Dock click is Notching's.
    Down { on_app: Option<i32>, at: (f64, f64), ms: u64 },
    Dragged { at: (f64, f64) },
    Up { ms: u64 },
    Timer { ms: u64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PressAction {
    /// Let the event through.
    Pass,
    /// Hold it back.
    Swallow,
    /// Post the held press again for the Dock, then let this event through.
    Replay,
    /// A short click on this app's icon: Notching's Dock click.
    Act(i32),
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
enum PressState {
    #[default]
    Idle,
    Holding { pid: i32, at: (f64, f64), ms: u64 },
    /// Handed back to the Dock until the button comes up.
    Passing,
}

/// Tells a short click on an app icon from a drag or a long press, which stay
/// the Dock's (design §3, §6).
#[derive(Debug, Default)]
pub struct DockPress {
    state: PressState,
}

impl DockPress {
    pub const fn new() -> Self {
        DockPress { state: PressState::Idle }
    }

    pub fn on(&mut self, ev: PressEvent) -> PressAction {
        match (self.state, ev) {
            (_, PressEvent::Down { on_app: Some(pid), at, ms }) => {
                self.state = PressState::Holding { pid, at, ms };
                PressAction::Swallow
            }
            (_, PressEvent::Down { on_app: None, .. }) => {
                self.state = PressState::Idle;
                PressAction::Pass
            }
            (PressState::Holding { at: (x0, y0), .. }, PressEvent::Dragged { at: (x, y) }) => {
                if ((x - x0).powi(2) + (y - y0).powi(2)).sqrt() > DRAG_SLOP {
                    self.state = PressState::Passing;
                    PressAction::Replay
                } else {
                    PressAction::Swallow
                }
            }
            (PressState::Holding { ms: start, .. }, PressEvent::Timer { ms }) => {
                if ms.saturating_sub(start) >= LONG_PRESS_MS {
                    self.state = PressState::Passing;
                    PressAction::Replay
                } else {
                    PressAction::Swallow
                }
            }
            (PressState::Holding { pid, .. }, PressEvent::Up { .. }) => {
                self.state = PressState::Idle;
                PressAction::Act(pid)
            }
            (PressState::Passing, PressEvent::Up { .. }) => {
                self.state = PressState::Idle;
                PressAction::Pass
            }
            _ => PressAction::Pass,
        }
    }
}

/// The screen side the Dock is on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockEdge {
    Bottom,
    Left,
    Right,
}

/// The side of `screen` nearest the icon's centre.
pub fn dock_edge(icon: Rect, screen: Rect) -> DockEdge {
    let (cx, cy) = (icon.x + icon.w / 2.0, icon.y + icon.h / 2.0);
    let (left, right, bottom) = (cx - screen.x, screen.max_x() - cx, screen.max_y() - cy);
    if bottom <= left && bottom <= right {
        DockEdge::Bottom
    } else if left <= right {
        DockEdge::Left
    } else {
        DockEdge::Right
    }
}

const PEEK_GAP: f64 = 10.0;
const PEEK_MARGIN: f64 = 12.0;

/// Where the peek panel of `size` sits: 10 pt from the icon toward the middle of
/// the screen, centred on the icon along the Dock and kept 12 pt inside
/// `visible`; it never comes off the icon toward the Dock. Larger than `visible`,
/// it is made 24 pt smaller than it first.
pub fn peek_frame(icon: Rect, edge: DockEdge, size: (f64, f64), visible: Rect) -> Rect {
    let w = size.0.min(visible.w - 2.0 * PEEK_MARGIN);
    let h = size.1.min(visible.h - 2.0 * PEEK_MARGIN);
    // max then min, not clamp: on a fractional screen rounding can put the upper
    // bound a hair under the lower one, and clamp would panic.
    let along_x = |c: f64| (c - w / 2.0).min(visible.max_x() - PEEK_MARGIN - w).max(visible.x + PEEK_MARGIN);
    let along_y = |c: f64| (c - h / 2.0).min(visible.max_y() - PEEK_MARGIN - h).max(visible.y + PEEK_MARGIN);
    let (cx, cy) = (icon.x + icon.w / 2.0, icon.y + icon.h / 2.0);
    match edge {
        DockEdge::Bottom => Rect { x: along_x(cx), y: (icon.y - PEEK_GAP - h).max(visible.y + PEEK_MARGIN), w, h },
        DockEdge::Left => Rect { x: (icon.max_x() + PEEK_GAP).min(visible.max_x() - PEEK_MARGIN - w), y: along_y(cy), w, h },
        DockEdge::Right => Rect { x: (icon.x - PEEK_GAP - w).max(visible.x + PEEK_MARGIN), y: along_y(cy), w, h },
    }
}

/// The pointer is still on the peek: on its icon (with a little slack), on the
/// card, or in the gap between them, in global CG points. Off all three the card
/// goes; the Dock does not always say when the pointer leaves it.
pub fn near_peek(mouse: (f64, f64), icon: Rect, card: Rect, edge: DockEdge) -> bool {
    const SLACK: f64 = 6.0;
    let (x, y) = mouse;
    let grown = Rect { x: icon.x - SLACK, y: icon.y - SLACK, w: icon.w + 2.0 * SLACK, h: icon.h + 2.0 * SLACK };
    let gap = match edge {
        DockEdge::Bottom => Rect { x: icon.x, y: card.max_y(), w: icon.w, h: (icon.y - card.max_y()).max(0.0) },
        DockEdge::Left => Rect { x: icon.max_x(), y: icon.y, w: (card.x - icon.max_x()).max(0.0), h: icon.h },
        DockEdge::Right => Rect { x: card.max_x(), y: icon.y, w: (icon.x - card.max_x()).max(0.0), h: icon.h },
    };
    grown.contains(x, y) || card.contains(x, y) || gap.contains(x, y)
}

/// `w` × `h` scaled down to fit `max_w` × `max_h`, keeping its shape; never up.
pub fn fit(w: f64, h: f64, max_w: f64, max_h: f64) -> (f64, f64) {
    let k = (max_w / w).min(max_h / h).min(1.0);
    ((w * k).round(), (h * k).round())
}

const MODIFIERS: u64 = 0x2_0000 | 0x4_0000 | 0x8_0000 | 0x10_0000; // ⇧ ⌃ ⌥ ⌘

/// A click with no ⇧⌃⌥⌘: ⌃-click (the Dock's menu), ⌘-click (Show in Finder)
/// and ⌥-click (hide others) stay the Dock's.
pub fn plain_click(flags: u64) -> bool {
    flags & MODIFIERS == 0
}

/// The app has a real window in the window server's list of every window,
/// minimized ones included: `(pid, layer, width, height)`. Asks the app
/// nothing, so a click on a hung app's icon never waits.
pub fn has_app_window(windows: &[(i32, i64, f64, f64)], pid: i32) -> bool {
    windows.iter().any(|&(p, layer, w, h)| p == pid && layer == 0 && w > 1.0 && h > 1.0)
}

/// Two bundle paths name the same app, through symlinks too (/Applications/Safari.app
/// is one). Falls back to the paths as written when one cannot be resolved.
pub fn same_bundle(a: &str, b: &str) -> bool {
    let clean = |p: &str| p.trim_end_matches('/').to_string();
    let real = |p: &str| std::fs::canonicalize(clean(p)).map(|r| r.to_string_lossy().to_string()).unwrap_or_else(|_| clean(p));
    clean(a) == clean(b) || real(a) == real(b)
}

/// The pointer in the card's own points (origin top-left), from the global
/// AppKit mouse location and the card's AppKit frame; None outside it.
pub fn card_point(mouse: (f64, f64), card: Rect) -> Option<(f64, f64)> {
    let (x, y) = (mouse.0 - card.x, card.max_y() - mouse.1);
    (x >= 0.0 && y >= 0.0 && x <= card.w && y <= card.h).then_some((x, y))
}

/// After the Dock went away: wait this long before each try to watch the new
/// one, then give up until the next change.
pub fn retry_delay(attempt: u32) -> Option<u64> {
    [250, 500, 1000, 2000, 4000].get(attempt as usize).copied()
}

/// What a window button on the peek card asks (design §2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowAct {
    Minimize,
    Restore,
    Close,
    Quit,
}

/// Window pictures kept in memory only, the least recently used dropped first.
#[derive(Debug, Default)]
pub struct PictureCache {
    // Oldest first.
    items: Vec<(u32, Arc<Vec<u8>>)>,
}

impl PictureCache {
    pub const CAP: usize = 64;

    pub fn put(&mut self, id: u32, png: Arc<Vec<u8>>) {
        self.items.retain(|(i, _)| *i != id);
        self.items.push((id, png));
        if self.items.len() > Self::CAP {
            self.items.remove(0);
        }
    }

    pub fn get(&mut self, id: u32) -> Option<Arc<Vec<u8>>> {
        let at = self.items.iter().position(|(i, _)| *i == id)?;
        let item = self.items.remove(at);
        let png = item.1.clone();
        self.items.push(item);
        Some(png)
    }

    /// Drops the pictures of these windows.
    pub fn remove(&mut self, ids: &[u32]) {
        self.items.retain(|(i, _)| !ids.contains(i));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peek_settings_default_and_survive_bad_fields() {
        let p: PeekSettings = serde_json::from_str(r#"{"dock":false,"dockClick":"nonsense","card":"light"}"#).unwrap();
        assert_eq!(p, PeekSettings { dock: false, dock_click: DockClick::Toggle, card: CardColor::Light, ..PeekSettings::default() });
        assert_eq!(
            serde_json::to_value(PeekSettings::default()).unwrap(),
            serde_json::json!({"dock":true,"dockClick":"toggle","card":"system","material":"solid","minimized":true})
        );
    }

    fn r(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect { x, y, w, h }
    }

    fn ax(id: u32, minimized: bool) -> AxWin {
        AxWin { id, title: format!("w{id}"), minimized, frame: r(0.0, 0.0, 100.0, 80.0) }
    }

    fn win(id: u32, minimized: bool) -> WinInfo {
        WinInfo { id, pid: 7, title: format!("w{id}"), minimized, frame: r(0.0, 0.0, 100.0, 80.0) }
    }

    #[test]
    fn merge_orders_front_to_back_then_minimized_and_drops_other_spaces() {
        // AX lists 1, 2 (minimized), 3, 4 (on another Space: not in the z order), 5 (minimized).
        let list = merge(7, vec![ax(1, false), ax(2, true), ax(3, false), ax(4, false), ax(5, true)], &[9, 3, 1]);
        assert_eq!(list.iter().map(|w| w.id).collect::<Vec<_>>(), vec![3, 1, 2, 5]);
        assert!(list.iter().all(|w| w.pid == 7));
        assert!(list[2].minimized && list[3].minimized && !list[0].minimized);
    }

    #[test]
    fn find_window_of_a_closed_window_is_none() {
        let list = vec![win(1, false), win(2, true)];
        assert_eq!(find_window(&list, 2).map(|w| w.id), Some(2));
        assert!(find_window(&list, 3).is_none());
    }

    #[test]
    fn click_plan_minimizes_the_front_app_and_shows_any_other() {
        let list = vec![win(1, false), win(2, false), win(3, true)];
        assert_eq!(click_plan(7, &list, Some(7)), ClickPlan::MinimizeAll(vec![1, 2]));
        assert_eq!(click_plan(7, &list, Some(9)), ClickPlan::ShowAll(vec![1, 2, 3]));
        assert_eq!(click_plan(7, &list, None), ClickPlan::ShowAll(vec![1, 2, 3]));
        // In front with every window minimized: bring them back.
        assert_eq!(click_plan(7, &[win(3, true)], Some(7)), ClickPlan::ShowAll(vec![3]));
        assert_eq!(click_plan(7, &[], Some(7)), ClickPlan::Pass);
    }

    fn down(pid: Option<i32>) -> PressEvent {
        PressEvent::Down { on_app: pid, at: (100.0, 900.0), ms: 1000 }
    }

    #[test]
    fn a_short_click_acts_and_is_swallowed() {
        let mut p = DockPress::default();
        assert_eq!(p.on(down(Some(7))), PressAction::Swallow);
        assert_eq!(p.on(PressEvent::Dragged { at: (102.0, 901.0) }), PressAction::Swallow);
        assert_eq!(p.on(PressEvent::Up { ms: 1120 }), PressAction::Act(7));
        // Back at rest: the next stray events pass.
        assert_eq!(p.on(PressEvent::Up { ms: 1300 }), PressAction::Pass);
    }

    #[test]
    fn a_drag_replays_the_press_for_the_dock() {
        let mut p = DockPress::default();
        p.on(down(Some(7)));
        assert_eq!(p.on(PressEvent::Dragged { at: (105.0, 900.0) }), PressAction::Replay);
        assert_eq!(p.on(PressEvent::Dragged { at: (140.0, 900.0) }), PressAction::Pass);
        assert_eq!(p.on(PressEvent::Timer { ms: 1400 }), PressAction::Pass);
        assert_eq!(p.on(PressEvent::Up { ms: 1500 }), PressAction::Pass);
    }

    #[test]
    fn a_long_press_replays_for_the_menu() {
        let mut p = DockPress::default();
        p.on(down(Some(7)));
        assert_eq!(p.on(PressEvent::Timer { ms: 1349 }), PressAction::Swallow);
        assert_eq!(p.on(PressEvent::Timer { ms: 1350 }), PressAction::Replay);
        assert_eq!(p.on(PressEvent::Up { ms: 2000 }), PressAction::Pass);
    }

    #[test]
    fn a_press_off_any_app_icon_passes() {
        let mut p = DockPress::default();
        assert_eq!(p.on(down(None)), PressAction::Pass);
        assert_eq!(p.on(PressEvent::Up { ms: 1100 }), PressAction::Pass);
        assert_eq!(p.on(PressEvent::Timer { ms: 1400 }), PressAction::Pass);
    }

    const SCREEN: Rect = Rect { x: 0.0, y: 0.0, w: 1440.0, h: 900.0 };

    #[test]
    fn dock_edge_finds_bottom_left_right() {
        assert_eq!(dock_edge(r(700.0, 840.0, 52.0, 52.0), SCREEN), DockEdge::Bottom);
        assert_eq!(dock_edge(r(4.0, 400.0, 52.0, 52.0), SCREEN), DockEdge::Left);
        assert_eq!(dock_edge(r(1384.0, 400.0, 52.0, 52.0), SCREEN), DockEdge::Right);
    }

    #[test]
    fn peek_frame_sits_above_a_bottom_dock_and_stays_on_screen() {
        let visible = r(0.0, 25.0, 1440.0, 800.0);
        let icon = r(700.0, 840.0, 52.0, 52.0);
        assert_eq!(peek_frame(icon, DockEdge::Bottom, (400.0, 200.0), visible), r(526.0, 630.0, 400.0, 200.0));
        // An icon near the left edge: pushed in to 12 pt.
        assert_eq!(peek_frame(r(5.0, 840.0, 52.0, 52.0), DockEdge::Bottom, (400.0, 200.0), visible).x, 12.0);
        // Wider than the screen: 24 pt narrower than it, then placed.
        let wide = peek_frame(icon, DockEdge::Bottom, (4000.0, 300.0), visible);
        assert_eq!((wide.x, wide.w), (12.0, 1416.0));
    }

    #[test]
    fn peek_frame_sits_beside_side_docks() {
        let visible = r(70.0, 25.0, 1370.0, 875.0);
        let left = peek_frame(r(8.0, 400.0, 52.0, 52.0), DockEdge::Left, (300.0, 200.0), visible);
        assert_eq!((left.x, left.y), (70.0, 326.0));
        let visible = r(0.0, 25.0, 1370.0, 875.0);
        let right = peek_frame(r(1380.0, 400.0, 52.0, 52.0), DockEdge::Right, (300.0, 200.0), visible);
        assert_eq!((right.x, right.y), (1070.0, 326.0));
    }

    fn png(n: u8) -> Arc<Vec<u8>> {
        Arc::new(vec![n])
    }

    #[test]
    fn picture_cache_drops_the_least_recently_used_beyond_cap() {
        let mut c = PictureCache::default();
        for id in 0..PictureCache::CAP as u32 {
            c.put(id, png(id as u8));
        }
        assert!(c.get(0).is_some()); // 0 used again: 1 is now the oldest
        c.put(1000, png(9));
        assert!(c.get(1).is_none());
        assert!(c.get(0).is_some() && c.get(1000).is_some());
    }

    #[test]
    fn picture_cache_drops_named_windows() {
        let mut c = PictureCache::default();
        c.put(1, png(1));
        c.put(2, png(2));
        c.remove(&[1, 9]);
        assert!(c.get(1).is_none() && c.get(2).is_some());
    }

    #[test]
    fn fit_scales_down_never_up() {
        assert_eq!(fit(1200.0, 800.0, 368.0, 236.0), (354.0, 236.0));
        assert_eq!(fit(200.0, 100.0, 368.0, 236.0), (200.0, 100.0));
    }

    #[test]
    fn window_acts_read_from_the_page() {
        let a: WindowAct = serde_json::from_str("\"restore\"").unwrap();
        assert_eq!(a, WindowAct::Restore);
    }

    #[test]
    fn peek_frame_never_panics_on_fractional_screens() {
        let visible = r(1854.8394052348776, 25.0, 3256.4662160811117, 800.0);
        let f = peek_frame(r(3000.0, 840.0, 52.0, 52.0), DockEdge::Bottom, (9000.0, 300.0), visible);
        assert!((f.w - (visible.w - 24.0)).abs() < 1e-6);
        assert!(f.x >= visible.x + 12.0 - 1e-6);
    }

    #[test]
    fn a_click_with_a_modifier_stays_the_docks() {
        assert!(plain_click(0));
        assert!(plain_click(0x100)); // a device bit, not a modifier
        for flag in [0x2_0000u64, 0x4_0000, 0x8_0000, 0x10_0000] {
            assert!(!plain_click(flag), "{flag:#x}");
        }
    }

    #[test]
    fn an_app_has_a_window_from_the_window_server_alone() {
        // (pid, layer, width, height); minimized windows are in kCGWindowListOptionAll too.
        let list = [(7, 0, 800.0, 600.0), (9, 0, 1.0, 1.0), (9, 25, 400.0, 30.0)];
        assert!(has_app_window(&list, 7));
        assert!(!has_app_window(&list, 9)); // a 1×1 helper and a menu-bar item
        assert!(!has_app_window(&list, 3));
    }

    #[test]
    fn a_dock_icon_matches_its_running_app_through_a_symlink() {
        let d = tempfile::tempdir().unwrap();
        let real = d.path().join("Cryptexes/Safari.app");
        std::fs::create_dir_all(&real).unwrap();
        let link = d.path().join("Safari.app");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let (real, link) = (real.to_string_lossy().to_string(), link.to_string_lossy().to_string());
        assert!(same_bundle(&format!("{link}/"), &real));
        assert!(same_bundle(&real, &real));
        assert!(!same_bundle(&real, "/Applications/Other.app"));
    }

    #[test]
    fn the_pointer_in_card_points_from_its_top_left() {
        // An AppKit frame (origin bottom-left) at 100,200 of 300×120.
        let card = r(100.0, 200.0, 300.0, 120.0);
        assert_eq!(card_point((110.0, 310.0), card), Some((10.0, 10.0)));
        assert_eq!(card_point((99.0, 250.0), card), None);
        assert_eq!(card_point((150.0, 321.0), card), None);
    }

    #[test]
    fn a_restarted_dock_is_tried_again_a_few_times() {
        let delays: Vec<u64> = (0..).map_while(retry_delay).collect();
        assert_eq!(delays, vec![250, 500, 1000, 2000, 4000]);
    }

    #[test]
    fn the_pointer_stays_near_the_peek_on_its_icon_the_gap_and_the_card() {
        // A bottom Dock: icon at the bottom, the card 10 pt above it.
        let icon = r(700.0, 840.0, 52.0, 52.0);
        let card = r(526.0, 630.0, 400.0, 200.0);
        let near = |x: f64, y: f64| near_peek((x, y), icon, card, DockEdge::Bottom);
        assert!(near(726.0, 866.0)); // on the icon
        assert!(near(726.0, 835.0)); // in the gap between icon and card
        assert!(near(600.0, 700.0)); // on the card
        assert!(near(703.0, 895.0)); // the icon's edge, with a little slack
        assert!(!near(300.0, 866.0)); // along the Dock, on another icon
        assert!(!near(726.0, 500.0)); // above the card
        assert!(!near(560.0, 835.0)); // beside the gap, off the icon's column
    }

    #[test]
    fn the_near_area_follows_a_side_dock() {
        let icon = r(8.0, 400.0, 52.0, 52.0);
        let card = r(70.0, 326.0, 300.0, 200.0);
        assert!(near_peek((65.0, 426.0), icon, card, DockEdge::Left)); // the gap
        assert!(!near_peek((65.0, 340.0), icon, card, DockEdge::Left));
    }
}
