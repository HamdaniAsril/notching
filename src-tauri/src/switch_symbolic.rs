//! macOS's own ⌘Tab (Intip jendela, owner's choice of 6 Nov): the window server
//! handles ⌘Tab before any event tap hears it, so while Notching's switcher
//! takes ⌘Tab or ⌘⇧Tab, the Mac's own switcher is turned off through SkyLight's
//! symbolic hot keys. Not documented by Apple (as AltTab does it); loaded at run
//! time, so a macOS without it still opens Notching. It is turned back on when
//! the switcher or the tool goes off, when Accessibility is taken away, when
//! Notching quits, and every time Notching opens, first of all, so a crash
//! never leaves it off for longer than until the next start.

use std::ffi::c_void;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Once, OnceLock};

type SetFn = unsafe extern "C" fn(hot_key: i32, enabled: bool) -> i32;

// CGSSymbolicHotKey: ⌘Tab and ⌘⇧Tab.
const COMMAND_TAB: i32 = 1;
const COMMAND_SHIFT_TAB: i32 = 2;

static SET: OnceLock<Option<SetFn>> = OnceLock::new();
static MISSING: Once = Once::new();
// Which of the two are off: bit 0 ⌘Tab, bit 1 ⌘⇧Tab.
static OFF: AtomicU8 = AtomicU8::new(0);

fn load() -> Option<SetFn> {
    // SAFETY: dlopen and dlsym with C strings; the symbol has this type in every
    // macOS that has it.
    unsafe {
        let lib = libc::dlopen(c"/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight".as_ptr(), libc::RTLD_LAZY);
        if lib.is_null() {
            return None;
        }
        [c"SLSSetSymbolicHotKeyEnabled", c"CGSSetSymbolicHotKeyEnabled"]
            .iter()
            .map(|n| libc::dlsym(lib, n.as_ptr()))
            .find(|p| !p.is_null())
            .map(|p| std::mem::transmute::<*mut c_void, SetFn>(p))
    }
}

/// macOS's own ⌘Tab and ⌘⇧Tab, each on or off. Safe from any thread.
pub fn set_native(cmd_tab: bool, cmd_shift_tab: bool) {
    let Some(set) = *SET.get_or_init(load) else {
        MISSING.call_once(|| eprintln!("notching: macOS's ⌘Tab cannot be switched (SkyLight symbol missing)"));
        return;
    };
    // SAFETY: two known hot key ids and a bool.
    unsafe {
        set(COMMAND_TAB, cmd_tab);
        set(COMMAND_SHIFT_TAB, cmd_shift_tab);
    }
    let off = u8::from(!cmd_tab) | u8::from(!cmd_shift_tab) << 1;
    if OFF.swap(off, Ordering::SeqCst) != off {
        let say = match off {
            0 => "back on",
            2 => "⌘⇧Tab off while the switcher takes it",
            _ => "off while the switcher takes it",
        };
        eprintln!("notching: macOS's ⌘Tab {say}");
    }
}

/// macOS's own ⌘Tab back on: at start, at quit, at uninstall, and whenever the
/// switcher lets go.
pub fn restore() {
    set_native(true, true);
}
