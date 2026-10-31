//! Runs Timer in the core, so it lasts while the panel, the strip and the module
//! page are closed: shows the time left beside the notch every second and ends
//! the timer with a notice. Keep awake's service without the power assertion.

use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;
use crate::status::{self, Activity};
use crate::timer::{Step, Timer, TimerDto, WAIT_MAX_MS};

/// The timer, plus the signal that wakes the thread at once.
pub struct TimerService {
    timer: Mutex<Timer>,
    poked: Arc<(Mutex<bool>, Condvar)>,
}

fn now() -> i64 {
    chrono::Local::now().timestamp_millis()
}

fn poke(state: &TimerService) {
    let (lock, cvar) = &*state.poked;
    *lock.lock().unwrap() = true;
    cvar.notify_one();
}

pub fn start(app: AppHandle) {
    let poked = Arc::new((Mutex::new(false), Condvar::new()));
    app.manage(TimerService { timer: Mutex::new(Timer::default()), poked: poked.clone() });
    let spawned = std::thread::Builder::new().name("notching-timer".into()).spawn(move || loop {
        let ms = tick(&app);
        let (lock, cvar) = &*poked;
        let mut was_poked = lock.lock().unwrap();
        if !*was_poked {
            was_poked = cvar.wait_timeout(was_poked, Duration::from_millis(ms as u64)).unwrap().0;
        }
        *was_poked = false;
    });
    if let Err(e) = spawned {
        eprintln!("notching: the timer did not start: {e}");
    }
}

// Ends a timer that is due or shows its time left, and says how long to wait.
// No lock is held while posting.
fn tick(app: &AppHandle) -> i64 {
    let step = app.state::<TimerService>().timer.lock().unwrap().step(now());
    match step {
        Step::Off => WAIT_MAX_MS,
        Step::Ended { owner, minutes } => {
            finish(app, &owner, minutes);
            WAIT_MAX_MS
        }
        Step::Clear(owner) => {
            status::clear(app, &owner);
            WAIT_MAX_MS
        }
        Step::On { owner, text, wait_ms } => {
            if let Err(e) = status::set(app, &owner, Activity::Running, Some(&text)) {
                eprintln!("notching: timer status: {e}");
            }
            wait_ms
        }
    }
}

// A timer that ended: its status goes and the notice comes.
fn finish(app: &AppHandle, owner: &str, minutes: u32) {
    status::clear(app, owner);
    let (title, detail) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        (core.module_text(owner, "notice.done.title"), core.module_text(owner, "notice.done.detail"))
    };
    let title = title.unwrap_or_else(|| "Timer".into());
    let detail = detail.unwrap_or_default().replace("{minutes}", &minutes.to_string());
    if let Err(e) = crate::notify::post(app, owner, "done", &title, &detail) {
        eprintln!("notching: the timer notice was not sent: {e}");
    }
}

// The thread takes down any status a round set after `finish` cleared it.
fn after(app: &AppHandle, ended: Option<(String, u32)>) {
    if let Some((owner, minutes)) = ended {
        finish(app, &owner, minutes);
        poke(&app.state::<TimerService>());
    }
}

// Ends a timer past its end before a call looks at it (the Mac just woke and
// the thread has not looked yet), runs `f` on it, and pokes the thread.
fn with<T>(app: &AppHandle, f: impl FnOnce(&mut Timer, i64) -> T) -> T {
    let state = app.state::<TimerService>();
    let (ended, out) = {
        let mut timer = state.timer.lock().unwrap();
        let now = now();
        let ended = timer.end_if_due(now);
        (ended, f(&mut timer, now))
    };
    after(app, ended);
    poke(&state);
    out
}

pub fn read(app: &AppHandle) -> TimerDto {
    with(app, |t, now| t.view(now))
}

/// A timer already running or paused is replaced.
pub fn begin(app: &AppHandle, owner: &str, minutes: u32) -> Result<TimerDto, String> {
    with(app, |t, now| t.start(owner, now, minutes).map(|()| t.view(now)).map_err(|e| e.to_string()))
}

pub fn pause(app: &AppHandle) -> Result<TimerDto, String> {
    with(app, |t, now| t.pause(now).map(|()| t.view(now)).map_err(|e| e.to_string()))
}

pub fn resume(app: &AppHandle) -> Result<TimerDto, String> {
    with(app, |t, now| t.resume(now).map(|()| t.view(now)).map_err(|e| e.to_string()))
}

/// No notice: the person stopped it.
pub fn stop(app: &AppHandle) -> TimerDto {
    let (owner, view) = with(app, |t, now| (t.stop(), t.view(now)));
    if let Some(owner) = owner {
        status::clear(app, &owner);
    }
    view
}

/// The module was switched off or uninstalled: its timer ends with it.
pub fn module_gone(app: &AppHandle, id: &str) {
    let owns = app.state::<TimerService>().timer.lock().unwrap().owner() == Some(id);
    if owns {
        stop(app);
    }
}
