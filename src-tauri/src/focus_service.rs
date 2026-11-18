//! Fokus jendela's native side (design 18 Nov): the blur layer, its keys, and
//! following the window in use. Filled in by Task 8 of the plan.

use tauri::AppHandle;

pub const MODULE_ID: &str = "window-focus";

/// Brings the blur in line with the tool and its settings.
pub fn sync(_app: &AppHandle) {}
