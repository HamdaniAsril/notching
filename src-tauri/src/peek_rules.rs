//! Intip jendela's rules (design 5 Nov), with no AppKit: its settings, the order
//! of an app's windows, what a Dock click does, where the peek panel sits, and
//! the pictures kept in memory.

/// What a click on an app's Dock icon does (design §2.2).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DockClick {
    /// Left to macOS.
    Mac,
    /// Minimize every window of the app in front, else bring them all back.
    #[default]
    #[serde(other)]
    Toggle,
}

/// The cards' colour: the Mac's light or dark, or always one of them.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardColor {
    Light,
    Dark,
    #[default]
    #[serde(other)]
    System,
}

/// Solid cards, or Liquid glass that shows what is behind them, blurred.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Material {
    Glass,
    #[default]
    #[serde(other)]
    Solid,
}

/// Intip jendela's settings on Pintasan (design §4). A missing field takes its
/// default, an unknown choice too.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PeekSettings {
    /// Peek from the Dock.
    pub dock: bool,
    pub dock_click: DockClick,
    pub card: CardColor,
    pub material: Material,
    /// Minimized windows shown too, marked.
    pub minimized: bool,
}

impl Default for PeekSettings {
    fn default() -> Self {
        PeekSettings { dock: true, dock_click: DockClick::Toggle, card: CardColor::System, material: Material::Solid, minimized: true }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peek_settings_default_and_survive_bad_fields() {
        let p: PeekSettings = serde_json::from_str(r#"{"dock":false,"dockClick":"nonsense","card":"light"}"#).unwrap();
        assert_eq!(p, PeekSettings { dock: false, dock_click: DockClick::Toggle, card: CardColor::Light, ..PeekSettings::default() });
        assert_eq!(
            serde_json::to_value(PeekSettings::default()).unwrap(),
            serde_json::json!({"dock":true,"dockClick":"toggle","card":"system","material":"solid","minimized":true})
        );
    }
}
