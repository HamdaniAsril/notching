//! Which language the UI speaks.

use crate::settings::LanguageSetting;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Id,
    En,
}

/// `Auto` follows the device: Indonesian ("id", or the legacy "in") gets Id,
/// anything else, or no locale at all, gets En.
pub fn resolve_lang(setting: LanguageSetting, device: Option<&str>) -> Lang {
    match setting {
        LanguageSetting::Id => Lang::Id,
        LanguageSetting::En => Lang::En,
        LanguageSetting::Auto => {
            let code = device.and_then(|d| d.split(['-', '_']).next()).unwrap_or("");
            if code.eq_ignore_ascii_case("id") || code.eq_ignore_ascii_case("in") {
                Lang::Id
            } else {
                Lang::En
            }
        }
    }
}

pub fn device_locale() -> Option<String> {
    sys_locale::get_locale()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_follows_the_device() {
        use LanguageSetting::Auto;
        assert_eq!(resolve_lang(Auto, Some("id-ID")), Lang::Id);
        assert_eq!(resolve_lang(Auto, Some("id")), Lang::Id);
        assert_eq!(resolve_lang(Auto, Some("in_ID")), Lang::Id);
        assert_eq!(resolve_lang(Auto, Some("en-ID")), Lang::En);
        assert_eq!(resolve_lang(Auto, Some("ida")), Lang::En);
        assert_eq!(resolve_lang(Auto, None), Lang::En);
    }

    #[test]
    fn an_explicit_choice_wins() {
        assert_eq!(resolve_lang(LanguageSetting::Id, Some("en-US")), Lang::Id);
        assert_eq!(resolve_lang(LanguageSetting::En, Some("id-ID")), Lang::En);
    }
}
