//! Volume app (design 19 Nov): one app turned down through a Core Audio process
//! tap. The tap mutes the app at its source; an aggregate device of the tap and
//! the current output plays it again at the level. Apps at 100 % are untouched.

use std::collections::{BTreeMap, HashMap};
use std::ffi::{c_char, c_int, c_void, CStr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::msg_send;
use objc2_foundation::{NSArray, NSMutableDictionary, NSNumber, NSString};
use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::volume_rules as rules;

pub const MODULE_ID: &str = "volume-app";
/// How often the playing apps and the output are looked at.
const TICK: Duration = Duration::from_secs(1);

const fn code(s: &[u8; 4]) -> u32 {
    (s[0] as u32) << 24 | (s[1] as u32) << 16 | (s[2] as u32) << 8 | s[3] as u32
}

const SYSTEM: u32 = 1;
const GLOBAL: u32 = code(b"glob");
const PROCESS_LIST: u32 = code(b"prs#");
const PROCESS_PID: u32 = code(b"ppid");
const PROCESS_OUTPUT: u32 = code(b"piro");
const DEFAULT_OUTPUT: u32 = code(b"dOut");
const DEVICE_UID: u32 = code(b"uid ");
const NAME: u32 = code(b"lnam");
const DEVICES: u32 = code(b"dev#");
const STREAMS: u32 = code(b"stm#");
const TRANSPORT: u32 = code(b"tran");
const CAN_BE_DEFAULT: u32 = code(b"dflt");
const HIDDEN: u32 = code(b"hidn");
/// Where alerts and sound effects play.
const SYSTEM_OUTPUT: u32 = code(b"sOut");
const OUTPUT: u32 = code(b"outp");
/// The device's main volume as the menu bar shows it.
const MAIN_VOLUME: u32 = code(b"vmvc");
const MUTE: u32 = code(b"mute");
/// CATapMuteBehavior: muted while Notching taps it.
const MUTED_WHEN_TAPPED: isize = 2;

#[repr(C)]
struct Address {
    selector: u32,
    scope: u32,
    element: u32,
}

#[repr(C)]
struct AudioBuffer {
    channels: u32,
    size: u32,
    data: *mut c_void,
}

#[repr(C)]
struct AudioBufferList {
    count: u32,
    buffers: [AudioBuffer; 1],
}

type IoProc = unsafe extern "C" fn(
    device: u32,
    now: *const c_void,
    input: *const AudioBufferList,
    input_time: *const c_void,
    output: *mut AudioBufferList,
    output_time: *const c_void,
    client: *mut c_void,
) -> i32;

#[link(name = "CoreAudio", kind = "framework")]
unsafe extern "C" {
    fn AudioObjectGetPropertyDataSize(object: u32, address: *const Address, qsize: u32, q: *const c_void, size: *mut u32) -> i32;
    fn AudioObjectGetPropertyData(object: u32, address: *const Address, qsize: u32, q: *const c_void, size: *mut u32, data: *mut c_void) -> i32;
    fn AudioObjectSetPropertyData(object: u32, address: *const Address, qsize: u32, q: *const c_void, size: u32, data: *const c_void) -> i32;
    fn AudioObjectHasProperty(object: u32, address: *const Address) -> u8;
    fn AudioObjectIsPropertySettable(object: u32, address: *const Address, settable: *mut u8) -> i32;
    fn AudioHardwareCreateProcessTap(description: *mut AnyObject, tap: *mut u32) -> i32;
    fn AudioHardwareDestroyProcessTap(tap: u32) -> i32;
    fn AudioHardwareCreateAggregateDevice(description: *const c_void, device: *mut u32) -> i32;
    fn AudioHardwareDestroyAggregateDevice(device: u32) -> i32;
    fn AudioDeviceCreateIOProcID(device: u32, proc_: IoProc, client: *mut c_void, id: *mut *mut c_void) -> i32;
    fn AudioDeviceDestroyIOProcID(device: u32, id: *mut c_void) -> i32;
    fn AudioDeviceStart(device: u32, id: *mut c_void) -> i32;
    fn AudioDeviceStop(device: u32, id: *mut c_void) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(object: *const c_void);
}

unsafe extern "C" {
    fn proc_pidpath(pid: c_int, buffer: *mut c_void, size: u32) -> c_int;
    fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

const RTLD_LAZY: c_int = 1;
/// dlsym's "search everywhere".
const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;

fn get<T: Copy>(object: u32, selector: u32) -> Option<T> {
    get_in(object, selector, GLOBAL)
}

fn get_in<T: Copy>(object: u32, selector: u32, scope: u32) -> Option<T> {
    let address = Address { selector, scope, element: 0 };
    let mut value = std::mem::MaybeUninit::<T>::uninit();
    let mut size = std::mem::size_of::<T>() as u32;
    // SAFETY: `value` has room for `size` bytes.
    let ok = unsafe { AudioObjectGetPropertyData(object, &address, 0, std::ptr::null(), &mut size, value.as_mut_ptr().cast()) } == 0;
    // SAFETY: Core Audio filled it.
    (ok && size as usize == std::mem::size_of::<T>()).then(|| unsafe { value.assume_init() })
}

/// Every process Core Audio knows, as process objects.
fn process_objects() -> Vec<u32> {
    ids(SYSTEM, PROCESS_LIST, GLOBAL)
}

/// A list of object ids.
fn ids(object: u32, selector: u32, scope: u32) -> Vec<u32> {
    let address = Address { selector, scope, element: 0 };
    let mut size = 0;
    // SAFETY: valid out pointers; the list is read into a buffer of that size.
    unsafe {
        if AudioObjectGetPropertyDataSize(object, &address, 0, std::ptr::null(), &mut size) != 0 {
            return vec![];
        }
        let mut ids = vec![0u32; size as usize / 4];
        if AudioObjectGetPropertyData(object, &address, 0, std::ptr::null(), &mut size, ids.as_mut_ptr().cast()) != 0 {
            return vec![];
        }
        ids.truncate(size as usize / 4);
        ids
    }
}

/// The current output's id and UID.
fn default_output() -> Option<(u32, String)> {
    let device: u32 = get(SYSTEM, DEFAULT_OUTPUT)?;
    Some((device, text_of(device, DEVICE_UID)?))
}

/// A CFString property, as text.
fn text_of(object: u32, selector: u32) -> Option<String> {
    let cf: *const c_void = get(object, selector)?;
    if cf.is_null() {
        return None;
    }
    // SAFETY: a CFString Core Audio handed over (+1), bridged to NSString.
    Some(unsafe {
        let text = (*(cf as *const NSString)).to_string();
        CFRelease(cf);
        text
    })
}

/// Has the output this property, and can it be changed? (has, settable)
fn output_property(device: u32, selector: u32) -> (bool, bool) {
    let address = Address { selector, scope: OUTPUT, element: 0 };
    // SAFETY: a valid address and out pointer.
    unsafe {
        if AudioObjectHasProperty(device, &address) == 0 {
            return (false, false);
        }
        let mut settable = 0u8;
        (true, AudioObjectIsPropertySettable(device, &address, &mut settable) == 0 && settable != 0)
    }
}

fn set_global<T: Copy>(object: u32, selector: u32, value: T) -> i32 {
    set_in(object, selector, GLOBAL, value)
}

fn set_output_prop<T: Copy>(device: u32, selector: u32, value: T) -> i32 {
    set_in(device, selector, OUTPUT, value)
}

fn set_in<T: Copy>(object: u32, selector: u32, scope: u32, value: T) -> i32 {
    let address = Address { selector, scope, element: 0 };
    // SAFETY: `value` is `size` bytes of the property's type.
    unsafe {
        AudioObjectSetPropertyData(object, &address, 0, std::ptr::null(), std::mem::size_of::<T>() as u32, (&value as *const T).cast())
    }
}

/// The app that answers for a process: Safari for its WebKit audio process.
fn responsible(pid: i32) -> i32 {
    type Responsible = unsafe extern "C" fn(i32) -> i32;
    static FN: OnceLock<Option<Responsible>> = OnceLock::new();
    let f = FN.get_or_init(|| {
        // SAFETY: a symbol of libSystem with this signature, looked up by name.
        unsafe {
            let p = dlsym(RTLD_DEFAULT, c"responsibility_get_pid_responsible_for_pid".as_ptr());
            (!p.is_null()).then(|| std::mem::transmute::<*mut c_void, Responsible>(p))
        }
    });
    // SAFETY: a plain value.
    f.map(|f| unsafe { f(pid) }).filter(|p| *p > 0).unwrap_or(pid)
}

fn path_of(pid: i32) -> Option<String> {
    let mut buf = vec![0u8; 4096];
    // SAFETY: a buffer of the size given.
    let n = unsafe { proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    (n > 0).then(|| String::from_utf8_lossy(&buf[..n as usize]).into_owned())
}

/// One app with sound, as Core Audio sees it now.
struct Found {
    pid: i32,
    objects: Vec<u32>,
    playing: bool,
}

/// Apps by their bundle path, each with its process objects.
fn scan() -> BTreeMap<String, Found> {
    let own = std::process::id() as i32;
    let mut apps: BTreeMap<String, Found> = BTreeMap::new();
    for object in process_objects() {
        let Some(pid) = get::<i32>(object, PROCESS_PID) else { continue };
        let owner = responsible(pid);
        if pid == own || owner == own {
            continue;
        }
        let Some(app) = path_of(owner).and_then(|p| rules::app_of(&p)) else { continue };
        let playing = get::<u32>(object, PROCESS_OUTPUT).unwrap_or(0) != 0;
        let found = apps.entry(app).or_insert(Found { pid: owner, objects: vec![], playing: false });
        found.objects.push(object);
        found.playing |= playing;
    }
    apps
}

/// One running tap.
struct Tap {
    objects: Vec<u32>,
    output: String,
    tap: u32,
    device: u32,
    proc_id: *mut c_void,
    gain: *const AtomicU32,
}

// SAFETY: the raw ids and the gain are used only under TAPS.
unsafe impl Send for Tap {}

static TAPS: Mutex<BTreeMap<String, Tap>> = Mutex::new(BTreeMap::new());
static LEVELS: Mutex<Option<BTreeMap<String, f32>>> = Mutex::new(None);
static FILE: OnceLock<PathBuf> = OnceLock::new();
static WAKE: Condvar = Condvar::new();
static WAKE_LOCK: Mutex<bool> = Mutex::new(false);
static ICONS: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

// Runs on Core Audio's IO thread: no locks, no allocation.
unsafe extern "C" fn io_proc(
    _device: u32,
    _now: *const c_void,
    input: *const AudioBufferList,
    _input_time: *const c_void,
    output: *mut AudioBufferList,
    _output_time: *const c_void,
    client: *mut c_void,
) -> i32 {
    // SAFETY: Core Audio's buffer lists for this cycle, and the gain that lives
    // until this proc is destroyed.
    unsafe {
        let gain = f32::from_bits((*(client as *const AtomicU32)).load(Ordering::Relaxed));
        let ins = std::slice::from_raw_parts(std::ptr::addr_of!((*input).buffers).cast::<AudioBuffer>(), (*input).count as usize);
        // The tap comes after the output device's own inputs (a headset's mic).
        let (source, in_ch): (&[f32], usize) = match ins.last() {
            Some(b) if !b.data.is_null() => (std::slice::from_raw_parts(b.data as *const f32, b.size as usize / 4), b.channels as usize),
            _ => (&[], 0),
        };
        let outs = std::slice::from_raw_parts_mut(std::ptr::addr_of_mut!((*output).buffers).cast::<AudioBuffer>(), (*output).count as usize);
        for b in outs {
            if b.data.is_null() {
                continue;
            }
            let dest = std::slice::from_raw_parts_mut(b.data as *mut f32, b.size as usize / 4);
            rules::copy_scaled(source, in_ch, dest, b.channels as usize, gain);
        }
    }
    0
}

fn ns(text: &str) -> Retained<AnyObject> {
    Retained::into_super(Retained::into_super(NSString::from_str(text)))
}

fn yes() -> Retained<AnyObject> {
    Retained::into_super(Retained::into_super(Retained::into_super(NSNumber::new_bool(true))))
}

fn dict(pairs: Vec<(&str, Retained<AnyObject>)>) -> Retained<NSMutableDictionary<NSString, AnyObject>> {
    let d = NSMutableDictionary::<NSString, AnyObject>::new();
    for (key, value) in pairs {
        // SAFETY: an NSString key and an object value.
        unsafe { d.setObject_forKey(&value, ProtocolKey::of(&NSString::from_str(key))) };
    }
    d
}

/// NSMutableDictionary wants its key as NSCopying.
struct ProtocolKey;
impl ProtocolKey {
    fn of(key: &NSString) -> &objc2::runtime::ProtocolObject<dyn objc2_foundation::NSCopying> {
        objc2::runtime::ProtocolObject::from_ref(key)
    }
}

fn start_tap(objects: &[u32], output: &str, level: f32) -> Result<Tap, String> {
    let class = AnyClass::get(c"CATapDescription").ok_or("no process taps on this macOS")?;
    let numbers: Vec<Retained<NSNumber>> = objects.iter().map(|o| NSNumber::new_u32(*o)).collect();
    let list = NSArray::from_retained_slice(&numbers);
    // SAFETY: CATapDescription's own initializer and setters, with the types
    // the header gives.
    let (tap, uuid) = unsafe {
        let blank: Allocated<AnyObject> = msg_send![class, alloc];
        let description: Option<Retained<AnyObject>> = msg_send![blank, initStereoMixdownOfProcesses: &*list];
        let description = description.ok_or("tap description refused")?;
        let _: () = msg_send![&*description, setMuteBehavior: MUTED_WHEN_TAPPED];
        let _: () = msg_send![&*description, setPrivate: Bool::YES];
        let _: () = msg_send![&*description, setName: &*NSString::from_str("Notching volume")];
        let mut tap = 0u32;
        let status = AudioHardwareCreateProcessTap(Retained::as_ptr(&description) as *mut AnyObject, &mut tap);
        if status != 0 {
            return Err(format!("tap not made ({status})"));
        }
        let id: Retained<AnyObject> = msg_send![&*description, UUID];
        let text: Retained<NSString> = msg_send![&*id, UUIDString];
        (tap, text.to_string())
    };
    let sub = dict(vec![("uid", ns(output))]);
    let tap_entry = dict(vec![("uid", ns(&uuid)), ("drift", yes())]);
    let subs = NSArray::from_retained_slice(&[Retained::into_super(Retained::into_super(Retained::into_super(sub)))]);
    let taps = NSArray::from_retained_slice(&[Retained::into_super(Retained::into_super(Retained::into_super(tap_entry)))]);
    let aggregate = dict(vec![
        ("uid", ns(&format!("{}{uuid}", rules::OWN_UID))),
        ("name", ns("Notching volume")),
        ("private", yes()),
        ("tapautostart", yes()),
        ("master", ns(output)),
        ("subdevices", Retained::into_super(Retained::into_super(subs))),
        ("taps", Retained::into_super(Retained::into_super(taps))),
    ]);
    let gain = Box::into_raw(Box::new(AtomicU32::new(level.clamp(0.0, 1.0).to_bits())));
    let mut device = 0u32;
    let mut proc_id: *mut c_void = std::ptr::null_mut();
    // SAFETY: an NSDictionary is a CFDictionary; the gain outlives the proc.
    let status = unsafe {
        let s = AudioHardwareCreateAggregateDevice(Retained::as_ptr(&aggregate).cast(), &mut device);
        if s == 0 {
            let s = AudioDeviceCreateIOProcID(device, io_proc, gain.cast(), &mut proc_id);
            if s == 0 {
                AudioDeviceStart(device, proc_id)
            } else {
                s
            }
        } else {
            s
        }
    };
    let made = Tap { objects: objects.to_vec(), output: output.to_string(), tap, device, proc_id, gain };
    if status != 0 {
        stop_tap(made);
        return Err(format!("aggregate not started ({status})"));
    }
    Ok(made)
}

fn stop_tap(t: Tap) {
    // SAFETY: ids made by start_tap; the gain is freed after its proc is gone.
    unsafe {
        if t.device != 0 {
            if !t.proc_id.is_null() {
                AudioDeviceStop(t.device, t.proc_id);
                AudioDeviceDestroyIOProcID(t.device, t.proc_id);
            }
            AudioHardwareDestroyAggregateDevice(t.device);
        }
        if t.tap != 0 {
            AudioHardwareDestroyProcessTap(t.tap);
        }
        drop(Box::from_raw(t.gain as *mut AtomicU32));
    }
}

// ---- Permission: System Audio Recording ----

type Preflight = unsafe extern "C" fn(service: *const c_void, options: *const c_void) -> c_int;
type Request = unsafe extern "C" fn(service: *const c_void, options: *const c_void, done: &block2::DynBlock<dyn Fn(u8)>);

fn tcc() -> Option<&'static (Preflight, Request)> {
    static FNS: OnceLock<Option<(Preflight, Request)>> = OnceLock::new();
    FNS.get_or_init(|| {
        // SAFETY: TCC's two functions, looked up by name with the signatures
        // they have had since macOS 10.14.
        unsafe {
            let lib = dlopen(c"/System/Library/PrivateFrameworks/TCC.framework/TCC".as_ptr(), RTLD_LAZY);
            if lib.is_null() {
                return None;
            }
            let p = dlsym(lib, c"TCCAccessPreflight".as_ptr());
            let r = dlsym(lib, c"TCCAccessRequest".as_ptr());
            (!p.is_null() && !r.is_null())
                .then(|| (std::mem::transmute::<*mut c_void, Preflight>(p), std::mem::transmute::<*mut c_void, Request>(r)))
        }
    })
    .as_ref()
}

const SERVICE: &CStr = c"kTCCServiceAudioCapture";

/// "granted", "denied" or "unknown".
pub fn access() -> &'static str {
    let Some((preflight, _)) = tcc() else { return "unknown" };
    let service = NSString::from_str(SERVICE.to_str().unwrap_or_default());
    // SAFETY: an NSString is a CFString; no options.
    match unsafe { preflight(Retained::as_ptr(&service).cast(), std::ptr::null()) } {
        0 => "granted",
        1 => "denied",
        _ => "unknown",
    }
}

/// Asks once; after a refusal macOS asks no more, so System Settings opens.
pub fn request() {
    if access() == "denied" {
        let _ = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture")
            .spawn();
        return;
    }
    let Some((_, request)) = tcc() else { return };
    let service = NSString::from_str(SERVICE.to_str().unwrap_or_default());
    let done = RcBlock::new(|_granted: u8| wake());
    // SAFETY: an NSString is a CFString; the block is copied by TCC.
    unsafe { request(Retained::as_ptr(&service).cast(), std::ptr::null(), &done) };
}

// ---- The loop ----

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn levels() -> BTreeMap<String, f32> {
    LEVELS.lock().unwrap().clone().unwrap_or_default()
}

fn save() {
    let Some(path) = FILE.get() else { return };
    if let Ok(text) = serde_json::to_string(&levels()) {
        let _ = std::fs::write(path, text);
    }
}

fn wake() {
    *WAKE_LOCK.lock().unwrap() = true;
    WAKE.notify_one();
}

/// Makes the taps match the levels, the playing apps and the output.
fn sync(on: bool) {
    let mut taps = TAPS.lock().unwrap();
    if !on || access() != "granted" {
        for (_, t) in std::mem::take(&mut *taps) {
            stop_tap(t);
        }
        return;
    }
    let levels = levels();
    let found = scan();
    let processes: Vec<(String, u32)> =
        found.iter().flat_map(|(app, f)| f.objects.iter().map(move |o| (app.clone(), *o))).collect();
    let want = rules::wanted(&processes, &levels);
    let output = default_output().map(|(_, uid)| uid);
    let stale: Vec<String> = taps
        .iter()
        .filter(|(app, t)| want.get(*app) != Some(&t.objects) || output.as_deref() != Some(t.output.as_str()))
        .map(|(app, _)| app.clone())
        .collect();
    for app in stale {
        if let Some(t) = taps.remove(&app) {
            stop_tap(t);
        }
    }
    let Some(output) = output else { return };
    for (app, objects) in want {
        let level = levels.get(&app).copied().unwrap_or(1.0);
        match taps.get(&app) {
            // SAFETY: the gain lives as long as its tap.
            Some(t) => unsafe { (*t.gain).store(level.to_bits(), Ordering::Relaxed) },
            None => match start_tap(&objects, &output, level) {
                Ok(t) => {
                    taps.insert(app, t);
                }
                Err(e) => eprintln!("notching: volume of {app}: {e}"),
            },
        }
    }
}

pub fn start(app: &AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let path = dir.join("app-volume.json");
        let saved: BTreeMap<String, f32> =
            std::fs::read_to_string(&path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        *LEVELS.lock().unwrap() = Some(saved);
        let _ = FILE.set(path);
    }
    let app = app.clone();
    std::thread::Builder::new()
        .name("app-volume".into())
        .spawn(move || loop {
            sync(enabled(&app));
            let woken = WAKE_LOCK.lock().unwrap();
            let (mut woken, _) = WAKE.wait_timeout_while(woken, TICK, |w| !*w).unwrap();
            *woken = false;
        })
        .ok();
}

/// One row on the card. Same shape as AppRow in modules/volume-app/view.ts.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDto {
    pub app: String,
    pub name: String,
    pub icon: Option<String>,
    pub level: f32,
    pub playing: bool,
}

/// The Mac's own volume, on the current output. Same shape as MainRow in
/// modules/volume-app/view.ts.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainDto {
    pub name: String,
    pub level: f32,
    pub muted: bool,
    /// False for an output whose volume is set on the device (HDMI, some DACs).
    pub settable: bool,
}

/// A speaker the sound can go to. Same shape as OutputRow in
/// modules/volume-app/view.ts.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputDto {
    pub uid: String,
    pub name: String,
    pub kind: rules::OutputKind,
    pub current: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeView {
    pub access: &'static str,
    pub main: Option<MainDto>,
    pub outputs: Vec<OutputDto>,
    pub apps: Vec<AppDto>,
}

/// Every device that can play the Mac's sound, as Sound settings lists them:
/// output streams, allowed as the default, not hidden, not our own taps.
fn outputs() -> Vec<(u32, OutputDto)> {
    let current = get::<u32>(SYSTEM, DEFAULT_OUTPUT);
    ids(SYSTEM, DEVICES, GLOBAL)
        .into_iter()
        .filter(|&d| !ids(d, STREAMS, OUTPUT).is_empty())
        .filter(|&d| get_in::<u32>(d, CAN_BE_DEFAULT, OUTPUT).is_none_or(|v| v != 0))
        .filter(|&d| get::<u32>(d, HIDDEN).is_none_or(|v| v == 0))
        .filter_map(|d| {
            let uid = text_of(d, DEVICE_UID)?;
            if rules::is_ours(&uid) {
                return None;
            }
            let name = text_of(d, NAME).unwrap_or_else(|| uid.clone());
            let kind = rules::output_kind(get::<u32>(d, TRANSPORT).unwrap_or(0));
            Some((d, OutputDto { uid, name, kind, current: current == Some(d) }))
        })
        .collect()
}

#[derive(serde::Deserialize)]
pub struct OutputArgs {
    pub uid: String,
}

/// Sends the Mac's sound to that speaker. Alerts move with it when they were
/// on the old one, as Sound settings does by default. Taps follow on the next
/// look, woken now.
pub fn set_output(a: &OutputArgs) {
    let Some((device, _)) = outputs().into_iter().find(|(_, o)| o.uid == a.uid) else { return };
    let old = get::<u32>(SYSTEM, DEFAULT_OUTPUT);
    let alerts = get::<u32>(SYSTEM, SYSTEM_OUTPUT);
    let status = set_global(SYSTEM, DEFAULT_OUTPUT, device);
    if status != 0 {
        eprintln!("notching: volume app: output not changed ({status})");
        return;
    }
    if old.is_some() && alerts == old {
        set_global(SYSTEM, SYSTEM_OUTPUT, device);
    }
    wake();
}

fn main_volume() -> Option<MainDto> {
    let (device, _) = default_output()?;
    let name = text_of(device, NAME).unwrap_or_default();
    let (has, settable) = output_property(device, MAIN_VOLUME);
    let level = if has { get_in::<f32>(device, MAIN_VOLUME, OUTPUT).unwrap_or(1.0) } else { 1.0 };
    let muted = get_in::<u32>(device, MUTE, OUTPUT).is_some_and(|m| m != 0);
    Some(MainDto { name, level: level.clamp(0.0, 1.0), muted, settable })
}

#[derive(serde::Deserialize)]
pub struct MainArgs {
    pub level: Option<f32>,
    pub muted: Option<bool>,
}

/// The Mac's own volume and mute, as the volume keys would set them.
pub fn set_main(a: &MainArgs) {
    let Some((device, _)) = default_output() else { return };
    let muted_now = get_in::<u32>(device, MUTE, OUTPUT).is_some_and(|m| m != 0);
    let (level, muted) = rules::main_writes(muted_now, a.level, a.muted);
    if let Some(level) = level {
        let status = set_output_prop(device, MAIN_VOLUME, level);
        if status != 0 {
            eprintln!("notching: volume app: main volume refused ({status})");
        }
    }
    if let Some(muted) = muted {
        if output_property(device, MUTE).1 {
            set_output_prop(device, MUTE, u32::from(muted));
        }
    }
}

fn icon(app: &str, pid: i32) -> Option<String> {
    let mut icons = ICONS.lock().unwrap();
    let icons = icons.get_or_insert_with(HashMap::new);
    icons.entry(app.to_string()).or_insert_with(|| crate::peek_service::app_icon(pid)).clone()
}

/// Apps playing now, and apps turned down that are running, by name.
pub fn read() -> VolumeView {
    let levels = levels();
    let mut apps: Vec<AppDto> = scan()
        .into_iter()
        .filter(|(app, f)| f.playing || levels.get(app).is_some_and(|l| *l < 1.0))
        .map(|(app, f)| AppDto {
            name: rules::app_name(&app),
            icon: icon(&app, f.pid),
            level: levels.get(&app).copied().unwrap_or(1.0),
            playing: f.playing,
            app,
        })
        .collect();
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    let outputs = outputs().into_iter().map(|(_, o)| o).collect();
    VolumeView { access: access(), main: main_volume(), outputs, apps }
}

#[derive(serde::Deserialize)]
pub struct SetArgs {
    pub app: String,
    pub level: f32,
}

/// The level at once for a running tap; a new tap on the next look, made now.
pub fn set(a: &SetArgs) {
    let level = a.level.clamp(0.0, 1.0);
    {
        let mut levels = LEVELS.lock().unwrap();
        let levels = levels.get_or_insert_with(BTreeMap::new);
        if level >= 1.0 {
            levels.remove(&a.app);
        } else {
            levels.insert(a.app.clone(), level);
        }
    }
    if let Some(t) = TAPS.lock().unwrap().get(&a.app) {
        // SAFETY: the gain lives as long as its tap.
        unsafe { (*t.gain).store(level.to_bits(), Ordering::Relaxed) };
    }
    save();
    wake();
}

/// Off or uninstalled: every app sounds as before.
pub fn module_changed(id: &str) {
    if id == MODULE_ID {
        wake();
    }
}

pub fn quitting() {
    sync(false);
}
