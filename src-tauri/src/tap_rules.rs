//! When a key or mouse tap macOS turned off may come back, and when the
//! Accessibility permission changed (owner's Mac, 6 Nov 2026: the permission
//! taken away while the taps were in left clicks and keys working only now and
//! then, until a forced restart). No AppKit here.

use std::time::{Duration, Instant};

/// How many times a tap may come back within WINDOW before it stays off.
const MAX_OFFS: usize = 3;
const WINDOW: Duration = Duration::from_secs(10);

/// A tap's record of being turned off by macOS (too slow, or the permission
/// gone). Off without the permission, or too often, it stays off: a tap
/// fighting macOS is what holds the keyboard and the pointer up.
#[derive(Clone, Debug, Default)]
pub struct Revive {
    offs: Vec<Instant>,
    dead: bool,
}

impl Revive {
    pub const fn new() -> Self {
        Revive { offs: Vec::new(), dead: false }
    }

    /// macOS turned the tap off at `now`; `trusted`: the permission is still
    /// there. True when it may be turned back on.
    pub fn after_off(&mut self, now: Instant, trusted: bool) -> bool {
        self.offs.retain(|t| now.saturating_duration_since(*t) < WINDOW);
        if self.dead || !trusted || self.offs.len() >= MAX_OFFS {
            self.dead = true;
            return false;
        }
        self.offs.push(now);
        true
    }

    /// Left off for good: the next sync takes the tap out.
    pub fn dead(&self) -> bool {
        self.dead
    }

    /// A new tap.
    pub fn reset(&mut self) {
        *self = Revive::new();
    }
}

/// Whether Notching has Accessibility. A no from AXIsProcessTrusted (`ax`)
/// stands. Its yes is checked by `can_tap` (making a tap and taking it down
/// again): when the permission is removed with "−", AXIsProcessTrusted keeps
/// its yes for the app's life, and TCC's own preflight keeps its first answer
/// too, but macOS refuses a new tap at once (CekIzin probe, owner's Mac, 6 Nov
/// 2026).
pub fn access_from(ax: bool, can_tap: impl FnOnce() -> bool) -> bool {
    ax && can_tap()
}

/// The Accessibility permission as last read, to tell when it changed.
#[derive(Clone, Copy, Debug, Default)]
pub struct AccessWatch {
    last: Option<bool>,
}

impl AccessWatch {
    /// True when `now` differs from the last reading; the first reading only
    /// sets where it stands, as launch already acted on it.
    pub fn changed(&mut self, now: bool) -> bool {
        let was = self.last.replace(now);
        was.is_some_and(|w| w != now)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tap_comes_back_while_the_permission_is_there() {
        let mut r = Revive::default();
        assert!(r.after_off(Instant::now(), true));
        assert!(!r.dead());
    }

    #[test]
    fn without_the_permission_a_tap_stays_off() {
        let mut r = Revive::default();
        assert!(!r.after_off(Instant::now(), false));
        assert!(r.dead());
        // Off for good, even when the permission reads as there again.
        assert!(!r.after_off(Instant::now(), true));
    }

    #[test]
    fn a_tap_turned_off_too_often_stays_off() {
        let mut r = Revive::default();
        let t = Instant::now();
        for i in 0..3 {
            assert!(r.after_off(t + Duration::from_secs(i), true), "off number {}", i + 1);
        }
        assert!(!r.after_off(t + Duration::from_secs(3), true));
        assert!(r.dead());
    }

    #[test]
    fn offs_far_apart_never_add_up() {
        let mut r = Revive::default();
        let t = Instant::now();
        for i in 0..10 {
            assert!(r.after_off(t + Duration::from_secs(11 * i), true));
        }
        assert!(!r.dead());
    }

    #[test]
    fn a_new_tap_starts_fresh() {
        let mut r = Revive::default();
        r.after_off(Instant::now(), false);
        r.reset();
        assert!(!r.dead());
        assert!(r.after_off(Instant::now(), true));
    }

    #[test]
    fn only_a_change_of_permission_counts() {
        let mut w = AccessWatch::default();
        assert!(!w.changed(true)); // the first reading: what launch already used
        assert!(!w.changed(true));
        assert!(w.changed(false));
        assert!(!w.changed(false));
        assert!(w.changed(true));
    }

    #[test]
    fn a_permission_removed_counts_even_when_accessibility_still_says_yes() {
        // Removed with "−", AXIsProcessTrusted keeps its yes; macOS refuses a
        // new tap at once (CekIzin probe, 6 Nov 2026).
        assert!(!access_from(true, || false));
        assert!(access_from(true, || true));
    }

    #[test]
    fn accessibilitys_no_needs_no_test_tap() {
        // Switched off, AXIsProcessTrusted says no at once: no tap is tried.
        assert!(!access_from(false, || panic!("no test tap without Accessibility's yes")));
    }
}
