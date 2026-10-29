//! Commands of the Beranda section in the settings window.

use tauri::{AppHandle, Manager, State};

use super::weather::{fetch, geocode_query, parse_places, Endpoint};
use super::HomeState;
use crate::app_core::CoreState;
use crate::module_commands::change;
use crate::settings::{Place, PrayerMethod};
use crate::settings_window::emit_settings;

/// Searches Open-Meteo for a city. Sends only the typed name and the language.
#[tauri::command]
pub async fn search_places(app: AppHandle, query: String) -> Result<Vec<Place>, String> {
    let lang = app.state::<CoreState>().0.lock().unwrap().lang();
    let Some(q) = geocode_query(&query, lang) else { return Ok(Vec::new()) };
    tauri::async_runtime::spawn_blocking(move || parse_places(&fetch(Endpoint::Geocode, &q)?))
        .await
        .map_err(|e| e.to_string())?
}

/// A new city is fetched at once: the retry wait belongs to the old one.
#[tauri::command]
pub fn set_place(app: AppHandle, core: State<CoreState>, home: State<HomeState>, place: Option<Place>) -> Result<(), String> {
    change(&app, &core, |c| c.set_place(place))?;
    home.0.lock().unwrap().last_try = None;
    emit_settings(&app);
    super::schedule::poke(&app);
    Ok(())
}

#[tauri::command]
pub fn set_prayer_method(app: AppHandle, core: State<CoreState>, method: PrayerMethod) -> Result<(), String> {
    change(&app, &core, |c| c.set_prayer_method(method))?;
    emit_settings(&app);
    super::schedule::poke(&app);
    Ok(())
}

#[tauri::command]
pub fn set_show_clock(app: AppHandle, core: State<CoreState>, on: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_show_clock(on))?;
    emit_settings(&app);
    Ok(())
}
