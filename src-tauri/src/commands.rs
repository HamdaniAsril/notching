//! Commands the notch webview calls. AppKit work goes through run_on_main_thread;
//! on Windows and Linux they hand over to desktop::overlay.

use tauri::{AppHandle, WebviewWindow};
#[cfg(target_os = "macos")]
use tauri::State;
#[cfg(target_os = "macos")]
use tauri_nspanel::ManagerExt;

use crate::geometry::Rect;
#[cfg(target_os = "macos")]
use crate::overlay::Overlays;
#[cfg(not(target_os = "macos"))]
use crate::overlay::ScreenInfoDto;

#[cfg(target_os = "macos")]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenInfoDto {
    label: String,
    has_notch: bool,
    notch_width: f64,
    notch_height: f64,
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn get_screen_info(window: WebviewWindow, overlays: State<Overlays>) -> Result<ScreenInfoDto, String> {
    let label = window.label().to_string();
    let map = overlays.0.lock().unwrap();
    let entry = map.get(&label).ok_or_else(|| format!("unknown overlay {label}"))?;
    let notch = entry.screen.notch;
    Ok(ScreenInfoDto {
        label,
        has_notch: notch.is_some(),
        notch_width: notch.map_or(0.0, |n| n.width),
        notch_height: notch.map_or(0.0, |n| n.height),
    })
}

/// Moves the sensors to the new hit areas and reroutes the cursor at once, so
/// click-through follows a hit area that grows or shrinks under a still cursor.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_hit_rects(app: AppHandle, window: WebviewWindow, overlays: State<Overlays>, rects: Vec<Rect>) {
    let label = window.label().to_string();
    if let Some(entry) = overlays.0.lock().unwrap().get_mut(&label) {
        entry.css_rects = rects;
    }
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        crate::sensor::sync(&handle, &label);
        crate::shelf_drop::resync(&handle, &label);
        crate::pointer::reroute_now(&handle);
    });
}

/// `true` makes the panel key so it gets Esc; `false` hands key status back to the
/// app that had it, by ordering the panel out and in again.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn set_panel_key(app: AppHandle, window: WebviewWindow, key: bool) -> Result<(), String> {
    let label = window.label().to_string();
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let Ok(panel) = handle.get_webview_panel(&label) else { return };
        if key {
            panel.show_and_make_key();
        } else {
            panel.hide();
            panel.show();
        }
    })
    .map_err(|e| e.to_string())
}

/// An open editor commits its edits first; the app ends when its window has gone.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::editor_window::quit(&app);
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn get_screen_info(window: WebviewWindow) -> Result<ScreenInfoDto, String> {
    crate::overlay::screen_info(&window)
}

/// The overlay's click-through follows the new hit areas at once.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_hit_rects(app: AppHandle, window: WebviewWindow, rects: Vec<Rect>) {
    crate::overlay::set_hit_rects(&app, &window, rects);
}

/// `true` focuses the overlay so it gets Esc; `false` gives focus back.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn set_panel_key(app: AppHandle, window: WebviewWindow, key: bool) -> Result<(), String> {
    crate::overlay::set_key(&app, &window, key)
}

/// No editor off macOS: the app just ends.
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
