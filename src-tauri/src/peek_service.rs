//! Intip jendela's native side (design 5 Nov): the peek card and the peek
//! layer, their commands, and keeping the Dock watch and the Dock click tap in
//! line with the tool, its settings and the Accessibility permission.
//!
//! The card shows 350 ms after the pointer stops on a running app's icon and
//! changes at once to another icon while it is up; it hides 220 ms after the
//! pointer leaves both the icon and the card. Both panels are never closed,
//! only ordered out (main thread).

use std::cell::RefCell;
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua, NSAutoresizingMaskOptions,
    NSGlassEffectView, NSGlassEffectViewStyle, NSPanel, NSWindowOrderingMode,
    NSEvent, NSEventMask, NSRunningApplication, NSWindowAnimationBehavior, NSWorkspace, NSWorkspaceDidTerminateApplicationNotification,
};
use objc2_foundation::{
    NSDistributedNotificationCenter, NSNotification, NSObjectProtocol, NSOperationQueue, NSPoint, NSRect, NSSize, NSString, NSUserDefaults,
};
use serde::Serialize;
use tauri::window::{Effect, EffectState, EffectsBuilder};
use tauri::{AppHandle, Emitter, EventTarget, LogicalSize, Manager, Size, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use crate::app_core::CoreState;
use crate::geometry::Rect;
use crate::glass_capture::{self, Owner};
use crate::glass_rules::{opening, Snap};
use crate::glass_view::{self, Enter};
use objc2_core_graphics::CGImage;
use crate::locale::Lang;
use crate::peek_capture::{self, PictureSize};
use crate::peek_dock::{self, DockItem};
use crate::peek_rules::{
    card_point, dock_edge, find_window, near_peek, peek_frame, CardColor, DockClick, DockEdge, Material, PeekSettings, WinInfo, WindowAct,
};
use crate::peek_windows;

pub const MODULE_ID: &str = "window-peek";
const CARD: &str = "peek";
const STAGE: &str = "peek-stage";
const VIEW_EVENT: &str = "notching://peek";
const STAGE_EVENT: &str = "notching://peek-stage";
const POINTER_EVENT: &str = "notching://peek-pointer";
/// Above the Dock (20) and the notch panels (25).
const CARD_LEVEL: i32 = 26;
/// Above app windows, under the notch panels and the card.
const STAGE_LEVEL: i32 = 24;
const OPEN_MS: u64 = 350;
const CLOSE_MS: u64 = 220;
const ACCESS_CHANGED: &str = "com.apple.accessibility.api";
const ACCESS_SETTLE: Duration = Duration::from_millis(1500);
const NOTICE_EVERY: Duration = Duration::from_secs(60);

mod panel {
    tauri_nspanel::tauri_panel! {
        panel!(PeekPanel {
            config: {
                can_become_key_window: false,
                is_floating_panel: true
            }
        })
    }
}
use panel::PeekPanel;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeekWindowDto {
    pub id: u32,
    pub title: String,
    pub minimized: bool,
    pub front: bool,
}

/// What the card shows; same shape as PeekView in src/peek/view.ts.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PeekViewDto {
    pub app: String,
    pub icon: Option<String>,
    pub windows: Vec<PeekWindowDto>,
    pub card: CardColor,
    pub material: Material,
    pub accent: String,
    pub lang: Lang,
    pub max_width: f64,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct FrameDto {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// What the layer shows; same shape as StageView in src/peek/stage.ts.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StageViewDto {
    pub frame: FrameDto,
    pub minimized: bool,
    pub picture: Option<String>,
    pub accent: String,
    pub lang: Lang,
}

// What the card is up for: the icon, its app, its windows and its screen (CG).
#[derive(Clone)]
struct Shown {
    item: DockItem,
    pid: i32,
    windows: Vec<WinInfo>,
    screen: Rect,
    visible: Rect,
    view: PeekViewDto,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static SHOWN: Mutex<Option<Shown>> = Mutex::new(None);
// The running app's icon under the pointer, as the Dock last said.
static HOVER: Mutex<Option<DockItem>> = Mutex::new(None);
static OVER_CARD: AtomicBool = AtomicBool::new(false);
// Bumped by every timer and every change, so an older timer does nothing.
static GENERATION: AtomicU64 = AtomicU64::new(0);
static LAST_NOTICE: Mutex<Option<Instant>> = Mutex::new(None);
static ACCESS_OBSERVER: Mutex<Option<Observer>> = Mutex::new(None);
static QUIT_OBSERVER: Mutex<Option<Observer>> = Mutex::new(None);
// The window whose card the pointer is on, for the peek layer; a picture that
// comes back for any other is dropped.
static HOVER_ID: Mutex<Option<u32>> = Mutex::new(None);
// The card's AppKit frame while it is up, and the last pointer sent to it.
static CARD_FRAME: Mutex<Option<Rect>> = Mutex::new(None);
static LAST_POINT: Mutex<Option<Option<(f64, f64)>>> = Mutex::new(None);
// While the card is up: its icon and its frame in CG points, the Dock's side,
// and the main screen's height, to tell when the pointer has left the peek.
static PEEK_AREA: Mutex<Option<(Rect, Rect, DockEdge, f64)>> = Mutex::new(None);
static AWAY: AtomicBool = AtomicBool::new(false);
// Notching's own glass: the pointer reached the card once this opening, and the screen was pictured again.
static RETOOK: AtomicBool = AtomicBool::new(false);

thread_local! {
    // Mouse-move monitors, only while the card is up.
    static POINTER_MONITORS: RefCell<Vec<Retained<AnyObject>>> = const { RefCell::new(Vec::new()) };
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
struct PointDto {
    x: f64,
    y: f64,
}

// Tells the card where the pointer is on it (in its points), or that it is
// off it. WebKit gives a panel that is never key no hover of its own.
fn send_pointer(app: &AppHandle) {
    let Some(frame) = *CARD_FRAME.lock().unwrap() else { return };
    let p = NSEvent::mouseLocation();
    leave_or_stay((p.x, p.y));
    let point = card_point((p.x, p.y), frame);
    {
        let mut last = LAST_POINT.lock().unwrap();
        if *last == Some(point) {
            return;
        }
        *last = Some(point);
    }
    let _ = app.emit_to(EventTarget::webview_window(CARD), POINTER_EVENT, point.map(|(x, y)| PointDto { x, y }));
}

// The Dock does not always say when the pointer leaves it, so the card's own
// pointer watch decides: off the icon, the gap and the card, the card goes
// after CLOSE_MS; back on them, it stays.
fn leave_or_stay(mouse: (f64, f64)) {
    let Some((icon, card, edge, primary)) = *PEEK_AREA.lock().unwrap() else { return };
    let near = near_peek((mouse.0, primary - mouse.1), icon, card, edge);
    if !near && !AWAY.swap(true, Ordering::SeqCst) {
        *HOVER.lock().unwrap() = None;
        later_hide();
    } else if near && AWAY.swap(false, Ordering::SeqCst) {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        if let Some(item) = SHOWN.lock().unwrap().as_ref().map(|s| s.item.clone()) {
            *HOVER.lock().unwrap() = Some(item);
        }
    }
}

// Follows the pointer while the card is up: over other apps (global) and over
// the card itself (local). Nothing watches it otherwise. Main thread.
fn watch_pointer(app: &AppHandle, on: bool) {
    POINTER_MONITORS.with(|m| {
        let mut m = m.borrow_mut();
        if !on {
            for token in m.drain(..) {
                // SAFETY: a monitor added below, removed once.
                unsafe { NSEvent::removeMonitor(&token) };
            }
            return;
        }
        if !m.is_empty() {
            return;
        }
        let mask = NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged;
        let local_app = app.clone();
        let local = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            send_pointer(&local_app);
            event.as_ptr()
        });
        let global_app = app.clone();
        let global = RcBlock::new(move |_: NonNull<NSEvent>| send_pointer(&global_app));
        // SAFETY: the blocks live as long as their monitors, removed above.
        if let Some(token) = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &local) } {
            m.push(token);
        }
        if let Some(token) = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &global) {
            m.push(token);
        }
    });
}

fn clear_stage(app: &AppHandle) {
    *HOVER_ID.lock().unwrap() = None;
    let _ = app.emit_to(EventTarget::webview_window(STAGE), STAGE_EVENT, None::<StageViewDto>);
    if let Ok(stage) = app.get_webview_panel(STAGE) {
        stage.hide();
    }
}

struct Observer(#[allow(dead_code)] Retained<ProtocolObject<dyn NSObjectProtocol>>);
// SAFETY: kept only to stay alive; never used from another thread.
unsafe impl Send for Observer {}

fn settings(app: &AppHandle) -> PeekSettings {
    app.state::<CoreState>().0.lock().unwrap().peek_settings()
}

pub(crate) fn installed_and_on(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn on_main(app: &AppHandle, run: impl FnOnce(&AppHandle) + Send + 'static) {
    let handle = app.clone();
    if MainThreadMarker::new().is_some() {
        run(&handle);
    } else {
        let _ = app.run_on_main_thread(move || run(&handle));
    }
}

// Runs `run` on the main thread after `ms`, unless something changed meanwhile.
fn later(ms: u64, run: impl FnOnce(&AppHandle) + Send + 'static) {
    let Some(app) = APP.get().cloned() else { return };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(ms));
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if GENERATION.load(Ordering::SeqCst) == generation {
                run(&handle);
            }
        });
    });
}

fn later_hide() {
    later(CLOSE_MS, |app| {
        if HOVER.lock().unwrap().is_none() && !OVER_CARD.load(Ordering::SeqCst) {
            hide_now(app);
        }
    });
}

// The Dock watch's word, on the main thread: which running app's icon the
// pointer is on, if any.
fn on_hover(item: Option<DockItem>) {
    let Some(app) = APP.get().cloned() else { return };
    if !settings(&app).dock {
        return;
    }
    match item.filter(|i| i.pid.is_some()) {
        Some(item) => {
            *HOVER.lock().unwrap() = Some(item.clone());
            card_picture(&app, &item);
            if SHOWN.lock().unwrap().is_some() {
                GENERATION.fetch_add(1, Ordering::SeqCst);
                show_for(&app, item);
            } else {
                later(OPEN_MS, move |app| {
                    if HOVER.lock().unwrap().as_ref() == Some(&item) {
                        show_for(app, item);
                    }
                });
            }
        }
        None => {
            *HOVER.lock().unwrap() = None;
            later_hide();
        }
    }
}

// Notching's own glass (design 7 Nov §4): the screen behind the card is
// pictured while the card is on its way, once per screen while it is up.
fn card_picture(app: &AppHandle, item: &DockItem) {
    if !glass_capture::can_draw(settings(app).material) {
        return;
    }
    let Some(mtm) = MainThreadMarker::new() else { return };
    let screens = crate::win_service::screens(mtm);
    let (screen, _) = screen_at(&screens, item.frame.x + item.frame.w / 2.0, item.frame.y + item.frame.h / 2.0);
    glass_capture::begin(app, Owner::Card, screen, card_exclude(app), card_glass_ready);
}

// The card and the peek layer stay out of the card's picture.
fn card_exclude(app: &AppHandle) -> Vec<u32> {
    [CARD, STAGE].iter().filter_map(|label| app.get_webview_panel(label).ok()).map(|p| p.as_panel().windowNumber() as u32).collect()
}

// The card's glass at `frame` (CG points) from its picture, when it can be drawn there.
fn card_glass(frame: Rect, s: PeekSettings) -> Option<Retained<CGImage>> {
    if !glass_capture::can_draw(s.material) {
        return None;
    }
    let snap = glass_capture::snapshot(Owner::Card)?;
    if !snap.screen.contains(frame.x + frame.w / 2.0, frame.y + frame.h / 2.0) {
        return None;
    }
    crate::glass_draw::render(&snap, frame, crate::peek_rules::glass_shape(None), crate::glass_draw::current_look(), None)
}

// The card's picture came while the card is up: its glass fades in.
fn card_glass_ready(app: &AppHandle, _owner: Owner) {
    let Some((_, frame, _, _)) = *PEEK_AREA.lock().unwrap() else { return };
    let s = settings(app);
    let Some(image) = card_glass(frame, s) else { return };
    let Ok(panel) = app.get_webview_panel(CARD) else { return };
    let shape = crate::peek_rules::glass_shape(None);
    dress_window(app, CARD, s, shape, true);
    glass_view::show(app, CARD, panel.as_panel(), &image, shape, crate::glass_draw::current_look(), Enter::Fade);
}

pub(crate) fn data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
}

pub(crate) fn app_icon(pid: i32) -> Option<String> {
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)?;
    let icon = app.icon()?;
    let png = crate::shelf_service::image_png(&icon)?;
    Some(data_url(&png))
}

// The screen (full, visible; CG) holding a point, else the main one.
pub(crate) fn screen_at(screens: &[(Rect, Rect)], x: f64, y: f64) -> (Rect, Rect) {
    screens.iter().copied().find(|(full, _)| full.contains(x, y)).or_else(|| screens.first().copied()).unwrap_or((
        Rect { x: 0.0, y: 0.0, w: 1440.0, h: 900.0 },
        Rect { x: 0.0, y: 0.0, w: 1440.0, h: 900.0 },
    ))
}

// Lists the app's windows on a thread of its own (an app may answer slowly),
// then shows them on the card, if the pointer still wants this app.
fn show_for(app: &AppHandle, item: DockItem) {
    let Some(pid) = item.pid else { return };
    let Some(mtm) = MainThreadMarker::new() else { return };
    let screens = crate::win_service::screens(mtm);
    let (screen, visible) = screen_at(&screens, item.frame.x + item.frame.w / 2.0, item.frame.y + item.frame.h / 2.0);
    let handle = app.clone();
    std::thread::spawn(move || {
        let s = settings(&handle);
        let mut windows = peek_windows::app_windows(pid);
        if !s.minimized {
            windows.retain(|w| !w.minimized);
        }
        let front = (peek_windows::front_pid() == Some(pid)).then(|| windows.iter().find(|w| !w.minimized).map(|w| w.id)).flatten();
        let (accent, lang) = {
            let core = handle.state::<CoreState>();
            let core = core.0.lock().unwrap();
            (core.accent(), core.lang())
        };
        let view = PeekViewDto {
            app: item.name.clone(),
            icon: app_icon(pid),
            windows: windows
                .iter()
                .map(|w| PeekWindowDto { id: w.id, title: w.title.clone(), minimized: w.minimized, front: Some(w.id) == front })
                .collect(),
            card: s.card,
            material: s.material,
            accent,
            lang,
            max_width: (visible.w - 24.0).max(220.0),
        };
        on_main(&handle, move |app| {
            let wanted = HOVER.lock().unwrap().as_ref().is_some_and(|h| h.pid == item.pid) || OVER_CARD.load(Ordering::SeqCst);
            if !wanted {
                return;
            }
            let mut shown = SHOWN.lock().unwrap();
            // Pictures of this app's windows that are gone since last time.
            if let Some(old) = shown.as_ref().filter(|o| o.pid == pid) {
                let gone: Vec<u32> = old.windows.iter().map(|w| w.id).filter(|id| !windows.iter().any(|w| w.id == *id)).collect();
                peek_capture::forget(&gone);
            }
            *shown = Some(Shown { item, pid, windows, screen, visible, view: view.clone() });
            drop(shown);
            ensure_panels(app);
            let _ = app.emit_to(EventTarget::webview_window(CARD), VIEW_EVENT, &view);
        });
    });
}

pub(crate) fn make_panel(app: &AppHandle, label: &str, url: &str, level: i32) -> Option<std::sync::Arc<dyn tauri_nspanel::Panel>> {
    if let Ok(panel) = app.get_webview_panel(label) {
        return Some(panel);
    }
    let panel = PanelBuilder::<_, PeekPanel>::new(app, label)
        .url(WebviewUrl::App(url.into()))
        .size(Size::Logical(LogicalSize::new(800.0, 300.0)))
        .level(PanelLevel::Custom(level))
        .collection_behavior(
            CollectionBehavior::new().can_join_all_spaces().stationary().ignores_cycle().full_screen_auxiliary(),
        )
        .style_mask(StyleMask::empty().borderless().nonactivating_panel())
        .transparent(true)
        .has_shadow(label != STAGE)
        .no_activate(true)
        .hides_on_deactivate(false)
        .accepts_mouse_moved_events(true)
        .with_window(|w| {
            w.accept_first_mouse(true).transparent(true).decorations(false).visible(false).focused(false).skip_taskbar(true)
        })
        .build()
        .map_err(|e| eprintln!("notching: peek panel {label} not made: {e}"))
        .ok()?;
    panel.as_panel().setAnimationBehavior(NSWindowAnimationBehavior::None);
    if label == STAGE {
        panel.set_ignores_mouse_events(true);
    }
    Some(panel)
}

fn ensure_panels(app: &AppHandle) {
    make_panel(app, CARD, "peek.html", CARD_LEVEL);
    make_panel(app, STAGE, "peek-stage.html", STAGE_LEVEL);
}

// A CG rect (top-left of the main screen) as an AppKit frame.
pub(crate) fn appkit(r: Rect, primary_height: f64) -> NSRect {
    NSRect::new(NSPoint::new(r.x, primary_height - r.y - r.h), NSSize::new(r.w, r.h))
}

pub(crate) fn primary_height() -> f64 {
    MainThreadMarker::new()
        .and_then(|mtm| crate::win_service::screens(mtm).first().map(|(full, _)| full.h))
        .unwrap_or(0.0)
}

thread_local! {
    // Each panel's Liquid Glass view, under its page, while Liquid glass is on.
    static GLASS: RefCell<HashMap<String, Retained<NSGlassEffectView>>> = RefCell::new(HashMap::new());
}

/// A peek panel's look (the card or the switcher): light or dark on this
/// window only, and Liquid glass under the page in `shape`: Notching's own
/// (`own`, glass_view.rs) or macOS's. Main thread.
pub(crate) fn dress_window(app: &AppHandle, label: &str, s: PeekSettings, shape: crate::peek_rules::GlassShape, own: bool) {
    let Some(window) = app.get_webview_window(label) else { return };
    let Ok(panel) = app.get_webview_panel(label) else { return };
    let panel = panel.as_panel();
    // On this window only: tao's set_theme changes the whole app's look.
    let dark = crate::peek_rules::card_dark(s.card, system_dark());
    // SAFETY: AppKit's appearance names are static strings.
    let name = unsafe { if dark { NSAppearanceNameDarkAqua } else { NSAppearanceNameAqua } };
    panel.setAppearance(NSAppearance::appearanceNamed(name).as_deref());
    let glass = s.material == Material::Glass;
    // macOS 26 and later: Apple's own Liquid Glass, clear. Before: the frosted popover material.
    let native = set_glass(label, panel, glass && !own, shape);
    if !own {
        glass_view::clear(app, label);
    }
    let effects = (glass && !own && !native).then(|| {
        EffectsBuilder::new()
            .effect(Effect::Popover)
            .state(EffectState::Active)
            .radius(shape.radius)
            .build()
    });
    let _ = window.set_effects(effects);
}

// Puts a clear Liquid Glass view under the panel's page (`on`), or takes it
// away. False when this macOS has none (before macOS 26) or it is off.
fn set_glass(label: &str, panel: &NSPanel, on: bool, shape: crate::peek_rules::GlassShape) -> bool {
    let Some(mtm) = MainThreadMarker::new() else { return false };
    if !on || objc2::runtime::AnyClass::get(c"NSGlassEffectView").is_none() {
        GLASS.with(|g| {
            if let Some(view) = g.borrow_mut().remove(label) {
                view.removeFromSuperview();
            }
        });
        return false;
    }
    let Some(content) = panel.contentView() else { return false };
    GLASS.with(|g| {
        let mut g = g.borrow_mut();
        let view = g.entry(label.to_string()).or_insert_with(|| {
            let view = NSGlassEffectView::new(mtm);
            view.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable);
            content.addSubview_positioned_relativeTo(&view, NSWindowOrderingMode::Below, None);
            view
        });
        view.setStyle(NSGlassEffectViewStyle::Clear);
        view.setCornerRadius(shape.radius);
        let alpha = crate::peek_rules::glass_alpha(std::env::var("NOTCHING_GLASS_ALPHA").ok().as_deref());
        if view.alphaValue() != alpha {
            eprintln!("notching: Liquid Glass under {label} at strength {alpha}");
            view.setAlphaValue(alpha);
        }
        // Hanging from the notch: the top corners go past the panel's edge, so they are square.
        let b = content.bounds();
        let extra = if shape.flat_top { shape.radius } else { 0.0 };
        let y = if content.isFlipped() { b.origin.y - extra } else { b.origin.y };
        view.setFrame(NSRect::new(NSPoint::new(b.origin.x, y), NSSize::new(b.size.width, b.size.height + extra)));
    });
    true
}

// macOS's own light or dark look right now, whatever Notching's own theme.
fn system_dark() -> bool {
    NSUserDefaults::standardUserDefaults()
        .stringForKey(&NSString::from_str("AppleInterfaceStyle"))
        .is_some_and(|v| v.to_string() == "Dark")
}

/// The page's size: the card is placed beside its icon and shown.
#[tauri::command]
pub fn peek_size(app: AppHandle, width: f64, height: f64) {
    on_main(&app, move |app| {
        let Some(shown) = SHOWN.lock().unwrap().clone() else { return };
        let icon = shown.item.frame;
        let frame = peek_frame(icon, dock_edge(icon, shown.screen), (width, height), shown.visible);
        let Ok(panel) = app.get_webview_panel(CARD) else { return };
        let s = settings(app);
        let shape = crate::peek_rules::glass_shape(None);
        let glass = card_glass(frame, s);
        dress_window(app, CARD, s, shape, glass.is_some());
        let primary = primary_height();
        let at = appkit(frame, primary);
        panel.as_panel().setFrame_display(at, true);
        panel.as_panel().invalidateShadow();
        let first = !panel.as_panel().isVisible();
        panel.as_panel().orderFrontRegardless();
        match glass {
            Some(image) => {
                let enter = if first {
                    Enter::Opening(opening(None))
                } else if glass_view::showing(CARD) {
                    Enter::Now
                } else {
                    Enter::Fade
                };
                glass_view::show(app, CARD, panel.as_panel(), &image, shape, crate::glass_draw::current_look(), enter);
            }
            // No picture yet: macOS's glass now, Notching's when it comes, or none after a second.
            None if first && glass_capture::state(Owner::Card) == Snap::Waiting => glass_capture::give_up_later(app, Owner::Card),
            None => {}
        }
        if first {
            eprintln!("notching: peek card shown for pid {} ({} windows)", shown.pid, shown.windows.len());
        }
        *PEEK_AREA.lock().unwrap() = Some((icon, frame, dock_edge(icon, shown.screen), primary));
        AWAY.store(false, Ordering::SeqCst);
        *CARD_FRAME.lock().unwrap() = Some(Rect { x: at.origin.x, y: at.origin.y, w: at.size.width, h: at.size.height });
        *LAST_POINT.lock().unwrap() = None;
        watch_pointer(app, true);
        send_pointer(app);
    });
}

/// The pointer came onto the card, or left it.
#[tauri::command]
pub fn peek_pointer(inside: bool) {
    OVER_CARD.store(inside, Ordering::SeqCst);
    if inside {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        // On the card, the Dock lets go of its name label, magnified icons or
        // shown auto-hide: the screen behind is pictured once more (design 7 Nov §4).
        if !RETOOK.swap(true, Ordering::SeqCst)
            && let Some(app) = APP.get()
        {
            on_main(app, |app| glass_capture::retake(app, Owner::Card, card_exclude(app), card_glass_ready));
        }
    } else {
        later_hide();
    }
}

/// A card clicked: that window comes forward, restored if minimized.
#[tauri::command]
pub fn peek_open(app: AppHandle, id: u32) {
    let Some(pid) = SHOWN.lock().unwrap().as_ref().map(|s| s.pid) else { return };
    hide();
    let _ = app;
    std::thread::spawn(move || {
        peek_windows::raise(pid, id);
    });
}

/// A window button; the card stays and shows the result.
#[tauri::command]
pub fn peek_act(app: AppHandle, id: u32, act: WindowAct) {
    let Some((pid, item)) = SHOWN.lock().unwrap().as_ref().map(|s| (s.pid, s.item.clone())) else { return };
    // The window peeked at may be the one acted on: stop peeking.
    on_main(&app, clear_stage);
    std::thread::spawn(move || {
        let found = find_window(&peek_windows::app_windows(pid), id).is_some();
        eprintln!("notching: peek button {act:?} on a window of pid {pid} (found: {found})");
        if found {
            match act {
                WindowAct::Minimize => {
                    peek_capture::remember_before_minimize(id);
                    peek_windows::minimize(pid, id);
                }
                WindowAct::Restore => {
                    peek_windows::restore(pid, id);
                }
                WindowAct::Close => {
                    peek_windows::close(pid, id);
                }
                WindowAct::Quit => {
                    peek_windows::quit(pid);
                }
            }
        }
        // Give the app a moment to act, then show what is there now.
        std::thread::sleep(Duration::from_millis(250));
        let running = NSRunningApplication::runningApplicationWithProcessIdentifier(pid).is_some_and(|a| !a.isTerminated());
        on_main(&app, move |app| {
            if running {
                show_for(app, item);
            } else {
                hide_now(app);
            }
        });
    });
}

/// The pointer on a card (Some) or off it (None): the window is peeked at in
/// its place on the layer.
#[tauri::command]
pub fn peek_hover(app: AppHandle, id: Option<u32>) {
    let Some(id) = id else {
        on_main(&app, clear_stage);
        return;
    };
    *HOVER_ID.lock().unwrap() = Some(id);
    let Some(shown) = SHOWN.lock().unwrap().clone() else { return };
    let Some(window) = find_window(&shown.windows, id).cloned() else { return };
    std::thread::spawn(move || {
        let picture = peek_capture::picture(id, window.minimized, PictureSize::Full).map(|png| data_url(&png));
        on_main(&app, move |app| {
            // Still over this window's card? A slow picture for another is dropped.
            if *HOVER_ID.lock().unwrap() != Some(id) || SHOWN.lock().unwrap().as_ref().is_none_or(|s| s.pid != shown.pid) {
                return;
            }
            let screen = shown.screen;
            let view = StageViewDto {
                frame: FrameDto { x: window.frame.x - screen.x, y: window.frame.y - screen.y, w: window.frame.w, h: window.frame.h },
                minimized: window.minimized,
                picture,
                accent: shown.view.accent.clone(),
                lang: shown.view.lang,
            };
            let Ok(stage) = app.get_webview_panel(STAGE) else { return };
            stage.as_panel().setFrame_display(appkit(screen, primary_height()), true);
            let _ = app.emit_to(EventTarget::webview_window(STAGE), STAGE_EVENT, &view);
            stage.as_panel().orderFrontRegardless();
        });
    });
}

/// A window's picture for its card, as a PNG data URL; None: the app's icon stays.
#[tauri::command]
pub async fn peek_picture(id: u32, full: bool) -> Option<String> {
    let minimized = SHOWN.lock().unwrap().as_ref().and_then(|s| s.windows.iter().find(|w| w.id == id).map(|w| w.minimized))?;
    let size = if full { PictureSize::Full } else { PictureSize::Thumb };
    tauri::async_runtime::spawn_blocking(move || peek_capture::picture(id, minimized, size).map(|png| data_url(&png)))
        .await
        .ok()
        .flatten()
}

/// The card's view, for a page that loaded after it went out.
#[tauri::command]
pub fn peek_view() -> Option<PeekViewDto> {
    SHOWN.lock().unwrap().as_ref().map(|s| s.view.clone())
}

fn hide_now(app: &AppHandle) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    if SHOWN.lock().unwrap().take().is_some() {
        eprintln!("notching: peek card hidden");
    }
    glass_capture::forget(Owner::Card);
    RETOOK.store(false, Ordering::SeqCst);
    *PEEK_AREA.lock().unwrap() = None;
    *HOVER_ID.lock().unwrap() = None;
    *CARD_FRAME.lock().unwrap() = None;
    *LAST_POINT.lock().unwrap() = None;
    watch_pointer(app, false);
    OVER_CARD.store(false, Ordering::SeqCst);
    for label in [CARD, STAGE] {
        if let Ok(panel) = app.get_webview_panel(label) {
            panel.hide();
        }
    }
    glass_view::clear(app, CARD);
    let _ = app.emit_to(EventTarget::webview_window(CARD), VIEW_EVENT, None::<PeekViewDto>);
    let _ = app.emit_to(EventTarget::webview_window(STAGE), STAGE_EVENT, None::<StageViewDto>);
}

/// Hides the card and the layer. Safe from any thread.
pub fn hide() {
    if let Some(app) = APP.get() {
        on_main(app, hide_now);
    }
}

/// The tool switched on or installed without Accessibility: the notch says
/// so, at most once a minute.
pub fn no_access(app: &AppHandle) {
    {
        let mut last = LAST_NOTICE.lock().unwrap();
        if last.is_some_and(|t| t.elapsed() < NOTICE_EVERY) {
            return;
        }
        *last = Some(Instant::now());
    }
    let text = |key: &str| app.state::<CoreState>().0.lock().unwrap().module_text(MODULE_ID, key).unwrap_or_default();
    if let Err(e) = crate::notify::post(app, MODULE_ID, "access", &text("notice.access.title"), &text("notice.access.detail")) {
        eprintln!("notching: the window-peek access notice was not sent: {e}");
    }
}

/// The Dock watch and the click tap as the tool, its settings and the
/// permission say. Safe from any thread.
pub fn sync(app: &AppHandle) {
    let _ = APP.set(app.clone());
    on_main(app, |app| {
        let want = installed_and_on(app) && crate::keyclean_tap::trusted(false);
        let s = settings(app);
        if want && (s.dock || s.dock_click == DockClick::Toggle) {
            peek_dock::start(app, on_hover);
        } else {
            peek_dock::stop();
        }
        if !want || !s.dock {
            hide_now(app);
        }
        crate::peek_tap::sync(want && s.dock_click == DockClick::Toggle);
    });
}

/// At launch, on the main thread: the watch and the tap, and a watch on the
/// Accessibility list so a permission given later works without a restart.
pub fn start(app: &AppHandle) {
    let _ = APP.set(app.clone());
    // Notching's own glass: its kernels compile once, off the main thread.
    std::thread::spawn(crate::glass_draw::warm_up);
    sync(app);
    let handle = app.clone();
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        let handle = handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(ACCESS_SETTLE);
            sync(&handle);
            // The switcher's tap, and macOS's ⌘Tab back on if the permission went.
            crate::switch_service::sync(&handle);
        });
    });
    let center = NSDistributedNotificationCenter::defaultCenter();
    // SAFETY: the block lives as long as its observer, kept for the app's life.
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(&NSString::from_str(ACCESS_CHANGED)),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &block,
        )
    };
    *ACCESS_OBSERVER.lock().unwrap() = Some(Observer(observer));

    // The app on the card quit (its ⏻ or otherwise): the card goes too.
    let handle = app.clone();
    let quit = RcBlock::new(move |_: NonNull<NSNotification>| {
        let gone = SHOWN.lock().unwrap().as_ref().is_some_and(|s| {
            NSRunningApplication::runningApplicationWithProcessIdentifier(s.pid).is_none_or(|a| a.isTerminated())
        });
        if gone {
            hide_now(&handle);
        }
    });
    let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: AppKit's notification name is a static string; the block lives as
    // long as its observer, kept for the app's life.
    let observer = unsafe {
        workspace.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceDidTerminateApplicationNotification),
            None,
            Some(&NSOperationQueue::mainQueue()),
            &quit,
        )
    };
    *QUIT_OBSERVER.lock().unwrap() = Some(Observer(observer));
}
