//! Notifications from Notching's own modules (spec 4.4): the Notifikasi page's
//! switches and the missed-notice dots.

use tauri::{AppHandle, Emitter, State};

use crate::app_core::CoreState;
use crate::module_commands::{change, MODULE_STATE_EVENT};
use crate::settings::ChannelPref;

#[tauri::command]
pub fn set_notice_glow(app: AppHandle, core: State<CoreState>, on: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_glow(on))
}

#[tauri::command]
pub fn set_notice_seconds(app: AppHandle, core: State<CoreState>, seconds: f64) -> Result<(), String> {
    change(&app, &core, |c| c.set_notice_seconds(seconds))
}

#[tauri::command]
pub fn set_channel(
    app: AppHandle,
    core: State<CoreState>,
    module: String,
    channel: String,
    on: bool,
    sound: bool,
) -> Result<(), String> {
    change(&app, &core, |c| c.set_channel(&module, &channel, ChannelPref { on, sound }))
}

/// The person looked: the dots go. Broadcasts only if there were any.
#[tauri::command]
pub fn clear_missed(app: AppHandle, core: State<CoreState>) {
    let state = {
        let mut core = core.0.lock().unwrap();
        if !core.clear_missed() {
            return;
        }
        core.state()
    };
    let _ = app.emit(MODULE_STATE_EVENT, state);
}
