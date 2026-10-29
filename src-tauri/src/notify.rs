//! Notifications from Notching's own modules (spec 4.4): the Notifikasi page's
//! switches, delivery to the screen under the cursor, and the missed-notice dots.

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSScreen, NSSound};
use objc2_core_graphics::{
    kCGNullWindowID, CGEventSource, CGEventSourceStateID, CGEventType, CGWindowListCopyWindowInfo, CGWindowListOption,
};
use objc2_foundation::{NSArray, NSDictionary, NSNumber, NSString};
use tauri::{AppHandle, Emitter, EventTarget, Manager, State};

use crate::app_core::CoreState;
use crate::geometry::{screen_under, to_cg, Rect};
use crate::module_commands::{change, MODULE_STATE_EVENT};
use crate::overlay::Overlays;
use crate::settings::ChannelPref;

/// Sent to the overlay on the screen under the cursor.
pub const NOTICE_EVENT: &str = "notching://notice";
/// Away this long, a notice also leaves a missed dot (spec 4.4).
pub const IDLE_SECS: f64 = 120.0;
pub const SOUND: &str = "Glass";
pub const TITLE_MAX: usize = 60;
pub const DETAIL_MAX: usize = 40;

/// Same shape as Notice in src/notch/notices.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoticeDto {
    /// None for the sample from the settings window.
    pub module_id: Option<String>,
    pub title: String,
    pub detail: String,
    pub glow: bool,
    pub seconds: f64,
}

/// One line, at most `max` characters, cut with "…".
pub fn clip(text: &str, max: usize) -> String {
    let line = text.replace(['\n', '\r', '\t'], " ");
    let line = line.trim();
    if line.chars().count() <= max {
        return line.to_string();
    }
    let cut: String = line.chars().take(max - 1).collect();
    format!("{}…", cut.trim_end())
}

/// An on-screen window, in CoreGraphics coordinates (origin top-left).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowBox {
    pub pid: i32,
    pub layer: i64,
    pub bounds: Rect,
}

/// Another app's normal window fills the screen: a full-screen app or video.
pub fn covers_screen(windows: &[WindowBox], screen_cg: Rect, own_pid: i32) -> bool {
    let near = |a: f64, b: f64| (a - b).abs() <= 1.0;
    windows.iter().any(|w| {
        w.layer == 0
            && w.pid != own_pid
            && near(w.bounds.x, screen_cg.x)
            && near(w.bounds.y, screen_cg.y)
            && near(w.bounds.max_x(), screen_cg.max_x())
            && near(w.bounds.max_y(), screen_cg.max_y())
    })
}

#[tauri::command]
pub fn set_notice_glow(app: AppHandle, core: State<CoreState>, on: bool) -> Result<(), String> {
    change(&app, &core, |c| c.set_glow(on))
}

#[tauri::command]
pub fn set_notice_seconds(app: AppHandle, core: State<CoreState>, seconds: f64) -> Result<(), String> {
    change(&app, &core, |c| c.set_notice_seconds(seconds))
}

#[tauri::command]
pub fn set_channel(
    app: AppHandle,
    core: State<CoreState>,
    module: String,
    channel: String,
    on: bool,
    sound: bool,
) -> Result<(), String> {
    change(&app, &core, |c| c.set_channel(&module, &channel, ChannelPref { on, sound }))
}

/// The person looked: the dots go. Broadcasts only if there were any.
#[tauri::command]
pub fn clear_missed(app: AppHandle, core: State<CoreState>) {
    let state = {
        let mut core = core.0.lock().unwrap();
        if !core.clear_missed() {
            return;
        }
        core.state()
    };
    let _ = app.emit(MODULE_STATE_EVENT, state);
}

/// A module's notice on one of its channels. Callable from any thread; a channel
/// the person switched off is dropped quietly.
pub fn post(app: &AppHandle, module_id: &str, channel: &str, title: &str, detail: &str) -> Result<(), String> {
    let (pref, look) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        let pref = core.channel(module_id, channel).ok_or("unknown or switched-off channel")?;
        (pref, core.notice_look())
    };
    if !pref.on {
        return Ok(());
    }
    let dto = NoticeDto {
        module_id: Some(module_id.to_string()),
        title: clip(title, TITLE_MAX),
        detail: clip(detail, DETAIL_MAX),
        glow: look.glow,
        seconds: look.seconds,
    };
    deliver(app, dto, pref.sound);
    Ok(())
}

/// "Kirim contoh" on the Notifikasi page: always with sound, never a missed dot,
/// whatever the channels say.
#[tauri::command]
pub fn send_sample_notice(app: AppHandle, title: String, detail: String) {
    let look = app.state::<CoreState>().0.lock().unwrap().notice_look();
    let dto = NoticeDto {
        module_id: None,
        title: clip(&title, TITLE_MAX),
        detail: clip(&detail, DETAIL_MAX),
        glow: look.glow,
        seconds: look.seconds,
    };
    deliver(&app, dto, true);
}

fn deliver(app: &AppHandle, dto: NoticeDto, sound: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let mut screens: Vec<(String, Rect)> = handle
            .state::<Overlays>()
            .0
            .lock()
            .unwrap()
            .iter()
            .map(|(label, e)| (label.clone(), e.screen.frame))
            .collect();
        screens.sort_by(|a, b| a.0.cmp(&b.0));
        let p = NSEvent::mouseLocation();
        let Some(label) = screen_under(&screens, p.x, p.y) else { return };
        if let Some(module) = &dto.module_id {
            let frame = screens.iter().find(|(l, _)| *l == label).map(|(_, f)| *f).unwrap();
            let primary = NSScreen::screens(mtm).firstObject().map_or(frame.h, |s| s.frame().size.height);
            let fullscreen = covers_screen(&window_list(), to_cg(frame, primary), std::process::id() as i32);
            if idle_seconds() >= IDLE_SECS || fullscreen {
                let state = {
                    let core = handle.state::<CoreState>();
                    let mut core = core.0.lock().unwrap();
                    core.mark_missed(module);
                    core.state()
                };
                let _ = handle.emit(MODULE_STATE_EVENT, state);
            }
        }
        if sound {
            play_sound();
        }
        let _ = handle.emit_to(EventTarget::webview_window(&label), NOTICE_EVENT, dto);
    });
}

// Seconds since the last key press, click or mouse move anywhere. Needs no permission.
fn idle_seconds() -> f64 {
    // kCGAnyInputEventType
    CGEventSource::seconds_since_last_event_type(CGEventSourceStateID::CombinedSessionState, CGEventType(u32::MAX))
}

// The on-screen windows of every app: owner, layer and bounds only, which need no
// Screen Recording permission.
fn window_list() -> Vec<WindowBox> {
    let options = CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;
    let Some(cf) = CGWindowListCopyWindowInfo(options, kCGNullWindowID) else { return Vec::new() };
    // A CFArray of CFDictionary is toll-free bridged to NSArray of NSDictionary;
    // `cf` keeps it alive while `list` is in use.
    let list: &NSArray<NSDictionary> = unsafe { &*(&*cf as *const _ as *const NSArray<NSDictionary>) };
    let key = NSString::from_str;
    let (pid, layer, bounds) = (key("kCGWindowOwnerPID"), key("kCGWindowLayer"), key("kCGWindowBounds"));
    let (x, y, w, h) = (key("X"), key("Y"), key("Width"), key("Height"));
    let num = |d: &NSDictionary, k: &NSString| {
        d.objectForKey(k).and_then(|o| o.downcast::<NSNumber>().ok()).map(|n| n.doubleValue())
    };
    (0..list.count())
        .filter_map(|i| {
            let d = list.objectAtIndex(i);
            let b = d.objectForKey(&bounds)?.downcast::<NSDictionary>().ok()?;
            Some(WindowBox {
                pid: num(&d, &pid)? as i32,
                layer: num(&d, &layer)? as i64,
                bounds: Rect { x: num(&b, &x)?, y: num(&b, &y)?, w: num(&b, &w)?, h: num(&b, &h)? },
            })
        })
        .collect()
}

fn play_sound() {
    if let Some(sound) = NSSound::soundNamed(&NSString::from_str(SOUND)) {
        sound.play();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn long_text_is_cut_with_an_ellipsis() {
        assert_eq!(clip(" Kirim invoice\nke klien ", 60), "Kirim invoice ke klien");
        let c = clip(&"é".repeat(70), 60);
        assert_eq!(c.chars().count(), 60);
        assert!(c.ends_with('…'));
        assert_eq!(clip("abc", 3), "abc");
    }

    #[test]
    fn a_full_screen_app_covers_the_screen() {
        let screen = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };
        let win = |pid, layer, bounds| [WindowBox { pid, layer, bounds }];
        assert!(covers_screen(&win(9, 0, screen), screen, 1));
        assert!(!covers_screen(&win(1, 0, screen), screen, 1));
        assert!(!covers_screen(&win(9, 25, screen), screen, 1));
        assert!(!covers_screen(&win(9, 0, Rect { h: 900.0, ..screen }), screen, 1));
        assert!(covers_screen(&win(9, 0, Rect { x: 0.5, w: 1469.5, ..screen }), screen, 1));
    }
}
