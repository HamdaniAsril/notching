//! Intip jendela's window switcher (design 5 Nov §2.3, §6): its key, and soon
//! its list and panel. Key clashes follow the same rule as Notching's other keys.

use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::module_commands::change;
use crate::shot_keys::{switch_from_web, Combo};
use crate::switch_rules::{refusal, SwitchKeyError};

fn settings(app: &AppHandle) -> crate::peek_rules::PeekSettings {
    app.state::<CoreState>().0.lock().unwrap().peek_settings()
}

/// The switcher holds this key: the tool installed and on, the switcher on.
pub fn holds(app: &AppHandle, c: Combo) -> bool {
    let s = settings(app);
    crate::peek_service::installed_and_on(app) && s.switcher && s.switcher_key == c
}

/// Brings the key tap and macOS's own ⌘Tab in line with the settings. Filled
/// in by Task 5.
pub fn sync(_app: &AppHandle) {}

/// A switcher key from the tap, on the main thread. Filled in by Task 5.
pub fn key(_app: &AppHandle, _action: crate::switch_rules::SwitchAction) {}

fn save_key(app: &AppHandle, key: Combo) -> Result<(), String> {
    let core = app.state::<CoreState>();
    let next = crate::peek_rules::PeekSettings { switcher_key: key, ..settings(app) };
    change(app, &core, |c| c.set_peek_settings(next))?;
    sync(app);
    Ok(())
}

/// A key recorded on Pintasan for the switcher. Refuses Screenshot's,
/// Atur jendela's and the app keys while they are on.
#[tauri::command]
pub async fn switch_set_key(app: AppHandle, code: String, cmd: bool, ctrl: bool, alt: bool, shift: bool) -> Result<(), SwitchKeyError> {
    let combo = switch_from_web(&code, cmd, ctrl, alt, shift);
    let shot = combo.is_some_and(|c| {
        crate::shot_service::enabled(&app) && {
            let s = app.state::<CoreState>().0.lock().unwrap().shot_keys();
            s.screen == c || s.pick == c
        }
    });
    let window = combo.is_some_and(|c| crate::win_service::holds(&app, c));
    let keys = combo.is_some_and(|c| crate::app_keys_service::holds(&app, c));
    if let Some(e) = refusal(combo, shot, window, keys) {
        return Err(e);
    }
    save_key(&app, combo.unwrap_or(crate::peek_rules::SWITCHER_KEY)).map_err(|_| SwitchKeyError::Invalid)
}

/// Back to ⌘Tab.
#[tauri::command]
pub async fn switch_reset_key(app: AppHandle) -> Result<(), String> {
    save_key(&app, crate::peek_rules::SWITCHER_KEY)
}
