//! Sends Beranda's notices on time: reminders with a time, and prayer times when
//! that channel is on (spec 4.4).

use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use chrono::{Days, Local, TimeZone};
use tauri::{AppHandle, Manager};

use super::prayer::{day_times, PrayerTime};
use super::reminders::Reminder;
use super::HomeState;
use crate::app_core::CoreState;
use crate::locale::Lang;
use crate::notify;

/// A notice more than this late (the Mac was asleep) is not sent at all.
pub const LATE_MS: i64 = 10 * 60_000;
/// The monotonic clock stops while the Mac sleeps, so the schedule is looked at
/// again at least this often.
pub const MAX_SLEEP_MS: i64 = 60_000;
// Prayer times already sent, by time.
const FIRED_KEEP: usize = 20;

#[derive(Clone, Debug, PartialEq)]
pub enum Due {
    Reminder { id: u64, title: String, at: i64 },
    Prayer(PrayerTime),
}

impl Due {
    fn at(&self) -> i64 {
        match self {
            Due::Reminder { at, .. } => *at,
            Due::Prayer(p) => p.at,
        }
    }
}

fn waiting(r: &Reminder) -> Option<i64> {
    r.at.filter(|_| !r.done && !r.notified)
}

fn on_time(now: i64, at: i64) -> bool {
    now - LATE_MS < at && at <= now
}

/// What to send now, oldest first.
pub fn due(now: i64, reminders: &[Reminder], prayers: &[PrayerTime], fired: &[i64]) -> Vec<Due> {
    let reminders = reminders.iter().filter_map(|r| {
        let at = waiting(r).filter(|&at| on_time(now, at))?;
        Some(Due::Reminder { id: r.id, title: r.title.clone(), at })
    });
    let prayers = prayers.iter().filter(|p| on_time(now, p.at) && !fired.contains(&p.at)).cloned().map(Due::Prayer);
    let mut all: Vec<Due> = reminders.chain(prayers).collect();
    all.sort_by_key(Due::at);
    all
}

/// Until the next event, between one second and a minute.
pub fn sleep_ms(now: i64, reminders: &[Reminder], prayers: &[PrayerTime]) -> i64 {
    reminders
        .iter()
        .filter_map(waiting)
        .chain(prayers.iter().map(|p| p.at))
        .filter(|&at| at > now)
        .map(|at| at - now)
        .min()
        .unwrap_or(MAX_SLEEP_MS)
        .clamp(1_000, MAX_SLEEP_MS)
}

/// Set and signalled by `poke`, so a change wakes the schedule at once.
pub struct SchedulerState(pub Arc<(Mutex<bool>, Condvar)>);

pub fn start(app: AppHandle) {
    let signal = Arc::new((Mutex::new(false), Condvar::new()));
    app.manage(SchedulerState(signal.clone()));
    let spawned = std::thread::Builder::new().name("notching-schedule".into()).spawn(move || {
        let mut fired = Vec::new();
        loop {
            let ms = tick(&app, &mut fired);
            let (lock, cvar) = &*signal;
            let mut poked = lock.lock().unwrap();
            if !*poked {
                poked = cvar.wait_timeout(poked, Duration::from_millis(ms as u64)).unwrap().0;
            }
            *poked = false;
        }
    });
    if let Err(e) = spawned {
        eprintln!("notching: the notice schedule did not start: {e}");
    }
}

/// Look at the schedule again now: a reminder, the city or a channel changed.
pub fn poke(app: &AppHandle) {
    if let Some(state) = app.try_state::<SchedulerState>() {
        let (lock, cvar) = &*state.0;
        *lock.lock().unwrap() = true;
        cvar.notify_one();
    }
}

fn clock(at: i64, lang: Lang) -> String {
    let format = if lang == Lang::Id { "%H.%M" } else { "%H:%M" };
    Local.timestamp_millis_opt(at).single().map(|t| t.format(format).to_string()).unwrap_or_default()
}

// Sends what is due and says how long to sleep. No lock is held while posting.
fn tick(app: &AppHandle, fired: &mut Vec<i64>) -> i64 {
    let now = Local::now();
    let (home, prayers_on, lang) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.home().clone(), core.channel("home", "prayer").is_some_and(|p| p.on), core.lang())
    };
    let prayers: Vec<PrayerTime> = match &home.place {
        Some(place) if prayers_on => {
            let today = now.date_naive();
            let days = [Some(today), today.checked_add_days(Days::new(1))];
            days.into_iter().flatten().flat_map(|d| day_times(d, place, home.prayer_method)).collect()
        }
        _ => Vec::new(),
    };
    let reminders = app.state::<HomeState>().0.lock().unwrap().reminders.items().to_vec();
    let mut sent = Vec::new();
    for d in due(now.timestamp_millis(), &reminders, &prayers, fired) {
        match d {
            Due::Reminder { id, title, at } => {
                let _ = notify::post(app, "home", "reminder", &title, &clock(at, lang));
                // Even when the channel is off, so switching it on later brings no old reminders.
                sent.push(id);
            }
            Due::Prayer(p) => {
                let name = serde_json::to_value(p.name).ok().and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
                let (template, label) = {
                    let core = app.state::<CoreState>();
                    let core = core.0.lock().unwrap();
                    (core.module_text("home", "notice.prayer"), core.module_text("home", &format!("prayers.{name}")))
                };
                let label = label.unwrap_or(name);
                let title = template.map_or(label.clone(), |t| t.replace("{name}", &label));
                let _ = notify::post(app, "home", "prayer", &title, &clock(p.at, lang));
                fired.push(p.at);
                if fired.len() > FIRED_KEEP {
                    fired.remove(0);
                }
            }
        }
    }
    let saved = match sent.is_empty() {
        true => Ok(()),
        false => app.state::<HomeState>().0.lock().unwrap().reminders.mark_notified(&sent),
    };
    if let Err(e) = saved {
        eprintln!("notching: saving sent reminders failed: {e}");
    }
    sleep_ms(Local::now().timestamp_millis(), &reminders, &prayers)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::prayer::PrayerName;

    fn r(id: u64, at: Option<i64>) -> Reminder {
        Reminder { id, title: format!("R{id}"), day: "2026-10-29".into(), at, done: false, notified: false }
    }

    fn rem(id: u64, at: i64) -> Due {
        Due::Reminder { id, title: format!("R{id}"), at }
    }

    #[test]
    fn a_reminder_fires_once_at_its_time() {
        assert!(due(999, &[r(1, Some(1000))], &[], &[]).is_empty());
        assert_eq!(due(1000, &[r(1, Some(1000))], &[], &[]), [rem(1, 1000)]);
        let sent = Reminder { notified: true, ..r(1, Some(1000)) };
        assert!(due(1000, &[sent], &[], &[]).is_empty());
    }

    #[test]
    fn events_older_than_ten_minutes_never_fire() {
        let now = 100 * 60_000;
        assert!(due(now, &[r(1, Some(now - LATE_MS))], &[], &[]).is_empty());
        assert_eq!(due(now, &[r(1, Some(now - LATE_MS + 1))], &[], &[]), [rem(1, now - LATE_MS + 1)]);
    }

    #[test]
    fn done_or_timeless_reminders_never_fire() {
        let done = Reminder { done: true, ..r(1, Some(1000)) };
        assert!(due(1000, &[done, r(2, None)], &[], &[]).is_empty());
    }

    #[test]
    fn a_prayer_fires_once() {
        let p = PrayerTime { name: PrayerName::Dhuhr, at: 5000 };
        assert_eq!(due(5000, &[], &[p.clone()], &[]), [Due::Prayer(p.clone())]);
        assert!(due(5000, &[], &[p], &[5000]).is_empty());
    }

    #[test]
    fn events_come_out_in_time_order() {
        let p = PrayerTime { name: PrayerName::Asr, at: 1500 };
        assert_eq!(due(2000, &[r(1, Some(2000))], &[p.clone()], &[]), [Due::Prayer(p), rem(1, 2000)]);
    }

    #[test]
    fn sleeps_until_the_next_event_but_wakes_every_minute() {
        let now = 1_000_000;
        assert_eq!(sleep_ms(now, &[r(1, Some(now + 5_000))], &[]), 5_000);
        let later = PrayerTime { name: PrayerName::Isha, at: now + 2 * 3_600_000 };
        assert_eq!(sleep_ms(now, &[], &[later]), MAX_SLEEP_MS);
        assert_eq!(sleep_ms(now, &[], &[]), MAX_SLEEP_MS);
        assert_eq!(sleep_ms(now, &[r(1, Some(now + 100))], &[]), 1_000);
    }
}
