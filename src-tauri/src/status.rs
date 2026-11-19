//! Modules that are on or running (design 30 Oct, §7–8), and the statuses
//! shown beside the notch: every one that has text and is not switched off, in
//! the order they started (design 1 Nov, Titipan §8), on the screen under the cursor.

use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_core::CoreState;
use crate::module_commands::{change, MODULE_STATE_EVENT};
use crate::notify::{clip, cursor_screen};

pub const STATUS_MAX: usize = 6;
/// A part's text ("Working", Agent AI): a word, not a number.
pub const PART_MAX: usize = 10;
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
    /// One of several statuses of the same module (Agent AI: one per agent).
    pub part: Option<String>,
    /// A file in the module's package shown instead of its icon.
    pub icon: Option<String>,
    /// Three dots after the text that fill one by one.
    pub dots: bool,
    /// The icon keeps its own colours instead of turning white.
    pub color: bool,
}

/// One of a module's statuses, each with its own icon (Agent AI, owner 19 Nov).
#[derive(Clone, Debug, PartialEq)]
pub struct Part {
    pub key: String,
    pub icon: String,
    pub text: String,
    pub dots: bool,
    /// Its icon keeps its own colours (Claude's orange, owner 19 Nov).
    pub color: bool,
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
                self.entries.push(LiveEntry {
                    module: module.map(String::from),
                    activity,
                    text,
                    icon_only: false,
                    part: None,
                    icon: None,
                    dots: false,
                    color: false,
                });
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

    /// The module's statuses become `parts`, where its first one was (or last);
    /// true when its activity changed or a part came or went. No parts clears it.
    pub fn set_parts(&mut self, module: &str, activity: Activity, parts: &[Part]) -> bool {
        let at = self.entries.iter().position(|e| e.module.as_deref() == Some(module)).unwrap_or(self.entries.len());
        let before: Vec<(Option<String>, Activity)> = self
            .entries
            .iter()
            .filter(|e| e.module.as_deref() == Some(module))
            .map(|e| (e.part.clone(), e.activity))
            .collect();
        self.entries.retain(|e| e.module.as_deref() != Some(module));
        let fresh: Vec<LiveEntry> = parts
            .iter()
            .map(|p| LiveEntry {
                module: Some(module.to_string()),
                activity,
                text: Some(clip(p.text.trim(), PART_MAX)).filter(|t| !t.is_empty()),
                icon_only: false,
                part: Some(p.key.clone()),
                icon: Some(p.icon.clone()),
                dots: p.dots,
                color: p.color,
            })
            .collect();
        let after: Vec<(Option<String>, Activity)> = fresh.iter().map(|e| (e.part.clone(), e.activity)).collect();
        let at = at.min(self.entries.len());
        self.entries.splice(at..at, fresh);
        before != after
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
    pub fn items(&self, off: &[String]) -> Vec<StatusItemDto> {
        self.entries
            .iter()
            .filter(|e| !e.module.as_ref().is_some_and(|m| off.contains(m)))
            .filter_map(|e| {
                let text = if e.icon_only { Some(String::new()) } else { e.text.clone() };
                text.map(|text| StatusItemDto { module_id: e.module.clone(), text, icon: e.icon.clone(), dots: e.dots, color: e.color })
            })
            .collect()
    }

    /// `items` as (module, text).
    #[cfg(test)]
    pub fn shown(&self, off: &[String]) -> Vec<(Option<String>, String)> {
        self.items(off).into_iter().map(|i| (i.module_id, i.text)).collect()
    }
}

/// One status beside the notch; `module_id` None is the sample.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusItemDto {
    pub module_id: Option<String>,
    pub text: String,
    /// A file in the module's package to show instead of its icon.
    pub icon: Option<String>,
    /// Three dots after the text that fill one by one.
    pub dots: bool,
    /// The icon keeps its own colours.
    pub color: bool,
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

/// A module's statuses, one per part; it must declare "status". No parts clears it.
pub fn set_parts(app: &AppHandle, module: &str, activity: Activity, parts: Vec<Part>) -> Result<(), String> {
    let mut result = Ok(());
    update(app, |core| match core.set_status_parts(module, activity, &parts) {
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

    fn part(key: &str, text: &str, dots: bool) -> Part {
        Part { key: key.into(), icon: format!("logos/{key}.svg"), text: text.into(), dots, color: key == "claude" }
    }

    #[test]
    fn parts_show_side_by_side_with_their_own_icon() {
        let mut live = LiveStatus::default();
        live.set(Some("timer"), Activity::Running, Some("18:42"));
        assert!(live.set_parts("ai", Activity::Running, &[part("claude", "Working", true), part("codex", "Waiting", false)]));
        live.set(Some("awake"), Activity::On, Some("1:42"));
        let items = live.items(&[]);
        assert_eq!(items.iter().map(|i| i.color).collect::<Vec<_>>(), vec![false, true, false, false]);
        let view: Vec<_> = items.iter().map(|i| (i.module_id.as_deref(), i.text.as_str(), i.icon.as_deref(), i.dots)).collect();
        assert_eq!(view, vec![
            (Some("timer"), "18:42", None, false),
            (Some("ai"), "Working", Some("logos/claude.svg"), true),
            (Some("ai"), "Waiting", Some("logos/codex.svg"), false),
            (Some("awake"), "1:42", None, false),
        ]);
        // New parts keep the module's place; the same parts are no change.
        assert!(live.set_parts("ai", Activity::Running, &[part("codex", "Working", true)]));
        assert_eq!(live.shown(&[])[1], (Some("ai".into()), "Working".into()));
        assert!(!live.set_parts("ai", Activity::Running, &[part("codex", "Working", true)]));
        assert!(live.set_parts("ai", Activity::On, &[part("codex", "Waiting", false)]));
        assert_eq!(live.activity("ai"), Some(Activity::On));
        // Switched off, or no parts at all.
        assert_eq!(live.items(&["ai".into()]).len(), 2);
        assert!(live.set_parts("ai", Activity::On, &[]));
        assert_eq!(live.activity("ai"), None);
        assert_eq!(live.shown(&[]).len(), 2);
    }

    #[test]
    fn a_part_takes_a_word_of_ten() {
        let mut live = LiveStatus::default();
        live.set_parts("ai", Activity::Running, &[part("c", "Working on it", true)]);
        assert_eq!(live.shown(&[])[0].1, "Working o…");
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
