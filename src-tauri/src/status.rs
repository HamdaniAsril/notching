//! Modules that are on or running (design 30 Oct, §7–8), and the one status
//! shown beside the notch: the last one started that has text and is not
//! switched off, on the screen under the cursor.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_core::CoreState;
use crate::module_commands::{change, MODULE_STATE_EVENT};
use crate::notify::{clip, cursor_screen};

pub const STATUS_MAX: usize = 6;
/// Sent to every window with a StatusDto, or null when nothing shows.
pub const STATUS_EVENT: &str = "notching://status";
/// What "Contoh status" in Notifikasi shows.
pub const SAMPLE_TEXT: &str = "18:42";

/// White tile while on (Keep awake), a red dot while running (Timer).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    On,
    Running,
}

/// `module` None is the sample from the settings window.
#[derive(Clone, Debug, PartialEq)]
pub struct LiveEntry {
    pub module: Option<String>,
    pub activity: Activity,
    pub text: Option<String>,
}

/// Kept in memory only, in the order the modules started.
#[derive(Default)]
pub struct LiveStatus {
    entries: Vec<LiveEntry>,
}

impl LiveStatus {
    /// A module already here keeps its place; true when its activity changed.
    pub fn set(&mut self, module: Option<&str>, activity: Activity, text: Option<&str>) -> bool {
        let text = text.map(str::trim).filter(|t| !t.is_empty()).map(|t| clip(t, STATUS_MAX));
        match self.entries.iter_mut().find(|e| e.module.as_deref() == module) {
            Some(e) => {
                let changed = e.activity != activity;
                e.activity = activity;
                e.text = text;
                changed
            }
            None => {
                self.entries.push(LiveEntry { module: module.map(String::from), activity, text });
                true
            }
        }
    }

    pub fn clear(&mut self, module: Option<&str>) -> bool {
        let before = self.entries.len();
        self.entries.retain(|e| e.module.as_deref() != module);
        self.entries.len() != before
    }

    pub fn activity(&self, module: &str) -> Option<Activity> {
        self.entries.iter().find(|e| e.module.as_deref() == Some(module)).map(|e| e.activity)
    }

    pub fn has_sample(&self) -> bool {
        self.entries.iter().any(|e| e.module.is_none())
    }

    /// The last one started that has text and whose module is not in `off`.
    pub fn shown(&self, off: &[String]) -> Option<(Option<String>, String)> {
        self.entries.iter().rev().find_map(|e| {
            let hidden = e.module.as_ref().is_some_and(|m| off.contains(m));
            match (&e.text, hidden) {
                (Some(text), false) => Some((e.module.clone(), text.clone())),
                _ => None,
            }
        })
    }
}

/// Same shape as Status in src/notch/status.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDto {
    pub module_id: Option<String>,
    pub text: String,
    /// The overlay window of the screen it shows on.
    pub screen: String,
}

/// Works out the status on the main thread, where the cursor's screen is known,
/// and sends it when it changed. Also after a module is switched off or removed
/// and after overlays are rebuilt, which change what shows where.
pub fn publish(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let screen = cursor_screen(&handle);
        let change = {
            let core = handle.state::<CoreState>();
            let mut core = core.0.lock().unwrap();
            match screen {
                Some(screen) => core.status_change(&screen),
                None => None,
            }
        };
        if let Some(status) = change {
            let _ = handle.emit(STATUS_EVENT, status);
        }
    });
}

// Applies a change under the lock; a changed activity also redraws the Modul tiles.
fn update(app: &AppHandle, f: impl FnOnce(&mut crate::app_core::AppCore) -> bool) {
    let state = {
        let core = app.state::<CoreState>();
        let mut core = core.0.lock().unwrap();
        f(&mut core).then(|| core.state())
    };
    if let Some(state) = state {
        let _ = app.emit(MODULE_STATE_EVENT, state);
    }
    publish(app);
}

/// A module's status; it must declare the "status" capability.
pub fn set(app: &AppHandle, module: &str, activity: Activity, text: Option<&str>) -> Result<(), String> {
    let mut result = Ok(());
    update(app, |core| match core.set_status(Some(module), activity, text) {
        Ok(changed) => changed,
        Err(e) => {
            result = Err(e.to_string());
            false
        }
    });
    result
}

pub fn clear(app: &AppHandle, module: &str) {
    update(app, |core| core.clear_status(Some(module)));
}

#[tauri::command]
pub fn get_status(app: AppHandle) -> Option<StatusDto> {
    app.state::<CoreState>().0.lock().unwrap().status()
}

#[tauri::command]
pub fn set_sample_status(app: AppHandle, on: bool) {
    update(&app, |core| {
        core.set_sample_status(on);
        true
    });
}

#[tauri::command]
pub fn set_status_shown(app: AppHandle, core: State<CoreState>, module: String, on: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_status_shown(&module, on))?;
    publish(&app);
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;

    fn shown(live: &LiveStatus) -> Option<(Option<String>, String)> {
        live.shown(&[])
    }

    fn of(module: &str, text: &str) -> Option<(Option<String>, String)> {
        Some((Some(module.into()), text.into()))
    }

    #[test]
    fn the_last_started_status_shows() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("18:42"));
        live.set(Some("b"), Activity::On, Some("On"));
        assert_eq!(shown(&live), of("b", "On"));
        live.set(Some("a"), Activity::Running, Some("18:41"));
        assert_eq!(shown(&live), of("b", "On"));
        live.clear(Some("b"));
        assert_eq!(shown(&live), of("a", "18:41"));
    }

    #[test]
    fn a_status_without_text_never_shows_but_keeps_activity() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::On, None);
        live.set(Some("b"), Activity::On, Some("  "));
        assert_eq!(shown(&live), None);
        assert_eq!(live.activity("a"), Some(Activity::On));
        assert_eq!(live.activity("b"), Some(Activity::On));
        assert_eq!(live.activity("c"), None);
    }

    #[test]
    fn status_text_is_cut_to_six() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("123456789"));
        assert_eq!(shown(&live), of("a", "12345…"));
    }

    #[test]
    fn switched_off_statuses_are_skipped() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("18:42"));
        live.set(Some("b"), Activity::On, Some("On"));
        assert_eq!(live.shown(&["b".into()]), of("a", "18:42"));
        assert_eq!(live.shown(&["a".into(), "b".into()]), None);
    }

    #[test]
    fn the_sample_is_a_status_of_its_own() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("1"));
        live.set(None, Activity::Running, Some("18:42"));
        assert_eq!(shown(&live), Some((None, "18:42".into())));
        assert!(live.has_sample());
        live.clear(None);
        assert!(!live.has_sample());
        assert_eq!(shown(&live), of("a", "1"));
    }

    #[test]
    fn activity_changes_are_reported() {
        let mut live = LiveStatus::default();
        assert!(live.set(Some("a"), Activity::Running, Some("1")));
        assert!(!live.set(Some("a"), Activity::Running, Some("2")));
        assert!(live.set(Some("a"), Activity::On, Some("2")));
        assert!(live.clear(Some("a")));
        assert!(!live.clear(Some("a")));
    }
}
