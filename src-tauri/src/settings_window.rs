//! The settings window (spec 8): a normal window, not a panel, opened from the ⋯
//! icon in the pill, and the settings commands it uses.

use tauri::webview::PageLoadEvent;
use tauri::{
    ActivationPolicy, AppHandle, Emitter, Manager, State, TitleBarStyle, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::app_core::CoreState;
use crate::geometry::centered_origin;
use crate::module_commands::change;
use crate::overlay::{ConnectedScreens, Overlays};
use crate::settings::{HomeSettings, LanguageSetting, NotchConfig};

pub const SETTINGS_LABEL: &str = "settings";
/// Broadcast whenever anything in SettingsDto changes.
pub const SETTINGS_EVENT: &str = "notching://settings";
pub const SETTINGS_SIZE: (f64, f64) = (680.0, 600.0);

// Two ⋯ clicks close together must not both build the window: the second build
// fails, and its clean-up would take the Dock icon from the open window. The
// main thread never takes this lock.
static OPENING: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// A build that failed because another one won leaves that window's Dock icon.
fn hide_dock_icon_after_failed_build(settings_window_open: bool) -> bool {
    !settings_window_open
}

/// Open at login, as macOS reports it. Same values as LoginItem in src/settings/types.ts.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LoginItem {
    On,
    Off,
    NeedsApproval,
    Unavailable,
}

/// Same shape as SettingsInfo in src/settings/types.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsDto {
    pub language: LanguageSetting,
    pub screen: Option<String>,
    pub screens: Vec<String>,
    pub login: LoginItem,
    pub version: String,
    pub home: HomeSettings,
}

// One lock at a time, so this is safe to call from anywhere.
pub fn settings_dto(app: &AppHandle) -> SettingsDto {
    let (language, screen, home) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.language(), core.screen().map(String::from), core.home().clone())
    };
    let screens = app.state::<ConnectedScreens>().0.lock().unwrap().clone();
    SettingsDto {
        language,
        screen,
        screens,
        login: crate::login_item::state(),
        version: app.package_info().version.to_string(),
        home,
    }
}

pub fn emit_settings(app: &AppHandle) {
    let _ = app.emit(SETTINGS_EVENT, settings_dto(app));
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> SettingsDto {
    settings_dto(&app)
}

/// Module names follow the language, so both broadcasts go out.
#[tauri::command]
pub fn set_language(app: AppHandle, core: State<CoreState>, language: LanguageSetting) -> Result<(), String> {
    change(&app, &core, |c| c.set_language(language))?;
    emit_settings(&app);
    Ok(())
}

#[tauri::command]
pub fn set_notch_config(app: AppHandle, core: State<CoreState>, config: NotchConfig) -> Result<(), String> {
    change(&app, &core, |c| c.set_notch(config))
}

/// Saves the choice, then rebuilds the overlays so only the chosen screen keeps one.
#[tauri::command]
pub fn set_screen(app: AppHandle, core: State<CoreState>, name: Option<String>) -> Result<(), String> {
    change(&app, &core, |c| c.set_screen(name))?;
    emit_settings(&app);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(e) = crate::overlay::rebuild_overlays(&handle) {
            eprintln!("notching: rebuilding overlays failed: {e}");
        }
    })
    .map_err(|e| e.to_string())
}

/// Brings the one settings window forward, or creates it centred on the screen
/// whose ⋯ was clicked. While it exists the app has a Dock icon and is in
/// Cmd+Tab (owner's decision, 28 Oct 2026). Async: creating a window from a
/// synchronous command can deadlock.
#[tauri::command]
pub async fn open_settings(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let _opening = OPENING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = app.set_activation_policy(ActivationPolicy::Regular);
        let _ = existing.unminimize();
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }

    let screen = app.state::<Overlays>().0.lock().unwrap().get(window.label()).map(|e| e.screen.frame);
    let _ = app.set_activation_policy(ActivationPolicy::Regular);
    let (w, h) = SETTINGS_SIZE;
    let mut builder = WebviewWindowBuilder::new(&app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("Notching")
        .inner_size(w, h)
        .min_inner_size(600.0, 480.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .visible(false)
        .on_page_load(|w, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = w.show();
                let _ = w.set_focus();
            }
        });
    if screen.is_none() {
        builder = builder.center();
    }
    let settings = match builder.build() {
        Ok(win) => win,
        Err(e) => {
            if hide_dock_icon_after_failed_build(app.get_webview_window(SETTINGS_LABEL).is_some()) {
                let _ = app.set_activation_policy(ActivationPolicy::Accessory);
            }
            return Err(e.to_string());
        }
    };

    let handle = app.clone();
    settings.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            let _ = handle.set_activation_policy(ActivationPolicy::Accessory);
        }
    });

    if let Some(frame) = screen {
        let (x, y) = centered_origin(frame, w, h);
        let target = settings.clone();
        app.run_on_main_thread(move || {
            let Ok(ptr) = target.ns_window() else { return };
            // SAFETY: Tauri hands out its own live NSWindow, and this runs on the main thread.
            let ns_window = unsafe { &*(ptr as *const objc2_app_kit::NSWindow) };
            ns_window.setFrameOrigin(objc2_foundation::NSPoint::new(x, y));
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failed_second_open_keeps_the_dock_icon() {
        assert!(!hide_dock_icon_after_failed_build(true));
        assert!(hide_dock_icon_after_failed_build(false));
    }
}
