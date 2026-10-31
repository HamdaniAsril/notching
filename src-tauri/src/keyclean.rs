//! Keyboard Cleaning Mode's rules (design 31 Oct, Keyboard Cleaning Mode): five
//! Esc presses end it, a pause of 3 s starts the count again, and it ends by
//! itself after 10 minutes.

/// Esc presses that end the mode.
pub const ESC_PRESSES: u8 = 5;
/// A pause this long without Esc starts the count again.
pub const PRESS_WINDOW_MS: i64 = 3_000;
/// The mode ends by itself this long after it started, in case nothing else works.
pub const SAFETY_MS: i64 = 600_000;
/// The monotonic clock stops while the Mac sleeps, so the safety is looked at
/// again at least this often.
pub const WAIT_MAX_MS: i64 = 60_000;

#[derive(Debug, PartialEq, Eq)]
pub enum Toggle {
    On,
    /// The owner it was on for.
    Off(String),
}

#[derive(Debug, PartialEq, Eq)]
pub enum Press {
    /// The mode is off.
    Ignored,
    Count(u8),
    /// The fifth press: the mode is over for this owner. The service ends it
    /// with `stop`, which gives it the owner whose status goes.
    Done(String),
}

/// What the service does next: nothing, end the mode at its safety (with
/// `stop`), put the count back to zero, or wait this long.
#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Off,
    Ended(String),
    Reset,
    Wait(i64),
}

/// Why the keyboard cannot be locked now; nothing dims then.
#[derive(Debug, PartialEq, Eq)]
pub enum Blocked {
    /// macOS has not let Notching filter keys (Accessibility).
    Permission,
    /// An app has secure input on (a password field, Terminal's Secure Keyboard
    /// Entry): an event tap gets no keys, so they would reach the app below.
    SecureInput,
}

pub fn blocked(trusted: bool, secure_input: bool) -> Option<Blocked> {
    match (trusted, secure_input) {
        (false, _) => Some(Blocked::Permission),
        (true, true) => Some(Blocked::SecureInput),
        (true, false) => None,
    }
}

/// Kept in memory only: a fresh launch is always off.
#[derive(Default)]
pub struct KeyClean {
    owner: Option<String>,
    started: i64,
    presses: u8,
    last_press: i64,
}

impl KeyClean {
    /// On when off, off when on.
    pub fn toggle(&mut self, owner: &str, now: i64) -> Toggle {
        if let Some(was) = self.stop() {
            return Toggle::Off(was);
        }
        self.owner = Some(owner.to_string());
        self.started = now;
        Toggle::On
    }

    pub fn esc(&mut self, now: i64) -> Press {
        if self.owner.is_none() {
            return Press::Ignored;
        }
        self.presses = self.presses(now) + 1;
        self.last_press = now;
        if self.presses < ESC_PRESSES {
            return Press::Count(self.presses);
        }
        self.presses = 0;
        self.owner.clone().map_or(Press::Ignored, Press::Done)
    }

    /// The owner, if it was on.
    pub fn stop(&mut self) -> Option<String> {
        self.presses = 0;
        self.owner.take()
    }

    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    /// The presses that still count at `now`.
    pub fn presses(&self, now: i64) -> u8 {
        if now - self.last_press >= PRESS_WINDOW_MS { 0 } else { self.presses }
    }

    pub fn step(&mut self, now: i64) -> Step {
        if self.owner.is_none() {
            return Step::Off;
        }
        let safety = self.started + SAFETY_MS;
        if now >= safety {
            return self.owner.clone().map_or(Step::Off, Step::Ended);
        }
        if self.presses > 0 && self.presses(now) == 0 {
            self.presses = 0;
            return Step::Reset;
        }
        let next = if self.presses > 0 { safety.min(self.last_press + PRESS_WINDOW_MS) } else { safety };
        Step::Wait((next - now).min(WAIT_MAX_MS))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_000_000_000;

    #[test]
    fn toggle_turns_on_then_off() {
        let mut k = KeyClean::default();
        assert_eq!(k.owner(), None);
        assert_eq!(k.toggle("k", T), Toggle::On);
        assert_eq!(k.owner(), Some("k"));
        assert_eq!(k.toggle("k", T + 5), Toggle::Off("k".into()));
        assert_eq!(k.owner(), None);
    }

    #[test]
    fn five_esc_end_it() {
        let mut k = KeyClean::default();
        assert_eq!(k.esc(T), Press::Ignored);
        k.toggle("k", T);
        for n in 1..=4 {
            assert_eq!(k.esc(T + n as i64 * 100), Press::Count(n));
            assert_eq!(k.presses(T + n as i64 * 100), n);
        }
        assert_eq!(k.esc(T + 500), Press::Done("k".into()));
        // The service ends it with stop(), which hands it the owner whose status goes.
        assert_eq!(k.owner(), Some("k"));
        assert_eq!(k.stop(), Some("k".into()));
        assert_eq!(k.esc(T + 600), Press::Ignored);
    }

    #[test]
    fn a_gap_resets_the_count() {
        let mut k = KeyClean::default();
        k.toggle("k", T);
        k.esc(T);
        k.esc(T + 1_000);
        assert_eq!(k.presses(T + 999 + PRESS_WINDOW_MS), 2);
        assert_eq!(k.presses(T + 1_000 + PRESS_WINDOW_MS), 0);
        assert_eq!(k.step(T + 2_000), Step::Wait(PRESS_WINDOW_MS - 1_000));
        assert_eq!(k.step(T + 1_000 + PRESS_WINDOW_MS), Step::Reset);
        assert!(matches!(k.step(T + 1_000 + PRESS_WINDOW_MS), Step::Wait(_)));
        assert_eq!(k.esc(T + 9_000), Press::Count(1));
    }

    #[test]
    fn a_press_after_a_gap_counts_from_one_even_before_the_reset_step() {
        let mut k = KeyClean::default();
        k.toggle("k", T);
        for n in 0..4 {
            k.esc(T + n * 100);
        }
        assert_eq!(k.esc(T + 300 + PRESS_WINDOW_MS + 1), Press::Count(1));
    }

    #[test]
    fn the_safety_ends_it_after_ten_minutes() {
        let mut k = KeyClean::default();
        assert_eq!(k.step(T), Step::Off);
        k.toggle("k", T);
        assert_eq!(k.step(T + SAFETY_MS - 1), Step::Wait(1));
        assert_eq!(k.step(T), Step::Wait(WAIT_MAX_MS));
        assert_eq!(k.step(T + SAFETY_MS), Step::Ended("k".into()));
        assert_eq!(k.stop(), Some("k".into()));
        assert_eq!(k.step(T + SAFETY_MS), Step::Off);
    }

    #[test]
    fn it_needs_accessibility_and_no_secure_input() {
        assert_eq!(blocked(true, false), None);
        assert_eq!(blocked(false, false), Some(Blocked::Permission));
        // With secure input on, a tap gets no keys: they would reach the app below.
        assert_eq!(blocked(true, true), Some(Blocked::SecureInput));
        assert_eq!(blocked(false, true), Some(Blocked::Permission));
    }

    #[test]
    fn stop_ends_once() {
        let mut k = KeyClean::default();
        assert_eq!(k.stop(), None);
        k.toggle("k", T);
        k.esc(T);
        assert_eq!(k.stop(), Some("k".into()));
        assert_eq!(k.stop(), None);
        k.toggle("k", T + 10);
        assert_eq!(k.presses(T + 10), 0);
    }
}
