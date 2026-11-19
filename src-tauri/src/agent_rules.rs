//! Status agent (design 19 Nov): what each AI agent's news means, and the
//! sessions the notch shows. Free of AppKit and of files so it can be unit tested.

use serde_json::Value;

/// A finished session stays on the card this long.
pub const DONE_KEEP_MS: u64 = 10 * 60 * 1000;
/// A working session that says nothing this long is dropped (a killed agent).
pub const WORKING_STALE_MS: u64 = 30 * 60 * 1000;
/// A session waiting for the person is kept longer: they may be away.
pub const WAITING_STALE_MS: u64 = 4 * 60 * 60 * 1000;
/// A notice's detail, before notify cuts it again.
pub const DETAIL_MAX: usize = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Agent {
    Claude,
    Codex,
    OpenCode,
}

impl Agent {
    pub const ALL: [Agent; 3] = [Agent::Claude, Agent::Codex, Agent::OpenCode];

    pub fn id(self) -> &'static str {
        match self {
            Agent::Claude => "claude",
            Agent::Codex => "codex",
            Agent::OpenCode => "opencode",
        }
    }

    pub fn from_id(id: &str) -> Option<Agent> {
        Agent::ALL.into_iter().find(|a| a.id() == id)
    }

    pub fn name(self) -> &'static str {
        match self {
            Agent::Claude => "Claude Code",
            Agent::Codex => "Codex",
            Agent::OpenCode => "OpenCode",
        }
    }

    /// Codex says nothing when a turn starts, only when it ends.
    fn tells_start(self) -> bool {
        !matches!(self, Agent::Codex)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Working,
    Waiting,
    Done,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Now(State),
    Gone,
}

/// One piece of news from an agent, read from an inbox file.
#[derive(Clone, Debug, PartialEq)]
pub struct News {
    pub agent: Agent,
    pub session: String,
    pub cwd: Option<String>,
    /// The bundle id of the app the agent runs in.
    pub app: Option<String>,
    pub kind: Kind,
    pub detail: Option<String>,
    pub at: u64,
}

/// What an inbox file says; None for news that changes nothing, or a file
/// that is not ours.
pub fn parse(raw: &str) -> Option<News> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let agent = Agent::from_id(v.get("agent")?.as_str()?)?;
    let at = v.get("at").and_then(Value::as_u64).unwrap_or(0);
    let app = text(&v, "app");
    let (session, cwd, kind, detail) = match agent {
        Agent::Claude => claude(&serde_json::from_str(v.get("input")?.as_str()?).ok()?)?,
        Agent::Codex => codex(&serde_json::from_str(v.get("args")?.as_array()?.last()?.as_str()?).ok()?)?,
        Agent::OpenCode => opencode(v.get("event")?, text(&v, "cwd"))?,
    };
    Some(News { agent, session, cwd, app, kind, detail: detail.map(|d| crate::notify::clip(&d, DETAIL_MAX)), at })
}

type Parsed = (String, Option<String>, Kind, Option<String>);

fn text(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(String::from)
}

// Claude Code's hook input on stdin.
fn claude(v: &Value) -> Option<Parsed> {
    let session = text(v, "session_id")?;
    let kind = match v.get("hook_event_name")?.as_str()? {
        "UserPromptSubmit" | "PostToolUse" => Kind::Now(State::Working),
        // Older versions send no type. idle_prompt comes after Stop: done already.
        "Notification" => match v.get("notification_type").and_then(Value::as_str) {
            None | Some("permission_prompt" | "elicitation_dialog" | "elicitation_url_dialog" | "agent_needs_input") => {
                Kind::Now(State::Waiting)
            }
            Some("elicitation_complete" | "elicitation_response") => Kind::Now(State::Working),
            Some(_) => return None,
        },
        "Stop" | "StopFailure" => Kind::Now(State::Done),
        "SessionEnd" => Kind::Gone,
        _ => return None,
    };
    let detail = match kind {
        Kind::Now(State::Waiting) => text(v, "message"),
        Kind::Now(State::Done) => text(v, "last_assistant_message"),
        _ => None,
    };
    Some((session, text(v, "cwd"), kind, detail))
}

// Codex's notify argument.
fn codex(v: &Value) -> Option<Parsed> {
    if v.get("type")?.as_str()? != "agent-turn-complete" {
        return None;
    }
    let session = text(v, "thread-id").or_else(|| text(v, "turn-id"))?;
    Some((session, text(v, "cwd"), Kind::Now(State::Done), text(v, "last-assistant-message")))
}

// An OpenCode event, as its plugin hears it.
fn opencode(e: &Value, cwd: Option<String>) -> Option<Parsed> {
    let p = e.get("properties")?;
    let id = |v: &Value| text(v, "sessionID");
    let (session, kind, detail) = match e.get("type")?.as_str()? {
        "session.status" => {
            let kind = match p.get("status")?.get("type")?.as_str()? {
                "busy" | "retry" => Kind::Now(State::Working),
                "idle" => Kind::Now(State::Done),
                _ => return None,
            };
            (id(p)?, kind, None)
        }
        "session.idle" | "session.error" => (id(p)?, Kind::Now(State::Done), None),
        "permission.asked" | "permission.updated" => (id(p)?, Kind::Now(State::Waiting), text(p, "title")),
        "permission.replied" => (id(p)?, Kind::Now(State::Working), None),
        "session.deleted" => (text(p.get("info")?, "id")?, Kind::Gone, None),
        _ => return None,
    };
    Some((session, cwd, kind, detail))
}

/// One session the notch knows.
#[derive(Clone, Debug, PartialEq)]
pub struct Session {
    pub agent: Agent,
    pub id: String,
    pub project: String,
    pub app: Option<String>,
    pub state: State,
    /// When it took this state.
    pub since: u64,
    /// When it last said anything.
    pub heard: u64,
    pub detail: Option<String>,
}

/// A notice to post: a session began waiting, or finished.
#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
    pub state: State,
    pub agent: Agent,
    pub project: String,
    pub detail: Option<String>,
}

#[derive(Debug, Default)]
pub struct Board {
    sessions: Vec<Session>,
}

/// The folder's last part, or the agent's name without one.
fn project(cwd: Option<&str>, agent: Agent) -> String {
    cwd.map(|c| c.trim_end_matches('/'))
        .and_then(|c| c.rsplit('/').next())
        .filter(|p| !p.is_empty())
        .map(String::from)
        .unwrap_or_else(|| agent.name().to_string())
}

impl Board {
    /// Takes the news; a notice when a session starts waiting or finishes.
    pub fn hear(&mut self, n: News) -> Option<Notice> {
        let at = n.at;
        let i = self.sessions.iter().position(|s| s.agent == n.agent && s.id == n.session);
        let state = match n.kind {
            Kind::Gone => {
                if let Some(i) = i {
                    self.sessions.remove(i);
                }
                return None;
            }
            Kind::Now(state) => state,
        };
        let Some(i) = i else {
            // A turn that ended before Notching heard it start is not news,
            // except from Codex, which tells only the end.
            if state == State::Done && n.agent.tells_start() {
                return None;
            }
            let s = Session {
                agent: n.agent,
                id: n.session,
                project: project(n.cwd.as_deref(), n.agent),
                app: n.app,
                state,
                since: at,
                heard: at,
                detail: n.detail,
            };
            let notice = (state != State::Working).then(|| notice(&s));
            self.sessions.push(s);
            return notice;
        };
        let s = &mut self.sessions[i];
        // News older than what was heard already came late.
        if at < s.heard {
            return None;
        }
        s.heard = at;
        if n.cwd.is_some() {
            s.project = project(n.cwd.as_deref(), n.agent);
        }
        if n.app.is_some() {
            s.app = n.app;
        }
        if s.state == state {
            return None;
        }
        s.state = state;
        s.since = at;
        s.detail = n.detail;
        (state != State::Working).then(|| notice(s))
    }

    /// Drops finished and silent sessions; true when any went.
    pub fn tidy(&mut self, now: u64) -> bool {
        let before = self.sessions.len();
        self.sessions.retain(|s| {
            let quiet = now.saturating_sub(s.heard);
            match s.state {
                State::Done => now.saturating_sub(s.since) < DONE_KEEP_MS,
                State::Working => quiet < WORKING_STALE_MS,
                State::Waiting => quiet < WAITING_STALE_MS,
            }
        });
        self.sessions.len() != before
    }

    /// Sessions working or waiting, and whether any is working.
    #[cfg(test)]
    pub fn busy(&self) -> (usize, bool) {
        let n = self.sessions.iter().filter(|s| s.state != State::Done).count();
        (n, self.sessions.iter().any(|s| s.state == State::Working))
    }

    /// Each agent with a session working or waiting, in Agent::ALL's order, and
    /// whether any of its sessions works.
    pub fn agents(&self) -> Vec<(Agent, bool)> {
        Agent::ALL
            .into_iter()
            .filter_map(|a| {
                let mine = self.sessions.iter().filter(|s| s.agent == a && s.state != State::Done);
                let mut any = false;
                let mut working = false;
                for s in mine {
                    any = true;
                    working |= s.state == State::Working;
                }
                any.then_some((a, working))
            })
            .collect()
    }

    /// Newest change first.
    pub fn list(&self) -> Vec<&Session> {
        let mut all: Vec<&Session> = self.sessions.iter().collect();
        all.sort_by(|a, b| b.since.cmp(&a.since));
        all
    }

    pub fn find(&self, agent: Agent, id: &str) -> Option<&Session> {
        self.sessions.iter().find(|s| s.agent == agent && s.id == id)
    }

    pub fn forget(&mut self, agent: Agent) {
        self.sessions.retain(|s| s.agent != agent);
    }
}

fn notice(s: &Session) -> Notice {
    Notice { state: s.state, agent: s.agent, project: s.project.clone(), detail: s.detail.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn claude_file(input: Value, at: u64) -> String {
        json!({ "agent": "claude", "at": at, "app": "com.apple.Terminal", "input": input.to_string() }).to_string()
    }

    fn claude_event(name: &str, extra: Value, at: u64) -> News {
        let mut input = json!({ "session_id": "s1", "cwd": "/Users/me/dev/notching", "hook_event_name": name });
        for (k, v) in extra.as_object().unwrap() {
            input[k] = v.clone();
        }
        parse(&claude_file(input, at)).unwrap()
    }

    fn oc(event: Value, at: u64) -> Option<News> {
        parse(&json!({ "agent": "opencode", "at": at, "cwd": "/Users/me/web", "event": event }).to_string())
    }

    #[test]
    fn claude_events_map_to_states() {
        let n = claude_event("UserPromptSubmit", json!({}), 5);
        assert_eq!(n.agent, Agent::Claude);
        assert_eq!(n.session, "s1");
        assert_eq!(n.cwd.as_deref(), Some("/Users/me/dev/notching"));
        assert_eq!(n.app.as_deref(), Some("com.apple.Terminal"));
        assert_eq!(n.kind, Kind::Now(State::Working));
        assert_eq!(n.at, 5);
        assert_eq!(claude_event("PostToolUse", json!({}), 1).kind, Kind::Now(State::Working));
        let w = claude_event("Notification", json!({ "notification_type": "permission_prompt", "message": "Claude needs your permission to use Bash" }), 1);
        assert_eq!(w.kind, Kind::Now(State::Waiting));
        assert_eq!(w.detail.as_deref(), Some("Claude needs your permission to use Bash"));
        assert_eq!(claude_event("Notification", json!({ "message": "x" }), 1).kind, Kind::Now(State::Waiting));
        assert_eq!(claude_event("Notification", json!({ "notification_type": "elicitation_dialog" }), 1).kind, Kind::Now(State::Waiting));
        assert_eq!(claude_event("Notification", json!({ "notification_type": "elicitation_response" }), 1).kind, Kind::Now(State::Working));
        let stop = claude_event("Stop", json!({ "last_assistant_message": "All 12 tests pass." }), 1);
        assert_eq!((stop.kind, stop.detail.as_deref()), (Kind::Now(State::Done), Some("All 12 tests pass.")));
        assert_eq!(claude_event("StopFailure", json!({ "error": "overloaded" }), 1).kind, Kind::Now(State::Done));
        assert_eq!(claude_event("SessionEnd", json!({ "reason": "prompt_input_exit" }), 1).kind, Kind::Gone);
    }

    #[test]
    fn claude_news_that_changes_nothing_is_none() {
        let file = |name: &str, extra: Value| {
            let mut input = json!({ "session_id": "s1", "hook_event_name": name });
            for (k, v) in extra.as_object().unwrap() {
                input[k] = v.clone();
            }
            parse(&claude_file(input, 1))
        };
        assert_eq!(file("Notification", json!({ "notification_type": "idle_prompt" })), None);
        assert_eq!(file("Notification", json!({ "notification_type": "auth_success" })), None);
        assert_eq!(file("Notification", json!({ "notification_type": "plugin_notification" })), None);
        assert_eq!(file("SubagentStop", json!({})), None);
        assert_eq!(file("SessionStart", json!({})), None);
        // No session id, broken input, or not ours at all.
        assert_eq!(parse(&claude_file(json!({ "hook_event_name": "Stop" }), 1)), None);
        assert_eq!(parse(&json!({ "agent": "claude", "input": "{not json" }).to_string()), None);
        assert_eq!(parse("hello"), None);
        assert_eq!(parse(&json!({ "agent": "gemini", "input": "{}" }).to_string()), None);
    }

    #[test]
    fn codex_tells_a_finished_turn_from_its_last_argument() {
        let payload = json!({ "type": "agent-turn-complete", "thread-id": "t9", "turn-id": "u1", "cwd": "/Users/me/api",
            "input-messages": ["fix it"], "last-assistant-message": "Fixed the test." });
        let file = json!({ "agent": "codex", "at": 7, "args": ["--", "/x/notify", payload.to_string()] }).to_string();
        let n = parse(&file).unwrap();
        assert_eq!((n.agent, n.session.as_str(), n.kind), (Agent::Codex, "t9", Kind::Now(State::Done)));
        assert_eq!(n.detail.as_deref(), Some("Fixed the test."));
        assert_eq!(n.cwd.as_deref(), Some("/Users/me/api"));
        let other = json!({ "agent": "codex", "args": [json!({ "type": "something-else" }).to_string()] }).to_string();
        assert_eq!(parse(&other), None);
    }

    #[test]
    fn opencode_events_map_to_states() {
        let status = |t: &str| oc(json!({ "type": "session.status", "properties": { "sessionID": "o1", "status": { "type": t } } }), 1).unwrap().kind;
        assert_eq!(status("busy"), Kind::Now(State::Working));
        assert_eq!(status("retry"), Kind::Now(State::Working));
        assert_eq!(status("idle"), Kind::Now(State::Done));
        let idle = oc(json!({ "type": "session.idle", "properties": { "sessionID": "o1" } }), 1).unwrap();
        assert_eq!((idle.session.as_str(), idle.kind), ("o1", Kind::Now(State::Done)));
        assert_eq!(idle.cwd.as_deref(), Some("/Users/me/web"));
        let ask = oc(json!({ "type": "permission.asked", "properties": { "sessionID": "o1", "id": "p", "title": "Run npm test" } }), 1).unwrap();
        assert_eq!((ask.kind, ask.detail.as_deref()), (Kind::Now(State::Waiting), Some("Run npm test")));
        let upd = oc(json!({ "type": "permission.updated", "properties": { "sessionID": "o1", "title": "Edit" } }), 1).unwrap();
        assert_eq!(upd.kind, Kind::Now(State::Waiting));
        let replied = oc(json!({ "type": "permission.replied", "properties": { "sessionID": "o1", "permissionID": "p", "response": "once" } }), 1).unwrap();
        assert_eq!(replied.kind, Kind::Now(State::Working));
        let gone = oc(json!({ "type": "session.deleted", "properties": { "info": { "id": "o1" } } }), 1).unwrap();
        assert_eq!((gone.session.as_str(), gone.kind), ("o1", Kind::Gone));
        assert_eq!(oc(json!({ "type": "session.error", "properties": { "sessionID": "o1" } }), 1).unwrap().kind, Kind::Now(State::Done));
        assert_eq!(oc(json!({ "type": "file.watcher.updated", "properties": {} }), 1), None);
        assert_eq!(oc(json!({ "type": "session.error", "properties": {} }), 1), None);
    }

    // Written by HOOK_SCRIPT itself (19 Nov), byte for byte.
    #[test]
    fn files_from_the_script_parse() {
        let claude = r#"{"agent":"claude","app":"com.apple.Terminal","args":[],"at":1795056072764,"input":"{\"session_id\":\"s1\",\"cwd\":\"/x/é proj\",\"hook_event_name\":\"Stop\",\"last_assistant_message\":\"Selesai ✓\"}\n"}"#;
        let n = parse(claude).unwrap();
        assert_eq!((n.kind, n.detail.as_deref(), n.cwd.as_deref()), (Kind::Now(State::Done), Some("Selesai ✓"), Some("/x/é proj")));
        assert_eq!((n.at, n.app.as_deref()), (1795056072764, Some("com.apple.Terminal")));
        let codex = r#"{"agent":"codex","app":"com.anthropic.claudefordesktop","args":["--","/bin/echo","old-ran","{\"type\":\"agent-turn-complete\",\"thread-id\":\"t1\"}"],"at":1795056072775,"input":""}"#;
        let n = parse(codex).unwrap();
        assert_eq!((n.agent, n.session.as_str(), n.kind), (Agent::Codex, "t1", Kind::Now(State::Done)));
    }

    #[test]
    fn a_long_detail_is_cut() {
        let long = "a".repeat(500);
        let n = claude_event("Notification", json!({ "message": long }), 1);
        assert_eq!(n.detail.unwrap().chars().count(), DETAIL_MAX);
    }

    fn news(agent: Agent, id: &str, kind: Kind, at: u64) -> News {
        News { agent, session: id.into(), cwd: Some("/Users/me/dev/notching/".into()), app: None, kind, detail: None, at }
    }

    #[test]
    fn a_session_works_waits_and_finishes_with_notices() {
        let mut b = Board::default();
        assert_eq!(b.hear(news(Agent::Claude, "s1", Kind::Now(State::Working), 1)), None);
        assert_eq!(b.busy(), (1, true));
        assert_eq!(b.list()[0].project, "notching");
        let wait = b.hear(news(Agent::Claude, "s1", Kind::Now(State::Waiting), 2)).unwrap();
        assert_eq!((wait.state, wait.agent, wait.project.as_str()), (State::Waiting, Agent::Claude, "notching"));
        assert_eq!(b.busy(), (1, false));
        // Still waiting: no second notice.
        assert_eq!(b.hear(news(Agent::Claude, "s1", Kind::Now(State::Waiting), 3)), None);
        assert_eq!(b.hear(news(Agent::Claude, "s1", Kind::Now(State::Working), 4)), None);
        let done = b.hear(news(Agent::Claude, "s1", Kind::Now(State::Done), 5)).unwrap();
        assert_eq!(done.state, State::Done);
        assert_eq!(b.busy(), (0, false));
        assert_eq!(b.list().len(), 1);
        b.hear(news(Agent::Claude, "s1", Kind::Gone, 6));
        assert!(b.list().is_empty());
    }

    #[test]
    fn an_end_heard_without_its_start_is_news_only_from_codex() {
        let mut b = Board::default();
        assert_eq!(b.hear(news(Agent::Claude, "s1", Kind::Now(State::Done), 1)), None);
        assert_eq!(b.hear(news(Agent::OpenCode, "o1", Kind::Now(State::Done), 1)), None);
        assert!(b.list().is_empty());
        let n = b.hear(news(Agent::Codex, "t1", Kind::Now(State::Done), 1)).unwrap();
        assert_eq!(n.agent, Agent::Codex);
        assert_eq!(b.list().len(), 1);
        // A waiting session heard first is still news.
        assert!(b.hear(news(Agent::Claude, "s2", Kind::Now(State::Waiting), 2)).is_some());
    }

    #[test]
    fn late_news_is_ignored() {
        let mut b = Board::default();
        b.hear(news(Agent::Claude, "s1", Kind::Now(State::Working), 10));
        b.hear(news(Agent::Claude, "s1", Kind::Now(State::Done), 20));
        assert_eq!(b.hear(news(Agent::Claude, "s1", Kind::Now(State::Working), 15)), None);
        assert_eq!(b.list()[0].state, State::Done);
    }

    #[test]
    fn sessions_are_apart_by_agent_and_id() {
        let mut b = Board::default();
        b.hear(news(Agent::Claude, "x", Kind::Now(State::Working), 1));
        b.hear(news(Agent::OpenCode, "x", Kind::Now(State::Working), 2));
        b.hear(news(Agent::Claude, "y", Kind::Now(State::Waiting), 3));
        assert_eq!(b.busy(), (3, true));
        // Newest change first.
        let order: Vec<_> = b.list().iter().map(|s| (s.agent, s.id.clone())).collect();
        assert_eq!(order, vec![(Agent::Claude, "y".into()), (Agent::OpenCode, "x".into()), (Agent::Claude, "x".into())]);
        b.forget(Agent::Claude);
        assert_eq!(b.list().len(), 1);
        assert!(b.find(Agent::OpenCode, "x").is_some());
    }

    #[test]
    fn agents_lists_each_busy_agent_once_in_a_fixed_order() {
        let mut b = Board::default();
        assert!(b.agents().is_empty());
        b.hear(news(Agent::OpenCode, "o", Kind::Now(State::Waiting), 1));
        b.hear(news(Agent::Claude, "a", Kind::Now(State::Waiting), 2));
        b.hear(news(Agent::Claude, "b", Kind::Now(State::Working), 3));
        b.hear(news(Agent::Codex, "t", Kind::Now(State::Done), 4));
        assert_eq!(b.agents(), vec![(Agent::Claude, true), (Agent::OpenCode, false)]);
        b.hear(news(Agent::Claude, "b", Kind::Now(State::Done), 5));
        assert_eq!(b.agents(), vec![(Agent::Claude, false), (Agent::OpenCode, false)]);
    }

    #[test]
    fn tidy_drops_old_finished_and_silent_sessions() {
        let mut b = Board::default();
        b.hear(news(Agent::Claude, "w", Kind::Now(State::Working), 0));
        b.hear(news(Agent::Claude, "q", Kind::Now(State::Waiting), 0));
        b.hear(news(Agent::Codex, "d", Kind::Now(State::Done), 0));
        assert!(!b.tidy(DONE_KEEP_MS - 1));
        assert!(b.tidy(DONE_KEEP_MS));
        assert!(b.find(Agent::Codex, "d").is_none());
        assert!(b.tidy(WORKING_STALE_MS));
        assert!(b.find(Agent::Claude, "w").is_none());
        assert!(b.find(Agent::Claude, "q").is_some());
        assert!(b.tidy(WAITING_STALE_MS));
        assert!(b.list().is_empty());
    }

    #[test]
    fn a_project_is_the_folder_or_the_agent() {
        assert_eq!(project(Some("/a/b/"), Agent::Claude), "b");
        assert_eq!(project(Some("/"), Agent::Codex), "Codex");
        assert_eq!(project(None, Agent::OpenCode), "OpenCode");
    }
}
