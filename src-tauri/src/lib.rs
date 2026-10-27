mod geometry;
mod locale;
mod modules;
mod settings;
mod system_stats;

#[cfg(target_os = "macos")]
mod commands;
#[cfg(target_os = "macos")]
mod overlay;
#[cfg(target_os = "macos")]
mod pointer;
#[cfg(target_os = "macos")]
mod screens;

#[cfg(target_os = "macos")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_nspanel::init())
        .manage(overlay::Overlays::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_screen_info,
            commands::set_hit_rects,
            commands::set_panel_key,
            commands::quit_app,
        ])
        .setup(|app| {
            // No Dock icon.
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            overlay::rebuild_overlays(app.handle())?;
            screens::watch_screen_changes(app.handle().clone());
            pointer::start_pointer_monitor(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Overlays come and go with screens; only an explicit quit ends the app.
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                api.prevent_exit();
            }
        });
}
