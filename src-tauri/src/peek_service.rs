//! Intip jendela's native side (design 5 Nov): the peek panels, their commands,
//! and keeping the Dock watch and the Dock click tap in line with the tool, its
//! settings and the Accessibility permission. Filled in by Task 11 of plan 1.

use tauri::AppHandle;

/// Brings the Dock watch and the click tap in line with the tool and its settings.
pub fn sync(_app: &AppHandle) {}

/// Hides the peek panels.
pub fn hide() {}
