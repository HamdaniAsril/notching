//! Commands for modules: their state, the last card, switching on/off,
//! uninstalling and reinstalling, and capability calls through the gate.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_core::{AppCore, CoreError, CoreState, ModuleStateDto, StatsState};
use crate::modules::gate::{authorize, Call};

/// Broadcast to every window whenever module state changes.
pub const MODULE_STATE_EVENT: &str = "notching://module-state";

#[tauri::command]
pub fn get_module_state(core: State<CoreState>) -> ModuleStateDto {
    core.0.lock().unwrap().state()
}

// Changes the state under the lock, then broadcasts it after letting go.
pub(crate) fn change(
    app: &AppHandle,
    core: &State<CoreState>,
    f: impl FnOnce(&mut AppCore) -> Result<(), CoreError>,
) -> Result<(), String> {
    let state = {
        let mut core = core.0.lock().unwrap();
        f(&mut core).map_err(|e| e.to_string())?;
        core.state()
    };
    let _ = app.emit(MODULE_STATE_EVENT, state);
    Ok(())
}

#[tauri::command]
pub fn set_last_card(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.set_last_card(&id))
}

#[tauri::command]
pub fn set_module_enabled(app: AppHandle, core: State<CoreState>, id: String, enabled: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_enabled(&id, enabled))
}

#[tauri::command]
pub fn uninstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.uninstall(&id))
}

#[tauri::command]
pub fn reinstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.reinstall(&id))
}

/// A module's capability call, checked against its installed manifest. The first
/// stats read may sleep ~200 ms, so it runs off the main thread.
#[tauri::command]
pub async fn module_call(
    app: AppHandle,
    module_id: String,
    capability: String,
    method: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let _ = args; // no capability takes arguments yet
    let call = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        authorize(core.module(&module_id), &module_id, &capability, &method).map_err(|e| e.to_string())?
    };
    match call {
        Call::SystemStatsRead => {
            let handle = app.clone();
            let stats = tauri::async_runtime::spawn_blocking(move || handle.state::<StatsState>().0.lock().unwrap().read())
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(stats).map_err(|e| e.to_string())
        }
    }
}
