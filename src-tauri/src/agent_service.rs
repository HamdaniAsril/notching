//! Status agent (design 19 Nov): the inbox the agents' hooks write to, the
//! status beside the notch, the notices, the card's list, and Hubungkan.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

use crate::agent_hooks as hooks;
use crate::agent_rules::{parse, Agent, Board, Notice, State};
use crate::app_core::CoreState;
use crate::status::{self, Activity, Part};

pub const MODULE_ID: &str = "ai-agent";
/// How often the inbox is read.
const POLL: Duration = Duration::from_millis(500);
/// News older than this when read (Notching was closed) updates the card but
/// makes no notice.
const BACKLOG_MS: u64 = 60_000;

static BOARD: Mutex<Option<Board>> = Mutex::new(None);
/// What the status beside the notch shows now: each busy agent, and whether it works.
static SHOWN: Mutex<Option<Vec<(Agent, bool)>>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn enabled(app: &AppHandle) -> bool {
    app.state::<CoreState>().0.lock().unwrap().module(MODULE_ID).is_some_and(|e| e.installed && e.enabled)
}

/// `<app data>/agents`, holding hook.pl and inbox/.
fn agents_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("agents"))
}

fn script_path(dir: &Path) -> PathBuf {
    dir.join("hook.pl")
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// The script, written again only when it changed.
fn write_script(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let path = script_path(dir);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(hooks::HOOK_SCRIPT) {
        std::fs::write(&path, hooks::HOOK_SCRIPT)?;
    }
    Ok(())
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::Builder::new()
        .name("agent-inbox".into())
        .spawn(move || loop {
            tick(&app);
            std::thread::sleep(POLL);
        })
        .ok();
}

// The inbox exists only while the module is on: the hook writes nothing without it.
fn tick(app: &AppHandle) {
    let Some(dir) = agents_dir(app) else { return };
    let inbox = dir.join("inbox");
    if !enabled(app) {
        if inbox.exists() {
            let _ = std::fs::remove_dir_all(&inbox);
        }
        let had = BOARD.lock().unwrap().take().is_some();
        if had {
            show(app);
        }
        return;
    }
    if !inbox.exists() {
        if let Err(e) = write_script(&dir).and_then(|_| std::fs::create_dir_all(&inbox)) {
            eprintln!("notching: agent inbox: {e}");
            return;
        }
    }
    let now = now_ms();
    let mut notices = Vec::new();
    {
        let mut board = BOARD.lock().unwrap();
        let board = board.get_or_insert_with(Board::default);
        for (path, raw) in read_inbox(&inbox) {
            let _ = std::fs::remove_file(&path);
            let Some(news) = parse(&raw) else { continue };
            let fresh = now.saturating_sub(news.at) < BACKLOG_MS;
            if let Some(n) = board.hear(news) {
                if fresh {
                    notices.push(n);
                }
            }
        }
        board.tidy(now);
    }
    for n in notices {
        post(app, &n);
    }
    show(app);
}

/// The inbox's finished files, oldest first (their names start with the time).
fn read_inbox(inbox: &Path) -> Vec<(PathBuf, String)> {
    let Ok(entries) = std::fs::read_dir(inbox) else { return vec![] };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            !name.starts_with('.') && name.ends_with(".json")
        })
        .collect();
    files.sort();
    files.into_iter().filter_map(|p| std::fs::read_to_string(&p).ok().map(|raw| (p, raw))).collect()
}

fn post(app: &AppHandle, n: &Notice) {
    let channel = match n.state {
        State::Waiting => "waiting",
        State::Done => "done",
        State::Working => return,
    };
    let title = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        core.module_text(MODULE_ID, &format!("notice.{channel}.title")).unwrap_or_default()
    };
    let title = title.replace("{agent}", n.agent.name());
    let detail = match &n.detail {
        Some(d) => format!("{} · {d}", n.project),
        None => n.project.clone(),
    };
    if let Err(e) = crate::notify::post(app, MODULE_ID, channel, &title, &detail) {
        eprintln!("notching: agent notice: {e}");
    }
}

/// Beside the notch (owner, 19 Nov): each busy agent's logo, then "Working"
/// with dots that fill one by one, or "Waiting"; a red dot while any works.
fn show(app: &AppHandle) {
    let agents = BOARD.lock().unwrap().as_ref().map(Board::agents).unwrap_or_default();
    {
        let mut shown = SHOWN.lock().unwrap();
        if shown.as_ref() == Some(&agents) {
            return;
        }
        *shown = Some(agents.clone());
    }
    if agents.is_empty() {
        status::clear(app, MODULE_ID);
        return;
    }
    let (working, waiting) = {
        let core = app.state::<CoreState>();
        let core = core.0.lock().unwrap();
        let text = |key: &str| core.module_text(MODULE_ID, key).unwrap_or_default();
        (text("status.working"), text("status.waiting"))
    };
    let parts = agents
        .iter()
        .map(|&(agent, works)| Part {
            key: agent.id().into(),
            icon: format!("logos/{}.svg", agent.id()),
            text: if works { working.clone() } else { waiting.clone() },
            dots: works,
            // Claude's logo in its own orange (owner, 19 Nov); the others white.
            color: agent == Agent::Claude,
        })
        .collect();
    let activity = if agents.iter().any(|&(_, works)| works) { Activity::Running } else { Activity::On };
    if let Err(e) = status::set_parts(app, MODULE_ID, activity, parts) {
        eprintln!("notching: agent status: {e}");
    }
}

/// One row on the card. Same shape as AgentSession in modules/ai-agent/view.ts.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub agent: Agent,
    pub name: &'static str,
    pub id: String,
    pub project: String,
    pub state: State,
    pub since: u64,
    pub detail: Option<String>,
    pub can_open: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentsView {
    pub now: u64,
    pub sessions: Vec<SessionDto>,
    /// Agents connected; none means the card points to Settings.
    pub connected: usize,
}

pub fn read(app: &AppHandle) -> AgentsView {
    let sessions = BOARD
        .lock()
        .unwrap()
        .as_ref()
        .map(|b| {
            b.list()
                .into_iter()
                .map(|s| SessionDto {
                    agent: s.agent,
                    name: s.agent.name(),
                    id: s.id.clone(),
                    project: s.project.clone(),
                    state: s.state,
                    since: s.since,
                    detail: s.detail.clone(),
                    can_open: s.app.is_some(),
                })
                .collect()
        })
        .unwrap_or_default();
    let connected = links(app).iter().filter(|l| l.connected).count();
    AgentsView { now: now_ms(), sessions, connected }
}

#[derive(serde::Deserialize)]
pub struct OpenArgs {
    pub agent: String,
    pub id: String,
}

/// Brings up the app the session runs in.
pub fn open(a: &OpenArgs) -> Result<(), String> {
    let agent = Agent::from_id(&a.agent).ok_or("unknown agent")?;
    let bundle = BOARD
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|b| b.find(agent, &a.id))
        .and_then(|s| s.app.clone())
        .ok_or("no app for this session")?;
    std::process::Command::new("/usr/bin/open").arg("-b").arg(&bundle).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Hubungkan ----

/// One agent on the module's settings page. Same shape as AgentLink in src/bridge.ts.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLink {
    pub agent: Agent,
    pub name: &'static str,
    pub installed: bool,
    pub connected: bool,
}

fn claude_file(home: &Path) -> PathBuf {
    home.join(".claude/settings.json")
}

fn codex_file(home: &Path) -> PathBuf {
    home.join(".codex/config.toml")
}

/// Its own file per Notching (Notching Dev beside Notching), named by the app's id.
fn opencode_file(app: &AppHandle, home: &Path) -> PathBuf {
    home.join(".config/opencode/plugins").join(format!("{}.js", app.config().identifier))
}

fn installed(agent: Agent, home: &Path) -> bool {
    match agent {
        Agent::Claude => home.join(".claude").is_dir(),
        Agent::Codex => home.join(".codex").is_dir(),
        Agent::OpenCode => home.join(".config/opencode").is_dir() || Path::new("/Applications/OpenCode.app").exists(),
    }
}

fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

fn connected(app: &AppHandle, agent: Agent, home: &Path, script: &str) -> bool {
    match agent {
        Agent::Claude => hooks::claude_connected(&read_text(&claude_file(home)), script),
        Agent::Codex => hooks::codex_connected(&read_text(&codex_file(home)), script),
        Agent::OpenCode => hooks::opencode_is_ours(&read_text(&opencode_file(app, home))),
    }
}

pub fn links(app: &AppHandle) -> Vec<AgentLink> {
    let (Some(home), Some(dir)) = (home(), agents_dir(app)) else { return vec![] };
    let script = script_path(&dir).to_string_lossy().into_owned();
    Agent::ALL
        .into_iter()
        .map(|agent| AgentLink {
            agent,
            name: agent.name(),
            installed: installed(agent, &home),
            connected: connected(app, agent, &home, &script),
        })
        .collect()
}

/// Temp file and rename; the file as it was before Notching first touched it is
/// kept beside it once.
fn write_file(path: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let backup = path.with_file_name(format!("{name}.before-notching"));
    if path.exists() && !backup.exists() {
        std::fs::copy(path, &backup).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_file_name(format!(".{name}.notching-tmp"));
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn link(app: &AppHandle, agent: Agent, on: bool) -> Result<(), String> {
    let home = home().ok_or("no home folder")?;
    let dir = agents_dir(app).ok_or("no app data folder")?;
    write_script(&dir).map_err(|e| e.to_string())?;
    let script = script_path(&dir).to_string_lossy().into_owned();
    match agent {
        Agent::Claude => {
            let path = claude_file(&home);
            let text = read_text(&path);
            let next = if on { hooks::claude_connect(&text, &script)? } else { hooks::claude_disconnect(&text, &script)? };
            if next != text && !(text.is_empty() && !on) {
                write_file(&path, &next)?;
            }
        }
        Agent::Codex => {
            let path = codex_file(&home);
            let text = read_text(&path);
            let next = if on { hooks::codex_connect(&text, &script)? } else { hooks::codex_disconnect(&text, &script)? };
            if next != text {
                write_file(&path, &next)?;
            }
        }
        Agent::OpenCode => {
            let path = opencode_file(app, &home);
            if on {
                let inbox = dir.join("inbox").to_string_lossy().into_owned();
                write_file(&path, &hooks::opencode_plugin(&inbox))?;
            } else if hooks::opencode_is_ours(&read_text(&path)) {
                std::fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }
    if !on {
        if let Some(b) = BOARD.lock().unwrap().as_mut() {
            b.forget(agent);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn agent_links(app: AppHandle) -> Vec<AgentLink> {
    links(&app)
}

#[tauri::command]
pub fn set_agent_link(app: AppHandle, agent: String, on: bool) -> Result<Vec<AgentLink>, String> {
    let agent = Agent::from_id(&agent).ok_or("unknown agent")?;
    link(&app, agent, on)?;
    show(&app);
    Ok(links(&app))
}

/// Uninstalled: no agent keeps running a script for a module that is gone.
pub fn uninstalled(app: &AppHandle, id: &str) {
    if id != MODULE_ID {
        return;
    }
    for agent in Agent::ALL {
        if let Err(e) = link(app, agent, false) {
            eprintln!("notching: {} not disconnected: {e}", agent.name());
        }
    }
}
