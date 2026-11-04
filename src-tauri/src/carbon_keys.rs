//! Carbon hot keys, shared by Screenshot's keys and Atur jendela: the calls,
//! the types they take, and reading which hot key an event is for.

use std::ffi::c_void;

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    pub fn GetApplicationEventTarget() -> *mut c_void;
    pub fn InstallEventHandler(
        target: *mut c_void,
        handler: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i32,
        num_types: usize,
        types: *const EventTypeSpec,
        user_data: *mut c_void,
        out_ref: *mut *mut c_void,
    ) -> i32;
    pub fn RegisterEventHotKey(
        key_code: u32,
        modifiers: u32,
        id: EventHotKeyID,
        target: *mut c_void,
        options: u32,
        out_ref: *mut *mut c_void,
    ) -> i32;
    pub fn UnregisterEventHotKey(hot_key: *mut c_void) -> i32;
    pub fn GetEventParameter(
        event: *mut c_void,
        name: u32,
        desired_type: u32,
        actual_type: *mut u32,
        size: usize,
        actual_size: *mut usize,
        data: *mut c_void,
    ) -> i32;
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct EventHotKeyID {
    pub signature: u32,
    pub id: u32,
}

#[repr(C)]
pub struct EventTypeSpec {
    pub event_class: u32,
    pub event_kind: u32,
}

pub const EVENT_CLASS_KEYBOARD: u32 = u32::from_be_bytes(*b"keyb"); // kEventClassKeyboard
pub const EVENT_HOT_KEY_PRESSED: u32 = 5; // kEventHotKeyPressed
pub const PARAM_DIRECT_OBJECT: u32 = u32::from_be_bytes(*b"----"); // kEventParamDirectObject
pub const TYPE_HOT_KEY_ID: u32 = u32::from_be_bytes(*b"hkid"); // typeEventHotKeyID
pub const NO_ERR: i32 = 0;
pub const EVENT_NOT_HANDLED: i32 = -9874; // eventNotHandledErr

/// The hot key a kEventHotKeyPressed event is for; None when it can't be read.
pub fn hot_key_id(event: *mut c_void) -> Option<EventHotKeyID> {
    let mut id = EventHotKeyID { signature: 0, id: 0 };
    // SAFETY: `id` is an EventHotKeyID, as large as the size passed.
    let status = unsafe {
        GetEventParameter(
            event,
            PARAM_DIRECT_OBJECT,
            TYPE_HOT_KEY_ID,
            std::ptr::null_mut(),
            std::mem::size_of::<EventHotKeyID>(),
            std::ptr::null_mut(),
            &mut id as *mut EventHotKeyID as *mut c_void,
        )
    };
    (status == NO_ERR).then_some(id)
}

/// Installs `handler` for hot key presses on the app's event target. Main thread.
pub fn install_handler(handler: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i32) -> i32 {
    let types = [EventTypeSpec { event_class: EVENT_CLASS_KEYBOARD, event_kind: EVENT_HOT_KEY_PRESSED }];
    // SAFETY: the handler is a plain function and `types` outlives the call.
    unsafe {
        InstallEventHandler(
            GetApplicationEventTarget(),
            handler,
            types.len(),
            types.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    }
}

/// Registers one hot key on the app's event target; None when macOS refuses it
/// (another app holds it). Main thread.
pub fn register(code: u32, mods: u32, signature: u32, id: u32) -> Option<*mut c_void> {
    let mut hot_key = std::ptr::null_mut();
    let id = EventHotKeyID { signature, id };
    // SAFETY: `hot_key` receives the ref, which stays valid until unregistered.
    let status = unsafe { RegisterEventHotKey(code, mods, id, GetApplicationEventTarget(), 0, &mut hot_key) };
    (status == NO_ERR && !hot_key.is_null()).then_some(hot_key)
}

/// Lets go of a hot key `register` gave. Main thread.
pub fn unregister(hot_key: *mut c_void) {
    // SAFETY: a ref RegisterEventHotKey gave; callers unregister each once.
    unsafe { UnregisterEventHotKey(hot_key) };
}
