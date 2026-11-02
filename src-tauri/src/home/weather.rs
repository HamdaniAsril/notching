//! Weather and city search through Open-Meteo: no account and no key. These two
//! fixed addresses are the only places the app sends anything (spec 3).

use std::path::Path;
use std::time::Duration;

use serde_json::Value;

use crate::locale::Lang;
use crate::settings::Place;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Endpoint {
    Geocode,
    Forecast,
}

impl Endpoint {
    pub fn url(self) -> &'static str {
        match self {
            Endpoint::Geocode => "https://geocoding-api.open-meteo.com/v1/search",
            Endpoint::Forecast => "https://api.open-meteo.com/v1/forecast",
        }
    }
}

/// One forecast hour: `at` in ms since the epoch, `rain` the chance of rain in percent.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hour {
    pub at: i64,
    pub temp: f64,
    pub code: u32,
    pub rain: u32,
}

/// `latitude`/`longitude` are the rounded coordinates that were sent. `hourly` is empty in a
/// cache written before the hours existed.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Weather {
    pub temp: f64,
    pub code: u32,
    pub min: f64,
    pub max: f64,
    pub fetched_at: i64,
    pub latitude: f64,
    pub longitude: f64,
    #[serde(default)]
    pub hourly: Vec<Hour>,
}

const MAX_HOURS: usize = 48;

pub const FRESH_MS: i64 = 30 * 60_000;
pub const RETRY_MS: i64 = 5 * 60_000;
pub const WEATHER_FILE: &str = "weather.json";
const TIMEOUT: Duration = Duration::from_secs(8);
const BODY_LIMIT: u64 = 64 * 1024;

/// What a city search sends: the typed name and the language, nothing else.
/// None when the name is shorter than 2 or longer than 60 characters.
pub fn geocode_query(text: &str, lang: Lang) -> Option<Vec<(&'static str, String)>> {
    let name = text.trim();
    if !(2..=60).contains(&name.chars().count()) {
        return None;
    }
    let language = match lang {
        Lang::Id => "id",
        Lang::En => "en",
    };
    Some(vec![
        ("name", name.to_string()),
        ("count", "6".into()),
        ("language", language.into()),
        ("format", "json".into()),
    ])
}

// About 1 km: enough for the weather, and all Open-Meteo learns of the place.
fn rounded(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn forecast_query(place: &Place) -> Vec<(&'static str, String)> {
    vec![
        ("latitude", format!("{:.2}", place.latitude)),
        ("longitude", format!("{:.2}", place.longitude)),
        ("current", "temperature_2m,weather_code".into()),
        ("daily", "temperature_2m_max,temperature_2m_min".into()),
        ("hourly", "temperature_2m,weather_code,precipitation_probability".into()),
        ("timeformat", "unixtime".into()),
        ("timezone", "auto".into()),
        ("forecast_days", "2".into()),
    ]
}

fn parse(json: &str) -> Result<Value, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    if v["error"] == Value::Bool(true) {
        return Err(v["reason"].as_str().unwrap_or("Open-Meteo refused the request").to_string());
    }
    Ok(v)
}

pub fn parse_places(json: &str) -> Result<Vec<Place>, String> {
    let v = parse(json)?;
    let text = |r: &Value, key: &str| r[key].as_str().unwrap_or("").to_string();
    Ok(v["results"]
        .as_array()
        .map(|results| {
            results
                .iter()
                .filter_map(|r| {
                    Some(Place {
                        name: text(r, "name"),
                        region: text(r, "admin1"),
                        country: text(r, "country"),
                        latitude: r["latitude"].as_f64()?,
                        longitude: r["longitude"].as_f64()?,
                    })
                })
                .filter(Place::is_valid)
                .take(6)
                .collect()
        })
        .unwrap_or_default())
}

// The hours that have all four values; a gap drops that hour, not the forecast.
fn parse_hours(v: &Value) -> Vec<Hour> {
    let h = &v["hourly"];
    let Some(times) = h["time"].as_array() else { return vec![] };
    times
        .iter()
        .enumerate()
        .filter_map(|(i, t)| {
            Some(Hour {
                at: t.as_i64()? * 1000,
                temp: h["temperature_2m"][i].as_f64()?,
                code: h["weather_code"][i].as_f64()? as u32,
                rain: h["precipitation_probability"][i].as_f64()?.round().clamp(0.0, 100.0) as u32,
            })
        })
        .take(MAX_HOURS)
        .collect()
}

pub fn parse_forecast(json: &str, place: &Place, now_ms: i64) -> Result<Weather, String> {
    let v = parse(json)?;
    let num = |x: &Value| x.as_f64().ok_or_else(|| "incomplete forecast".to_string());
    Ok(Weather {
        temp: num(&v["current"]["temperature_2m"])?,
        code: num(&v["current"]["weather_code"])? as u32,
        min: num(&v["daily"]["temperature_2m_min"][0])?,
        max: num(&v["daily"]["temperature_2m_max"][0])?,
        fetched_at: now_ms,
        latitude: rounded(place.latitude),
        longitude: rounded(place.longitude),
        hourly: parse_hours(&v),
    })
}

pub fn same_place(w: &Weather, place: &Place) -> bool {
    w.latitude == rounded(place.latitude) && w.longitude == rounded(place.longitude)
}

/// Fetch when there is nothing for this place or it is 30 minutes old, but never
/// sooner than 5 minutes after the last try.
pub fn should_fetch(cached: Option<&Weather>, place: &Place, last_try: Option<i64>, now_ms: i64) -> bool {
    let wanted = cached.is_none_or(|w| !same_place(w, place) || now_ms - w.fetched_at >= FRESH_MS);
    wanted && last_try.is_none_or(|t| now_ms - t >= RETRY_MS)
}

/// Blocking; never call it on the main thread.
pub fn fetch(endpoint: Endpoint, query: &[(&'static str, String)]) -> Result<String, String> {
    use ureq::tls::{RootCerts, TlsConfig, TlsProvider};
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .tls_config(TlsConfig::builder().provider(TlsProvider::NativeTls).root_certs(RootCerts::PlatformVerifier).build())
        .timeout_global(Some(TIMEOUT))
        // Open-Meteo explains a refusal in the body.
        .http_status_as_error(false)
        .user_agent("Notching")
        .build()
        .into();
    let mut request = agent.get(endpoint.url());
    for (key, value) in query {
        request = request.query(*key, value);
    }
    let mut response = request.call().map_err(|e| e.to_string())?;
    response.body_mut().with_config().limit(BODY_LIMIT).read_to_string().map_err(|e| e.to_string())
}

pub fn load_cache(path: &Path) -> Option<Weather> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

pub fn save_cache(path: &Path, w: &Weather) -> std::io::Result<()> {
    super::write_atomic(path, &serde_json::to_string(w).map_err(std::io::Error::other)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jakarta() -> Place {
        Place {
            name: "Jakarta".into(),
            region: "Jakarta".into(),
            country: "Indonesia".into(),
            latitude: -6.21462,
            longitude: 106.84513,
        }
    }

    // Open-Meteo's answers on 29 October 2026, trimmed to the fields that matter.
    const JAKARTA_JSON: &str = r#"{"results":[
        {"id":1642911,"name":"Jakarta","latitude":-6.21462,"longitude":106.84513,"elevation":16.0,"feature_code":"PPLC",
         "country_code":"ID","admin1_id":1642907,"timezone":"Asia/Jakarta","population":8540121,"country_id":1643084,
         "country":"Indonesia","admin1":"Jakarta"},
        {"id":6754874,"name":"Jakarta Pusat","latitude":-6.1818,"longitude":106.8223,"elevation":17.0,"feature_code":"PPLX",
         "country_code":"ID","admin1_id":1642907,"admin2_id":1642908,"timezone":"Asia/Jakarta","country_id":1643084,
         "country":"Indonesia","admin1":"Jakarta","admin2":"Kotamadya Jakarta Pusat"}],"generationtime_ms":0.1295805}"#;
    const FORECAST_JSON: &str = r#"{"latitude":-6.221441,"longitude":106.856186,"generationtime_ms":0.117,
        "utc_offset_seconds":25200,"timezone":"Asia/Jakarta","timezone_abbreviation":"GMT+7","elevation":14.0,
        "current_units":{"time":"iso8601","interval":"seconds","temperature_2m":"°C","weather_code":"wmo code"},
        "current":{"time":"2026-10-29T07:15","interval":900,"temperature_2m":26.3,"weather_code":3},
        "daily_units":{"time":"iso8601","temperature_2m_max":"°C","temperature_2m_min":"°C"},
        "daily":{"time":["2026-10-29"],"temperature_2m_max":[31.4],"temperature_2m_min":[24.7]}}"#;

    fn pairs(v: &[(&'static str, &str)]) -> Vec<(&'static str, String)> {
        v.iter().map(|(k, v)| (*k, v.to_string())).collect()
    }

    #[test]
    fn only_the_two_open_meteo_urls() {
        assert_eq!(Endpoint::Geocode.url(), "https://geocoding-api.open-meteo.com/v1/search");
        assert_eq!(Endpoint::Forecast.url(), "https://api.open-meteo.com/v1/forecast");
    }

    #[test]
    fn the_forecast_gets_rounded_coordinates_and_nothing_else() {
        assert_eq!(
            forecast_query(&jakarta()),
            pairs(&[
                ("latitude", "-6.21"),
                ("longitude", "106.85"),
                ("current", "temperature_2m,weather_code"),
                ("daily", "temperature_2m_max,temperature_2m_min"),
                ("hourly", "temperature_2m,weather_code,precipitation_probability"),
                ("timeformat", "unixtime"),
                ("timezone", "auto"),
                ("forecast_days", "2"),
            ])
        );
    }

    #[test]
    fn a_city_search_sends_only_the_typed_name() {
        assert_eq!(
            geocode_query("  Bandung ", Lang::Id),
            Some(pairs(&[("name", "Bandung"), ("count", "6"), ("language", "id"), ("format", "json")]))
        );
        assert_eq!(geocode_query("Bandung", Lang::En).unwrap()[2], ("language", "en".to_string()));
        assert_eq!(geocode_query("a", Lang::Id), None);
        assert_eq!(geocode_query(&"x".repeat(61), Lang::Id), None);
    }

    #[test]
    fn places_from_a_search() {
        let places = parse_places(JAKARTA_JSON).unwrap();
        assert_eq!(places.len(), 2);
        assert_eq!(places[0], jakarta());
        assert_eq!((places[1].name.as_str(), places[1].region.as_str()), ("Jakarta Pusat", "Jakarta"));
        assert_eq!(parse_places(r#"{"generationtime_ms":0.1}"#), Ok(vec![]));
    }

    #[test]
    fn a_forecast_from_open_meteo() {
        assert_eq!(
            parse_forecast(FORECAST_JSON, &jakarta(), 1000),
            Ok(Weather { temp: 26.3, code: 3, min: 24.7, max: 31.4, fetched_at: 1000, latitude: -6.21, longitude: 106.85, hourly: vec![] })
        );
    }

    #[test]
    fn a_forecast_with_hours() {
        let json = r#"{"current":{"temperature_2m":26.3,"weather_code":3},
            "daily":{"temperature_2m_max":[31.4,32.0],"temperature_2m_min":[24.7,24.9]},
            "hourly":{"time":[1793239200,1793242800,1793246400],
                      "temperature_2m":[26.1,27.4,28.0],
                      "weather_code":[3,61,80],
                      "precipitation_probability":[10,60,85]}}"#;
        let w = parse_forecast(json, &jakarta(), 0).unwrap();
        assert_eq!(
            w.hourly,
            vec![
                Hour { at: 1_793_239_200_000, temp: 26.1, code: 3, rain: 10 },
                Hour { at: 1_793_242_800_000, temp: 27.4, code: 61, rain: 60 },
                Hour { at: 1_793_246_400_000, temp: 28.0, code: 80, rain: 85 },
            ]
        );
    }

    #[test]
    fn an_hour_with_a_gap_is_skipped_and_at_most_48_are_kept() {
        let json = r#"{"current":{"temperature_2m":26.3,"weather_code":3},
            "daily":{"temperature_2m_max":[31.4],"temperature_2m_min":[24.7]},
            "hourly":{"time":[3600,7200,10800],"temperature_2m":[20.0,null,22.0],
                      "weather_code":[1,2,3],"precipitation_probability":[0,0,null]}}"#;
        let w = parse_forecast(json, &jakarta(), 0).unwrap();
        assert_eq!(w.hourly, vec![Hour { at: 3_600_000, temp: 20.0, code: 1, rain: 0 }]);

        let n = 60;
        let list = |f: &dyn Fn(usize) -> String| (0..n).map(|i| f(i)).collect::<Vec<_>>().join(",");
        let long = format!(
            r#"{{"current":{{"temperature_2m":1.0,"weather_code":0}},"daily":{{"temperature_2m_max":[1.0],"temperature_2m_min":[0.0]}},
            "hourly":{{"time":[{}],"temperature_2m":[{}],"weather_code":[{}],"precipitation_probability":[{}]}}}}"#,
            list(&|i| (1_793_239_200 + 3600 * i as i64).to_string()),
            list(&|i| format!("{}.5", 20 + i % 10)),
            list(&|_| "3".into()),
            list(&|_| "40".into()),
        );
        let w = parse_forecast(&long, &jakarta(), 0).unwrap();
        assert_eq!(w.hourly.len(), 48);
        assert_eq!(w.hourly[47].at, (1_793_239_200 + 3600 * 47) * 1000);
    }

    #[test]
    fn a_forecast_without_hourly_data_still_parses() {
        let w = parse_forecast(FORECAST_JSON, &jakarta(), 0).unwrap();
        assert!(w.hourly.is_empty());
    }

    #[test]
    fn two_days_of_hours_stay_far_under_the_body_limit() {
        // Real-looking numbers: a 10-digit unix time, one decimal, a 2-digit code, a percent.
        let n = 48;
        let list = |f: &dyn Fn(usize) -> String| (0..n).map(|i| f(i)).collect::<Vec<_>>().join(",");
        let body = format!(
            r#"{{"hourly":{{"time":[{}],"temperature_2m":[{}],"weather_code":[{}],"precipitation_probability":[{}]}}}}"#,
            list(&|i| (1_793_239_200 + 3600 * i as i64).to_string()),
            list(&|i| format!("{}.8", 24 + i % 9)),
            list(&|_| "61".into()),
            list(&|_| "100".into()),
        );
        assert!((body.len() as u64) < BODY_LIMIT / 10, "{} bytes", body.len());
    }

    #[test]
    fn an_old_cache_without_hours_still_loads() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(WEATHER_FILE);
        std::fs::write(
            &p,
            r#"{"temp":26.3,"code":3,"min":24.7,"max":31.4,"fetchedAt":1000,"latitude":-6.21,"longitude":106.85}"#,
        )
        .unwrap();
        let w = load_cache(&p).unwrap();
        assert_eq!(w.temp, 26.3);
        assert!(w.hourly.is_empty());
    }

    #[test]
    fn a_forecast_error_or_gap_is_an_error() {
        let e = parse_forecast(r#"{"error":true,"reason":"Latitude must be in range of -90 to 90°."}"#, &jakarta(), 0);
        assert!(e.unwrap_err().contains("Latitude"));
        assert!(parse_forecast(r#"{"current":{}}"#, &jakarta(), 0).is_err());
        assert!(parse_forecast("not json", &jakarta(), 0).is_err());
    }

    #[test]
    fn fetches_when_stale_moved_or_missing_but_not_too_often() {
        let now = 10_000_000_000;
        let fresh = parse_forecast(FORECAST_JSON, &jakarta(), now - 60_000).unwrap();
        let bandung = Place { name: "Bandung".into(), latitude: -6.9175, longitude: 107.6191, ..jakarta() };
        assert!(should_fetch(None, &jakarta(), None, now));
        assert!(!should_fetch(Some(&fresh), &jakarta(), None, now));
        let old = Weather { fetched_at: now - FRESH_MS, ..fresh.clone() };
        assert!(should_fetch(Some(&old), &jakarta(), None, now));
        assert!(should_fetch(Some(&fresh), &bandung, None, now));
        assert!(!should_fetch(Some(&old), &jakarta(), Some(now - 60_000), now));
        assert!(should_fetch(Some(&old), &jakarta(), Some(now - RETRY_MS), now));
    }

    #[test]
    fn the_cache_survives_a_save_and_load() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join(WEATHER_FILE);
        assert_eq!(load_cache(&p), None);
        let w = parse_forecast(FORECAST_JSON, &jakarta(), 1000).unwrap();
        save_cache(&p, &w).unwrap();
        assert_eq!(load_cache(&p), Some(w));
        std::fs::write(&p, "{oops").unwrap();
        assert_eq!(load_cache(&p), None);
    }

    // Reaches the network, so only on request: cargo test -- --ignored live_
    #[test]
    #[ignore]
    fn live_search_and_forecast_through_macos_tls() {
        let places = parse_places(&fetch(Endpoint::Geocode, &geocode_query("Jakarta", Lang::Id).unwrap()).unwrap()).unwrap();
        assert_eq!(places[0].name, "Jakarta");
        let w = parse_forecast(&fetch(Endpoint::Forecast, &forecast_query(&places[0])).unwrap(), &places[0], 0).unwrap();
        assert!((-60.0..60.0).contains(&w.temp));
    }
}
