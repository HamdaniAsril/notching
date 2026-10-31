//! Commands for the pages in the pill (design 30 Oct, §3): adding, changing,
//! deleting and reordering them from the settings window.

use tauri::{AppHandle, State};

use crate::app_core::CoreState;
use crate::module_commands::change;
use crate::pages::Placement;

/// Returns the new page's id.
#[tauri::command]
pub fn add_page(app: AppHandle, core: State<CoreState>, name: String, icon: String) -> Result<String, String> {
    let mut id = String::new();
    change(&app, &core, |c| {
        id = c.add_page(&name, &icon)?;
        Ok(())
    })?;
    Ok(id)
}

#[tauri::command]
pub fn set_page(
    app: AppHandle,
    core: State<CoreState>,
    id: String,
    name: Option<String>,
    icon: String,
    widgets: Vec<Placement>,
) -> Result<(), String> {
    change(&app, &core, |c| c.set_page(&id, name.as_deref(), &icon, widgets))
}

#[tauri::command]
pub fn delete_page(app: AppHandle, core: State<CoreState>, id: String) -> Result<(), String> {
    change(&app, &core, |c| c.delete_page(&id))
}

#[tauri::command]
pub fn move_page(app: AppHandle, core: State<CoreState>, id: String, to: usize) -> Result<(), String> {
    change(&app, &core, |c| c.move_page(&id, to))
}
