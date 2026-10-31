//! Modules that are on or running (design 30 Oct, §7–8), and the statuses
//! shown beside the notch: every one that has text and is not switched off, in
//! the order they started (design 1 Nov, Titipan §8), on the screen under the cursor.

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
    /// Shows as the module's icon alone (Keyboard Cleaning Mode, design 31 Oct §5).
    pub icon_only: bool,
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
                e.icon_only = false;
                changed
            }
            None => {
                self.entries.push(LiveEntry { module: module.map(String::from), activity, text, icon_only: false });
                true
            }
        }
    }

    /// A module's status as its icon alone, with no text; true when its
    /// activity changed.
    pub fn set_icon(&mut self, module: &str, activity: Activity) -> bool {
        let changed = self.set(Some(module), activity, None);
        if let Some(e) = self.entries.iter_mut().find(|e| e.module.as_deref() == Some(module)) {
            e.icon_only = true;
        }
        changed
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

    /// Every entry that has text, or is an icon alone (text ""), and whose
    /// module is not in `off`, in the order they started.
    pub fn shown(&self, off: &[String]) -> Vec<(Option<String>, String)> {
        self.entries
            .iter()
            .filter(|e| !e.module.as_ref().is_some_and(|m| off.contains(m)))
            .filter_map(|e| {
                let text = if e.icon_only { Some(String::new()) } else { e.text.clone() };
                text.map(|t| (e.module.clone(), t))
            })
            .collect()
    }
}

/// One status beside the notch; `module_id` None is the sample.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusItemDto {
    pub module_id: Option<String>,
    pub text: String,
}

/// Same shape as LiveStatus in src/bridge.ts: never sent with no items (null instead).
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDto {
    /// The overlay window of the screen they show on.
    pub screen: String,
    pub items: Vec<StatusItemDto>,
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

/// A module's status as its icon alone; it must declare "status".
pub fn set_icon(app: &AppHandle, module: &str, activity: Activity) -> Result<(), String> {
    let mut result = Ok(());
    update(app, |core| match core.set_status_icon(module, activity) {
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

    type Shown = Vec<(Option<String>, String)>;

    fn shown(live: &LiveStatus) -> Shown {
        live.shown(&[])
    }

    fn of(list: &[(&str, &str)]) -> Shown {
        list.iter().map(|(m, t)| (Some(m.to_string()), t.to_string())).collect()
    }

    #[test]
    fn shown_lists_every_entry_in_start_order() {
        let mut live = LiveStatus::default();
        live.set(Some("timer"), Activity::Running, Some("18:42"));
        live.set(Some("awake"), Activity::On, Some("1:42"));
        live.set_icon("keyclean", Activity::On);
        assert_eq!(shown(&live), of(&[("timer", "18:42"), ("awake", "1:42"), ("keyclean", "")]));
        // A module already here keeps its place when its text changes.
        live.set(Some("timer"), Activity::Running, Some("18:41"));
        assert_eq!(shown(&live)[0], (Some("timer".into()), "18:41".into()));
        live.clear(Some("awake"));
        assert_eq!(shown(&live), of(&[("timer", "18:41"), ("keyclean", "")]));
    }

    #[test]
    fn shown_skips_off_modules_and_textless_entries() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("18:42"));
        live.set(Some("b"), Activity::On, Some("On"));
        live.set(Some("c"), Activity::On, None);
        live.set(Some("d"), Activity::On, Some("  "));
        assert_eq!(live.shown(&["b".into()]), of(&[("a", "18:42")]));
        assert_eq!(live.shown(&["a".into(), "b".into()]), Shown::new());
    }

    #[test]
    fn a_status_without_text_never_shows_but_keeps_activity() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::On, None);
        live.set(Some("b"), Activity::On, Some("  "));
        assert_eq!(shown(&live), Shown::new());
        assert_eq!(live.activity("a"), Some(Activity::On));
        assert_eq!(live.activity("b"), Some(Activity::On));
        assert_eq!(live.activity("c"), None);
    }

    #[test]
    fn an_icon_only_status_shows_with_empty_text() {
        let mut live = LiveStatus::default();
        assert!(live.set_icon("k", Activity::On));
        assert_eq!(shown(&live), of(&[("k", "")]));
        assert_eq!(live.activity("k"), Some(Activity::On));
        // Text set later replaces the icon alone.
        live.set(Some("k"), Activity::On, Some("On"));
        assert_eq!(shown(&live), of(&[("k", "On")]));
        assert!(!live.set_icon("k", Activity::On));
        assert_eq!(shown(&live), of(&[("k", "")]));
    }

    #[test]
    fn status_text_is_cut_to_six() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("123456789"));
        assert_eq!(shown(&live), of(&[("a", "12345…")]));
    }

    #[test]
    fn the_sample_is_a_status_of_its_own() {
        let mut live = LiveStatus::default();
        live.set(Some("a"), Activity::Running, Some("1"));
        live.set(None, Activity::Running, Some("18:42"));
        assert_eq!(shown(&live), vec![(Some("a".into()), "1".into()), (None, "18:42".into())]);
        assert!(live.has_sample());
        live.clear(None);
        assert!(!live.has_sample());
        assert_eq!(shown(&live), of(&[("a", "1")]));
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
