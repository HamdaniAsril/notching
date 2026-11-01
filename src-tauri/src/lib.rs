mod app_core;
mod awake;
mod geometry;
mod home;
mod locale;
mod module_commands;
mod modules;
mod page_commands;
mod pages;
mod settings;
mod shelf;
mod shot;
mod status;
mod system_stats;
mod keyclean;
mod lamp;
mod timer;

#[cfg(target_os = "macos")]
mod awake_hold;
#[cfg(target_os = "macos")]
mod awake_service;
#[cfg(target_os = "macos")]
mod commands;
#[cfg(target_os = "macos")]
mod keyclean_dim;
#[cfg(target_os = "macos")]
mod keyclean_service;
#[cfg(target_os = "macos")]
mod keyclean_tap;
#[cfg(target_os = "macos")]
mod lamp_service;
#[cfg(target_os = "macos")]
mod login_item;
#[cfg(target_os = "macos")]
mod notify;
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
mod shelf_drag;
#[cfg(target_os = "macos")]
mod shelf_drop;
#[cfg(target_os = "macos")]
mod shelf_service;
#[cfg(target_os = "macos")]
mod shot_service;
#[cfg(target_os = "macos")]
mod timer_service;

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
        .register_uri_scheme_protocol(shot_service::SCHEME, |_ctx, req| match shot_service::dir() {
            Some(dir) => shot_service::respond(dir, req.uri().path()),
            None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_screen_info,
            commands::set_hit_rects,
            commands::set_panel_key,
            commands::quit_app,
            module_commands::get_module_state,
            module_commands::set_last_page,
            page_commands::add_page,
            page_commands::set_page,
            page_commands::delete_page,
            page_commands::move_page,
            status::get_status,
            status::set_sample_status,
            status::set_status_shown,
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
            keyclean_tap::open_accessibility_settings,
            keyclean_service::get_clean_state,
            home::commands::search_places,
            home::commands::set_place,
            home::commands::set_prayer_method,
            notify::set_notice_glow,
            notify::set_notice_seconds,
            notify::set_channel,
            notify::clear_missed,
            notify::send_sample_notice,
            shelf_service::shelf_state,
            shelf_service::shelf_remove,
            shelf_service::shelf_clear,
            shelf_drop::shelf_drop_ready,
            shelf_drag::shelf_start_drag,
            shot_service::shot_list,
            shot_service::shot_take_screen,
            shot_service::shot_copy,
            shot_service::shot_save,
            shot_service::shot_delete,
            shot_service::shot_permission,
            shot_service::open_screen_recording_settings,
        ])
        // A file drag can reach an overlay's webview before its sensor (the panel
        // already catches the mouse): that opens the drop zone too (Titipan).
        .on_window_event(|window, event| {
            use tauri::Manager as _;
            if let tauri::WindowEvent::DragDrop(drop) = event {
                let label = window.label();
                if !label.starts_with("notch-") {
                    return;
                }
                match drop {
                    tauri::DragDropEvent::Enter { .. } => shelf_drop::arrived(window.app_handle(), label),
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        shelf_drop::dropped_on_overlay(window.app_handle(), label, paths.clone())
                    }
                    _ => {}
                }
            }
        })
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
            app.manage(shelf_service::ShelfState(std::sync::Mutex::new(shelf::Shelf::default())));
            shelf_service::start(app.handle());
            shot_service::start(app.handle());
            overlay::rebuild_overlays(app.handle())?;
            home::schedule::start(app.handle().clone());
            awake_service::start(app.handle().clone());
            timer_service::start(app.handle().clone());
            keyclean_service::start(app.handle().clone());
            lamp_service::start(app.handle());
            screens::watch_screen_changes(app.handle().clone());
            sensor::init(app.handle());
            shelf_drop::init(app.handle());
            pointer::start_pointer_monitor(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            // Overlays come and go with screens; only an explicit quit ends the app.
            tauri::RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            tauri::RunEvent::Exit => {
                lamp_service::quitting(app);
                shelf_service::quitting(app);
            }
            _ => {}
        });
}
