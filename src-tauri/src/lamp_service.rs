//! The lamp's brightness on macOS. Brightness has no public API: DisplayServices,
//! a private framework, is opened at run time, and a display it cannot read
//! (most external monitors) is left alone. Without it the lamp is only the
//! notch's light.

use std::ffi::{c_char, c_int, c_void, CStr};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager};

use crate::lamp::{Lamp, Level};

pub struct LampState(Mutex<Lamp>);

type GetBrightness = unsafe extern "C" fn(display: u32, brightness: *mut f32) -> i32;
type SetBrightness = unsafe extern "C" fn(display: u32, brightness: f32) -> i32;

struct Brightness {
    get: GetBrightness,
    set: SetBrightness,
}

unsafe extern "C" {
    fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGGetOnlineDisplayList(max: u32, displays: *mut u32, count: *mut u32) -> i32;
}

const RTLD_LAZY: c_int = 1;
const FRAMEWORK: &CStr = c"/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices";

fn brightness() -> Option<&'static Brightness> {
    static FNS: OnceLock<Option<Brightness>> = OnceLock::new();
    FNS.get_or_init(|| {
        // SAFETY: a constant C path, and symbols cast to the signatures
        // DisplayServices has had since macOS 10.12.
        unsafe {
            let lib = dlopen(FRAMEWORK.as_ptr(), RTLD_LAZY);
            if lib.is_null() {
                return None;
            }
            let get = dlsym(lib, c"DisplayServicesGetBrightness".as_ptr());
            let set = dlsym(lib, c"DisplayServicesSetBrightness".as_ptr());
            if get.is_null() || set.is_null() {
                return None;
            }
            Some(Brightness {
                get: std::mem::transmute::<*mut c_void, GetBrightness>(get),
                set: std::mem::transmute::<*mut c_void, SetBrightness>(set),
            })
        }
    })
    .as_ref()
}

/// Every display DisplayServices can read, with its brightness.
fn levels() -> Vec<Level> {
    let Some(b) = brightness() else { return Vec::new() };
    let mut ids = [0u32; 16];
    let mut count = 0;
    // SAFETY: `ids` holds 16 entries and `count` is a valid out pointer.
    if unsafe { CGGetOnlineDisplayList(ids.len() as u32, ids.as_mut_ptr(), &mut count) } != 0 {
        return Vec::new();
    }
    ids[..count as usize]
        .iter()
        .filter_map(|&id| {
            let mut level = 0.0;
            // SAFETY: `level` is a valid out pointer.
            (unsafe { (b.get)(id, &mut level) } == 0).then_some((id, level))
        })
        .collect()
}

fn set(id: u32, level: f32) {
    if let Some(b) = brightness() {
        // SAFETY: plain values.
        unsafe {
            (b.set)(id, level.clamp(0.0, 1.0));
        }
    }
}

pub fn start(app: &AppHandle) {
    app.manage(LampState(Mutex::new(Lamp::default())));
}

pub fn turn_on(app: &AppHandle, owner: &str) {
    let ids = app.state::<LampState>().0.lock().unwrap().turn_on(owner, levels());
    for id in ids {
        set(id, 1.0);
    }
}

pub fn turn_off(app: &AppHandle) {
    let saved = app.state::<LampState>().0.lock().unwrap().turn_off();
    for (id, level) in saved {
        set(id, level);
    }
}

pub fn module_gone(app: &AppHandle, id: &str) {
    let owns = app.state::<LampState>().0.lock().unwrap().owner() == Some(id);
    if owns {
        turn_off(app);
    }
}

/// As Notching quits: never leave the screens at full brightness.
pub fn quitting(app: &AppHandle) {
    if app.try_state::<LampState>().is_some() {
        turn_off(app);
    }
}
