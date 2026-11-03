//! What Keep awake holds: while a Hold lives, the screen stays on and the machine
//! does not sleep. macOS uses an IOKit power assertion, Windows
//! SetThreadExecutionState, Linux a systemd-inhibit child process.

/// What `pmset -g assertions` shows next to the process (macOS); also the default
/// reason text elsewhere.
pub const HOLD_NAME: &str = "Notching keep awake";

#[cfg(target_os = "linux")]
pub use linux::Hold;
#[cfg(target_os = "macos")]
pub use mac::Hold;
#[cfg(target_os = "windows")]
pub use win::Hold;

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::c_void;

    use objc2_foundation::NSString;

    use super::HOLD_NAME;

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
            Self::take_named(HOLD_NAME)
        }

        /// The same hold under another name in `pmset -g assertions`.
        pub fn take_named(name: &str) -> Option<Hold> {
            let kind = NSString::from_str(HOLD_TYPE);
            let name = NSString::from_str(name);
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
}

/// SetThreadExecutionState belongs to the calling thread, so a Hold owns a thread
/// that sets it and parks on a channel; dropping the Hold closes the channel, the
/// thread clears the state and exits.
#[cfg(target_os = "windows")]
mod win {
    use std::sync::mpsc;
    use std::thread::JoinHandle;

    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }

    pub struct Hold {
        release: Option<mpsc::Sender<()>>,
        thread: Option<JoinHandle<()>>,
    }

    impl Hold {
        /// None when Windows refuses it or the thread cannot start.
        pub fn take() -> Option<Hold> {
            Self::take_named(super::HOLD_NAME)
        }

        /// Windows shows no per-hold name, so the name only labels the thread.
        pub fn take_named(name: &str) -> Option<Hold> {
            let (release, parked) = mpsc::channel::<()>();
            let (ready_tx, ready_rx) = mpsc::channel::<bool>();
            let thread = std::thread::Builder::new()
                .name(name.to_string())
                .spawn(move || {
                    // SAFETY: plain kernel32 call with flags only.
                    let ok = unsafe {
                        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED)
                    } != 0;
                    let _ = ready_tx.send(ok);
                    if !ok {
                        return;
                    }
                    // Returns Err once the Hold drops its sender.
                    let _ = parked.recv();
                    // SAFETY: as above; clears this thread's requirement.
                    unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
                })
                .ok()?;
            if ready_rx.recv().unwrap_or(false) {
                Some(Hold { release: Some(release), thread: Some(thread) })
            } else {
                let _ = thread.join();
                None
            }
        }
    }

    impl Drop for Hold {
        fn drop(&mut self) {
            drop(self.release.take());
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }
}

/// A `systemd-inhibit ... sleep infinity` child holds the inhibitor lock for as
/// long as it lives. Idle and sleep are blocked; on desktops where logind's idle
/// inhibitor does not stop the screensaver or screen blanking, the screen may
/// still turn off. That is accepted.
#[cfg(target_os = "linux")]
mod linux {
    use std::process::{Child, Command, Stdio};

    /// PATH lookup first, then the usual absolute location.
    const CANDIDATES: [&str; 2] = ["systemd-inhibit", "/usr/bin/systemd-inhibit"];

    pub struct Hold(Child);

    impl Hold {
        /// None when systemd-inhibit is missing or cannot start.
        pub fn take() -> Option<Hold> {
            Self::take_named(super::HOLD_NAME)
        }

        /// The same hold under another reason text in `systemd-inhibit --list`.
        pub fn take_named(name: &str) -> Option<Hold> {
            CANDIDATES.iter().find_map(|bin| spawn(bin, name)).map(Hold)
        }
    }

    fn spawn(bin: &str, why: &str) -> Option<Child> {
        Command::new(bin)
            .args(["--what=idle:sleep", "--who=Notching"])
            .arg(format!("--why={why}"))
            .args(["--mode=block", "sleep", "infinity"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()
    }

    impl Drop for Hold {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn taking_and_dropping_a_hold_does_not_panic() {
        // None is fine on a host that refuses (CI without logind); a Some must drop cleanly.
        drop(Hold::take_named("Notching test hold"));
    }

    #[cfg(target_os = "macos")]
    fn pmset() -> String {
        let out = std::process::Command::new("pmset").args(["-g", "assertions"]).output().unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    #[cfg(target_os = "macos")]
    fn mine(out: &str) -> bool {
        let pid = format!("pid {}(", std::process::id());
        out.lines().any(|l| l.contains(&pid) && l.contains(HOLD_NAME))
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_hold_shows_in_pmset_until_dropped() {
        let hold = Hold::take().expect("assertion");
        assert!(mine(&pmset()));
        drop(hold);
        assert!(!mine(&pmset()));
    }
}
