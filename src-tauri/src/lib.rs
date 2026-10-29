mod app_core;
mod geometry;
mod home;
mod locale;
mod module_commands;
mod modules;
mod settings;
mod system_stats;

#[cfg(target_os = "macos")]
mod commands;
#[cfg(target_os = "macos")]
mod login_item;
#[cfg(target_os = "macos")]
mod overlay;
#[cfg(target_os = "macos")]
mod pointer;
#[cfg(target_os = "macos")]
mod screens;
#[cfg(target_os = "macos")]
mod sensor;
#[cfg(target_os = "macos")]
mod settings_window;

#[cfg(target_os = "macos")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_nspanel::init())
        .manage(overlay::Overlays::default())
        .manage(overlay::ConnectedScreens::default())
        .register_uri_scheme_protocol(modules::protocol::SCHEME, |ctx, req| {
            use tauri::Manager;
            let Some(core) = ctx.app_handle().try_state::<app_core::CoreState>() else {
                return tauri::http::Response::builder().status(404).body(Vec::new()).unwrap();
            };
            let core = core.0.lock().unwrap();
            modules::protocol::respond(core.active_dir(), |id| core.servable(id), req.uri().path())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_screen_info,
            commands::set_hit_rects,
            commands::set_panel_key,
            commands::quit_app,
            module_commands::get_module_state,
            module_commands::set_last_card,
            module_commands::set_module_enabled,
            module_commands::uninstall_module,
            module_commands::reinstall_module,
            module_commands::module_call,
            settings_window::open_settings,
            settings_window::get_settings,
            settings_window::set_language,
            settings_window::set_notch_config,
            settings_window::set_screen,
            login_item::set_launch_at_login,
            login_item::open_login_items,
            home::commands::search_places,
            home::commands::set_place,
            home::commands::set_prayer_method,
            home::commands::set_show_clock,
        ])
        .setup(|app| {
            // No Dock icon.
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            // Before the overlays: their pages ask for module state as they load.
            use tauri::Manager;
            let paths = app.path();
            let store = modules::store::ModuleStore::new(
                paths.resource_dir()?.join("modules"),
                paths.app_data_dir()?.join("modules"),
            );
            let settings = paths.app_config_dir()?.join(settings::SETTINGS_FILE);
            let core = app_core::AppCore::open(settings, store, locale::device_locale());
            app.manage(app_core::CoreState(std::sync::Mutex::new(core)));
            app.manage(app_core::StatsState(std::sync::Mutex::new(system_stats::SystemStats::new())));
            let home = home::Home::open(&paths.app_data_dir()?, &paths.app_cache_dir()?);
            app.manage(home::HomeState(std::sync::Mutex::new(home)));
            overlay::rebuild_overlays(app.handle())?;
            screens::watch_screen_changes(app.handle().clone());
            sensor::init(app.handle());
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
