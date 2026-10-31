//! Timer's countdown (design 31 Oct, Timer): whole minutes 1–60, paused or
//! running, ended by the wall clock so a Mac that slept past the end stops at once.

/// The longest timer, and the most minutes one start may ask for.
pub const MAX_MINUTES: u32 = 60;
/// The ruler's place before anything was started.
pub const DEFAULT_MINUTES: u32 = 5;
/// The monotonic clock stops while the Mac sleeps, so an idle or paused timer
/// is looked at again at least this often.
pub const WAIT_MAX_MS: i64 = 60_000;
const SECOND_MS: i64 = 1_000;
const MINUTE_MS: i64 = 60_000;

#[derive(Debug, PartialEq, Eq)]
pub enum TimerError {
    BadMinutes,
    NotRunning,
    NotPaused,
}

// Sent to the module as is.
impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TimerError::BadMinutes => write!(f, "minutes must be 1–{MAX_MINUTES}"),
            TimerError::NotRunning => write!(f, "the timer is not running"),
            TimerError::NotPaused => write!(f, "the timer is not paused"),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    Idle,
    Running,
    Paused,
}

/// Same shape as TimerView in modules/timer/view.ts. `minutes` is the last
/// started (or the default); `until` only while running; `left` while running
/// or paused; `text` the status text unless idle.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerDto {
    pub state: TimerState,
    pub minutes: u32,
    pub until: Option<i64>,
    pub left: Option<i64>,
    pub text: Option<String>,
}

/// What the service does next: nothing, end the timer of this module, take
/// down a status left from a stopped timer, or show the text until it changes.
#[derive(Debug, PartialEq)]
pub enum Step {
    Off,
    Ended { owner: String, minutes: u32 },
    Clear(String),
    On { owner: String, text: String, wait_ms: i64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Idle,
    /// Wall-clock milliseconds.
    Running { until: i64 },
    Paused { left: i64 },
}

/// Kept in memory only: a fresh launch has no timer.
#[derive(Clone)]
pub struct Timer {
    owner: Option<String>,
    phase: Phase,
    minutes: u32,
    // Whose status the last On step showed; as in awake.rs, a round that read
    // On just before a stop can set it again, and the next round takes it down.
    shown: Option<String>,
}

impl Default for Timer {
    fn default() -> Self {
        Timer { owner: None, phase: Phase::Idle, minutes: DEFAULT_MINUTES, shown: None }
    }
}

impl Timer {
    /// A timer already running or paused is replaced.
    pub fn start(&mut self, owner: &str, now: i64, minutes: u32) -> Result<(), TimerError> {
        if !(1..=MAX_MINUTES).contains(&minutes) {
            return Err(TimerError::BadMinutes);
        }
        self.owner = Some(owner.to_string());
        self.phase = Phase::Running { until: now + minutes as i64 * MINUTE_MS };
        self.minutes = minutes;
        Ok(())
    }

    /// A timer past its end is over, even before the service has looked.
    pub fn pause(&mut self, now: i64) -> Result<(), TimerError> {
        match self.live(now) {
            Phase::Running { until } => {
                self.phase = Phase::Paused { left: until - now };
                Ok(())
            }
            _ => Err(TimerError::NotRunning),
        }
    }

    pub fn resume(&mut self, now: i64) -> Result<(), TimerError> {
        match self.phase {
            Phase::Paused { left } => {
                self.phase = Phase::Running { until: now + left };
                Ok(())
            }
            _ => Err(TimerError::NotPaused),
        }
    }

    /// The owner, if a timer was running or paused.
    pub fn stop(&mut self) -> Option<String> {
        self.phase = Phase::Idle;
        self.owner.take()
    }

    pub fn owner(&self) -> Option<&str> {
        self.owner.as_deref()
    }

    fn due(&self, now: i64) -> bool {
        matches!(self.phase, Phase::Running { until } if now >= until)
    }

    // The phase as it stands at `now`: a due timer counts as idle.
    fn live(&self, now: i64) -> Phase {
        if self.due(now) { Phase::Idle } else { self.phase }
    }

    /// The owner and minutes when the timer's time has come, even long past
    /// it; the timer ends.
    pub fn end_if_due(&mut self, now: i64) -> Option<(String, u32)> {
        if !self.due(now) {
            return None;
        }
        self.stop().map(|owner| (owner, self.minutes))
    }

    pub fn view(&self, now: i64) -> TimerDto {
        let (state, until, left) = match self.live(now) {
            Phase::Idle => (TimerState::Idle, None, None),
            Phase::Running { until } => (TimerState::Running, Some(until), Some(until - now)),
            Phase::Paused { left } => (TimerState::Paused, None, Some(left)),
        };
        TimerDto { state, minutes: self.minutes, until, left, text: left.map(status_text) }
    }

    /// Ends a timer whose time has come, even long past it.
    pub fn step(&mut self, now: i64) -> Step {
        if let Some((owner, minutes)) = self.end_if_due(now) {
            // This round clears the status itself, and only rounds set it.
            self.shown = None;
            return Step::Ended { owner, minutes };
        }
        let Some(owner) = self.owner.clone() else {
            return self.shown.take().map_or(Step::Off, Step::Clear);
        };
        self.shown = Some(owner.clone());
        match self.phase {
            Phase::Idle => Step::Off,
            Phase::Running { until } => {
                let left = until - now;
                let secs = (left + SECOND_MS - 1) / SECOND_MS;
                let wait_ms = (left - (secs - 1) * SECOND_MS).min(WAIT_MAX_MS);
                Step::On { owner, text: status_text(left), wait_ms }
            }
            Phase::Paused { left } => Step::On { owner, text: status_text(left), wait_ms: WAIT_MAX_MS },
        }
    }
}

/// "6:42": minutes and seconds left, seconds rounded up, never below "0:01".
pub fn status_text(left_ms: i64) -> String {
    let s = ((left_ms + SECOND_MS - 1) / SECOND_MS).max(1);
    format!("{}:{:02}", s / 60, s % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: i64 = 1_000;
    const M: i64 = 60_000;
    const T: i64 = 1_000_000_000;

    #[test]
    fn start_takes_1_to_60_minutes() {
        let mut t = Timer::default();
        assert_eq!(t.start("t", T, 0), Err(TimerError::BadMinutes));
        assert_eq!(t.start("t", T, 61), Err(TimerError::BadMinutes));
        assert_eq!(t.owner(), None);
        assert_eq!(t.view(T).minutes, DEFAULT_MINUTES);
        t.start("t", T, 60).unwrap();
        assert_eq!(
            t.view(T),
            TimerDto { state: TimerState::Running, minutes: 60, until: Some(T + 60 * M), left: Some(60 * M), text: Some("60:00".into()) }
        );
    }

    #[test]
    fn starting_again_replaces_the_timer() {
        let mut t = Timer::default();
        t.start("t", T, 10).unwrap();
        t.pause(T + M).unwrap();
        t.start("t", T + M, 3).unwrap();
        assert_eq!(t.view(T + M).until, Some(T + 4 * M));
    }

    #[test]
    fn pause_keeps_what_is_left_and_resume_goes_on_from_it() {
        let mut t = Timer::default();
        assert_eq!(t.pause(T), Err(TimerError::NotRunning));
        assert_eq!(t.resume(T), Err(TimerError::NotPaused));
        t.start("t", T, 10).unwrap();
        t.pause(T + 3 * M + 18 * S).unwrap();
        // Time asleep or waiting does not count while paused.
        let v = t.view(T + 500 * M);
        assert_eq!((v.state, v.until, v.left, v.text.as_deref()), (TimerState::Paused, None, Some(6 * M + 42 * S), Some("6:42")));
        assert_eq!(t.pause(T + 500 * M), Err(TimerError::NotRunning));
        t.resume(T + 500 * M).unwrap();
        assert_eq!(t.view(T + 500 * M).until, Some(T + 500 * M + 6 * M + 42 * S));
    }

    #[test]
    fn status_text_is_minutes_and_seconds_rounded_up() {
        assert_eq!(status_text(6 * M + 42 * S), "6:42");
        assert_eq!(status_text(6 * M + 41 * S + 1), "6:42");
        assert_eq!(status_text(60 * M), "60:00");
        assert_eq!(status_text(9 * S), "0:09");
        assert_eq!(status_text(1), "0:01");
    }

    #[test]
    fn step_waits_until_the_next_second() {
        let mut t = Timer::default();
        assert_eq!(t.step(T), Step::Off);
        t.start("t", T, 5).unwrap();
        assert_eq!(t.step(T + 300), Step::On { owner: "t".into(), text: "5:00".into(), wait_ms: 700 });
        t.pause(T + 300).unwrap();
        assert_eq!(t.step(T + 300), Step::On { owner: "t".into(), text: "5:00".into(), wait_ms: WAIT_MAX_MS });
    }

    #[test]
    fn it_ends_once_at_its_time_with_its_minutes() {
        let mut t = Timer::default();
        t.start("t", T, 1).unwrap();
        assert!(matches!(t.step(T + M - 1), Step::On { wait_ms: 1, .. }));
        assert_eq!(t.step(T + M), Step::Ended { owner: "t".into(), minutes: 1 });
        assert_eq!(t.step(T + M), Step::Off);
        let v = t.view(T + M);
        assert_eq!((v.state, v.minutes, v.text), (TimerState::Idle, 1, None));
    }

    #[test]
    fn a_clock_jump_past_the_end_ends_at_once() {
        let mut t = Timer::default();
        t.start("t", T, 25).unwrap();
        assert_eq!(t.view(T + 180 * M).state, TimerState::Idle);
        assert_eq!(t.pause(T + 180 * M), Err(TimerError::NotRunning));
        assert_eq!(t.end_if_due(T + 180 * M), Some(("t".into(), 25)));
        assert_eq!(t.end_if_due(T + 180 * M), None);
    }

    #[test]
    fn a_status_shown_is_cleared_once_after_a_stop() {
        let mut t = Timer::default();
        t.start("t", T, 5).unwrap();
        assert!(matches!(t.step(T), Step::On { .. }));
        t.stop();
        assert_eq!(t.step(T), Step::Clear("t".into()));
        assert_eq!(t.step(T), Step::Off);
    }

    #[test]
    fn stop_reports_the_owner_once_and_keeps_the_minutes() {
        let mut t = Timer::default();
        assert_eq!(t.stop(), None);
        t.start("t", T, 25).unwrap();
        assert_eq!(t.stop(), Some("t".into()));
        assert_eq!(t.stop(), None);
        assert_eq!(t.view(T).minutes, 25);
    }

    #[test]
    fn errors_read_plainly() {
        assert_eq!(TimerError::BadMinutes.to_string(), "minutes must be 1–60");
        assert_eq!(TimerError::NotRunning.to_string(), "the timer is not running");
        assert_eq!(TimerError::NotPaused.to_string(), "the timer is not paused");
    }
}
