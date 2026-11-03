//! Windows and Linux: no notch, so the panel drops down from the top centre of
//! each screen. Shelf, Screenshot, Cleaner, Keyboard Cleaning Mode, Music and
//! Mirror's lamp are macOS-only; their commands are not registered here.

pub mod overlay;

use tauri::Manager;

use crate::{
    app_core, commands, home, locale, module_commands, modules, notify, page_commands, prefs, settings,
    settings_window, status, system_stats, timer_service,
};

pub fn run() {
    #[cfg(target_os = "linux")]
    linux_env();

    tauri::Builder::default()
        .manage(overlay::Overlays::default())
        .manage(overlay::ConnectedScreens::default())
        .register_uri_scheme_protocol(modules::protocol::SCHEME, |ctx, req| {
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
            // PORT(C): login_item::set_launch_at_login, login_item::open_login_items
            home::commands::search_places,
            home::commands::set_place,
            home::commands::set_prayer_method,
            notify::set_notice_glow,
            notify::set_notice_seconds,
            notify::set_channel,
            notify::clear_missed,
            notify::send_sample_notice,
        ])
        .setup(|app| {
            // Before the overlays: their pages ask for module state as they load.
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
            app.manage(prefs::PrefsState(prefs::Prefs::new(paths.app_data_dir()?.join("widget-prefs"))));
            overlay::rebuild_overlays(app.handle())?;
            overlay::start(app.handle().clone());
            home::schedule::start(app.handle().clone());
            // PORT(C): crate::awake_service::start(app.handle().clone());
            timer_service::start(app.handle().clone());
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

// Windows are placed and kept on top through X11 (XWayland under Wayland), and
// WebKitGTK's DMA-BUF renderer draws blank windows on some GPUs. A value the
// person set is kept.
#[cfg(target_os = "linux")]
fn linux_env() {
    for (key, value) in [("GDK_BACKEND", "x11"), ("WEBKIT_DISABLE_DMABUF_RENDERER", "1")] {
        if std::env::var_os(key).is_none() {
            // SAFETY: called first thing in run(), before any other thread exists.
            unsafe { std::env::set_var(key, value) };
        }
    }
}
