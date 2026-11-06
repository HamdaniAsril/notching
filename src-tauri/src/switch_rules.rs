//! The window switcher's rules (Intip jendela, design 5 Nov §2.3 and §6), with
//! no AppKit: which keys it takes while open, what it lists and in which order,
//! where the selection starts and how it moves.

use crate::peek_rules::WinInfo;
use crate::shot_keys::{Combo, CMD, SHIFT};

/// One thing the switcher lists.
#[derive(Clone, Debug, PartialEq)]
pub enum Item {
    Window { pid: i32, id: u32, title: String, minimized: bool },
    /// A running app with no window here: on another Space, full screen,
    /// hidden, or none at all. Choosing it lets macOS take you there.
    App { pid: i32, name: String },
}

impl Item {
    pub fn pid(&self) -> i32 {
        match self {
            Item::Window { pid, .. } | Item::App { pid, .. } => *pid,
        }
    }
}

/// Every app's windows newest first, by the window server's front-to-back
/// window numbers `z`; the minimized ones after; then the running `apps` that
/// have no window here. A shown window missing from `z` is on another Space.
pub fn items(windows: Vec<WinInfo>, z: &[u32], apps: &[(i32, String)]) -> Vec<Item> {
    let item = |w: WinInfo| Item::Window { pid: w.pid, id: w.id, title: w.title, minimized: w.minimized };
    let (minimized, shown): (Vec<WinInfo>, Vec<WinInfo>) = windows.into_iter().partition(|w| w.minimized);
    let mut shown: Vec<(usize, WinInfo)> =
        shown.into_iter().filter_map(|w| z.iter().position(|&n| n == w.id).map(|i| (i, w))).collect();
    shown.sort_by_key(|(i, _)| *i);
    let mut list: Vec<Item> = shown.into_iter().map(|(_, w)| item(w)).chain(minimized.into_iter().map(item)).collect();
    let listed: Vec<i32> = list.iter().map(Item::pid).collect();
    list.extend(apps.iter().filter(|(pid, _)| !listed.contains(pid)).map(|(pid, name)| Item::App { pid: *pid, name: name.clone() }));
    list
}

/// The apps of `items`, in the order their first item comes (Per app).
pub fn apps_of(items: &[Item]) -> Vec<i32> {
    let mut pids = Vec::new();
    for pid in items.iter().map(Item::pid) {
        if !pids.contains(&pid) {
            pids.push(pid);
        }
    }
    pids
}

/// A key event as the switcher's tap sees it; modifiers are Carbon's.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SwitchKey {
    Down { code: u16, mods: u32, repeat: bool },
    Flags { mods: u32 },
}

/// A window button's key while the switcher is open.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Act {
    Minimize,
    Close,
    Quit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SwitchAction {
    /// Not the switcher's: let it through.
    Pass,
    Open,
    /// The switcher's but does nothing: held back.
    Swallow,
    Next,
    Prev,
    NextWin,
    PrevWin,
    Commit,
    Cancel,
    Act(Act),
}

const TAB: u16 = 48;
const RETURN: u16 = 36;
const ENTER: u16 = 76;
const ESCAPE: u16 = 53;
const LEFT: u16 = 123;
const RIGHT: u16 = 124;
const DOWN: u16 = 125;
const UP: u16 = 126;
const GRAVE: u16 = 50;
const KEY_M: u16 = 46;
const KEY_W: u16 = 13;
const KEY_Q: u16 = 12;

/// Whether the switcher is open, and whether letting go of the trigger still
/// opens the selection (not after a window button was used).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SwitchKeys {
    open: bool,
    sticky: bool,
}

impl SwitchKeys {
    pub const fn new() -> Self {
        SwitchKeys { open: false, sticky: false }
    }

    pub fn on(&mut self, key: SwitchKey, trigger: Combo) -> SwitchAction {
        let held = |mods: u32| mods & trigger.mods == trigger.mods;
        let action = match key {
            SwitchKey::Down { code, mods, .. } if !self.open => {
                if u32::from(code) == trigger.code && held(mods) {
                    self.open = true;
                    self.sticky = false;
                    SwitchAction::Open
                } else {
                    SwitchAction::Pass
                }
            }
            // A trigger of its own (⌥Q, say) moves like Tab does, and never acts.
            SwitchKey::Down { code, mods, .. } if code != TAB && u32::from(code) == trigger.code => {
                if mods & SHIFT != 0 && trigger.mods & SHIFT == 0 {
                    SwitchAction::Prev
                } else {
                    SwitchAction::Next
                }
            }
            SwitchKey::Down { code, mods, .. } => match code {
                TAB if mods & SHIFT != 0 => SwitchAction::Prev,
                TAB | RIGHT => SwitchAction::Next,
                LEFT => SwitchAction::Prev,
                DOWN | GRAVE => SwitchAction::NextWin,
                UP => SwitchAction::PrevWin,
                RETURN | ENTER => SwitchAction::Commit,
                ESCAPE => SwitchAction::Cancel,
                KEY_M => SwitchAction::Act(Act::Minimize),
                KEY_W => SwitchAction::Act(Act::Close),
                KEY_Q => SwitchAction::Act(Act::Quit),
                _ => SwitchAction::Swallow,
            },
            SwitchKey::Flags { mods } if self.open && !self.sticky && !held(mods) => SwitchAction::Commit,
            SwitchKey::Flags { .. } => SwitchAction::Pass,
        };
        // Done either way: never left open, holding the keyboard.
        if matches!(action, SwitchAction::Commit | SwitchAction::Cancel) {
            self.closed();
        }
        // Set here, on the tap's thread, so a release right after cannot open.
        if matches!(action, SwitchAction::Act(_)) {
            self.sticky = true;
        }
        action
    }

    /// A window button was used: letting go of the trigger no longer opens.
    pub fn acted(&mut self) {
        self.sticky = true;
    }

    pub fn closed(&mut self) {
        *self = SwitchKeys::default();
    }

    pub fn is_open(&self) -> bool {
        self.open
    }
}

/// Why a key recorded for the switcher was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SwitchKeyError {
    /// Not a key that can be recorded, or no ⌘, ⌃ or ⌥.
    Invalid,
    /// One of Screenshot's two keys while Screenshot is on.
    Shot,
    /// One of Atur jendela's keys while that tool is on.
    Window,
    /// Keep awake's or Shelf's key while its module is on.
    App,
}

/// The switcher's key `combo` (None: not a key that can be recorded) refused
/// when Screenshot, Atur jendela or an app key holds it.
pub fn refusal(combo: Option<Combo>, shot: bool, window: bool, app: bool) -> Option<SwitchKeyError> {
    match combo {
        None => Some(SwitchKeyError::Invalid),
        Some(_) if shot => Some(SwitchKeyError::Shot),
        Some(_) if window => Some(SwitchKeyError::Window),
        Some(_) if app => Some(SwitchKeyError::App),
        Some(_) => None,
    }
}

/// ⌘Tab or ⌘⇧Tab: macOS's own switcher must be off for Notching to hear it.
pub fn needs_symbolic_off(c: Combo) -> bool {
    c.code == u32::from(TAB) && c.mods & CMD != 0 && c.mods & !(CMD | SHIFT) == 0
}

/// Which of macOS's own keys the trigger needs off: (⌘Tab, ⌘⇧Tab). ⌘Tab
/// also takes ⌘⇧Tab; ⌘⇧Tab leaves plain ⌘Tab to macOS.
pub fn native_off(c: Combo) -> (bool, bool) {
    let both = needs_symbolic_off(c);
    (both && c.mods & SHIFT == 0, both)
}

/// No window left to show: only app cards, or nothing.
pub fn nothing_left(items: &[Item]) -> bool {
    !items.iter().any(|i| matches!(i, Item::Window { .. }))
}

/// How long the panel waits from the key so a quick ⌘Tab never flashes it.
pub const SHOW_AFTER: std::time::Duration = std::time::Duration::from_millis(140);

/// What is left of that wait `since_open` after the key.
pub fn show_delay(since_open: std::time::Duration) -> std::time::Duration {
    SHOW_AFTER.saturating_sub(since_open)
}

/// Where the pointer was over the switcher's screen, so only a move picks: a
/// pointer resting where the panel appears leaves the second item chosen.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct PointerGate {
    last: Option<(f64, f64)>,
}

impl PointerGate {
    pub const fn new() -> Self {
        PointerGate { last: None }
    }

    /// The panel shows (or takes a new size) with the pointer at `p`: kept the
    /// first time, not sent.
    pub fn shown(&mut self, p: (f64, f64)) {
        self.last.get_or_insert(p);
    }

    /// The pointer at `p`: true when it moved and the page should hear it.
    pub fn moved(&mut self, p: (f64, f64)) -> bool {
        let moved = self.last != Some(p);
        self.last = Some(p);
        moved
    }

    pub fn reset(&mut self) {
        self.last = None;
    }
}

/// The second item, as ⌘Tab starts on the app before.
pub fn first_selection(len: usize) -> usize {
    usize::from(len > 1)
}

/// Moves a selection by `d`, round from end to start.
pub fn step(sel: usize, len: usize, d: i32) -> usize {
    if len == 0 {
        return 0;
    }
    (sel as i64 + i64::from(d)).rem_euclid(len as i64) as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::Rect;
    use crate::peek_rules::WinInfo;
    use crate::shot_keys::{Combo, CMD, OPTION, SHIFT};

    const CMD_TAB: Combo = Combo { code: 48, mods: CMD };

    fn down(code: u16, mods: u32) -> SwitchKey {
        SwitchKey::Down { code, mods, repeat: false }
    }

    fn opened() -> SwitchKeys {
        let mut k = SwitchKeys::default();
        assert_eq!(k.on(down(48, CMD), CMD_TAB), SwitchAction::Open);
        k
    }

    #[test]
    fn opens_on_the_trigger_only() {
        let mut k = SwitchKeys::default();
        assert_eq!(k.on(down(48, 0), CMD_TAB), SwitchAction::Pass);
        assert_eq!(k.on(down(0, CMD), CMD_TAB), SwitchAction::Pass);
        assert_eq!(k.on(SwitchKey::Flags { mods: CMD }, CMD_TAB), SwitchAction::Pass);
        assert!(!k.is_open());
        assert_eq!(k.on(down(48, CMD | SHIFT), CMD_TAB), SwitchAction::Open);
        assert!(k.is_open());
    }

    #[test]
    fn navigates_while_open() {
        let mut k = opened();
        let cases = [
            (48, CMD, SwitchAction::Next),
            (48, CMD | SHIFT, SwitchAction::Prev),
            (124, CMD, SwitchAction::Next),
            (123, CMD, SwitchAction::Prev),
            (125, CMD, SwitchAction::NextWin),
            (50, CMD, SwitchAction::NextWin),
            (126, CMD, SwitchAction::PrevWin),
            (46, CMD, SwitchAction::Act(Act::Minimize)),
            (13, CMD, SwitchAction::Act(Act::Close)),
            (12, CMD, SwitchAction::Act(Act::Quit)),
            (7, CMD, SwitchAction::Swallow), // X: held back, never reaches the app behind
        ];
        for (code, mods, want) in cases {
            assert_eq!(k.on(down(code, mods), CMD_TAB), want, "key {code}");
        }
        assert_eq!(k.on(down(36, CMD), CMD_TAB), SwitchAction::Commit);
        k.closed();
        let mut k = opened();
        assert_eq!(k.on(down(53, CMD), CMD_TAB), SwitchAction::Cancel);
    }

    #[test]
    fn releasing_the_modifier_commits() {
        let mut k = opened();
        assert_eq!(k.on(SwitchKey::Flags { mods: CMD | SHIFT }, CMD_TAB), SwitchAction::Pass);
        assert_eq!(k.on(SwitchKey::Flags { mods: 0 }, CMD_TAB), SwitchAction::Commit);
        // A quick ⌘Tab: open, then released at once.
        let mut k = opened();
        assert_eq!(k.on(SwitchKey::Flags { mods: SHIFT }, CMD_TAB), SwitchAction::Commit);
    }

    #[test]
    fn after_an_action_release_does_not_commit() {
        let mut k = opened();
        k.acted();
        assert_eq!(k.on(SwitchKey::Flags { mods: 0 }, CMD_TAB), SwitchAction::Pass);
        assert!(k.is_open());
        assert_eq!(k.on(down(36, 0), CMD_TAB), SwitchAction::Commit);
        k.closed();
        // The next opening is not sticky.
        let mut k2 = k;
        assert_eq!(k2.on(down(48, CMD), CMD_TAB), SwitchAction::Open);
        assert_eq!(k2.on(SwitchKey::Flags { mods: 0 }, CMD_TAB), SwitchAction::Commit);
    }

    #[test]
    fn another_trigger_works_too() {
        let opt_tab = Combo { code: 48, mods: OPTION };
        let mut k = SwitchKeys::default();
        assert_eq!(k.on(down(48, CMD), opt_tab), SwitchAction::Pass);
        assert_eq!(k.on(down(48, OPTION), opt_tab), SwitchAction::Open);
        assert_eq!(k.on(SwitchKey::Flags { mods: 0 }, opt_tab), SwitchAction::Commit);
    }

    fn w(pid: i32, id: u32, minimized: bool) -> WinInfo {
        WinInfo { id, pid, title: format!("w{id}"), minimized, frame: Rect { x: 0.0, y: 0.0, w: 100.0, h: 80.0 } }
    }

    #[test]
    fn items_order_windows_then_minimized_then_apps() {
        let windows = vec![w(1, 1, false), w(2, 9, false), w(1, 4, true), w(2, 5, false)];
        let apps = [(1, "Word".to_string()), (2, "Safari".to_string()), (3, "Musik".to_string())];
        let list = items(windows, &[5, 1, 9], &apps);
        let ids: Vec<String> = list
            .iter()
            .map(|i| match i {
                Item::Window { id, .. } => format!("w{id}"),
                Item::App { name, .. } => name.clone(),
            })
            .collect();
        assert_eq!(ids, vec!["w5", "w1", "w9", "w4", "Musik"]);
    }

    #[test]
    fn apps_of_follows_the_newest_window() {
        let windows = vec![w(1, 1, false), w(2, 9, false), w(2, 5, false)];
        let apps = [(1, "Word".to_string()), (2, "Safari".to_string()), (3, "Musik".to_string())];
        let list = items(windows, &[5, 1, 9], &apps);
        assert_eq!(apps_of(&list), vec![2, 1, 3]);
    }

    #[test]
    fn first_selection_is_the_second_item() {
        assert_eq!(first_selection(3), 1);
        assert_eq!(first_selection(1), 0);
        assert_eq!(first_selection(0), 0);
    }

    #[test]
    fn step_wraps() {
        assert_eq!(step(2, 3, 1), 0);
        assert_eq!(step(0, 3, -1), 2);
        assert_eq!(step(1, 3, 1), 2);
        assert_eq!(step(0, 0, 1), 0);
    }

    #[test]
    fn symbolic_off_only_for_command_tab() {
        assert!(needs_symbolic_off(CMD_TAB));
        assert!(needs_symbolic_off(Combo { code: 48, mods: CMD | SHIFT }));
        assert!(!needs_symbolic_off(Combo { code: 48, mods: OPTION }));
        assert!(!needs_symbolic_off(Combo { code: 50, mods: CMD }));
    }

    #[test]
    fn the_switcher_key_refuses_keys_others_hold() {
        let k = Some(Combo { code: 48, mods: OPTION });
        assert_eq!(refusal(None, false, false, false), Some(SwitchKeyError::Invalid));
        assert_eq!(refusal(k, true, false, false), Some(SwitchKeyError::Shot));
        assert_eq!(refusal(k, false, true, false), Some(SwitchKeyError::Window));
        assert_eq!(refusal(k, false, false, true), Some(SwitchKeyError::App));
        assert_eq!(refusal(k, false, false, false), None);
        assert_eq!(serde_json::to_value(SwitchKeyError::Shot).unwrap(), serde_json::json!({"kind": "shot"}));
    }

    #[test]
    fn other_keys_name_the_switcher_when_it_holds_theirs() {
        assert_eq!(serde_json::to_value(crate::shot_keys::SetKeyError::Peek).unwrap(), serde_json::json!("peek"));
        assert_eq!(serde_json::to_value(crate::win_rules::WinKeyError::Peek).unwrap(), serde_json::json!({"kind": "peek"}));
        assert_eq!(serde_json::to_value(crate::app_keys::AppKeyError::Peek).unwrap(), serde_json::json!({"kind": "peek"}));
        assert_eq!(crate::shot_keys::label(Combo { code: 48, mods: CMD }), "⌘⇥");
    }

    #[test]
    fn the_switcher_may_take_tab_where_other_keys_may_not() {
        use crate::shot_keys::{from_web, switch_from_web};
        assert_eq!(switch_from_web("Tab", false, false, true, false), Some(Combo { code: 48, mods: OPTION }));
        assert_eq!(switch_from_web("Tab", true, false, false, true), Some(Combo { code: 48, mods: CMD | SHIFT }));
        assert_eq!(switch_from_web("Tab", false, false, false, true), None);
        assert_eq!(switch_from_web("Backquote", true, false, false, false), Some(Combo { code: 0x32, mods: CMD }));
        assert_eq!(from_web("Tab", true, false, false, false), None);
    }

    #[test]
    fn a_window_button_makes_the_release_open_nothing_at_once() {
        // Set by the key itself, not later by the main thread: a release right after stays harmless.
        let mut k = opened();
        assert_eq!(k.on(down(13, CMD), CMD_TAB), SwitchAction::Act(Act::Close));
        assert_eq!(k.on(SwitchKey::Flags { mods: 0 }, CMD_TAB), SwitchAction::Pass);
        assert!(k.is_open());
    }

    #[test]
    fn the_trigger_key_itself_moves_while_open() {
        let opt_q = Combo { code: 12, mods: OPTION };
        let mut k = SwitchKeys::default();
        assert_eq!(k.on(down(12, OPTION), opt_q), SwitchAction::Open);
        assert_eq!(k.on(down(12, OPTION), opt_q), SwitchAction::Next); // not Quit
        assert_eq!(k.on(down(12, OPTION | SHIFT), opt_q), SwitchAction::Prev);
    }

    #[test]
    fn only_the_mac_keys_the_trigger_needs_are_turned_off() {
        assert_eq!(native_off(CMD_TAB), (true, true));
        assert_eq!(native_off(Combo { code: 48, mods: CMD | SHIFT }), (false, true));
        assert_eq!(native_off(Combo { code: 48, mods: OPTION }), (false, false));
    }

    #[test]
    fn nothing_left_when_no_window_is() {
        let app = Item::App { pid: 1, name: "Finder".into() };
        let win = Item::Window { pid: 2, id: 9, title: "x".into(), minimized: false };
        assert!(nothing_left(&[]));
        assert!(nothing_left(std::slice::from_ref(&app)));
        assert!(!nothing_left(&[app, win]));
    }

    #[test]
    fn the_panel_waits_a_moment_so_a_quick_switch_never_flashes_it() {
        use std::time::Duration;
        assert_eq!(show_delay(Duration::from_millis(40)), Duration::from_millis(100));
        assert_eq!(show_delay(Duration::from_millis(200)), Duration::ZERO);
    }

    #[test]
    fn a_resting_pointer_picks_nothing_until_it_moves() {
        let mut g = PointerGate::default();
        g.shown((10.0, 10.0));
        assert!(!g.moved((10.0, 10.0)));
        // Every size after a key keeps the first place, and moves nothing.
        g.shown((10.0, 10.0));
        assert!(!g.moved((10.0, 10.0)));
        assert!(g.moved((12.0, 10.0)));
        assert!(!g.moved((12.0, 10.0)));
        g.reset();
        g.shown((40.0, 40.0));
        assert!(!g.moved((40.0, 40.0)));
    }
}
