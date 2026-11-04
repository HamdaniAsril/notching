//! The app keys on Pengaturan's Pintasan page (owner, 4 Nov): Keep awake on and
//! off, and Shelf opened, ⌃⌥K and ⌃⌥V until changed. Free of AppKit.

use serde::{Deserialize, Serialize};

use crate::shot_keys::{Combo, CONTROL, OPTION};

/// What an app key does, and the module it belongs to.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Awake,
    Shelf,
}

impl Action {
    pub const ALL: [Action; 2] = [Action::Awake, Action::Shelf];

    /// The module that must be on for the key to work.
    pub fn module(self) -> &'static str {
        match self {
            Action::Awake => "keep-awake",
            Action::Shelf => "shelf",
        }
    }

    /// Its hot key id: the index in ALL plus one.
    pub fn id(self) -> u32 {
        Action::ALL.iter().position(|&a| a == self).unwrap() as u32 + 1
    }

    pub fn from_id(id: u32) -> Option<Action> {
        Action::ALL.get((id as usize).checked_sub(1)?).copied()
    }
}

/// One combo per action; an action missing from the settings keeps its own.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct AppKeys {
    pub awake: Combo,
    pub shelf: Combo,
}

impl Default for AppKeys {
    fn default() -> Self {
        AppKeys {
            awake: Combo { code: 0x28, mods: CONTROL | OPTION }, // ⌃⌥K
            shelf: Combo { code: 0x09, mods: CONTROL | OPTION }, // ⌃⌥V
        }
    }
}

impl AppKeys {
    fn slot(&mut self, action: Action) -> &mut Combo {
        match action {
            Action::Awake => &mut self.awake,
            Action::Shelf => &mut self.shelf,
        }
    }

    pub fn get(mut self, action: Action) -> Combo {
        *self.slot(action)
    }

    /// The action whose key `combo` is.
    pub fn action_of(self, combo: Combo) -> Option<Action> {
        Action::ALL.into_iter().find(|&a| self.get(a) == combo)
    }
}

/// Why a key recorded for an action was refused.
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppKeyError {
    /// Not a key that can be recorded, or no ⌘, ⌃ or ⌥.
    Invalid,
    /// The other action's key.
    Duplicate { action: Action },
    /// One of Screenshot's two keys while Screenshot is on.
    Shot,
    /// One of Atur jendela's nine keys while that tool is on.
    Window,
}

/// One action set to `combo`. `shot` and `window` say whether Screenshot or
/// Atur jendela, while on, hold it.
pub fn set_key(keys: AppKeys, action: Action, combo: Option<Combo>, shot: bool, window: bool) -> Result<AppKeys, AppKeyError> {
    let combo = combo.ok_or(AppKeyError::Invalid)?;
    if let Some(other) = keys.action_of(combo).filter(|&a| a != action) {
        return Err(AppKeyError::Duplicate { action: other });
    }
    if shot {
        return Err(AppKeyError::Shot);
    }
    if window {
        return Err(AppKeyError::Window);
    }
    let mut next = keys;
    *next.slot(action) = combo;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shot_keys::{label, CMD, SHIFT};

    #[test]
    fn defaults_are_control_option_k_and_v() {
        let k = AppKeys::default();
        assert_eq!(label(k.awake), "⌃⌥K");
        assert_eq!(label(k.shelf), "⌃⌥V");
    }

    #[test]
    fn ids_round_trip() {
        for a in Action::ALL {
            assert_eq!(Action::from_id(a.id()), Some(a));
        }
        assert_eq!(Action::from_id(0), None);
        assert_eq!(Action::from_id(3), None);
    }

    #[test]
    fn a_key_is_refused_when_taken() {
        let keys = AppKeys::default();
        let mine = Combo { code: 0x28, mods: CMD | SHIFT };
        assert_eq!(set_key(keys, Action::Awake, None, false, false), Err(AppKeyError::Invalid));
        assert_eq!(set_key(keys, Action::Awake, Some(keys.shelf), false, false), Err(AppKeyError::Duplicate { action: Action::Shelf }));
        assert_eq!(set_key(keys, Action::Awake, Some(mine), true, false), Err(AppKeyError::Shot));
        assert_eq!(set_key(keys, Action::Awake, Some(mine), false, true), Err(AppKeyError::Window));
        assert_eq!(set_key(keys, Action::Awake, Some(keys.awake), false, false), Ok(keys));
        assert_eq!(set_key(keys, Action::Awake, Some(mine), false, false).unwrap().awake, mine);
    }

    #[test]
    fn missing_actions_keep_their_key() {
        let k: AppKeys = serde_json::from_str(r#"{"shelf":{"code":1,"mods":4096}}"#).unwrap();
        assert_eq!(k.awake, AppKeys::default().awake);
        assert_eq!(k.shelf, Combo { code: 1, mods: CONTROL });
    }

    #[test]
    fn errors_are_tagged() {
        assert_eq!(
            serde_json::to_value(AppKeyError::Duplicate { action: Action::Shelf }).unwrap(),
            serde_json::json!({"kind":"duplicate","action":"shelf"})
        );
    }
}
