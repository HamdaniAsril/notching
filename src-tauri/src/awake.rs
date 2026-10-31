//! Keep awake's timing (design 31 Oct): on for some minutes or with no limit, up
//! to 24 hours, ended by the wall clock so a Mac that slept past the end stops at once.

/// The longest run, and the most minutes one call may ask for.
pub const MAX_MINUTES: u32 = 1440;
/// The status text with no limit.
pub const FOREVER_TEXT: &str = "∞";
/// The monotonic clock stops while the Mac sleeps, so the end is looked at again
/// at least this often.
pub const WAIT_MAX_MS: i64 = 60_000;
const MINUTE_MS: i64 = 60_000;

#[derive(Debug, PartialEq, Eq)]
pub enum AwakeError {
    BadMinutes,
    Off,
    NoEnd,
}

// Sent to the module as is.
impl std::fmt::Display for AwakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AwakeError::BadMinutes => write!(f, "minutes must be 1–{MAX_MINUTES}"),
            AwakeError::Off => write!(f, "keep awake is off"),
            AwakeError::NoEnd => write!(f, "keep awake has no end"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Until {
    Forever,
    /// Wall-clock milliseconds.
    At(i64),
}

/// Same shape as AwakeView in modules/keep-awake/view.ts. `until` only for a
/// timed run; `text` is the status text while on.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwakeDto {
    pub on: bool,
    pub until: Option<i64>,
    pub forever: bool,
    pub text: Option<String>,
}

/// What the service does next: nothing, end the run of this module, take down
/// a status left from a stopped run, or show the text until it changes.
#[derive(Debug, PartialEq)]
pub enum Step {
    Off,
    Ended(String),
    Clear(String),
    On { owner: String, text: String, wait_ms: i64 },
}

/// Kept in memory only: a fresh launch is always off.
#[derive(Clone, Default)]
pub struct Awake {
    owner: Option<String>,
    until: Option<Until>,
    // Whose status the last On step showed. A stop clears the status at once,
    // but a round that read On just before can set it again after that clear;
    // the next round takes it down.
    shown: Option<String>,
}

fn checked(minutes: u32) -> Result<i64, AwakeError> {
    match minutes {
        1..=MAX_MINUTES => Ok(minutes as i64 * MINUTE_MS),
        _ => Err(AwakeError::BadMinutes),
    }
}

impl Awake {
    /// `None` has no limit. A run already going is replaced.
    pub fn start(&mut self, owner: &str, now: i64, minutes: Option<u32>) -> Result<(), AwakeError> {
        let until = match minutes {
            None => Until::Forever,
            Some(m) => Until::At(now + checked(m)?),
        };
        self.owner = Some(owner.to_string());
        self.until = Some(until);
        Ok(())
    }

    /// Never past 24 hours from now. A run past its end is over, even before
    /// the service has looked (the Mac just woke).
    pub fn add(&mut self, now: i64, minutes: u32) -> Result<(), AwakeError> {
        let ms = checked(minutes)?;
        match self.until.filter(|_| !self.due(now)) {
            None => Err(AwakeError::Off),
            Some(Until::Forever) => Err(AwakeError::NoEnd),
            Some(Until::At(t)) => {
                self.until = Some(Until::At((t + ms).min(now + MAX_MINUTES as i64 * MINUTE_MS)));
                Ok(())
            }
        }
    }

    /// The owner, if it was on.
    pub fn stop(&mut self) -> Option<String> {
        self.until = None;
        self.owner.take()
    }

    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    fn due(&self, now: i64) -> bool {
        matches!(self.until, Some(Until::At(t)) if now >= t)
    }

    /// The owner when the run's time has come, even long past it; the run ends.
    pub fn end_if_due(&mut self, now: i64) -> Option<String> {
        if !self.due(now) {
            return None;
        }
        self.stop()
    }

    pub fn view(&self, now: i64) -> AwakeDto {
        match self.until.filter(|_| !self.due(now)) {
            None => AwakeDto { on: false, until: None, forever: false, text: None },
            Some(Until::Forever) => AwakeDto { on: true, until: None, forever: true, text: Some(FOREVER_TEXT.into()) },
            Some(Until::At(t)) => {
                AwakeDto { on: true, until: Some(t), forever: false, text: Some(status_text(t - now)) }
            }
        }
    }

    /// Ends a run whose time has come, even long past it.
    pub fn step(&mut self, now: i64) -> Step {
        if let Some(owner) = self.end_if_due(now) {
            // This round clears the status itself, and only rounds set it.
            self.shown = None;
            return Step::Ended(owner);
        }
        let Some(owner) = self.owner.clone() else {
            return self.shown.take().map_or(Step::Off, Step::Clear);
        };
        self.shown = Some(owner.clone());
        match self.until {
            None => Step::Off,
            Some(Until::At(t)) => {
                let left = t - now;
                let minutes = (left + MINUTE_MS - 1) / MINUTE_MS;
                let wait_ms = (left - (minutes - 1) * MINUTE_MS).min(WAIT_MAX_MS);
                Step::On { owner, text: status_text(left), wait_ms }
            }
            Some(Until::Forever) => Step::On { owner, text: FOREVER_TEXT.into(), wait_ms: WAIT_MAX_MS },
        }
    }
}

/// "1:42" from an hour on, "42m" below (not "0:42", which reads as seconds);
/// minutes rounded up.
pub fn status_text(remaining_ms: i64) -> String {
    let m = ((remaining_ms + MINUTE_MS - 1) / MINUTE_MS).max(1);
    if m >= 60 {
        format!("{}:{:02}", m / 60, m % 60)
    } else {
        format!("{m}m")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const M: i64 = 60_000;
    const T: i64 = 1_000_000_000;

    #[test]
    fn start_takes_1_to_1440_minutes_or_no_limit() {
        let mut a = Awake::default();
        assert_eq!(a.start("k", T, Some(0)), Err(AwakeError::BadMinutes));
        assert_eq!(a.start("k", T, Some(1441)), Err(AwakeError::BadMinutes));
        assert_eq!(a.owner(), None);
        assert!(a.start("k", T, Some(1)).is_ok());
        assert!(a.start("k", T, Some(1440)).is_ok());
        assert!(a.start("k", T, None).is_ok());
        assert_eq!(a.owner(), Some("k"));
    }

    #[test]
    fn starting_again_replaces_the_end() {
        let mut a = Awake::default();
        a.start("k", T, Some(120)).unwrap();
        a.start("k", T, Some(60)).unwrap();
        assert_eq!(a.view(T).until, Some(T + 60 * M));
    }

    #[test]
    fn add_extends_and_stops_at_24_hours() {
        let mut a = Awake::default();
        a.start("k", T, Some(20)).unwrap();
        a.add(T, 30).unwrap();
        assert_eq!(a.view(T).until, Some(T + 50 * M));
        a.add(T, 1440).unwrap();
        assert_eq!(a.view(T).until, Some(T + 1440 * M));
        assert_eq!(a.view(T).text.as_deref(), Some("24:00"));
        assert_eq!(a.add(T, 0), Err(AwakeError::BadMinutes));
    }

    #[test]
    fn add_needs_a_timed_run() {
        let mut a = Awake::default();
        assert_eq!(a.add(T, 15), Err(AwakeError::Off));
        a.start("k", T, None).unwrap();
        assert_eq!(a.add(T, 15), Err(AwakeError::NoEnd));
    }

    #[test]
    fn status_text_rounds_minutes_up() {
        assert_eq!(status_text(102 * M), "1:42");
        assert_eq!(status_text(60 * M), "1:00");
        assert_eq!(status_text(59 * M + 1_000), "1:00");
        assert_eq!(status_text(42 * M), "42m");
        assert_eq!(status_text(30_000), "1m");
        assert_eq!(status_text(1440 * M), "24:00");
    }

    #[test]
    fn view_follows_the_state() {
        let mut a = Awake::default();
        assert_eq!(a.view(T), AwakeDto { on: false, until: None, forever: false, text: None });
        a.start("k", T, None).unwrap();
        assert_eq!(a.view(T), AwakeDto { on: true, until: None, forever: true, text: Some("∞".into()) });
        a.start("k", T, Some(102)).unwrap();
        assert_eq!(a.view(T), AwakeDto { on: true, until: Some(T + 102 * M), forever: false, text: Some("1:42".into()) });
    }

    #[test]
    fn step_waits_until_the_text_changes() {
        let mut a = Awake::default();
        assert_eq!(a.step(T), Step::Off);
        a.start("k", T, Some(103)).unwrap();
        // 102.5 minutes left: "1:43" until 102 minutes are left.
        assert_eq!(a.step(T + 30_000), Step::On { owner: "k".into(), text: "1:43".into(), wait_ms: 30_000 });
        a.start("k", T, None).unwrap();
        assert_eq!(a.step(T), Step::On { owner: "k".into(), text: "∞".into(), wait_ms: WAIT_MAX_MS });
    }

    #[test]
    fn it_ends_once_at_its_time() {
        let mut a = Awake::default();
        a.start("k", T, Some(1)).unwrap();
        assert!(matches!(a.step(T + M - 1), Step::On { wait_ms: 1, .. }));
        assert_eq!(a.step(T + M), Step::Ended("k".into()));
        assert_eq!(a.step(T + M), Step::Off);
        assert!(!a.view(T + M).on);
    }

    #[test]
    fn a_clock_jump_past_the_end_ends_at_once() {
        let mut a = Awake::default();
        a.start("k", T, Some(60)).unwrap();
        assert_eq!(a.step(T + 180 * M), Step::Ended("k".into()));
    }

    #[test]
    fn a_status_shown_is_cleared_once_after_a_stop() {
        let mut a = Awake::default();
        a.start("k", T, Some(60)).unwrap();
        assert!(matches!(a.step(T), Step::On { .. }));
        a.stop();
        // A status set after the stop's own clear goes on the next round.
        assert_eq!(a.step(T), Step::Clear("k".into()));
        assert_eq!(a.step(T), Step::Off);
    }

    #[test]
    fn a_run_past_its_end_takes_no_more_time() {
        let mut a = Awake::default();
        a.start("k", T, Some(60)).unwrap();
        assert!(!a.view(T + 90 * M).on);
        assert_eq!(a.add(T + 90 * M, 60), Err(AwakeError::Off));
        assert_eq!(a.end_if_due(T + 59 * M), None);
        assert_eq!(a.end_if_due(T + 90 * M), Some("k".into()));
        assert_eq!(a.end_if_due(T + 90 * M), None);
        assert_eq!(a.step(T + 90 * M), Step::Off);
    }

    #[test]
    fn a_status_shown_before_an_end_is_cleared_once_after_it() {
        let mut a = Awake::default();
        a.start("k", T, Some(60)).unwrap();
        assert!(matches!(a.step(T), Step::On { .. }));
        assert_eq!(a.end_if_due(T + 90 * M), Some("k".into()));
        assert_eq!(a.step(T + 90 * M), Step::Clear("k".into()));
        assert_eq!(a.step(T + 90 * M), Step::Off);
    }

    #[test]
    fn stop_reports_the_owner_once() {
        let mut a = Awake::default();
        assert_eq!(a.stop(), None);
        a.start("k", T, Some(60)).unwrap();
        assert_eq!(a.stop(), Some("k".into()));
        assert_eq!(a.stop(), None);
    }
}
