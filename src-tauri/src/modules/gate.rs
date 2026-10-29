//! The capability gate: a module may use only what its manifest declares (spec 6).

use super::manifest::Capability;
use super::store::ModuleEntry;

/// A capability call the gate let through.
#[derive(Debug, PartialEq, Eq)]
pub enum Call {
    SystemStatsRead,
    HomeRead,
    HomeRefreshWeather,
    RemindersAdd,
    RemindersSetDone,
    NotifyPost,
}

#[derive(Debug, PartialEq, Eq)]
pub enum CallError {
    UnknownModule(String),
    ModuleOff(String),
    UnknownCapability(String),
    NotDeclared { module: String, capability: String },
    UnknownMethod(String),
    Failed(String),
}

// Sent to the module as is.
impl std::fmt::Display for CallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CallError::UnknownModule(id) => write!(f, "unknown module {id}"),
            CallError::ModuleOff(id) => write!(f, "module {id} is switched off"),
            CallError::UnknownCapability(cap) => write!(f, "unknown capability {cap}"),
            CallError::NotDeclared { module, capability } => write!(f, "module {module} did not declare {capability}"),
            CallError::UnknownMethod(method) => write!(f, "unknown method {method}"),
            CallError::Failed(why) => write!(f, "{why}"),
        }
    }
}

pub fn authorize(module: Option<&ModuleEntry>, module_id: &str, capability: &str, method: &str) -> Result<Call, CallError> {
    let module = module.ok_or_else(|| CallError::UnknownModule(module_id.to_string()))?;
    if !module.enabled {
        return Err(CallError::ModuleOff(module_id.to_string()));
    }
    // Same names as in manifest.json.
    let cap: Capability = serde_json::from_value(serde_json::Value::String(capability.to_string()))
        .map_err(|_| CallError::UnknownCapability(capability.to_string()))?;
    if !module.manifest.capabilities.contains(&cap) {
        return Err(CallError::NotDeclared { module: module_id.to_string(), capability: capability.to_string() });
    }
    match (cap, method) {
        (Capability::SystemStats, "read") => Ok(Call::SystemStatsRead),
        (Capability::HomeData, "read") => Ok(Call::HomeRead),
        (Capability::HomeData, "refreshWeather") => Ok(Call::HomeRefreshWeather),
        (Capability::Reminders, "add") => Ok(Call::RemindersAdd),
        (Capability::Reminders, "setDone") => Ok(Call::RemindersSetDone),
        (Capability::Notify, "post") => Ok(Call::NotifyPost),
        _ => Err(CallError::UnknownMethod(method.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::manifest::{CardSize, Manifest};

    fn entry(id: &str, caps: &[Capability], enabled: bool) -> ModuleEntry {
        ModuleEntry {
            manifest: Manifest {
                id: id.into(),
                version: "1.0.0".into(),
                entry: Some("index.html".into()),
                icon: "icon.svg".into(),
                card: Some(CardSize { width: 400, height: 90 }),
                permissions: vec![],
                capabilities: caps.to_vec(),
                notifications: vec![],
                widgets: vec![],
            },
            name: id.into(),
            short_name: id.into(),
            description: String::new(),
            installed: true,
            enabled,
            size: 0,
            icon_svg: String::new(),
            channels: vec![],
            widgets: vec![],
        }
    }

    #[test]
    fn a_declared_capability_is_allowed() {
        let m = entry("system-stat", &[Capability::SystemStats], true);
        assert_eq!(authorize(Some(&m), "system-stat", "system.stats", "read"), Ok(Call::SystemStatsRead));
    }

    #[test]
    fn an_undeclared_capability_is_refused() {
        let m = entry("home", &[], true);
        assert_eq!(
            authorize(Some(&m), "home", "system.stats", "read"),
            Err(CallError::NotDeclared { module: "home".into(), capability: "system.stats".into() })
        );
    }

    #[test]
    fn switched_off_or_unknown_modules_are_refused() {
        assert_eq!(authorize(None, "zzz", "system.stats", "read"), Err(CallError::UnknownModule("zzz".into())));
        let off = entry("system-stat", &[Capability::SystemStats], false);
        assert_eq!(
            authorize(Some(&off), "system-stat", "system.stats", "read"),
            Err(CallError::ModuleOff("system-stat".into()))
        );
    }

    #[test]
    fn unknown_capabilities_and_methods_are_refused() {
        let m = entry("system-stat", &[Capability::SystemStats], true);
        assert_eq!(
            authorize(Some(&m), "system-stat", "keyboard.lock", "lock"),
            Err(CallError::UnknownCapability("keyboard.lock".into()))
        );
        assert_eq!(
            authorize(Some(&m), "system-stat", "system.stats", "write"),
            Err(CallError::UnknownMethod("write".into()))
        );
    }

    #[test]
    fn beranda_capabilities() {
        let home = entry("home", &[Capability::HomeData, Capability::Reminders], true);
        assert_eq!(authorize(Some(&home), "home", "home.data", "read"), Ok(Call::HomeRead));
        assert_eq!(authorize(Some(&home), "home", "home.data", "refreshWeather"), Ok(Call::HomeRefreshWeather));
        assert_eq!(authorize(Some(&home), "home", "reminders", "add"), Ok(Call::RemindersAdd));
        assert_eq!(authorize(Some(&home), "home", "reminders", "setDone"), Ok(Call::RemindersSetDone));
        let stat = entry("system-stat", &[Capability::SystemStats], true);
        assert!(matches!(authorize(Some(&stat), "system-stat", "reminders", "add"), Err(CallError::NotDeclared { .. })));
    }

    #[test]
    fn errors_read_as_plain_sentences() {
        let e = CallError::NotDeclared { module: "home".into(), capability: "system.stats".into() };
        assert_eq!(e.to_string(), "module home did not declare system.stats");
    }

    #[test]
    fn notify_needs_its_capability() {
        let timer = entry("timer", &[Capability::Notify], true);
        assert_eq!(authorize(Some(&timer), "timer", "notify", "post"), Ok(Call::NotifyPost));
        let quiet = entry("timer", &[], true);
        assert_eq!(
            authorize(Some(&quiet), "timer", "notify", "post"),
            Err(CallError::NotDeclared { module: "timer".into(), capability: "notify".into() })
        );
    }
}
