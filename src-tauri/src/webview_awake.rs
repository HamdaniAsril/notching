//! Keeps the page of every Notching window awake while the window is out of sight.
//!
//! By default WebKit suspends a page's WebContent process a few minutes after its
//! window was last seen (hidden panels, a minimized Settings window). Waking such a
//! page for a moment, as a core event or the display waking does, can catch WebKit
//! halfway back to sleep: the app side then waits for a picture the page never
//! sends, and WebKit's display link fires 60 times a second until that window is
//! seen again. That was the 0.2–0.6 % CPU at rest found on 7 Nov 2026
//! (verification note 2026-11-07-kaca-sendiri, "CPU saat diam"). Notching's pages
//! do nothing while out of sight, so they are left awake instead (macOS 14 and
//! later; macOS 13 keeps WebKit's default).
//!
//! The policy has to be in the configuration the web view is built with: set once
//! the page has started loading, WebKit still suspends it (probe, 7 Nov).

use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_web_kit::{WKInactiveSchedulingPolicy, WKWebViewConfiguration};
use tauri::{AppHandle, Manager, Runtime, WebviewWindowBuilder};

/// A configuration made on the main thread, carried to a builder on any thread.
pub struct Awake(Retained<WKWebViewConfiguration>);

// SAFETY: the configuration is made on the main thread and only handed to Tauri,
// which builds the web view with it on the main thread. Nothing reads it between.
unsafe impl Send for Awake {}

fn make(mtm: MainThreadMarker) -> Awake {
    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    // SAFETY: a fresh configuration's own preferences, on the main thread.
    unsafe { config.preferences().setInactiveSchedulingPolicy(WKInactiveSchedulingPolicy::None) };
    Awake(config)
}

/// The configuration for the window `label`, or None on macOS 13 (WebKit's own).
/// Off the main thread it waits for the main thread to make it.
pub fn configuration<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<Awake> {
    if !objc2::available!(macos = 14.0) {
        return None;
    }
    let awake = match MainThreadMarker::new() {
        Some(mtm) => make(mtm),
        None => {
            let (tx, rx) = std::sync::mpsc::channel();
            app.run_on_main_thread(move || {
                if let Some(mtm) = MainThreadMarker::new() {
                    let _ = tx.send(make(mtm));
                }
            })
            .ok()?;
            rx.recv().ok()?
        }
    };
    eprintln!("notching: page {label} stays awake out of sight");
    Some(awake)
}

/// `builder` with the configuration, when there is one.
pub fn apply<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    awake: Option<Awake>,
) -> WebviewWindowBuilder<'a, R, M> {
    match awake {
        Some(Awake(config)) => builder.with_webview_configuration(config),
        None => builder,
    }
}
