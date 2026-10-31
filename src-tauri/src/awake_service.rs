//! Runs Keep awake in the core, so it lasts while the panel and the module page
//! are closed: holds the power assertion, shows the time left beside the notch,
//! and ends the run with a notice.

use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::awake::{Awake, AwakeDto, Step, WAIT_MAX_MS};
use crate::awake_hold::Hold;
use crate::status::{self, Activity};

struct Service {
    awake: Awake,
    hold: Option<Hold>,
}

/// The run and its assertion, plus the signal that wakes the thread at once.
pub struct AwakeState {
    service: Mutex<Service>,
    poked: Arc<(Mutex<bool>, Condvar)>,
}

fn now() -> i64 {
    chrono::Local::now().timestamp_millis()
}

fn poke(state: &AwakeState) {
    let (lock, cvar) = &*state.poked;
    *lock.lock().unwrap() = true;
    cvar.notify_one();
}

pub fn start(app: AppHandle) {
    let poked = Arc::new((Mutex::new(false), Condvar::new()));
    app.manage(AwakeState { service: Mutex::new(Service { awake: Awake::default(), hold: None }), poked: poked.clone() });
    let spawned = std::thread::Builder::new().name("notching-awake".into()).spawn(move || loop {
        let ms = tick(&app);
        let (lock, cvar) = &*poked;
        let mut was_poked = lock.lock().unwrap();
        if !*was_poked {
            was_poked = cvar.wait_timeout(was_poked, Duration::from_millis(ms as u64)).unwrap().0;
        }
        *was_poked = false;
    });
    if let Err(e) = spawned {
        eprintln!("notching: keep awake did not start: {e}");
    }
}

// Ends a run that is due or shows its time left, and says how long to wait.
// No lock is held while posting.
fn tick(app: &AppHandle) -> i64 {
    let step = {
        let state = app.state::<AwakeState>();
        let mut service = state.service.lock().unwrap();
        let step = service.awake.step(now());
        if matches!(step, Step::Ended(_)) {
            service.hold = None;
        }
        step
    };
    match step {
        Step::Off => WAIT_MAX_MS,
        Step::Ended(owner) => {
            finish(app, &owner);
            WAIT_MAX_MS
        }
        Step::Clear(owner) => {
            status::clear(app, &owner);
            WAIT_MAX_MS
        }
        Step::On { owner, text, wait_ms } => {
            if let Err(e) = status::set(app, &owner, Activity::On, Some(&text)) {
                eprintln!("notching: keep awake status: {e}");
            }
            wait_ms
        }
    }
}

// A run that ended: its status goes and the notice comes.
fn finish(app: &AppHandle, owner: &str) {
    status::clear(app, owner);
    let (title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.module_text(owner, "notice.done.title"), core.module_text(owner, "notice.done.detail"))
    };
    let title = title.unwrap_or_else(|| "Keep awake".into());
    if let Err(e) = crate::notify::post(app, owner, "done", &title, detail.as_deref().unwrap_or("")) {
        eprintln!("notching: the keep awake notice was not sent: {e}");
    }
}

// Ends a run that is past its end before a call looks at it: after the Mac
// wakes, the thread may not have looked yet. Call with the service lock held;
// the owner it returns goes to `finish` once the lock is let go.
fn settle(service: &mut Service, now: i64) -> Option<String> {
    let ended = service.awake.end_if_due(now);
    if ended.is_some() {
        service.hold = None;
    }
    ended
}

// The thread takes down any status a round set after `finish` cleared it.
fn after(app: &AppHandle, ended: Option<String>) {
    if let Some(owner) = ended {
        finish(app, &owner);
        poke(&app.state::<AwakeState>());
    }
}

pub fn read(app: &AppHandle) -> AwakeDto {
    let state = app.state::<AwakeState>();
    let (ended, view) = {
        let mut service = state.service.lock().unwrap();
        let now = now();
        (settle(&mut service, now), service.awake.view(now))
    };
    after(app, ended);
    view
}

/// `None` has no limit. Takes the assertion only when none is held; when macOS
/// refuses it, Keep awake stays off.
pub fn turn_on(app: &AppHandle, owner: &str, minutes: Option<u32>) -> Result<AwakeDto, String> {
    let state = app.state::<AwakeState>();
    let (ended, view) = {
        let mut service = state.service.lock().unwrap();
        let ended = settle(&mut service, now());
        let mut next = service.awake.clone();
        let started = next.start(owner, now(), minutes).map_err(|e| e.to_string()).and_then(|()| {
            if service.hold.is_none() {
                service.hold = Some(Hold::take().ok_or("the Mac did not allow staying awake")?);
            }
            Ok(())
        });
        if started.is_ok() {
            service.awake = next;
        }
        (ended, started.map(|()| service.awake.view(now())))
    };
    after(app, ended);
    poke(&state);
    view
}

pub fn extend(app: &AppHandle, minutes: u32) -> Result<AwakeDto, String> {
    let state = app.state::<AwakeState>();
    let (ended, view) = {
        let mut service = state.service.lock().unwrap();
        let ended = settle(&mut service, now());
        let added = service.awake.add(now(), minutes).map_err(|e| e.to_string());
        (ended, added.map(|()| service.awake.view(now())))
    };
    after(app, ended);
    poke(&state);
    view
}

/// No notice: the person turned it off.
pub fn turn_off(app: &AppHandle) -> AwakeDto {
    let state = app.state::<AwakeState>();
    let (owner, view) = {
        let mut service = state.service.lock().unwrap();
        let owner = service.awake.stop();
        service.hold = None;
        (owner, service.awake.view(now()))
    };
    if let Some(owner) = owner {
        status::clear(app, &owner);
    }
    poke(&state);
    view
}

/// The module was switched off or uninstalled: its run ends with it.
pub fn module_gone(app: &AppHandle, id: &str) {
    let owns = app.state::<AwakeState>().service.lock().unwrap().awake.owner() == Some(id);
    if owns {
        turn_off(app);
    }
}
