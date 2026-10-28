//! Open at login, through SMAppService (macOS 13+). macOS holds the state; the
//! settings file does not.

use std::path::Path;

use objc2_service_management::{SMAppService, SMAppServiceStatus};
use tauri::AppHandle;

use crate::settings_window::{emit_settings, LoginItem};

/// SMAppServiceStatus, as a plain enum.
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
pub fn is_bundled(exe: &Path) -> bool {
    let mut up = exe.ancestors().skip(1);
    let (Some(macos), Some(contents), Some(app)) = (up.next(), up.next(), up.next()) else { return false };
    macos.file_name().is_some_and(|n| n == "MacOS")
        && contents.file_name().is_some_and(|n| n == "Contents")
        && app.extension().is_some_and(|e| e == "app")
}

fn bundled() -> bool {
    std::env::current_exe().is_ok_and(|exe| is_bundled(&exe))
}

fn status() -> ServiceStatus {
    // SAFETY: plain ServiceManagement calls with no arguments.
    match unsafe { SMAppService::mainAppService().status() } {
        SMAppServiceStatus::Enabled => ServiceStatus::Enabled,
        SMAppServiceStatus::RequiresApproval => ServiceStatus::RequiresApproval,
        SMAppServiceStatus::NotFound => ServiceStatus::NotFound,
        _ => ServiceStatus::NotRegistered,
    }
}

pub fn state() -> LoginItem {
    let bundled = bundled();
    // Asking a dev build's main app service means nothing, so skip the call.
    if !bundled {
        return LoginItem::Unavailable;
    }
    login_state(status(), bundled)
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

#[tauri::command]
pub fn set_launch_at_login(app: AppHandle, on: bool) -> Result<(), String> {
    let result = set(on);
    emit_settings(&app);
    result
}

/// System Settings → General → Login Items.
#[tauri::command]
pub fn open_login_items() {
    // SAFETY: as above.
    unsafe { SMAppService::openSystemSettingsLoginItems() };
}

#[cfg(test)]
mod tests {
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
}
