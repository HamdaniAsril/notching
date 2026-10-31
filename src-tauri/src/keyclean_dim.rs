//! Keyboard Cleaning Mode's dim layer: one panel per screen showing clean.html,
//! 90 % black, catching clicks, never key (main thread only). Like the notch
//! panels, these are never closed, only hidden (see overlay.rs).

use objc2::MainThreadMarker;
use objc2_foundation::{NSPoint, NSRect, NSSize};
use tauri::{AppHandle, LogicalSize, Size, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use crate::screens::current_screens;

/// Above the menu bar and the status items (25); the notch panels go one higher
/// while the mode is on (overlay::set_raised).
pub const DIM_LEVEL: i64 = 26;

mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(DimPanel {
            config: {
                can_become_key_window: false,
                is_floating_panel: true
            }
        })
    }
}
use panel::DimPanel;

fn label(index: usize) -> String {
    format!("clean-{index}")
}

/// Covers every screen; a panel for a screen seen before is reused.
pub fn show(app: &AppHandle) {
    let Some(mtm) = MainThreadMarker::new() else { return };
    for screen in current_screens(mtm) {
        let label = label(screen.index);
        let panel = match app.get_webview_panel(&label) {
            Ok(p) => p,
            Err(_) => match create(app, &label) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("notching: dim layer {label} failed: {e}");
                    continue;
                }
            },
        };
        let f = screen.frame;
        panel.as_panel().setFrame_display(NSRect::new(NSPoint::new(f.x, f.y), NSSize::new(f.w, f.h)), true);
        panel.set_ignores_mouse_events(false);
        panel.order_front_regardless();
    }
}

/// Hides every dim panel there is, for screens gone too.
pub fn hide(app: &AppHandle) {
    for index in 0..16 {
        if let Ok(panel) = app.get_webview_panel(&label(index)) {
            panel.hide();
        }
    }
}

fn create(app: &AppHandle, label: &str) -> tauri::Result<std::sync::Arc<dyn tauri_nspanel::Panel>> {
    let panel = PanelBuilder::<_, DimPanel>::new(app, label)
        .url(WebviewUrl::App("clean.html".into()))
        .size(Size::Logical(LogicalSize::new(800.0, 600.0)))
        .level(PanelLevel::Custom(DIM_LEVEL as i32))
        .collection_behavior(
            CollectionBehavior::new().can_join_all_spaces().stationary().ignores_cycle().full_screen_auxiliary(),
        )
        .style_mask(StyleMask::empty().borderless().nonactivating_panel())
        .transparent(true)
        .has_shadow(false)
        .no_activate(true)
        .hides_on_deactivate(false)
        .with_window(|w| w.transparent(true).decorations(false).visible(false).focused(false).skip_taskbar(true))
        .build()?;
    Ok(panel)
}
