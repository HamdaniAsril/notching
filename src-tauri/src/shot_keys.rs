//! Screenshot's keys (design 3 Nov tombol): the two combos, as one sets them in
//! Settings, their labels, and whether one of the Mac's own shortcuts holds them.
//! Free of AppKit.

use serde::{Deserialize, Serialize};

// Carbon's modifiers, as RegisterEventHotKey takes them.
pub const CMD: u32 = 0x0100;
pub const SHIFT: u32 = 0x0200;
pub const OPTION: u32 = 0x0800;
pub const CONTROL: u32 = 0x1000;

/// A key with its modifiers: a macOS virtual key code and Carbon modifiers.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Combo {
    pub code: u32,
    pub mods: u32,
}

/// ⌘⇧3 for the whole screen and ⌘⇧4 for a window or an area, unless changed.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShotKeys {
    pub screen: Combo,
    pub pick: Combo,
}

impl Default for ShotKeys {
    fn default() -> Self {
        ShotKeys { screen: Combo { code: 20, mods: CMD | SHIFT }, pick: Combo { code: 21, mods: CMD | SHIFT } }
    }
}

impl ShotKeys {
    pub fn is_default(&self) -> bool {
        *self == ShotKeys::default()
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Which {
    Screen,
    Pick,
}

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum SetKeyError {
    /// Not a key that can be recorded, or no ⌘, ⌃ or ⌥.
    Invalid,
    /// The other row's combo.
    Duplicate,
    /// One of Atur jendela's nine keys while that tool is on (design 4 Nov, alat latar).
    Tool,
}

// The keys that can be recorded: (virtual key code, KeyboardEvent.code, label).
const KEYS: &[(u32, &str, &str)] = &[
    (0x00, "KeyA", "A"), (0x0B, "KeyB", "B"), (0x08, "KeyC", "C"), (0x02, "KeyD", "D"),
    (0x0E, "KeyE", "E"), (0x03, "KeyF", "F"), (0x05, "KeyG", "G"), (0x04, "KeyH", "H"),
    (0x22, "KeyI", "I"), (0x26, "KeyJ", "J"), (0x28, "KeyK", "K"), (0x25, "KeyL", "L"),
    (0x2E, "KeyM", "M"), (0x2D, "KeyN", "N"), (0x1F, "KeyO", "O"), (0x23, "KeyP", "P"),
    (0x0C, "KeyQ", "Q"), (0x0F, "KeyR", "R"), (0x01, "KeyS", "S"), (0x11, "KeyT", "T"),
    (0x20, "KeyU", "U"), (0x09, "KeyV", "V"), (0x0D, "KeyW", "W"), (0x07, "KeyX", "X"),
    (0x10, "KeyY", "Y"), (0x06, "KeyZ", "Z"),
    (0x1D, "Digit0", "0"), (0x12, "Digit1", "1"), (0x13, "Digit2", "2"), (0x14, "Digit3", "3"),
    (0x15, "Digit4", "4"), (0x17, "Digit5", "5"), (0x16, "Digit6", "6"), (0x1A, "Digit7", "7"),
    (0x1C, "Digit8", "8"), (0x19, "Digit9", "9"),
    (0x1B, "Minus", "-"), (0x18, "Equal", "="), (0x21, "BracketLeft", "["), (0x1E, "BracketRight", "]"),
    (0x2A, "Backslash", "\\"), (0x29, "Semicolon", ";"), (0x27, "Quote", "'"), (0x2B, "Comma", ","),
    (0x2F, "Period", "."), (0x2C, "Slash", "/"), (0x32, "Backquote", "`"),
    (0x7A, "F1", "F1"), (0x78, "F2", "F2"), (0x63, "F3", "F3"), (0x76, "F4", "F4"),
    (0x60, "F5", "F5"), (0x61, "F6", "F6"), (0x62, "F7", "F7"), (0x64, "F8", "F8"),
    (0x65, "F9", "F9"), (0x6D, "F10", "F10"), (0x67, "F11", "F11"), (0x6F, "F12", "F12"),
];

/// "⌘⇧3", "⌃⇧S": the modifiers as ⌃ ⌥ ⌘ ⇧, then the key.
pub fn label(c: Combo) -> String {
    let mut s: String = [(CONTROL, '⌃'), (OPTION, '⌥'), (CMD, '⌘'), (SHIFT, '⇧')]
        .into_iter()
        .filter(|&(m, _)| c.mods & m != 0)
        .map(|(_, g)| g)
        .collect();
    match KEYS.iter().find(|k| k.0 == c.code) {
        Some(k) => s.push_str(k.2),
        None => s.push_str(&format!("#{}", c.code)),
    }
    s
}

/// The combo a keydown in Settings makes, by the key's place on the keyboard; None
/// for a key that can't be recorded or without ⌘, ⌃ or ⌥.
pub fn from_web(code: &str, cmd: bool, ctrl: bool, alt: bool, shift: bool) -> Option<Combo> {
    let key = KEYS.iter().find(|k| k.1 == code)?;
    if !(cmd || ctrl || alt) {
        return None;
    }
    let mods = [(cmd, CMD), (ctrl, CONTROL), (alt, OPTION), (shift, SHIFT)]
        .into_iter()
        .filter(|&(on, _)| on)
        .fold(0, |m, (_, bit)| m | bit);
    Some(Combo { code: key.0, mods })
}

/// One row set to `combo`; the other row's combo is refused.
pub fn set_key(keys: ShotKeys, which: Which, combo: Option<Combo>) -> Result<ShotKeys, SetKeyError> {
    let combo = combo.ok_or(SetKeyError::Invalid)?;
    let (other, next) = match which {
        Which::Screen => (keys.pick, ShotKeys { screen: combo, ..keys }),
        Which::Pick => (keys.screen, ShotKeys { pick: combo, ..keys }),
    };
    if combo == other {
        return Err(SetKeyError::Duplicate);
    }
    Ok(next)
}

/// Who among the Mac's own shortcuts holds a combo.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MacHold {
    Free,
    /// One of the Mac's screenshot shortcuts.
    Screenshot,
    /// Another of the Mac's shortcuts that is on.
    Shortcut,
}

// The Mac's shortcuts store NSEvent's modifier flags.
const NS_SHIFT: i64 = 0x20000;
const NS_CONTROL: i64 = 0x40000;
const NS_OPTION: i64 = 0x80000;
const NS_CMD: i64 = 0x100000;
const NS_MODS: i64 = NS_SHIFT | NS_CONTROL | NS_OPTION | NS_CMD;

fn ns_flags(mods: u32) -> i64 {
    [(SHIFT, NS_SHIFT), (CONTROL, NS_CONTROL), (OPTION, NS_OPTION), (CMD, NS_CMD)]
        .into_iter()
        .filter(|&(m, _)| mods & m != 0)
        .fold(0, |f, (_, ns)| f | ns)
}

// The Mac's screenshot shortcuts, with the key and flags they have until changed:
// ⌘⇧3, ⌃⌘⇧3, ⌘⇧4, ⌃⌘⇧4 and ⌘⇧5.
const SCREENSHOT_IDS: [(&str, i64, i64); 5] = [
    ("28", 20, NS_CMD | NS_SHIFT),
    ("29", 20, NS_CONTROL | NS_CMD | NS_SHIFT),
    ("30", 21, NS_CMD | NS_SHIFT),
    ("31", 21, NS_CONTROL | NS_CMD | NS_SHIFT),
    ("184", 23, NS_CMD | NS_SHIFT),
];

/// Which of the Mac's own shortcuts holds `combo`, from `com.apple.symbolichotkeys`.
/// A screenshot shortcut that is missing is the Mac's default, which is on; any other
/// shortcut counts only when it is on and its key is written down.
pub fn mac_holds(symbolic_hotkeys: &serde_json::Value, combo: Combo) -> MacHold {
    let hotkeys = &symbolic_hotkeys["AppleSymbolicHotKeys"];
    let flags = ns_flags(combo.mods);
    let matches = |p: &[serde_json::Value]| {
        p.get(1).and_then(|v| v.as_i64()) == Some(i64::from(combo.code))
            && p.get(2).and_then(|v| v.as_i64()).map(|f| f & NS_MODS) == Some(flags)
    };
    let screenshot = SCREENSHOT_IDS.iter().any(|&(id, code, default_flags)| {
        let entry = &hotkeys[id];
        if entry["enabled"].as_bool() == Some(false) {
            return false;
        }
        match entry["value"]["parameters"].as_array() {
            Some(p) => matches(p),
            None => i64::from(combo.code) == code && flags == default_flags,
        }
    });
    if screenshot {
        return MacHold::Screenshot;
    }
    let other = hotkeys.as_object().is_some_and(|all| {
        all.iter().any(|(id, entry)| {
            !SCREENSHOT_IDS.iter().any(|s| s.0 == id)
                && entry["enabled"].as_bool() == Some(true)
                && entry["value"]["parameters"].as_array().is_some_and(|p| matches(p))
        })
    });
    if other { MacHold::Shortcut } else { MacHold::Free }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn combo(code: u32, mods: u32) -> Combo {
        Combo { code, mods }
    }

    #[test]
    fn labels_read_like_the_mac() {
        assert_eq!(label(ShotKeys::default().screen), "⌘⇧3");
        assert_eq!(label(ShotKeys::default().pick), "⌘⇧4");
        assert_eq!(label(combo(0x01, CONTROL | SHIFT)), "⌃⇧S");
        assert_eq!(label(combo(0x60, OPTION)), "⌥F5");
        assert_eq!(label(combo(0x2C, CMD | OPTION)), "⌥⌘/");
    }

    #[test]
    fn defaults_are_cmd_shift_3_and_4() {
        let keys = ShotKeys::default();
        assert_eq!(keys.screen, combo(20, CMD | SHIFT));
        assert_eq!(keys.pick, combo(21, CMD | SHIFT));
        assert!(keys.is_default());
        assert!(!ShotKeys { screen: combo(1, CONTROL), ..keys }.is_default());
    }

    #[test]
    fn from_web_needs_cmd_ctrl_or_option() {
        assert_eq!(from_web("KeyS", false, true, false, true), Some(combo(0x01, CONTROL | SHIFT)));
        assert_eq!(from_web("Digit3", true, false, false, true), Some(ShotKeys::default().screen));
        assert_eq!(from_web("KeyS", false, false, false, true), None);
        assert_eq!(from_web("KeyS", false, false, false, false), None);
        assert_eq!(from_web("ShiftLeft", true, false, false, true), None);
        assert_eq!(from_web("Space", true, false, false, false), None);
        assert_eq!(from_web("F12", false, false, true, false), Some(combo(0x6F, OPTION)));
        assert_eq!(from_web("Slash", true, false, true, false), Some(combo(0x2C, CMD | OPTION)));
    }

    #[test]
    fn set_key_refuses_the_other_rows_combo() {
        let keys = ShotKeys::default();
        assert_eq!(set_key(keys, Which::Pick, Some(keys.screen)), Err(SetKeyError::Duplicate));
        assert_eq!(set_key(keys, Which::Screen, Some(keys.pick)), Err(SetKeyError::Duplicate));
        assert_eq!(set_key(keys, Which::Screen, Some(keys.screen)), Ok(keys));
        assert_eq!(set_key(keys, Which::Screen, None), Err(SetKeyError::Invalid));
        let s = combo(0x01, CONTROL | SHIFT);
        assert_eq!(set_key(keys, Which::Screen, Some(s)), Ok(ShotKeys { screen: s, pick: keys.pick }));
        assert_eq!(set_key(keys, Which::Pick, Some(s)), Ok(ShotKeys { screen: keys.screen, pick: s }));
    }

    fn entry(enabled: bool, code: i64, flags: i64) -> serde_json::Value {
        json!({ "enabled": enabled, "value": { "parameters": [65535, code, flags] } })
    }

    const NS_CMD_SHIFT: i64 = 0x120000;

    #[test]
    fn mac_holds_screenshot_keys_and_their_defaults() {
        let keys = ShotKeys::default();
        let both = |e28, e30| json!({ "AppleSymbolicHotKeys": { "28": e28, "30": e30 } });
        let on = both(entry(true, 20, NS_CMD_SHIFT), entry(true, 21, NS_CMD_SHIFT));
        assert_eq!(mac_holds(&on, keys.screen), MacHold::Screenshot);
        assert_eq!(mac_holds(&on, keys.pick), MacHold::Screenshot);
        let off = both(entry(false, 20, NS_CMD_SHIFT), entry(true, 21, NS_CMD_SHIFT));
        assert_eq!(mac_holds(&off, keys.screen), MacHold::Free);
        assert_eq!(mac_holds(&off, keys.pick), MacHold::Screenshot);
        // Missing: the Mac's default, which is on.
        assert_eq!(mac_holds(&json!({}), keys.screen), MacHold::Screenshot);
        assert_eq!(mac_holds(&json!({"AppleSymbolicHotKeys":{"30":{"enabled":true}}}), keys.pick), MacHold::Screenshot);
        // Rebound to another key, or other modifiers: free.
        let moved = both(entry(true, 20, 0x100000), entry(true, 99, NS_CMD_SHIFT));
        assert_eq!(mac_holds(&moved, keys.screen), MacHold::Free);
        assert_eq!(mac_holds(&moved, keys.pick), MacHold::Free);
        // ⌘⇧5 (184) and ⌃⌘⇧3 (29) by default.
        assert_eq!(mac_holds(&json!({}), combo(23, CMD | SHIFT)), MacHold::Screenshot);
        let no5 = json!({"AppleSymbolicHotKeys":{"184": entry(false, 23, NS_CMD_SHIFT)}});
        assert_eq!(mac_holds(&no5, combo(23, CMD | SHIFT)), MacHold::Free);
        assert_eq!(mac_holds(&json!({}), combo(20, CONTROL | CMD | SHIFT)), MacHold::Screenshot);
    }

    #[test]
    fn mac_holds_other_enabled_shortcuts() {
        let spotlight = |on| json!({"AppleSymbolicHotKeys":{"64": entry(on, 49, 0x100000)}});
        assert_eq!(mac_holds(&spotlight(true), combo(49, CMD)), MacHold::Shortcut);
        assert_eq!(mac_holds(&spotlight(false), combo(49, CMD)), MacHold::Free);
        assert_eq!(mac_holds(&json!({}), combo(0x01, CONTROL | SHIFT)), MacHold::Free);
        // Another shortcut on the default ⌘⇧3 while 28 is off.
        let other = json!({"AppleSymbolicHotKeys":{"28": entry(false, 20, NS_CMD_SHIFT), "70": entry(true, 20, NS_CMD_SHIFT)}});
        assert_eq!(mac_holds(&other, ShotKeys::default().screen), MacHold::Shortcut);
    }
}
