//! Now Playing for the `musik` package (design 3 Nov, §2).
//!
//! Since macOS 15.4 a normal app gets an empty Now Playing, so a helper runs in
//! the system perl, as the owner chose knowing an update can close it (3 Nov,
//! "kerjakan cara 3 saja"): `/usr/bin/perl np.pl libnotching-media.dylib`. It
//! writes JSON lines and takes play, pause and skip words on stdin.
//!
//! At most one helper, only while the package is on. When it dies or goes quiet
//! it is started again after 1, 2, 4 … 30 s; it is killed when the package goes
//! and at quit, and it exits by itself when its stdin closes. Nothing is written
//! to disk or sent anywhere.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command as Process, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::app_core::CoreState;

pub const MODULE_ID: &str = "musik";

const PERL: &str = "/usr/bin/perl";
/// The helper writes at least every 10 s: this long without a line, it hung.
const SILENCE: Duration = Duration::from_secs(30);
/// A helper that ran this long starts the waits from 1 s again.
const STEADY: Duration = Duration::from_secs(60);
const LONGEST_WAIT_S: u64 = 30;

/// One line of the helper. With nothing playing every field is null and `rate` 0.
#[derive(Clone, Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct NowPlaying {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    /// Seconds.
    pub duration: Option<f64>,
    /// Seconds, as of `at`.
    pub elapsed: Option<f64>,
    /// 0 while paused.
    #[serde(default)]
    pub rate: f64,
    /// Milliseconds since the epoch.
    #[serde(default)]
    pub at: i64,
    /// The source app's bundle id.
    pub app: Option<String>,
    /// A `data:image/…;base64,…` URL, at most 128 px on its long side.
    pub art: Option<String>,
}

/// `media.now`: `on` is false while no helper runs or it has said nothing yet.
#[derive(serde::Serialize)]
pub struct NowDto {
    #[serde(flatten)]
    now: NowPlaying,
    on: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Command {
    Toggle,
    Play,
    Pause,
    Next,
    Prev,
}

impl Command {
    /// The word the helper reads.
    pub fn word(self) -> &'static str {
        match self {
            Command::Toggle => "toggle",
            Command::Play => "play",
            Command::Pause => "pause",
            Command::Next => "next",
            Command::Prev => "prev",
        }
    }
}

/// `media.command`'s one argument.
pub fn parse_command(args: Option<&serde_json::Value>) -> Result<Command, String> {
    match args.and_then(serde_json::Value::as_str) {
        Some("toggle") => Ok(Command::Toggle),
        Some("play") => Ok(Command::Play),
        Some("pause") => Ok(Command::Pause),
        Some("next") => Ok(Command::Next),
        Some("prev") => Ok(Command::Prev),
        _ => Err("media.command takes toggle, play, pause, next or prev".into()),
    }
}

/// A line that is not the helper's JSON is skipped.
fn parse_line(line: &[u8]) -> Option<NowPlaying> {
    let text = std::str::from_utf8(line).ok()?.trim();
    let mut now: NowPlaying = serde_json::from_str(text).ok()?;
    if now.art.as_deref().is_some_and(|a| !a.starts_with("data:image/")) {
        now.art = None;
    }
    Some(now)
}

/// The wait before the next start: 1, 2, 4, 8, 16, then 30 s.
fn backoff(attempt: u32) -> Duration {
    Duration::from_secs(1u64.checked_shl(attempt).unwrap_or(u64::MAX).min(LONGEST_WAIT_S))
}

struct Helper {
    child: Child,
    stdin: ChildStdin,
}

impl Helper {
    fn spawn(script: &Path, lib: &Path) -> std::io::Result<(Helper, ChildStdout)> {
        for file in [script, lib] {
            if !file.is_file() {
                return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("{} is missing", file.display())));
            }
        }
        let mut child = Process::new(PERL)
            .arg(script)
            .arg(lib)
            // Nothing from the environment may load into the helper's perl.
            .env_remove("PERL5OPT")
            .env_remove("PERL5LIB")
            .env_remove("PERLLIB")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        match (child.stdin.take(), child.stdout.take()) {
            (Some(stdin), Some(stdout)) => Ok((Helper { child, stdin }, stdout)),
            _ => {
                Helper::end(child);
                Err(std::io::Error::other("the helper has no pipes"))
            }
        }
    }

    fn end(mut child: Child) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[derive(Default)]
struct Control {
    /// Bumped at every switch on and off: a supervisor of an older run stops.
    run: u64,
    on: bool,
    helper: Option<Helper>,
    latest: Option<NowPlaying>,
}

type Shared = Arc<(Mutex<Control>, Condvar)>;

pub struct MediaService(Shared);

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

fn helper_files(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
    match app.path().resource_dir() {
        Ok(dir) => Some((dir.join("media/np.pl"), dir.join("media/libnotching-media.dylib"))),
        Err(e) => {
            eprintln!("notching: no resource folder for the music helper: {e}");
            None
        }
    }
}

pub fn start(app: &AppHandle) {
    app.manage(MediaService(Arc::new((Mutex::new(Control::default()), Condvar::new()))));
    if enabled(app) {
        switch_on(app);
    }
}

/// The package was switched back on or reinstalled.
pub fn module_on(app: &AppHandle, id: &str) {
    if id == MODULE_ID && enabled(app) {
        switch_on(app);
    }
}

/// The package was switched off or uninstalled: its helper goes with it.
pub fn module_gone(app: &AppHandle, id: &str) {
    if id == MODULE_ID {
        switch_off(&app.state::<MediaService>().0);
    }
}

/// As Notching quits: no perl is left behind.
pub fn quitting(app: &AppHandle) {
    if let Some(service) = app.try_state::<MediaService>() {
        switch_off(&service.0);
    }
}

pub fn now(app: &AppHandle) -> NowDto {
    let service = app.state::<MediaService>();
    let control = service.0.0.lock().unwrap();
    match &control.latest {
        Some(now) => NowDto { now: now.clone(), on: true },
        None => NowDto { now: NowPlaying::default(), on: false },
    }
}

pub fn send(app: &AppHandle, command: Command) -> Result<serde_json::Value, String> {
    let service = app.state::<MediaService>();
    let mut control = service.0.0.lock().unwrap();
    let helper = control.helper.as_mut().ok_or("the music helper is not running")?;
    writeln!(helper.stdin, "{}", command.word())
        .and_then(|()| helper.stdin.flush())
        .map_err(|e| format!("the music helper did not take the command: {e}"))?;
    Ok(serde_json::json!({ "ok": true }))
}

fn switch_on(app: &AppHandle) {
    if let Some((script, lib)) = helper_files(app) {
        begin(&app.state::<MediaService>().0, script, lib);
    }
}

fn begin(shared: &Shared, script: PathBuf, lib: PathBuf) {
    let run = {
        let mut control = shared.0.lock().unwrap();
        if control.on {
            return;
        }
        control.on = true;
        control.run += 1;
        control.run
    };
    let handle = Arc::clone(shared);
    let spawned = std::thread::Builder::new()
        .name("notching-media".into())
        .spawn(move || supervise(&handle, run, &script, &lib));
    if let Err(e) = spawned {
        eprintln!("notching: the music helper did not start: {e}");
        shared.0.lock().unwrap().on = false;
    }
}

fn switch_off(shared: &Shared) {
    let gone = {
        let mut control = shared.0.lock().unwrap();
        if !control.on {
            return;
        }
        control.on = false;
        control.run += 1;
        control.latest = None;
        control.helper.take()
    };
    shared.1.notify_all();
    if let Some(helper) = gone {
        Helper::end(helper.child);
    }
}

// Keeps one helper running for `run`, until a switch off or on starts another.
fn supervise(shared: &Shared, run: u64, script: &Path, lib: &Path) {
    let (lock, wake) = &**shared;
    let mut attempt = 0;
    loop {
        let started = Instant::now();
        // Started and stored under the lock, so a switch off cannot miss it.
        let stdout = {
            let mut control = lock.lock().unwrap();
            if control.run != run {
                return;
            }
            match Helper::spawn(script, lib) {
                Ok((helper, stdout)) => {
                    control.helper = Some(helper);
                    Some(stdout)
                }
                Err(e) => {
                    eprintln!("notching: the music helper did not start: {e}");
                    None
                }
            }
        };
        if let Some(stdout) = stdout {
            listen(shared, run, stdout);
        }
        let gone = {
            let mut control = lock.lock().unwrap();
            if control.run != run {
                return;
            }
            control.latest = None;
            control.helper.take()
        };
        if let Some(helper) = gone {
            Helper::end(helper.child);
        }
        if started.elapsed() >= STEADY {
            attempt = 0;
        }
        let wait = backoff(attempt);
        attempt = attempt.saturating_add(1);
        let control = lock.lock().unwrap();
        let (control, _) = wake.wait_timeout_while(control, wait, |c| c.run == run).unwrap();
        if control.run != run {
            return;
        }
    }
}

// Stores each good line until the helper's stdout closes. A helper silent for
// SILENCE is killed, which closes it.
fn listen(shared: &Shared, run: u64, stdout: ChildStdout) {
    let (lines, incoming) = mpsc::channel::<Vec<u8>>();
    let reader = std::thread::Builder::new().name("notching-media-read".into()).spawn(move || {
        let mut out = BufReader::new(stdout);
        loop {
            let mut line = Vec::new();
            match out.read_until(b'\n', &mut line) {
                Ok(0) | Err(_) => return,
                Ok(_) if lines.send(line).is_err() => return,
                Ok(_) => {}
            }
        }
    });
    if let Err(e) = reader {
        eprintln!("notching: the music helper cannot be read: {e}");
        return;
    }
    loop {
        match incoming.recv_timeout(SILENCE) {
            Ok(line) => {
                let Some(now) = parse_line(&line) else { continue };
                let mut control = shared.0.lock().unwrap();
                if control.run == run {
                    control.latest = Some(now);
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                eprintln!("notching: the music helper went quiet; starting it again");
                let mut control = shared.0.lock().unwrap();
                if control.run == run
                    && let Some(helper) = control.helper.as_mut()
                {
                    let _ = helper.child.kill();
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_good_line_is_read() {
        let line = br#"{"title":"Jalan Braga","artist":"Kolektif Senja","album":null,"duration":228.0,"elapsed":134.5,"rate":1,"at":1762149600000,"app":"com.apple.Music","art":"data:image/jpeg;base64,AAAA"}"#;
        let now = parse_line(line).unwrap();
        assert_eq!(now.title.as_deref(), Some("Jalan Braga"));
        assert_eq!(now.artist.as_deref(), Some("Kolektif Senja"));
        assert_eq!(now.album, None);
        assert_eq!(now.duration, Some(228.0));
        assert_eq!(now.elapsed, Some(134.5));
        assert_eq!(now.rate, 1.0);
        assert_eq!(now.at, 1_762_149_600_000);
        assert_eq!(now.app.as_deref(), Some("com.apple.Music"));
        assert_eq!(now.art.as_deref(), Some("data:image/jpeg;base64,AAAA"));
    }

    #[test]
    fn a_bad_line_is_skipped() {
        assert_eq!(parse_line(b"perl: warning: something"), None);
        assert_eq!(parse_line(b"{\"title\":"), None);
        assert_eq!(parse_line(b"[1,2,3]"), None);
        assert_eq!(parse_line(&[0xff, 0xfe, b'{', b'}']), None);
        assert_eq!(parse_line(b""), None);
    }

    #[test]
    fn the_nothing_playing_line() {
        let line = br#"{"title":null,"artist":null,"album":null,"duration":null,"elapsed":null,"rate":0,"at":1762149600000,"app":null,"art":null}"#;
        let now = parse_line(line).unwrap();
        assert_eq!(now, NowPlaying { at: 1_762_149_600_000, ..NowPlaying::default() });
    }

    #[test]
    fn art_that_is_not_a_picture_is_dropped() {
        let line = br#"{"title":"x","rate":1,"at":1,"art":"javascript:alert(1)"}"#;
        assert_eq!(parse_line(line).unwrap().art, None);
    }

    #[test]
    fn the_line_ends_are_trimmed() {
        assert_eq!(parse_line(b"{\"title\":\"x\",\"rate\":0,\"at\":1}\r\n").unwrap().title.as_deref(), Some("x"));
    }

    #[test]
    fn the_restart_waits_grow_to_30_seconds() {
        let waits: Vec<u64> = (0..7).map(|n| backoff(n).as_secs()).collect();
        assert_eq!(waits, vec![1, 2, 4, 8, 16, 30, 30]);
        assert_eq!(backoff(100), Duration::from_secs(30));
    }

    // A stand-in helper in the same perl: it says one line, then echoes commands
    // as titles until its stdin closes.
    const ECHO: &str = r#"$| = 1; open(my $log, '>>', $ARGV[0]); print $log "start\n"; close $log;
print qq({"title":"first","rate":1,"at":1}\n);
while (my $w = <STDIN>) { chomp $w; print qq({"title":"$w","rate":1,"at":2}\n); }"#;

    fn fake(dir: &Path, body: &str) -> (PathBuf, PathBuf) {
        let script = dir.join("fake.pl");
        std::fs::write(&script, body).unwrap();
        // Stands where the library goes, which must exist.
        let log = dir.join("starts.log");
        std::fs::write(&log, "").unwrap();
        (script, log)
    }

    fn shared() -> Shared {
        Arc::new((Mutex::new(Control::default()), Condvar::new()))
    }

    fn wait_for(what: &str, mut ok: impl FnMut() -> bool) {
        let start = Instant::now();
        while !ok() {
            assert!(start.elapsed() < Duration::from_secs(10), "timed out waiting for {what}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    fn title(s: &Shared) -> Option<String> {
        s.0.lock().unwrap().latest.as_ref().and_then(|n| n.title.clone())
    }

    fn pid(s: &Shared) -> Option<u32> {
        s.0.lock().unwrap().helper.as_ref().map(|h| h.child.id())
    }

    fn alive(pid: u32) -> bool {
        Process::new("/bin/kill").args(["-0", &pid.to_string()]).stderr(Stdio::null()).status().unwrap().success()
    }

    fn starts(log: &Path) -> usize {
        std::fs::read_to_string(log).map(|t| t.lines().count()).unwrap_or(0)
    }

    #[test]
    fn the_helper_runs_once_takes_commands_and_is_killed_on_switch_off() {
        let dir = tempfile::tempdir().unwrap();
        let (script, log) = fake(dir.path(), ECHO);
        let s = shared();
        begin(&s, script.clone(), log.clone());
        begin(&s, script, log.clone());
        wait_for("the first line", || title(&s).as_deref() == Some("first"));
        {
            let mut c = s.0.lock().unwrap();
            let h = c.helper.as_mut().unwrap();
            writeln!(h.stdin, "{}", Command::Next.word()).unwrap();
        }
        wait_for("the command's echo", || title(&s).as_deref() == Some("next"));
        assert_eq!(starts(&log), 1);
        let helper = pid(&s).unwrap();
        switch_off(&s);
        assert!(!alive(helper), "the helper outlived the switch off");
        assert_eq!(title(&s), None);
        assert_eq!(pid(&s), None);
    }

    #[test]
    fn a_helper_that_dies_is_started_again_and_reads_as_off_meanwhile() {
        let dir = tempfile::tempdir().unwrap();
        let (script, log) = fake(
            dir.path(),
            r#"open(my $log, '>>', $ARGV[0]); print $log "start\n"; close $log; print qq(not json\n); exit 1;"#,
        );
        let s = shared();
        begin(&s, script, log.clone());
        wait_for("a second start after 1 s", || starts(&log) >= 2);
        assert_eq!(title(&s), None);
        switch_off(&s);
        let after = starts(&log);
        std::thread::sleep(Duration::from_millis(2500));
        assert_eq!(starts(&log), after, "a helper started after the switch off");
    }

    #[test]
    fn only_the_five_commands_pass() {
        for (word, command) in [
            ("toggle", Command::Toggle),
            ("play", Command::Play),
            ("pause", Command::Pause),
            ("next", Command::Next),
            ("prev", Command::Prev),
        ] {
            assert_eq!(parse_command(Some(&json!(word))), Ok(command));
            assert_eq!(command.word(), word);
        }
        for bad in [json!("stop"), json!("toggle\nnext"), json!("Toggle"), json!(""), json!(2), json!({ "command": "play" })] {
            assert!(parse_command(Some(&bad)).is_err(), "{bad} passed");
        }
        assert!(parse_command(None).is_err());
    }
}
