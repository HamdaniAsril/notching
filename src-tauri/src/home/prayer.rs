//! Prayer times, computed on the device. The astronomy is a line-by-line port of
//! adhan-js 4.4.3 (https://github.com/batoulapps/adhan-js), used under its MIT
//! license: Copyright (c) 2016 Batoul Apps. Only what Notching uses is ported:
//! the methods below, the Shafi madhab and the middle-of-the-night rule for high
//! latitudes. Equations are from Jean Meeus, Astronomical Algorithms.

use chrono::{Days, NaiveDate};

use crate::settings::{Place, PrayerMethod};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PrayerName {
    Fajr,
    Dhuhr,
    Asr,
    Maghrib,
    Isha,
}

/// `at` is milliseconds since the epoch.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrayerTime {
    pub name: PrayerName,
    pub at: i64,
}

/// Today's five times, and the ones either side of now (spec 7, "Berikutnya").
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrayerDay {
    pub today: Vec<PrayerTime>,
    pub prev: PrayerTime,
    pub next: PrayerTime,
}

/// A method's angles, Isha interval (minutes after Maghrib, 0 for none),
/// adjustments in minutes (Fajr, Dhuhr, Asr, Maghrib, Isha) and rounding.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Parameters {
    pub fajr_angle: f64,
    pub isha_angle: f64,
    pub isha_interval: f64,
    pub adjustments: [f64; 5],
    pub round_up: bool,
}

/// Same values as adhan-js's CalculationMethod. Kemenag RI: Subuh 20°, Isya 18°,
/// ihtiyat +2/+3/+2/+3/+2 minutes, rounded up.
pub fn parameters(method: PrayerMethod) -> Parameters {
    let p = |fajr_angle, isha_angle, adjustments, round_up| Parameters {
        fajr_angle,
        isha_angle,
        isha_interval: 0.0,
        adjustments,
        round_up,
    };
    let dhuhr_1 = [0.0, 1.0, 0.0, 0.0, 0.0];
    match method {
        PrayerMethod::Kemenag => p(20.0, 18.0, [2.0, 3.0, 2.0, 3.0, 2.0], true),
        PrayerMethod::Singapore => p(20.0, 18.0, dhuhr_1, true),
        PrayerMethod::MuslimWorldLeague => p(18.0, 17.0, dhuhr_1, false),
        PrayerMethod::Egyptian => p(19.5, 17.5, dhuhr_1, false),
        PrayerMethod::Karachi => p(18.0, 18.0, dhuhr_1, false),
        PrayerMethod::UmmAlQura => Parameters { isha_interval: 90.0, ..p(18.5, 0.0, [0.0; 5], false) },
        PrayerMethod::NorthAmerica => p(15.0, 15.0, dhuhr_1, false),
    }
}

/// The five prayers of a local date, in order; sunrise is left out. Empty where
/// the sun does not rise or set that day (near the poles).
pub fn day_times(date: NaiveDate, place: &Place, method: PrayerMethod) -> Vec<PrayerTime> {
    let params = parameters(method);
    let (lat, lon) = (place.latitude, place.longitude);
    let solar = SolarTime::new(date, lat, lon);
    let Some(tomorrow) = date.checked_add_days(Days::new(1)) else { return Vec::new() };

    let dhuhr = utc_time(date, solar.transit);
    let sunrise = utc_time(date, solar.sunrise);
    let sunset = utc_time(date, solar.sunset);
    let asr = utc_time(date, solar.afternoon(1.0));
    let tomorrow_sunrise = utc_time(tomorrow, SolarTime::new(tomorrow, lat, lon).sunrise);
    let night = tomorrow_sunrise - sunset;

    // Fajr and Isha never fall past the middle of the night.
    let mut fajr = utc_time(date, solar.hour_angle(-params.fajr_angle, false));
    let safe_fajr = sunrise - night / 2.0;
    if fajr.is_nan() || safe_fajr > fajr {
        fajr = safe_fajr;
    }
    let isha = if params.isha_interval > 0.0 {
        sunset + params.isha_interval * 60_000.0
    } else {
        let isha = utc_time(date, solar.hour_angle(-params.isha_angle, true));
        let safe_isha = sunset + night / 2.0;
        if isha.is_nan() || safe_isha < isha { safe_isha } else { isha }
    };

    let names = [PrayerName::Fajr, PrayerName::Dhuhr, PrayerName::Asr, PrayerName::Maghrib, PrayerName::Isha];
    let raw = [fajr, dhuhr, asr, sunset, isha];
    if raw.iter().any(|t| !t.is_finite()) {
        return Vec::new();
    }
    names
        .iter()
        .zip(raw)
        .zip(params.adjustments)
        .map(|((&name, t), minutes)| PrayerTime { name, at: rounded_minute(t + minutes * 60_000.0, params.round_up) as i64 })
        .collect()
}

/// `today` is the Mac's local date. Yesterday and tomorrow are included, so the
/// prayer before Subuh is last night's Isya and the one after Isya is tomorrow's
/// Subuh. None where the sun does not rise or set.
pub fn prayer_day(now_ms: i64, today: NaiveDate, place: &Place, method: PrayerMethod) -> Option<PrayerDay> {
    let times = |d: Option<NaiveDate>| d.map(|d| day_times(d, place, method)).unwrap_or_default();
    let yesterday = times(today.checked_sub_days(Days::new(1)));
    let today_times = day_times(today, place, method);
    let tomorrow = times(today.checked_add_days(Days::new(1)));
    if yesterday.is_empty() || today_times.is_empty() || tomorrow.is_empty() {
        return None;
    }
    let all: Vec<PrayerTime> = yesterday.into_iter().chain(today_times.iter().copied()).chain(tomorrow).collect();
    let prev = *all.iter().rev().find(|p| p.at <= now_ms)?;
    let next = *all.iter().find(|p| p.at > now_ms)?;
    Some(PrayerDay { today: today_times, prev, next })
}

// adhan-js roundedMinute: up always adds the rest of the minute, even at :00.
fn rounded_minute(ms: f64, up: bool) -> f64 {
    let seconds = (ms.rem_euclid(60_000.0) / 1000.0).floor();
    let offset = if up || seconds >= 30.0 { 60.0 - seconds } else { -seconds };
    ms + offset * 1000.0
}

// adhan-js TimeComponents(...).utcDate: whole hours, minutes and seconds of the
// UTC day; hours may run below 0 or past 24.
fn utc_time(date: NaiveDate, hours: f64) -> f64 {
    let h = hours.floor();
    let m = ((hours - h) * 60.0).floor();
    let s = ((hours - (h + m / 60.0)) * 3600.0).floor();
    let midnight = date.and_hms_opt(0, 0, 0).expect("midnight exists").and_utc().timestamp_millis() as f64;
    midnight + (h * 3600.0 + m * 60.0 + s) * 1000.0
}

fn rad(d: f64) -> f64 {
    d.to_radians()
}

fn deg(r: f64) -> f64 {
    r.to_degrees()
}

fn normalize(num: f64, max: f64) -> f64 {
    num - max * (num / max).floor()
}

fn unwind(angle: f64) -> f64 {
    normalize(angle, 360.0)
}

fn quadrant_shift(angle: f64) -> f64 {
    if (-180.0..=180.0).contains(&angle) { angle } else { angle - 360.0 * (angle / 360.0).round() }
}

fn julian_day(date: NaiveDate) -> f64 {
    use chrono::Datelike;
    let (year, month, day) = (date.year() as f64, date.month() as f64, date.day() as f64);
    let y = if month > 2.0 { year } else { year - 1.0 };
    let m = if month > 2.0 { month } else { month + 12.0 };
    let a = (y / 100.0).trunc();
    let b = (2.0 - a + (a / 4.0).trunc()).trunc();
    (365.25 * (y + 4716.0)).trunc() + (30.6001 * (m + 1.0)).trunc() + day + b - 1524.5
}

struct SolarCoordinates {
    declination: f64,
    right_ascension: f64,
    apparent_sidereal_time: f64,
}

fn solar_coordinates(julian_day: f64) -> SolarCoordinates {
    let t = (julian_day - 2451545.0) / 36525.0;
    let l0 = unwind(280.4664567 + 36000.76983 * t + 0.0003032 * t.powi(2));
    let lp = unwind(218.3165 + 481267.8813 * t);
    let omega = unwind(125.04452 - 1934.136261 * t + 0.0020708 * t.powi(2) + t.powi(3) / 450000.0);
    let m = unwind(357.52911 + 35999.05029 * t - 0.0001537 * t.powi(2));
    let center = (1.914602 - 0.004817 * t - 0.000014 * t.powi(2)) * rad(m).sin()
        + (0.019993 - 0.000101 * t) * (2.0 * rad(m)).sin()
        + 0.000289 * (3.0 * rad(m)).sin();
    let lambda = rad(unwind(l0 + center - 0.00569 - 0.00478 * rad(125.04 - 1934.136 * t).sin()));
    let jd = t * 36525.0 + 2451545.0;
    let theta0 = unwind(
        280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t.powi(2) - t.powi(3) / 38710000.0,
    );
    let d_psi = -17.2 / 3600.0 * rad(omega).sin() - 1.32 / 3600.0 * (2.0 * rad(l0)).sin()
        - 0.23 / 3600.0 * (2.0 * rad(lp)).sin()
        + 0.21 / 3600.0 * (2.0 * rad(omega)).sin();
    let d_epsilon = 9.2 / 3600.0 * rad(omega).cos() + 0.57 / 3600.0 * (2.0 * rad(l0)).cos()
        + 0.1 / 3600.0 * (2.0 * rad(lp)).cos()
        - 0.09 / 3600.0 * (2.0 * rad(omega)).cos();
    let epsilon0 = 23.439291 - 0.013004167 * t - 0.0000001639 * t.powi(2) + 0.0000005036 * t.powi(3);
    let epsilon = rad(epsilon0 + 0.00256 * rad(125.04 - 1934.136 * t).cos());
    SolarCoordinates {
        declination: deg((epsilon.sin() * lambda.sin()).asin()),
        right_ascension: unwind(deg((epsilon.cos() * lambda.sin()).atan2(lambda.cos()))),
        apparent_sidereal_time: theta0 + d_psi * 3600.0 * rad(epsilon0 + d_epsilon).cos() / 3600.0,
    }
}

fn interpolate(y2: f64, y1: f64, y3: f64, n: f64) -> f64 {
    let (a, b) = (y2 - y1, y3 - y2);
    y2 + n / 2.0 * (a + b + n * (b - a))
}

fn interpolate_angles(y2: f64, y1: f64, y3: f64, n: f64) -> f64 {
    let (a, b) = (unwind(y2 - y1), unwind(y3 - y2));
    y2 + n / 2.0 * (a + b + n * (b - a))
}

/// Times as hours of the UTC day.
struct SolarTime {
    lat: f64,
    lon: f64,
    solar: SolarCoordinates,
    prev: SolarCoordinates,
    next: SolarCoordinates,
    approx_transit: f64,
    transit: f64,
    sunrise: f64,
    sunset: f64,
}

impl SolarTime {
    fn new(date: NaiveDate, lat: f64, lon: f64) -> SolarTime {
        let jd = julian_day(date);
        let solar = solar_coordinates(jd);
        let approx_transit = normalize((solar.right_ascension - lon - solar.apparent_sidereal_time) / 360.0, 1.0);
        let mut st = SolarTime {
            lat,
            lon,
            prev: solar_coordinates(jd - 1.0),
            next: solar_coordinates(jd + 1.0),
            solar,
            approx_transit,
            transit: 0.0,
            sunrise: 0.0,
            sunset: 0.0,
        };
        let m0 = approx_transit;
        let theta = unwind(st.solar.apparent_sidereal_time + 360.985647 * m0);
        let a = unwind(interpolate_angles(st.solar.right_ascension, st.prev.right_ascension, st.next.right_ascension, m0));
        st.transit = (m0 + quadrant_shift(theta + lon - a) / -360.0) * 24.0;
        st.sunrise = st.hour_angle(-50.0 / 60.0, false);
        st.sunset = st.hour_angle(-50.0 / 60.0, true);
        st
    }

    // adhan-js Astronomical.correctedHourAngle.
    fn hour_angle(&self, angle: f64, after_transit: bool) -> f64 {
        let (lat, lw) = (self.lat, -self.lon);
        let d2 = self.solar.declination;
        let h0 = deg(((rad(angle).sin() - rad(lat).sin() * rad(d2).sin()) / (rad(lat).cos() * rad(d2).cos())).acos());
        let m = if after_transit { self.approx_transit + h0 / 360.0 } else { self.approx_transit - h0 / 360.0 };
        let theta = unwind(self.solar.apparent_sidereal_time + 360.985647 * m);
        let a = unwind(interpolate_angles(self.solar.right_ascension, self.prev.right_ascension, self.next.right_ascension, m));
        let delta = interpolate(d2, self.prev.declination, self.next.declination, m);
        let h = theta - lw - a;
        let altitude = deg((rad(lat).sin() * rad(delta).sin() + rad(lat).cos() * rad(delta).cos() * rad(h).cos()).asin());
        let dm = (altitude - angle) / (360.0 * rad(delta).cos() * rad(lat).cos() * rad(h).sin());
        (m + dm) * 24.0
    }

    // Asr: the sun where a shadow is `shadow_length` times the object, plus its noon shadow.
    fn afternoon(&self, shadow_length: f64) -> f64 {
        let tangent = (self.lat - self.solar.declination).abs();
        let angle = deg((1.0 / (shadow_length + rad(tangent).tan())).atan());
        self.hour_angle(angle, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, NaiveDate, TimeZone};

    // Coordinates as Open-Meteo returns them for Jakarta.
    fn jakarta() -> Place {
        Place {
            name: "Jakarta".into(),
            region: "Jakarta".into(),
            country: "Indonesia".into(),
            latitude: -6.21462,
            longitude: 106.84513,
        }
    }

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 10, d).unwrap()
    }

    fn wib_zone() -> FixedOffset {
        FixedOffset::east_opt(7 * 3600).unwrap()
    }

    fn wib(ms: i64) -> String {
        wib_zone().timestamp_millis_opt(ms).unwrap().format("%H:%M").to_string()
    }

    fn wib_ms(d: u32, h: u32, m: u32) -> i64 {
        wib_zone().with_ymd_and_hms(2026, 10, d, h, m, 0).unwrap().timestamp_millis()
    }

    #[test]
    fn kemenag_matches_the_published_jakarta_schedule() {
        // Kemenag (Bimas Islam) schedule for Jakarta, 29 October 2026.
        let t = day_times(day(29), &jakarta(), PrayerMethod::Kemenag);
        assert_eq!(t.iter().map(|p| wib(p.at)).collect::<Vec<_>>(), ["04:10", "11:40", "14:53", "17:49", "19:00"]);
        assert_eq!(
            t.iter().map(|p| p.name).collect::<Vec<_>>(),
            [PrayerName::Fajr, PrayerName::Dhuhr, PrayerName::Asr, PrayerName::Maghrib, PrayerName::Isha]
        );
    }

    #[test]
    fn other_methods_follow_adhan() {
        // adhan-js 4.4.3 for the same place and day.
        let t = day_times(day(29), &jakarta(), PrayerMethod::MuslimWorldLeague);
        assert_eq!(t.iter().map(|p| wib(p.at)).collect::<Vec<_>>(), ["04:16", "11:37", "14:51", "17:46", "18:53"]);
    }

    #[test]
    fn prev_and_next_cross_midnight() {
        let place = jakarta();
        let m = PrayerMethod::Kemenag;

        let night = prayer_day(wib_ms(29, 2, 0), day(29), &place, m).unwrap();
        assert_eq!(night.prev, day_times(day(28), &place, m)[4]);
        assert_eq!(night.next, day_times(day(29), &place, m)[0]);
        assert_eq!(wib(night.next.at), "04:10");

        let evening = prayer_day(wib_ms(29, 21, 0), day(29), &place, m).unwrap();
        assert_eq!((evening.prev.name, wib(evening.prev.at)), (PrayerName::Isha, "19:00".to_string()));
        assert_eq!(evening.next, day_times(day(30), &place, m)[0]);
        assert_eq!(wib(evening.next.at), "04:09");

        let today = day_times(day(29), &place, m);
        let noon = prayer_day(today[1].at, day(29), &place, m).unwrap();
        assert_eq!((noon.prev, noon.next), (today[1], today[2]));
        assert_eq!(noon.today, today);
    }

    #[test]
    fn no_times_where_the_sun_does_not_set() {
        let tromso = Place { name: "Tromsø".into(), latitude: 69.65, longitude: 18.96, ..jakarta() };
        let midsummer = NaiveDate::from_ymd_opt(2026, 6, 21).unwrap();
        assert!(day_times(midsummer, &tromso, PrayerMethod::Kemenag).is_empty());
        assert_eq!(prayer_day(0, midsummer, &tromso, PrayerMethod::Kemenag), None);
    }
}
