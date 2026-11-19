//! Kecerahan (design 19 Nov): each screen's brightness, through DisplayServices
//! (built-in and Apple displays), DDC over IOAVService (a monitor that answers),
//! or software dimming of its gamma table (one that doesn't).

use std::collections::HashMap;
use std::ffi::{c_char, c_void, CStr};
use std::path::PathBuf;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

use objc2::MainThreadMarker;
use objc2_app_kit::NSScreen;
use objc2_foundation::{NSNumber, NSString};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::brightness_rules::{self as rules, MonitorId, VCP_BRIGHTNESS};

pub const MODULE_ID: &str = "kecerahan";
/// Between two DDC writes: monitors drop commands sent faster.
const DDC_GAP: Duration = Duration::from_millis(50);
/// How often software dimming is checked: macOS puts the gamma back after
/// sleep, a display change, or another app.
const SOFT_CHECK: Duration = Duration::from_secs(2);

type CFTypeRef = *const c_void;

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOServiceMatching(name: *const c_char) -> *mut c_void;
    fn IOServiceGetMatchingServices(main_port: u32, matching: *mut c_void, existing: *mut u32) -> i32;
    fn IOIteratorNext(iterator: u32) -> u32;
    fn IOObjectRelease(object: u32) -> i32;
    fn IORegistryEntryCreateCFProperty(entry: u32, key: CFTypeRef, allocator: CFTypeRef, options: u32) -> CFTypeRef;
    fn IOAVServiceCreateWithService(allocator: CFTypeRef, service: u32) -> CFTypeRef;
    fn IOAVServiceReadI2C(service: CFTypeRef, chip: u32, offset: u32, buffer: *mut u8, length: u32) -> i32;
    fn IOAVServiceWriteI2C(service: CFTypeRef, chip: u32, offset: u32, buffer: *const u8, length: u32) -> i32;
    fn IOAVServiceCopyEDID(service: CFTypeRef, edid: *mut CFTypeRef) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFStringCreateWithCString(allocator: CFTypeRef, text: *const c_char, encoding: u32) -> CFTypeRef;
    fn CFEqual(a: CFTypeRef, b: CFTypeRef) -> u8;
    fn CFRelease(object: CFTypeRef);
    fn CFDataGetLength(data: CFTypeRef) -> isize;
    fn CFDataGetBytePtr(data: CFTypeRef) -> *const u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGGetOnlineDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
    fn CGDisplayVendorNumber(display: u32) -> u32;
    fn CGDisplayModelNumber(display: u32) -> u32;
    fn CGDisplaySerialNumber(display: u32) -> u32;
    fn CGDisplayIsBuiltin(display: u32) -> u32;
    fn CGGetDisplayTransferByTable(display: u32, capacity: u32, red: *mut f32, green: *mut f32, blue: *mut f32, count: *mut u32) -> i32;
    fn CGSetDisplayTransferByTable(display: u32, count: u32, red: *const f32, green: *const f32, blue: *const f32) -> i32;
    fn CGDisplayRestoreColorSyncSettings();
}

const UTF8: u32 = 0x0800_0100;
const DDC_CHIP: u32 = 0x37;
const DDC_OFFSET: u32 = 0x51;

/// An IOAVService, kept for the life of the app.
struct Av(CFTypeRef);
// SAFETY: IOAVService calls are made from one thread at a time (under WAYS).
unsafe impl Send for Av {}

/// A screen's three gamma channels.
#[derive(Clone, Debug, PartialEq)]
struct Gamma {
    red: Vec<f32>,
    green: Vec<f32>,
    blue: Vec<f32>,
}

/// How a screen's brightness is changed.
enum Way {
    System,
    Ddc { av: Av, max: u16 },
    /// `own`: the gamma the screen had before Notching dimmed it.
    Soft { key: String, own: Gamma },
}

/// Same shape as Screen in modules/kecerahan/view.ts.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenDto {
    pub id: u32,
    pub name: String,
    /// 0–1.
    pub level: f32,
    /// "system", "ddc" or "soft".
    pub way: &'static str,
}

/// Every screen Notching has looked at, by CoreGraphics id.
static WAYS: Mutex<Option<HashMap<u32, Way>>> = Mutex::new(None);
/// Levels waiting for the worker, newest only.
static PENDING: Mutex<Vec<(u32, f32)>> = Mutex::new(Vec::new());
static WAKE: Condvar = Condvar::new();
/// Software levels by monitor, as saved.
static SOFT: Mutex<Option<HashMap<String, f32>>> = Mutex::new(None);
static FILE: OnceLock<PathBuf> = OnceLock::new();

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn online() -> Vec<u32> {
    let mut ids = [0u32; 16];
    let mut count = 0;
    // SAFETY: `ids` holds 16 entries and `count` is a valid out pointer.
    if unsafe { CGGetOnlineDisplayList(ids.len() as u32, ids.as_mut_ptr(), &mut count) } != 0 {
        return vec![];
    }
    ids[..count as usize].to_vec()
}

fn monitor(id: u32) -> MonitorId {
    // SAFETY: plain values.
    unsafe { MonitorId { vendor: CGDisplayVendorNumber(id), product: CGDisplayModelNumber(id), serial: CGDisplaySerialNumber(id) } }
}

fn cfstring(text: &CStr) -> CFTypeRef {
    // SAFETY: a valid C string; the caller releases the result.
    unsafe { CFStringCreateWithCString(std::ptr::null(), text.as_ptr(), UTF8) }
}

/// Every external IOAVService with the monitor its EDID names.
fn external_services() -> Vec<(MonitorId, Av)> {
    let mut out = Vec::new();
    // SAFETY: IOKit and CoreFoundation calls on objects released here; the
    // matching dictionary is consumed by IOServiceGetMatchingServices.
    unsafe {
        let mut iterator = 0;
        if IOServiceGetMatchingServices(0, IOServiceMatching(c"DCPAVServiceProxy".as_ptr()), &mut iterator) != 0 {
            return out;
        }
        let location = cfstring(c"Location");
        let external = cfstring(c"External");
        loop {
            let service = IOIteratorNext(iterator);
            if service == 0 {
                break;
            }
            let at = IORegistryEntryCreateCFProperty(service, location, std::ptr::null(), 0);
            let is_external = !at.is_null() && CFEqual(at, external) != 0;
            if !at.is_null() {
                CFRelease(at);
            }
            if is_external {
                let av = IOAVServiceCreateWithService(std::ptr::null(), service);
                if !av.is_null() {
                    let mut edid: CFTypeRef = std::ptr::null();
                    let id = (IOAVServiceCopyEDID(av, &mut edid) == 0 && !edid.is_null())
                        .then(|| std::slice::from_raw_parts(CFDataGetBytePtr(edid), CFDataGetLength(edid).max(0) as usize))
                        .and_then(rules::edid_id);
                    if !edid.is_null() {
                        CFRelease(edid);
                    }
                    match id {
                        Some(id) => out.push((id, Av(av))),
                        None => CFRelease(av),
                    }
                }
            }
            IOObjectRelease(service);
        }
        IOObjectRelease(iterator);
        CFRelease(location);
        CFRelease(external);
    }
    out
}

/// Brightness over DDC as (current, max); None when the monitor does not answer.
fn ddc_read(av: &Av) -> Option<(u16, u16)> {
    let packet = rules::get_packet(VCP_BRIGHTNESS);
    for _ in 0..4 {
        // SAFETY: buffers of the lengths given.
        unsafe {
            let mut wrote = false;
            for _ in 0..2 {
                std::thread::sleep(Duration::from_millis(10));
                wrote |= IOAVServiceWriteI2C(av.0, DDC_CHIP, DDC_OFFSET, packet.as_ptr(), packet.len() as u32) == 0;
            }
            if wrote {
                std::thread::sleep(Duration::from_millis(50));
                let mut reply = [0u8; 11];
                if IOAVServiceReadI2C(av.0, DDC_CHIP, DDC_OFFSET, reply.as_mut_ptr(), reply.len() as u32) == 0 {
                    if let Some(answer) = rules::parse_reply(VCP_BRIGHTNESS, &reply) {
                        return Some(answer);
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    None
}

fn ddc_write(av: &Av, value: u16) {
    let packet = rules::set_packet(VCP_BRIGHTNESS, value);
    for _ in 0..2 {
        // SAFETY: a buffer of the length given.
        unsafe {
            IOAVServiceWriteI2C(av.0, DDC_CHIP, DDC_OFFSET, packet.as_ptr(), packet.len() as u32);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn gamma(id: u32) -> Option<Gamma> {
    let mut red = vec![0f32; 1024];
    let mut green = vec![0f32; 1024];
    let mut blue = vec![0f32; 1024];
    let mut count = 0;
    // SAFETY: three buffers of 1024 entries and a valid out pointer.
    let ok = unsafe {
        CGGetDisplayTransferByTable(id, 1024, red.as_mut_ptr(), green.as_mut_ptr(), blue.as_mut_ptr(), &mut count)
    } == 0;
    if !ok || count == 0 {
        return None;
    }
    let n = count as usize;
    red.truncate(n);
    green.truncate(n);
    blue.truncate(n);
    Some(Gamma { red, green, blue })
}

fn set_gamma(id: u32, g: &Gamma) {
    // SAFETY: three tables of the same length.
    unsafe {
        CGSetDisplayTransferByTable(id, g.red.len() as u32, g.red.as_ptr(), g.green.as_ptr(), g.blue.as_ptr());
    }
}

fn dimmed(own: &Gamma, factor: f32) -> Gamma {
    Gamma { red: rules::scaled(&own.red, factor), green: rules::scaled(&own.green, factor), blue: rules::scaled(&own.blue, factor) }
}

fn soft_level(key: &str) -> f32 {
    SOFT.lock().unwrap().as_ref().and_then(|m| m.get(key).copied()).unwrap_or(1.0)
}

fn save_soft() {
    let Some(path) = FILE.get() else { return };
    let map = SOFT.lock().unwrap().clone().unwrap_or_default();
    if let Ok(text) = serde_json::to_string(&map) {
        let _ = std::fs::write(path, text);
    }
}

/// Finds how each online screen is set, once; new screens are looked at, gone
/// ones forgotten. May take a second for a monitor that does not answer DDC.
fn survey() {
    let ids = online();
    let mut ways = WAYS.lock().unwrap();
    let ways = ways.get_or_insert_with(HashMap::new);
    ways.retain(|id, _| ids.contains(id));
    let fresh: Vec<u32> = ids.iter().copied().filter(|id| !ways.contains_key(id)).collect();
    if fresh.is_empty() {
        return;
    }
    let mut services = external_services();
    for id in fresh {
        // SAFETY: a plain value.
        let builtin = unsafe { CGDisplayIsBuiltin(id) } != 0;
        let way = if builtin || crate::lamp_service::get(id).is_some() {
            Way::System
        } else {
            let mon = monitor(id);
            let ddc = services
                .iter()
                .position(|(m, _)| *m == mon)
                .map(|i| services.remove(i).1)
                .and_then(|av| ddc_read(&av).map(|(_, max)| Way::Ddc { av, max }));
            match ddc {
                Some(way) => way,
                None => match gamma(id) {
                    Some(own) => Way::Soft { key: mon.key(), own },
                    None => continue,
                },
            }
        };
        ways.insert(id, way);
    }
    for (_, av) in services {
        // SAFETY: an IOAVService created above and not kept.
        unsafe { CFRelease(av.0) };
    }
}

fn level_of(id: u32, way: &Way) -> f32 {
    match way {
        Way::System => crate::lamp_service::get(id).unwrap_or(1.0),
        Way::Ddc { av, max } => ddc_read(av).map(|(current, _)| rules::ddc_level(current, *max)).unwrap_or(1.0),
        Way::Soft { key, .. } => soft_level(key),
    }
}

/// NSScreen names by CoreGraphics id, read on the main thread.
fn names(app: &AppHandle) -> HashMap<u32, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let _ = app.run_on_main_thread(move || {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let key = NSString::from_str("NSScreenNumber");
        let map: HashMap<u32, String> = NSScreen::screens(mtm)
            .iter()
            .filter_map(|screen| {
                let number = screen.deviceDescription().objectForKey(&key)?;
                let number = number.downcast::<NSNumber>().ok()?;
                Some((number.unsignedIntValue(), screen.localizedName().to_string()))
            })
            .collect();
        let _ = tx.send(map);
    });
    rx.recv_timeout(Duration::from_secs(1)).unwrap_or_default()
}

/// The card's rows, the built-in screen first. Blocks while a new monitor is
/// tried over DDC.
pub fn read(app: &AppHandle) -> Vec<ScreenDto> {
    survey();
    let names = names(app);
    let ways = WAYS.lock().unwrap();
    let Some(ways) = ways.as_ref() else { return vec![] };
    let mut rows: Vec<ScreenDto> = online()
        .into_iter()
        .filter_map(|id| {
            let way = ways.get(&id)?;
            let kind = match way {
                Way::System => "system",
                Way::Ddc { .. } => "ddc",
                Way::Soft { .. } => "soft",
            };
            Some(ScreenDto { id, name: names.get(&id).cloned().unwrap_or_default(), level: level_of(id, way), way: kind })
        })
        .collect();
    // SAFETY: a plain value.
    rows.sort_by_key(|r| unsafe { CGDisplayIsBuiltin(r.id) } == 0);
    rows
}

#[derive(serde::Deserialize)]
pub struct SetArgs {
    pub id: u32,
    pub level: f32,
}

/// Hands the level to the worker; the newest per screen wins.
pub fn set(a: &SetArgs) {
    let mut pending = PENDING.lock().unwrap();
    pending.retain(|(id, _)| *id != a.id);
    pending.push((a.id, a.level.clamp(0.0, 1.0)));
    WAKE.notify_one();
}

fn apply(id: u32, level: f32) {
    let ways = WAYS.lock().unwrap();
    let Some(way) = ways.as_ref().and_then(|w| w.get(&id)) else { return };
    match way {
        Way::System => crate::lamp_service::set(id, level),
        Way::Ddc { av, max } => {
            ddc_write(av, rules::ddc_value(level, *max));
            std::thread::sleep(DDC_GAP);
        }
        Way::Soft { key, own } => {
            if level >= 1.0 {
                set_gamma(id, own);
            } else {
                set_gamma(id, &dimmed(own, rules::soft_factor(level)));
            }
            let key = key.clone();
            drop(ways);
            SOFT.lock().unwrap().get_or_insert_with(HashMap::new).insert(key, level);
            save_soft();
        }
    }
}

/// Puts every saved software level back where macOS reset it.
fn keep_soft() {
    let ways = WAYS.lock().unwrap();
    let Some(ways) = ways.as_ref() else { return };
    for (id, way) in ways {
        if let Way::Soft { key, own } = way {
            let level = soft_level(key);
            if level < 1.0 {
                let want = dimmed(own, rules::soft_factor(level));
                let kept = gamma(*id).is_some_and(|g| {
                    rules::same_gamma(&g.red, &want.red) && rules::same_gamma(&g.green, &want.green) && rules::same_gamma(&g.blue, &want.blue)
                });
                if !kept {
                    set_gamma(*id, &want);
                }
            }
        }
    }
}

pub fn start(app: &AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("brightness.json");
        let saved: HashMap<String, f32> =
            std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        *SOFT.lock().unwrap() = Some(saved);
        let _ = FILE.set(path);
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("brightness".into())
        .spawn(move || loop {
            let next = {
                let pending = PENDING.lock().unwrap();
                let (mut pending, _) = WAKE.wait_timeout_while(pending, SOFT_CHECK, |p| p.is_empty()).unwrap();
                (!pending.is_empty()).then(|| pending.remove(0))
            };
            if !enabled(&app) {
                continue;
            }
            match next {
                Some((id, level)) => apply(id, level),
                None => {
                    survey();
                    keep_soft();
                }
            }
        })
        .ok();
}

/// Screens changed: new monitors are looked at on the next check.
pub fn screens_changed() {
    WAKE.notify_one();
}

/// Every software-dimmed screen gets its own colours back.
fn restore() {
    let any = WAYS.lock().unwrap().as_ref().is_some_and(|w| w.values().any(|w| matches!(w, Way::Soft { .. })));
    if any {
        // SAFETY: no arguments.
        unsafe { CGDisplayRestoreColorSyncSettings() };
    }
}

/// Off or uninstalled: the colours come back; on: the saved dimming returns.
pub fn module_changed(id: &str, on: bool) {
    if id != MODULE_ID {
        return;
    }
    if on {
        WAKE.notify_one();
    } else {
        restore();
    }
}

pub fn quitting() {
    restore();
}
