//! Commands for modules: their state, the last page, switching on/off,
//! uninstalling and reinstalling, and capability calls through the gate.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_core::{AppCore, CoreError, CoreState, ModuleStateDto, StatsState};
use crate::home::{current_snapshot, refresh_weather, HomeState};
use crate::modules::gate::{authorize, Call, CallError};
use crate::prefs::PrefsState;

/// Broadcast to every window whenever module state changes.
pub const MODULE_STATE_EVENT: &str = "notching://module-state";

/// A hidden feature's capability called off macOS; its module never installs there.
#[cfg(not(target_os = "macos"))]
const NOT_HERE: &str = "not available on this platform";

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
pub fn set_last_page(app: AppHandle, core: State<CoreState>, page: String) -> Result<(), String> {
    change(&app, &core, |c| c.set_last_page(&page))
}

#[tauri::command]
pub fn set_module_enabled(app: AppHandle, core: State<CoreState>, id: String, enabled: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_enabled(&id, enabled))?;
    if !enabled {
        module_gone(&app, &id);
    } else {
        module_on(&app, &id);
    }
    crate::status::publish(&app);
    Ok(())
}

// The module was switched off or uninstalled: whatever it runs ends with it.
#[cfg(target_os = "macos")]
fn module_gone(app: &AppHandle, id: &str) {
    crate::awake_service::module_gone(app, id);
    crate::timer_service::module_gone(app, id);
    crate::keyclean_service::module_gone(app, id);
    crate::lamp_service::module_gone(app, id);
    crate::shelf_service::module_gone(app, id);
    crate::shot_service::module_gone(app, id);
    crate::cleaner_service::module_gone(app, id);
    crate::media_service::module_gone(app, id);
}

#[cfg(not(target_os = "macos"))]
fn module_gone(app: &AppHandle, id: &str) {
    crate::awake_service::module_gone(app, id);
    crate::timer_service::module_gone(app, id);
}

#[cfg(target_os = "macos")]
fn module_on(app: &AppHandle, id: &str) {
    crate::shot_hotkey::module_on(app, id);
    crate::media_service::module_on(app, id);
}

#[cfg(not(target_os = "macos"))]
fn module_on(_app: &AppHandle, _id: &str) {}

#[tauri::command]
pub fn uninstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.uninstall(&id))?;
    module_gone(&app, &id);
    #[cfg(target_os = "macos")]
    crate::shot_service::uninstalled(&app, &id);
    crate::status::publish(&app);
    Ok(())
}

#[tauri::command]
pub fn reinstall_module(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.reinstall(&id))?;
    module_on(&app, &id);
    crate::status::publish(&app);
    Ok(())
}

/// A module's capability call, checked against its installed manifest. Stats and
/// weather may block, so they run off the main thread.
#[tauri::command]
pub async fn module_call(
    app: AppHandle,
    module_id: String,
    capability: String,
    method: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let call = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        authorize(core.module(&module_id), &module_id, &capability, &method).map_err(|e| e.to_string())?
    };
    let value = match call {
        Call::SystemStatsRead => {
            let handle = app.clone();
            let stats = tauri::async_runtime::spawn_blocking(move || handle.state::<StatsState>().0.lock().unwrap().read())
                .await
                .map_err(|e| e.to_string())?;
            serde_json::to_value(stats)
        }
        Call::HomeRead => serde_json::to_value(current_snapshot(&app)),
        Call::HomeRefreshWeather => {
            let handle = app.clone();
            tauri::async_runtime::spawn_blocking(move || refresh_weather(&handle)).await.map_err(|e| e.to_string())??;
            serde_json::to_value(current_snapshot(&app))
        }
        Call::RemindersAdd => {
            let a: AddArgs = parse_args(args, "reminders.add")?;
            let added = app.state::<HomeState>().0.lock().unwrap().reminders.add(&a.title, &a.day, a.at)?;
            crate::home::schedule::poke(&app);
            serde_json::to_value(added)
        }
        Call::RemindersSetDone => {
            let a: DoneArgs = parse_args(args, "reminders.setDone")?;
            app.state::<HomeState>().0.lock().unwrap().reminders.set_done(a.id, a.done)?;
            crate::home::schedule::poke(&app);
            Ok(serde_json::Value::Null)
        }
        // A module can only use its own channels: they are looked up under module_id.
        Call::NotifyPost => {
            let a: PostArgs = parse_args(args, "notify.post")?;
            crate::notify::post(&app, &module_id, &a.channel, &a.title, a.detail.as_deref().unwrap_or(""))?;
            Ok(serde_json::Value::Null)
        }
        Call::AwakeRead => serde_json::to_value(crate::awake_service::read(&app)),
        // The run belongs to the module that started it: its status and notice.
        Call::AwakeStart => {
            let a: StartArgs = parse_args(args, "awake.start")?;
            serde_json::to_value(crate::awake_service::turn_on(&app, &module_id, a.minutes)?)
        }
        Call::AwakeAdd => {
            let a: ExtendArgs = parse_args(args, "awake.add")?;
            serde_json::to_value(crate::awake_service::extend(&app, a.minutes)?)
        }
        Call::AwakeStop => serde_json::to_value(crate::awake_service::turn_off(&app)),
        Call::TimerRead => serde_json::to_value(crate::timer_service::read(&app)),
        // Like Keep awake: the timer belongs to the module that started it.
        Call::TimerStart => {
            let a: ExtendArgs = parse_args(args, "timer.start")?;
            serde_json::to_value(crate::timer_service::begin(&app, &module_id, a.minutes)?)
        }
        Call::TimerPause => serde_json::to_value(crate::timer_service::pause(&app)?),
        Call::TimerResume => serde_json::to_value(crate::timer_service::resume(&app)?),
        Call::TimerStop => serde_json::to_value(crate::timer_service::stop(&app)),
        #[cfg(target_os = "macos")]
        Call::KeyCleanToggle => {
            crate::keyclean_service::toggle(&app, &module_id)?;
            Ok(serde_json::Value::Null)
        }
        #[cfg(target_os = "macos")]
        Call::LampOn => {
            crate::lamp_service::turn_on(&app, &module_id);
            Ok(serde_json::Value::Null)
        }
        #[cfg(target_os = "macos")]
        Call::LampOff => {
            crate::lamp_service::turn_off(&app);
            Ok(serde_json::Value::Null)
        }
        // The notch opens the shelf itself; the call has nothing to do.
        #[cfg(target_os = "macos")]
        Call::ShelfOpen => Ok(serde_json::Value::Null),
        // The tile's capture is wired in the screenshot service (a later task).
        #[cfg(target_os = "macos")]
        Call::ScreenshotOpen => Ok(serde_json::Value::Null),
        // Cleaner's pages are drawn by the notch, which opens them itself.
        #[cfg(target_os = "macos")]
        Call::CleanerOpen => Ok(serde_json::Value::Null),
        #[cfg(target_os = "macos")]
        Call::MediaNow => serde_json::to_value(crate::media_service::now(&app)),
        #[cfg(target_os = "macos")]
        Call::MediaCommand => {
            let command = crate::media_service::parse_command(args.as_ref())?;
            Ok(crate::media_service::send(&app, command)?)
        }
        // Mirror's lamp; the rest belong to modules that never install here.
        #[cfg(not(target_os = "macos"))]
        Call::KeyCleanToggle
        | Call::LampOn
        | Call::LampOff
        | Call::ShelfOpen
        | Call::ScreenshotOpen
        | Call::CleanerOpen
        | Call::MediaNow
        | Call::MediaCommand => return Err(NOT_HERE.into()),
        // Always the calling module's own file: the id never comes from args.
        Call::PrefsRead => Ok(app.state::<PrefsState>().0.read(&module_id)),
        Call::PrefsWrite => {
            let a: PrefsWriteArgs = parse_args(args, "prefs.write")?;
            app.state::<PrefsState>().0.write(&module_id, &a.value)?;
            Ok(serde_json::Value::Null)
        }
    };
    value.map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct AddArgs {
    title: String,
    day: String,
    at: Option<i64>,
}

#[derive(serde::Deserialize)]
struct PostArgs {
    channel: String,
    title: String,
    detail: Option<String>,
}

/// `minutes` null: no limit.
#[derive(serde::Deserialize)]
struct StartArgs {
    minutes: Option<u32>,
}

/// `awake.add` and `timer.start`.
#[derive(serde::Deserialize)]
struct ExtendArgs {
    minutes: u32,
}

#[derive(serde::Deserialize)]
struct PrefsWriteArgs {
    value: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct DoneArgs {
    id: u64,
    done: bool,
}

fn parse_args<T: serde::de::DeserializeOwned>(args: Option<serde_json::Value>, call: &str) -> Result<T, String> {
    serde_json::from_value(args.unwrap_or_default())
        .map_err(|_| CallError::Failed(format!("bad arguments for {call}")).to_string())
}
