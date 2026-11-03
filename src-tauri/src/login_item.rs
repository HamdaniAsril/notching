//! Open at login. macOS: SMAppService (13+), and macOS holds the state. Windows: a
//! value under HKCU\...\Run. Linux: an XDG autostart .desktop file. The settings
//! file never holds the state.

use std::path::Path;

use tauri::AppHandle;

use crate::settings_window::{emit_settings, LoginItem};

/// SMAppServiceStatus, as a plain enum. Off macOS only Enabled and NotRegistered occur.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ServiceStatus {
    NotRegistered,
    Enabled,
    RequiresApproval,
    NotFound,
}

/// Outside an app bundle (tauri dev) the main app service is not this app.
pub fn login_state(status: ServiceStatus, bundled: bool) -> LoginItem {
    if !bundled {
        return LoginItem::Unavailable;
    }
    match status {
        ServiceStatus::Enabled => LoginItem::On,
        ServiceStatus::RequiresApproval => LoginItem::NeedsApproval,
        ServiceStatus::NotRegistered | ServiceStatus::NotFound => LoginItem::Off,
    }
}

/// …/<Name>.app/Contents/MacOS/<exe>
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn is_bundled(exe: &Path) -> bool {
    let mut up = exe.ancestors().skip(1);
    let (Some(macos), Some(contents), Some(app)) = (up.next(), up.next(), up.next()) else { return false };
    macos.file_name().is_some_and(|n| n == "MacOS")
        && contents.file_name().is_some_and(|n| n == "Contents")
        && app.extension().is_some_and(|e| e == "app")
}

/// Pure helpers for the Windows and Linux backends. Compiled everywhere so their
/// tests run on every OS; each OS uses only its own half.
#[allow(dead_code)]
mod portable {
    use std::ffi::OsString;
    use std::path::{Path, PathBuf};

    pub const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    pub const RUN_VALUE: &str = "Notching";

    /// The quoted exe path stored in the Run value.
    pub fn run_data(exe: &Path) -> String {
        format!("\"{}\"", exe.display())
    }

    pub fn reg_add_args(exe: &Path) -> Vec<String> {
        ["add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d"]
            .into_iter()
            .map(String::from)
            .chain([run_data(exe), "/f".to_string()])
            .collect()
    }

    pub fn reg_delete_args() -> Vec<String> {
        ["delete", RUN_KEY, "/v", RUN_VALUE, "/f"].into_iter().map(String::from).collect()
    }

    pub fn reg_query_args() -> Vec<String> {
        ["query", RUN_KEY, "/v", RUN_VALUE].into_iter().map(String::from).collect()
    }

    /// True when `reg query` output holds a Notching value that launches `exe`.
    pub fn run_value_points_to(query_output: &str, exe: &Path) -> bool {
        let want = run_data(exe).to_lowercase();
        query_output
            .lines()
            .filter(|l| l.trim_start().starts_with(RUN_VALUE))
            .any(|l| l.to_lowercase().contains(&want))
    }

    /// What autostart launches: the AppImage file when running from one (the
    /// mounted current_exe vanishes on exit), else the current exe.
    pub fn exec_path(appimage: Option<OsString>, exe: PathBuf) -> PathBuf {
        match appimage {
            Some(a) if !a.is_empty() => PathBuf::from(a),
            _ => exe,
        }
    }

    /// An Exec= value: quoted and escaped when it has spaces or reserved characters.
    pub fn exec_line(path: &Path) -> String {
        let raw = path.to_string_lossy();
        let plain = !raw.chars().any(|c| " \t\n\"'\\><~|&;$*?#()`%".contains(c));
        if plain {
            return raw.into_owned();
        }
        let escaped = raw
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$")
            .replace('%', "%%");
        format!("\"{escaped}\"")
    }

    pub fn desktop_entry(exec: &Path) -> String {
        format!(
            "[Desktop Entry]\nType=Application\nName=Notching\nExec={}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
            exec_line(exec)
        )
    }

    /// True when the file text is an autostart entry that launches `exec`.
    pub fn desktop_entry_points_to(text: &str, exec: &Path) -> bool {
        let want = format!("Exec={}", exec_line(exec));
        text.lines().any(|l| l.trim() == want)
    }

    /// $XDG_CONFIG_HOME/autostart, else ~/.config/autostart. Relative XDG values are ignored per the spec.
    pub fn autostart_dir(xdg_config_home: Option<OsString>, home: Option<OsString>) -> Option<PathBuf> {
        let xdg = xdg_config_home.map(PathBuf::from).filter(|p| p.is_absolute());
        let base = xdg.or_else(|| home.filter(|h| !h.is_empty()).map(|h| PathBuf::from(h).join(".config")))?;
        Some(base.join("autostart"))
    }

    pub const DESKTOP_FILE: &str = "notching.desktop";
}

#[cfg(target_os = "macos")]
mod platform {
    use objc2_service_management::{SMAppService, SMAppServiceStatus};

    use super::{is_bundled, ServiceStatus};

    pub fn bundled() -> bool {
        std::env::current_exe().is_ok_and(|exe| is_bundled(&exe))
    }

    pub fn status() -> ServiceStatus {
        // SAFETY: plain ServiceManagement calls with no arguments.
        match unsafe { SMAppService::mainAppService().status() } {
            SMAppServiceStatus::Enabled => ServiceStatus::Enabled,
            SMAppServiceStatus::RequiresApproval => ServiceStatus::RequiresApproval,
            SMAppServiceStatus::NotFound => ServiceStatus::NotFound,
            _ => ServiceStatus::NotRegistered,
        }
    }

    /// Registers or unregisters this app as a login item, only when that changes something.
    pub fn set(on: bool) -> Result<(), String> {
        if !bundled() {
            return Err("open at login needs the installed Notching.app".into());
        }
        let now = status();
        // SAFETY: as above.
        let service = unsafe { SMAppService::mainAppService() };
        let result = if on && now != ServiceStatus::Enabled {
            unsafe { service.registerAndReturnError() }
        } else if !on && matches!(now, ServiceStatus::Enabled | ServiceStatus::RequiresApproval) {
            unsafe { service.unregisterAndReturnError() }
        } else {
            Ok(())
        };
        result.map_err(|e| e.localizedDescription().to_string())
    }

    /// System Settings → General → Login Items.
    pub fn open() {
        // SAFETY: as above.
        unsafe { SMAppService::openSystemSettingsLoginItems() };
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    use super::portable::*;
    use super::ServiceStatus;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// No bundle concept here: an installed or portable exe is always a valid target.
    pub fn bundled() -> bool {
        true
    }

    fn reg(args: &[String]) -> Result<std::process::Output, String> {
        Command::new("reg")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("could not run reg.exe: {e}"))
    }

    pub fn status() -> ServiceStatus {
        let Ok(exe) = std::env::current_exe() else { return ServiceStatus::NotRegistered };
        let Ok(out) = reg(&reg_query_args()) else { return ServiceStatus::NotRegistered };
        if out.status.success() && run_value_points_to(&String::from_utf8_lossy(&out.stdout), &exe) {
            ServiceStatus::Enabled
        } else {
            ServiceStatus::NotRegistered
        }
    }

    pub fn set(on: bool) -> Result<(), String> {
        let now = status() == ServiceStatus::Enabled;
        if on == now {
            return Ok(());
        }
        let args = if on {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            reg_add_args(&exe)
        } else {
            reg_delete_args()
        };
        let out = reg(&args)?;
        if out.status.success() {
            return Ok(());
        }
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }

    /// Settings → Apps → Startup.
    pub fn open() {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:startupapps"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use std::path::PathBuf;

    use super::portable::*;
    use super::ServiceStatus;

    /// No bundle concept here (AppImage, deb and dev builds all autostart the same way).
    pub fn bundled() -> bool {
        true
    }

    fn desktop_file() -> Option<PathBuf> {
        let dir = autostart_dir(std::env::var_os("XDG_CONFIG_HOME"), std::env::var_os("HOME"))?;
        Some(dir.join(DESKTOP_FILE))
    }

    fn exec() -> Result<PathBuf, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        Ok(exec_path(std::env::var_os("APPIMAGE"), exe))
    }

    pub fn status() -> ServiceStatus {
        let (Some(file), Ok(exec)) = (desktop_file(), exec()) else { return ServiceStatus::NotRegistered };
        match std::fs::read_to_string(file) {
            Ok(text) if desktop_entry_points_to(&text, &exec) => ServiceStatus::Enabled,
            _ => ServiceStatus::NotRegistered,
        }
    }

    pub fn set(on: bool) -> Result<(), String> {
        let file = desktop_file().ok_or("no home folder to put the autostart entry in")?;
        if !on {
            return match std::fs::remove_file(&file) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            };
        }
        if let Some(dir) = file.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&file, desktop_entry(&exec()?)).map_err(|e| e.to_string())
    }

    /// Desktops have no common login-items page and the switch here never needs
    /// approval, so there is nothing to open.
    pub fn open() {}
}

pub fn state() -> LoginItem {
    let bundled = platform::bundled();
    // Asking a dev build's main app service means nothing, so skip the call.
    if !bundled {
        return LoginItem::Unavailable;
    }
    login_state(platform::status(), bundled)
}

/// Registers or unregisters this app as a login item, only when that changes something.
pub fn set(on: bool) -> Result<(), String> {
    platform::set(on)
}

#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, on: bool) -> Result<(), String> {
    let result = set(on);
    emit_settings(&app);
    result
}

/// The OS page that lists login items (a no-op on Linux).
#[tauri::command]
pub fn open_login_items() {
    platform::open();
}

#[cfg(test)]
mod tests {
    use std::ffi::OsString;
    use std::path::PathBuf;

    use super::portable::*;
    use super::*;

    #[test]
    fn outside_an_app_bundle_it_is_unavailable() {
        assert_eq!(login_state(ServiceStatus::Enabled, false), LoginItem::Unavailable);
    }

    #[test]
    fn the_system_status_maps_to_the_switch() {
        assert_eq!(login_state(ServiceStatus::Enabled, true), LoginItem::On);
        assert_eq!(login_state(ServiceStatus::RequiresApproval, true), LoginItem::NeedsApproval);
        assert_eq!(login_state(ServiceStatus::NotRegistered, true), LoginItem::Off);
        assert_eq!(login_state(ServiceStatus::NotFound, true), LoginItem::Off);
    }

    #[test]
    fn knows_an_app_bundle_from_a_dev_build() {
        assert!(is_bundled(Path::new("/Applications/Notching.app/Contents/MacOS/notching")));
        assert!(!is_bundled(Path::new("/Users/x/dev/notch/src-tauri/target/debug/notching")));
    }

    #[test]
    fn reg_add_quotes_the_exe_path() {
        let args = reg_add_args(Path::new(r"C:\Program Files\Notching\notching.exe"));
        assert_eq!(args[0], "add");
        assert_eq!(args[1], RUN_KEY);
        assert_eq!(&args[2..4], ["/v", "Notching"]);
        assert_eq!(&args[4..7], ["/t", "REG_SZ", "/d"]);
        assert_eq!(args[7], r#""C:\Program Files\Notching\notching.exe""#);
        assert_eq!(args[8], "/f");
    }

    #[test]
    fn reg_delete_and_query_target_the_notching_value() {
        assert_eq!(reg_delete_args(), ["delete", RUN_KEY, "/v", "Notching", "/f"]);
        assert_eq!(reg_query_args(), ["query", RUN_KEY, "/v", "Notching"]);
    }

    #[test]
    fn a_run_value_must_point_at_this_exe() {
        let exe = Path::new(r"C:\Apps\Notching\notching.exe");
        let out = format!("\r\n{RUN_KEY}\r\n    Notching    REG_SZ    \"C:\\apps\\notching\\notching.exe\"\r\n\r\n");
        assert!(run_value_points_to(&out, exe));
        let other = out.replace("notching.exe", "other.exe");
        assert!(!run_value_points_to(&other, exe));
        assert!(!run_value_points_to("", exe));
    }

    #[test]
    fn autostart_launches_the_appimage_when_there_is_one() {
        let exe = PathBuf::from("/tmp/.mount_abc/usr/bin/notching");
        assert_eq!(exec_path(Some(OsString::from("/home/u/Notching.AppImage")), exe.clone()), PathBuf::from("/home/u/Notching.AppImage"));
        assert_eq!(exec_path(Some(OsString::new()), exe.clone()), exe);
        assert_eq!(exec_path(None, exe.clone()), exe);
    }

    #[test]
    fn the_desktop_entry_has_the_standard_keys() {
        let text = desktop_entry(Path::new("/usr/bin/notching"));
        for line in ["[Desktop Entry]", "Type=Application", "Name=Notching", "Exec=/usr/bin/notching", "X-GNOME-Autostart-enabled=true"] {
            assert!(text.lines().any(|l| l == line), "missing {line}");
        }
        assert!(desktop_entry_points_to(&text, Path::new("/usr/bin/notching")));
        assert!(!desktop_entry_points_to(&text, Path::new("/opt/other")));
    }

    #[test]
    fn exec_quotes_paths_with_spaces() {
        assert_eq!(exec_line(Path::new("/opt/My Apps/notching")), "\"/opt/My Apps/notching\"");
        let text = desktop_entry(Path::new("/opt/My Apps/notching"));
        assert!(desktop_entry_points_to(&text, Path::new("/opt/My Apps/notching")));
    }

    #[test]
    #[cfg(unix)]
    fn the_autostart_dir_follows_xdg_then_home() {
        let os = |s: &str| Some(OsString::from(s));
        assert_eq!(autostart_dir(os("/x/cfg"), os("/home/u")), Some(PathBuf::from("/x/cfg/autostart")));
        assert_eq!(autostart_dir(None, os("/home/u")), Some(PathBuf::from("/home/u/.config/autostart")));
        assert_eq!(autostart_dir(os(""), os("/home/u")), Some(PathBuf::from("/home/u/.config/autostart")));
        assert_eq!(autostart_dir(os("rel"), os("/home/u")), Some(PathBuf::from("/home/u/.config/autostart")));
        assert_eq!(autostart_dir(None, None), None);
    }
}
