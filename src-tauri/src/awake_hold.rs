//! The macOS power assertion behind Keep awake: while a Hold lives, the screen
//! stays on and the Mac does not sleep.

use std::ffi::c_void;

use objc2_foundation::NSString;

/// What `pmset -g assertions` shows next to the process.
pub const HOLD_NAME: &str = "Notching keep awake";
// The owner chose the screen on, not only the Mac awake (design 31 Oct §2); this
// type keeps the system awake as well.
const HOLD_TYPE: &str = "PreventUserIdleDisplaySleep";
const LEVEL_ON: u32 = 255; // kIOPMAssertionLevelOn

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    // The CFStringRef arguments take an NSString: the two are toll-free bridged.
    fn IOPMAssertionCreateWithName(kind: *const c_void, level: u32, name: *const c_void, id: *mut u32) -> i32;
    fn IOPMAssertionRelease(id: u32) -> i32;
}

/// One assertion, released when dropped.
pub struct Hold(u32);

impl Hold {
    /// None when macOS refuses it.
    pub fn take() -> Option<Hold> {
        let kind = NSString::from_str(HOLD_TYPE);
        let name = NSString::from_str(HOLD_NAME);
        let mut id = 0;
        // SAFETY: both strings outlive the call, and `id` is a valid out pointer.
        let status = unsafe {
            IOPMAssertionCreateWithName(
                objc2::rc::Retained::as_ptr(&kind).cast(),
                LEVEL_ON,
                objc2::rc::Retained::as_ptr(&name).cast(),
                &mut id,
            )
        };
        (status == 0).then_some(Hold(id))
    }
}

impl Drop for Hold {
    fn drop(&mut self) {
        // SAFETY: the id came from IOPMAssertionCreateWithName and is released once.
        unsafe {
            IOPMAssertionRelease(self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pmset() -> String {
        let out = std::process::Command::new("pmset").args(["-g", "assertions"]).output().unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    fn mine(out: &str) -> bool {
        let pid = format!("pid {}(", std::process::id());
        out.lines().any(|l| l.contains(&pid) && l.contains(HOLD_NAME))
    }

    #[test]
    fn a_hold_shows_in_pmset_until_dropped() {
        let hold = Hold::take().expect("assertion");
        assert!(mine(&pmset()));
        drop(hold);
        assert!(!mine(&pmset()));
    }
}
