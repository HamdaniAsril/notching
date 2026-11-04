//! Updates from the GitHub releases (owner, 4 Nov): which release is newer,
//! which file of it to take, and when to ask again. Free of AppKit and network.

use serde::Deserialize;

/// Where the latest published release is asked for. Drafts and pre-releases
/// are never "latest".
pub const LATEST_URL: &str = "https://api.github.com/repos/HamdaniAsril/notching/releases/latest";
/// Every link taken from the answer must start with one of these.
const RELEASE_PAGE: &str = "https://github.com/HamdaniAsril/notching/releases/tag/";
const DOWNLOAD: &str = "https://github.com/HamdaniAsril/notching/releases/download/";
/// Once a day while the switch is on.
pub const CHECK_EVERY_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Deserialize)]
struct ReleaseJson {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<Asset>,
}

/// A published release, as much of it as an update needs.
#[derive(Clone, Debug, PartialEq)]
pub struct Release {
    pub version: String,
    pub page: String,
    pub dmg: String,
    pub size: u64,
}

/// "v0.1.3" or "0.1.3" as numbers; anything else is None.
pub fn parse_version(s: &str) -> Option<(u64, u64, u64)> {
    let mut parts = s.strip_prefix('v').unwrap_or(s).split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let v = (next()?, next()?, next()?);
    parts.next().is_none().then_some(v)
}

/// The latest version is newer than the running one.
pub fn newer(latest: &str, current: &str) -> bool {
    matches!((parse_version(latest), parse_version(current)), (Some(l), Some(c)) if l > c)
}

/// The release in GitHub's answer, with its Apple Silicon DMG. None when the
/// answer is not a published release of Notching or lacks the DMG, or a link
/// points anywhere but this repository's releases.
pub fn parse_release(json: &str) -> Option<Release> {
    let r: ReleaseJson = serde_json::from_str(json).ok()?;
    if r.draft || r.prerelease || !r.html_url.starts_with(RELEASE_PAGE) {
        return None;
    }
    let (major, minor, patch) = parse_version(&r.tag_name)?;
    let version = format!("{major}.{minor}.{patch}");
    let want = format!("Notching_{version}_aarch64.dmg");
    let asset = r.assets.into_iter().find(|a| a.name == want)?;
    if !asset.browser_download_url.starts_with(DOWNLOAD) {
        return None;
    }
    Some(Release { version, page: r.html_url, dmg: asset.browser_download_url, size: asset.size })
}

/// Time for the daily check: never checked, a day gone, or a clock set back.
pub fn due(last: Option<i64>, now: i64) -> bool {
    last.is_none_or(|t| now - t >= CHECK_EVERY_MS || now < t)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LATEST: &str = r#"{"tag_name":"v0.1.3","html_url":"https://github.com/HamdaniAsril/notching/releases/tag/v0.1.3",
      "draft":false,"prerelease":false,"assets":[
        {"name":"Notching_0.1.3_aarch64.app.tar.gz","browser_download_url":"https://github.com/HamdaniAsril/notching/releases/download/v0.1.3/Notching_0.1.3_aarch64.app.tar.gz","size":6430161},
        {"name":"Notching_0.1.3_aarch64.dmg","browser_download_url":"https://github.com/HamdaniAsril/notching/releases/download/v0.1.3/Notching_0.1.3_aarch64.dmg","size":6551363}]}"#;

    #[test]
    fn versions_compare_as_numbers() {
        assert_eq!(parse_version("v0.1.12"), Some((0, 1, 12)));
        assert_eq!(parse_version("1.2.3"), Some((1, 2, 3)));
        assert_eq!(parse_version("v1.2"), None);
        assert_eq!(parse_version("v1.2.3.4"), None);
        assert_eq!(parse_version("v1.2.x"), None);
        assert!(newer("v0.1.10", "0.1.9"));
        assert!(newer("0.2.0", "0.1.9"));
        assert!(!newer("v0.1.2", "0.1.2"));
        assert!(!newer("v0.1.1", "0.1.2"));
        assert!(!newer("nonsense", "0.1.2"));
    }

    #[test]
    fn the_release_brings_its_dmg() {
        assert_eq!(
            parse_release(LATEST),
            Some(Release {
                version: "0.1.3".into(),
                page: "https://github.com/HamdaniAsril/notching/releases/tag/v0.1.3".into(),
                dmg: "https://github.com/HamdaniAsril/notching/releases/download/v0.1.3/Notching_0.1.3_aarch64.dmg".into(),
                size: 6551363,
            })
        );
    }

    #[test]
    fn anything_but_a_published_notching_release_is_refused() {
        assert_eq!(parse_release(&LATEST.replace(r#""draft":false"#, r#""draft":true"#)), None);
        assert_eq!(parse_release(&LATEST.replace(r#""prerelease":false"#, r#""prerelease":true"#)), None);
        // The DMG named for another version, or none.
        assert_eq!(parse_release(&LATEST.replace("Notching_0.1.3_aarch64.dmg\"", "Notching_0.1.2_aarch64.dmg\"")), None);
        // Links outside this repository's releases.
        assert_eq!(parse_release(&LATEST.replace("https://github.com/HamdaniAsril/notching/releases/download/v0.1.3/Notching_0.1.3_aarch64.dmg", "https://example.com/Notching_0.1.3_aarch64.dmg")), None);
        assert_eq!(parse_release(&LATEST.replace("https://github.com/HamdaniAsril/notching/releases/tag/", "https://github.com/someone/notching/releases/tag/")), None);
        assert_eq!(parse_release("{}"), None);
        assert_eq!(parse_release("not json"), None);
    }

    #[test]
    fn the_check_is_daily() {
        let day = CHECK_EVERY_MS;
        assert!(due(None, 1_000));
        assert!(!due(Some(1_000), 1_000 + day - 1));
        assert!(due(Some(1_000), 1_000 + day));
        // A clock set back does not wait a day more.
        assert!(due(Some(5 * day), day));
    }
}
