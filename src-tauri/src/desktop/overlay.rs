//! cfg(not(target_os = "macos")) — the whole `desktop` module is gated in lib.rs
//! STUB: package B replaces this file with the real overlay windows.

use std::{collections::HashMap, sync::Mutex};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::geometry::Rect;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfoDto {
    pub label: String,
    pub has_notch: bool,
    pub notch_width: f64,
    pub notch_height: f64,
}

#[allow(dead_code)] // the stub never reads css_rects
pub struct OverlayEntry {
    pub monitor_name: String,
    pub css_rects: Vec<Rect>,
}

#[derive(Default)]
pub struct Overlays(pub Mutex<HashMap<String, OverlayEntry>>);

/// Names of connected monitors, each once (settings "screen" choices).
#[derive(Default)]
pub struct ConnectedScreens(pub Mutex<Vec<String>>);

/// (Re)creates/places one overlay window per chosen monitor; labels start with "notch-"; url "index.html".
pub fn rebuild_overlays(app: &AppHandle) -> tauri::Result<()> {
    let mut names: Vec<String> = app.available_monitors()?.iter().filter_map(|m| m.name().cloned()).collect();
    names.dedup();
    *app.state::<ConnectedScreens>().0.lock().unwrap() = names;
    Ok(())
}

pub fn screen_info(window: &WebviewWindow) -> Result<ScreenInfoDto, String> {
    Ok(ScreenInfoDto { label: window.label().to_string(), has_notch: false, notch_width: 0.0, notch_height: 0.0 })
}

pub fn set_hit_rects(app: &AppHandle, window: &WebviewWindow, rects: Vec<Rect>) {
    if let Some(entry) = app.state::<Overlays>().0.lock().unwrap().get_mut(window.label()) {
        entry.css_rects = rects;
    }
}

/// true = focus the overlay so it gets Esc; false = give focus back.
pub fn set_key(_app: &AppHandle, window: &WebviewWindow, key: bool) -> Result<(), String> {
    if key {
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Starts cursor polling (hover + click-through) and monitor-change watching.
pub fn start(_app: AppHandle) {}
