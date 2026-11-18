//! Fokus jendela (design 18 Nov): its setting, which windows stay clear, and
//! which window a peek shows. Free of AppKit so it can be unit tested.

/// How dark the blur gets (design §6): a thin black layer over it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Dim {
    None,
    Much,
    /// Last, so serde can take any unknown choice as this one.
    #[default]
    #[serde(other)]
    Little,
}

impl Dim {
    /// The black layer's opacity.
    pub fn alpha(self) -> f64 {
        match self {
            Dim::None => 0.0,
            Dim::Little => 0.15,
            Dim::Much => 0.35,
        }
    }
}

/// Fokus jendela's settings. A missing field takes its default, an unknown choice too.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FocusSettings {
    pub dim: Dim,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn focus_settings_default_and_survive_bad_fields() {
        let f: FocusSettings = serde_json::from_str(r#"{"dim":"nonsense"}"#).unwrap();
        assert_eq!(f, FocusSettings::default());
        assert_eq!(serde_json::to_value(FocusSettings::default()).unwrap(), serde_json::json!({"dim":"little"}));
        assert_eq!([Dim::None.alpha(), Dim::Little.alpha(), Dim::Much.alpha()], [0.0, 0.15, 0.35]);
    }
}
