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
    /// The channel it came on; its widget decides which page a click opens.
    pub channel: Option<String>,
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
/// `top_inset` is the screen's notch strip (0 without a notch): there a
/// full-screen window starts under the strip, like a maximised one, so it counts
/// only in a Space without the Dock's desktop window (layer 20), which full-screen
/// Spaces lack.
pub fn covers_screen(windows: &[WindowBox], screen_cg: Rect, top_inset: f64, own_pid: i32) -> bool {
    let near = |a: f64, b: f64, by: f64| (a - b).abs() <= by;
    let spans = |b: &Rect| {
        near(b.x, screen_cg.x, 1.0) && near(b.max_x(), screen_cg.max_x(), 1.0) && near(b.max_y(), screen_cg.max_y(), 1.0)
    };
    let desktop = windows.iter().any(|w| w.layer == 20 && spans(&w.bounds) && near(w.bounds.y, screen_cg.y, 1.0));
    windows.iter().any(|w| {
        let top = w.bounds.y - screen_cg.y;
        w.layer == 0
            && w.pid != own_pid
            && spans(&w.bounds)
            && (near(top, 0.0, 1.0) || (top_inset > 0.0 && !desktop && near(top, top_inset, 2.0)))
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
    change(&app, &core, |c| c.set_channel(&module, &channel, ChannelPref { on, sound }))?;
    crate::home::schedule::poke(&app);
    Ok(())
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
        channel: Some(channel.to_string()),
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
        channel: None,
        title: clip(&title, TITLE_MAX),
        detail: clip(&detail, DETAIL_MAX),
        glow: look.glow,
        seconds: look.seconds,
    };
    deliver(&app, dto, true);
}

// Each overlay window: its label, its screen's frame and the notch's height there.
fn overlays(app: &AppHandle) -> Vec<(String, Rect, f64)> {
    app.state::<Overlays>()
        .0
        .lock()
        .unwrap()
        .iter()
        .map(|(label, e)| (label.clone(), e.screen.frame, e.screen.notch.map_or(0.0, |n| n.height)))
        .collect()
}

fn under_cursor(overlays: &[(String, Rect, f64)]) -> (Vec<(String, Rect)>, Option<String>) {
    let mut screens: Vec<(String, Rect)> = overlays.iter().map(|(l, f, _)| (l.clone(), *f)).collect();
    screens.sort_by(|a, b| a.0.cmp(&b.0));
    let p = NSEvent::mouseLocation();
    let label = screen_under(&screens, p.x, p.y);
    (screens, label)
}

/// The overlay window of the screen under the cursor. Call on the main thread.
pub fn cursor_screen(app: &AppHandle) -> Option<String> {
    under_cursor(&overlays(app)).1
}

fn deliver(app: &AppHandle, dto: NoticeDto, sound: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let overlays = overlays(&handle);
        let (screens, label) = under_cursor(&overlays);
        let Some(label) = label else { return };
        if let (Some(module), Some(channel)) = (&dto.module_id, &dto.channel) {
            let frame = screens.iter().find(|(l, _)| *l == label).map(|(_, f)| *f).unwrap();
            let primary = NSScreen::screens(mtm).firstObject().map_or(frame.h, |s| s.frame().size.height);
            let inset = overlays.iter().find(|(l, _, _)| *l == label).map_or(0.0, |(_, _, i)| *i);
            let fullscreen = covers_screen(&window_list(), to_cg(frame, primary), inset, std::process::id() as i32);
            if idle_seconds() >= IDLE_SECS || fullscreen {
                let state = {
                    let core = handle.state::<CoreState>();
                    let mut core = core.0.lock().unwrap();
                    core.mark_missed(module, channel);
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
        assert!(covers_screen(&win(9, 0, screen), screen, 0.0, 1));
        assert!(!covers_screen(&win(1, 0, screen), screen, 0.0, 1));
        assert!(!covers_screen(&win(9, 25, screen), screen, 0.0, 1));
        assert!(!covers_screen(&win(9, 0, Rect { h: 900.0, ..screen }), screen, 0.0, 1));
        assert!(covers_screen(&win(9, 0, Rect { x: 0.5, w: 1469.5, ..screen }), screen, 0.0, 1));
    }

    // Seen on a MacBook Air M4 (29 Oct 2026): a full-screen Arc window starts under
    // the notch strip, at y 33 with a 32 pt safe area, and its Space has no Dock
    // desktop window (layer 20). A maximised window in a normal Space has the same
    // bounds, but the Dock's desktop window is there.
    #[test]
    fn a_full_screen_app_under_the_notch_strip_counts() {
        let screen = Rect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };
        let app = WindowBox { pid: 9, layer: 0, bounds: Rect { x: 0.0, y: 33.0, w: 1470.0, h: 923.0 } };
        let desktop = WindowBox { pid: 7, layer: 20, bounds: screen };
        assert!(covers_screen(&[app], screen, 32.0, 1));
        assert!(!covers_screen(&[app, desktop], screen, 32.0, 1));
        assert!(!covers_screen(&[app], screen, 0.0, 1));
        let short = WindowBox { bounds: Rect { h: 859.0, ..app.bounds }, ..app };
        assert!(!covers_screen(&[short], screen, 32.0, 1));
    }
}
