//! Beranda: its settings live in settings.json; its data lives here, in Rust,
//! because the card's sandboxed frame can neither store anything nor reach the
//! network, and lives only while the panel is open.

pub mod commands;
pub mod prayer;
pub mod reminders;
pub mod schedule;
pub mod weather;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::settings::{HomeSettings, Place};
use prayer::{prayer_day, PrayerDay};
use reminders::{Reminder, Reminders, REMINDERS_FILE};
use weather::{same_place, Weather, WEATHER_FILE};

pub struct Home {
    pub reminders: Reminders,
    pub weather: Option<Weather>,
    /// When the weather was last asked for, so a failing network is retried
    /// only every few minutes.
    pub last_try: Option<i64>,
    weather_path: PathBuf,
}

impl Home {
    pub fn open(data_dir: &Path, cache_dir: &Path) -> Home {
        let weather_path = cache_dir.join(WEATHER_FILE);
        Home {
            reminders: Reminders::open(data_dir.join(REMINDERS_FILE)),
            weather: weather::load_cache(&weather_path),
            last_try: None,
            weather_path,
        }
    }
}

pub struct HomeState(pub Mutex<Home>);

/// A running module's line in Beranda's bottom row, e.g. "Timer 12.30". Plan 5
/// fills these (timer, keep awake); for now there are none.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniStatus {
    pub module: String,
    pub label: String,
    pub value: String,
}

/// Everything the Beranda card shows. Same shape as HomeSnapshot in modules/home/types.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSnapshot {
    pub place: Option<Place>,
    pub weather: Option<Weather>,
    pub prayer: Option<PrayerDay>,
    pub reminders: Vec<Reminder>,
    pub show_clock: bool,
    pub statuses: Vec<MiniStatus>,
}

pub fn snapshot(settings: &HomeSettings, home: &mut Home, now: chrono::DateTime<chrono::Local>) -> HomeSnapshot {
    let today = now.date_naive();
    if let Err(e) = home.reminders.purge(&today.format("%Y-%m-%d").to_string()) {
        eprintln!("notching: tidying reminders failed: {e}");
    }
    let place = settings.place.clone();
    HomeSnapshot {
        weather: place.as_ref().and_then(|p| home.weather.clone().filter(|w| same_place(w, p))),
        prayer: place.as_ref().and_then(|p| prayer_day(now.timestamp_millis(), today, p, settings.prayer_method)),
        reminders: home.reminders.items().to_vec(),
        show_clock: settings.show_clock,
        statuses: Vec::new(),
        place,
    }
}

/// The snapshot as the app holds it now. One lock at a time.
pub fn current_snapshot(app: &AppHandle) -> HomeSnapshot {
    let settings = app.state::<CoreState>().0.lock().unwrap().home().clone();
    let home = app.state::<HomeState>();
    let mut home = home.0.lock().unwrap();
    snapshot(&settings, &mut home, chrono::Local::now())
}

/// Fetches the weather for the chosen city when it is due (weather::should_fetch).
/// Blocking, and no lock is held while the request is out.
pub fn refresh_weather(app: &AppHandle) -> Result<(), String> {
    let Some(place) = app.state::<CoreState>().0.lock().unwrap().home().place.clone() else { return Ok(()) };
    let now = chrono::Utc::now().timestamp_millis();
    {
        let home = app.state::<HomeState>();
        let mut home = home.0.lock().unwrap();
        if !weather::should_fetch(home.weather.as_ref(), &place, home.last_try, now) {
            return Ok(());
        }
        home.last_try = Some(now);
    }
    let json = weather::fetch(weather::Endpoint::Forecast, &weather::forecast_query(&place))?;
    let fresh = weather::parse_forecast(&json, &place, chrono::Utc::now().timestamp_millis())?;
    let home = app.state::<HomeState>();
    let mut home = home.0.lock().unwrap();
    if let Err(e) = weather::save_cache(&home.weather_path, &fresh) {
        eprintln!("notching: saving the weather failed: {e}");
    }
    home.weather = Some(fresh);
    Ok(())
}

/// Writes a temporary file and renames it over the old one, so a crash mid-write
/// never leaves half a file.
pub(crate) fn write_atomic(path: &std::path::Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn jakarta() -> Place {
        Place {
            name: "Jakarta".into(),
            region: "Jakarta".into(),
            country: "Indonesia".into(),
            latitude: -6.21462,
            longitude: 106.84513,
        }
    }

    fn now() -> chrono::DateTime<chrono::Local> {
        chrono::Local.with_ymd_and_hms(2026, 10, 29, 10, 18, 0).unwrap()
    }

    fn home(d: &tempfile::TempDir) -> Home {
        Home::open(&d.path().join("data"), &d.path().join("cache"))
    }

    fn weather_for(place: &Place) -> Weather {
        Weather {
            temp: 31.4,
            code: 3,
            min: 24.7,
            max: 33.2,
            fetched_at: now().timestamp_millis(),
            latitude: (place.latitude * 100.0).round() / 100.0,
            longitude: (place.longitude * 100.0).round() / 100.0,
        }
    }

    #[test]
    fn a_snapshot_without_a_city_has_no_weather_or_prayer() {
        let d = tempfile::tempdir().unwrap();
        let s = snapshot(&HomeSettings::default(), &mut home(&d), now());
        assert_eq!((s.place, s.weather, s.prayer), (None, None, None));
        assert!(s.show_clock);
        assert!(s.statuses.is_empty());
    }

    #[test]
    fn a_snapshot_shows_weather_only_for_the_current_city() {
        let d = tempfile::tempdir().unwrap();
        let mut h = home(&d);
        h.weather = Some(weather_for(&jakarta()));
        let bandung = Place { name: "Bandung".into(), latitude: -6.9175, longitude: 107.6191, ..jakarta() };
        let mut settings = HomeSettings { place: Some(bandung), ..Default::default() };
        assert_eq!(snapshot(&settings, &mut h, now()).weather, None);
        settings.place = Some(jakarta());
        assert_eq!(snapshot(&settings, &mut h, now()).weather, Some(weather_for(&jakarta())));
    }

    #[test]
    fn a_snapshot_has_the_next_prayer_and_drops_old_done_reminders() {
        let d = tempfile::tempdir().unwrap();
        let mut h = home(&d);
        let old = h.reminders.add("Kemarin", "2026-10-28", None).unwrap().id;
        let today = h.reminders.add("Hari ini", "2026-10-29", None).unwrap().id;
        h.reminders.set_done(old, true).unwrap();
        h.reminders.set_done(today, true).unwrap();
        let settings = HomeSettings { place: Some(jakarta()), ..Default::default() };
        let s = snapshot(&settings, &mut h, now());
        let prayer = s.prayer.unwrap();
        assert_eq!(prayer.today.len(), 5);
        let t = now().timestamp_millis();
        assert!(prayer.prev.at <= t && t < prayer.next.at);
        assert_eq!(s.reminders.iter().map(|r| r.title.as_str()).collect::<Vec<_>>(), ["Hari ini"]);
    }

    #[test]
    fn the_cached_weather_is_read_at_open() {
        let d = tempfile::tempdir().unwrap();
        weather::save_cache(&d.path().join("cache").join(weather::WEATHER_FILE), &weather_for(&jakarta())).unwrap();
        assert_eq!(home(&d).weather, Some(weather_for(&jakarta())));
    }
}
