//! Status agent's Hubungkan (design 19 Nov): what goes into each agent's own
//! config, and what comes out again. Text in, text out, so it can be unit tested.

use serde_json::{json, Map, Value};
use toml_edit::{value, Array, DocumentMut, Item};

/// Claude Code's hook events Notching listens to (design §What each agent's news means).
pub const CLAUDE_EVENTS: [&str; 6] = ["UserPromptSubmit", "PostToolUse", "Notification", "Stop", "StopFailure", "SessionEnd"];

pub const PERL: &str = "/usr/bin/perl";

/// The script every hook runs: one file per piece of news into `inbox/` beside
/// it. It never fails the agent and never waits on Notching; with no inbox
/// (Notching gone) it writes nothing. For Codex it then hands the turn on to the
/// program that held `notify` before (after `--`).
pub const HOOK_SCRIPT: &str = r#"#!/usr/bin/perl
# Notching: passes an AI agent's news to the notch. Written by Notching;
# Status agent's Lepaskan stops the agents from running it.
use strict;
use warnings;
use File::Basename qw(dirname);
use Time::HiRes qw(time);
use JSON::PP;

my $agent = shift @ARGV;
exit 0 unless defined $agent;
my @args = @ARGV;
my $input = '';
if ($agent eq 'claude') {
    local $/;
    $input = <STDIN>;
    $input = '' unless defined $input;
}
eval {
    my $dir = dirname(__FILE__) . '/inbox';
    if (-d $dir) {
        my $ms = int(time() * 1000);
        my $name = sprintf('%d-%d-%04d', $ms, $$, int(rand(10000)));
        my %news = (agent => $agent, at => $ms, input => $input, args => \@args);
        $news{app} = $ENV{__CFBundleIdentifier} if $ENV{__CFBundleIdentifier};
        open(my $fh, '>', "$dir/.$name.tmp") or die;
        print $fh JSON::PP->new->canonical->encode(\%news);
        close($fh);
        rename("$dir/.$name.tmp", "$dir/$name.json");
    }
};
if ($agent eq 'codex' && @args > 2 && $args[0] eq '--') {
    my @old = @args[1 .. $#args];
    exec { $old[0] } @old;
}
exit 0;
"#;

/// The shell command Claude Code runs; the script path is quoted for the shell.
pub fn claude_command(script: &str) -> String {
    format!("{PERL} '{}' claude", script.replace('\'', r"'\''"))
}

fn ours(hook: &Value, script: &str) -> bool {
    hook.get("command").and_then(Value::as_str).is_some_and(|c| c.contains(script))
}

fn read_json(text: &str) -> Result<Map<String, Value>, String> {
    if text.trim().is_empty() {
        return Ok(Map::new());
    }
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(m)) => Ok(m),
        Ok(_) => Err("settings.json is not an object".into()),
        Err(e) => Err(format!("settings.json cannot be read: {e}")),
    }
}

fn write_json(root: Map<String, Value>) -> String {
    let mut out = serde_json::to_string_pretty(&Value::Object(root)).unwrap_or_default();
    out.push('\n');
    out
}

/// Every event Notching needs runs the script.
pub fn claude_connected(text: &str, script: &str) -> bool {
    let Ok(root) = read_json(text) else { return false };
    CLAUDE_EVENTS.iter().all(|event| {
        root.get("hooks")
            .and_then(|h| h.get(*event))
            .and_then(Value::as_array)
            .is_some_and(|groups| {
                groups.iter().any(|g| g.get("hooks").and_then(Value::as_array).is_some_and(|hs| hs.iter().any(|h| ours(h, script))))
            })
    })
}

/// Removes every hook naming the script, and what that leaves empty.
fn strip(root: &mut Map<String, Value>, script: &str) {
    let Some(Value::Object(hooks)) = root.get_mut("hooks") else { return };
    for groups in hooks.values_mut() {
        let Value::Array(groups) = groups else { continue };
        for g in groups.iter_mut() {
            if let Some(Value::Array(hs)) = g.get_mut("hooks") {
                hs.retain(|h| !ours(h, script));
            }
        }
        groups.retain(|g| !g.get("hooks").and_then(Value::as_array).is_some_and(Vec::is_empty));
    }
    hooks.retain(|_, groups| !groups.as_array().is_some_and(Vec::is_empty));
    if hooks.is_empty() {
        root.remove("hooks");
    }
}

/// `text` with one hook per event for the script; anything else in it stays.
pub fn claude_connect(text: &str, script: &str) -> Result<String, String> {
    let mut root = read_json(text)?;
    strip(&mut root, script);
    let hooks = root.entry("hooks").or_insert_with(|| Value::Object(Map::new()));
    let Value::Object(hooks) = hooks else { return Err("settings.json has hooks that are not an object".into()) };
    for event in CLAUDE_EVENTS {
        let groups = hooks.entry(event).or_insert_with(|| Value::Array(vec![]));
        let Value::Array(groups) = groups else { return Err(format!("settings.json has {event} hooks that are not a list")) };
        groups.push(json!({ "hooks": [{ "type": "command", "command": claude_command(script) }] }));
    }
    Ok(write_json(root))
}

pub fn claude_disconnect(text: &str, script: &str) -> Result<String, String> {
    let mut root = read_json(text)?;
    strip(&mut root, script);
    Ok(write_json(root))
}

fn read_toml(text: &str) -> Result<DocumentMut, String> {
    text.parse::<DocumentMut>().map_err(|e| format!("config.toml cannot be read: {e}"))
}

/// `notify` as a list of strings; None when it is not set.
fn notify(doc: &DocumentMut) -> Result<Option<Vec<String>>, String> {
    let Some(item) = doc.get("notify") else { return Ok(None) };
    let list = item.as_array().ok_or("notify in config.toml is not a list")?;
    list.iter().map(|v| v.as_str().map(String::from).ok_or_else(|| "notify in config.toml holds something other than text".to_string())).collect::<Result<_, _>>().map(Some)
}

fn is_ours(list: &[String], script: &str) -> bool {
    list.get(1).is_some_and(|s| s == script)
}

pub fn codex_connected(text: &str, script: &str) -> bool {
    read_toml(text).ok().and_then(|d| notify(&d).ok().flatten()).is_some_and(|l| is_ours(&l, script))
}

/// `notify` runs the script first; a program already there runs after it.
pub fn codex_connect(text: &str, script: &str) -> Result<String, String> {
    let mut doc = read_toml(text)?;
    let old = notify(&doc)?.unwrap_or_default();
    if is_ours(&old, script) {
        return Ok(doc.to_string());
    }
    let mut list: Vec<String> = vec![PERL.into(), script.into(), "codex".into()];
    if !old.is_empty() {
        list.push("--".into());
        list.extend(old);
    }
    doc.insert("notify", value(list.into_iter().collect::<Array>()));
    Ok(doc.to_string())
}

/// `notify` as it was before Hubungkan.
pub fn codex_disconnect(text: &str, script: &str) -> Result<String, String> {
    let mut doc = read_toml(text)?;
    let Some(list) = notify(&doc)? else { return Ok(doc.to_string()) };
    if !is_ours(&list, script) {
        return Ok(doc.to_string());
    }
    let old: Vec<String> = list.iter().skip_while(|s| *s != "--").skip(1).cloned().collect();
    if old.is_empty() {
        doc.remove("notify");
    } else {
        doc.insert("notify", Item::Value(old.into_iter().collect::<Array>().into()));
    }
    Ok(doc.to_string())
}

/// OpenCode's plugin, written to its plugins folder: the same files into the
/// same inbox, straight from JavaScript.
pub fn opencode_plugin(inbox: &str) -> String {
    let inbox = serde_json::to_string(inbox).unwrap_or_default();
    format!(
        r#"// Notching: tells the notch what OpenCode is doing. Written by Notching;
// Status agent's Lepaskan deletes this file.
import {{ existsSync, renameSync, writeFileSync }} from "node:fs";

const INBOX = {inbox};
const KEEP = new Set(["session.status", "session.idle", "session.error", "session.deleted",
  "permission.asked", "permission.updated", "permission.replied"]);

export const Notching = async ({{ directory }}) => ({{
  event: async ({{ event }}) => {{
    if (!KEEP.has(event.type) || !existsSync(INBOX)) return;
    try {{
      const at = Date.now();
      const name = `${{at}}-${{process.pid}}-${{String(Math.floor(Math.random() * 10000)).padStart(4, "0")}}`;
      const news = {{ agent: "opencode", at, cwd: directory, app: process.env.__CFBundleIdentifier, event }};
      writeFileSync(`${{INBOX}}/.${{name}}.tmp`, JSON.stringify(news));
      renameSync(`${{INBOX}}/.${{name}}.tmp`, `${{INBOX}}/${{name}}.json`);
    }} catch {{}}
  }},
}});
"#
    )
}

/// Whether a plugin file on disk is ours.
pub fn opencode_is_ours(text: &str) -> bool {
    text.starts_with("// Notching: tells the notch what OpenCode is doing.")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCRIPT: &str = "/Users/me/Library/Application Support/id.web.notching/agents/hook.pl";

    #[test]
    fn claude_connect_adds_one_hook_per_event_and_keeps_the_rest() {
        let before = r#"{
  "model": "opus",
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }]
  },
  "env": { "A": "1" }
}"#;
        assert!(!claude_connected(before, SCRIPT));
        let after = claude_connect(before, SCRIPT).unwrap();
        assert!(claude_connected(&after, SCRIPT));
        let v: Value = serde_json::from_str(&after).unwrap();
        // The order of the file stays.
        let keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        assert_eq!(keys, vec!["model", "hooks", "env"]);
        assert_eq!(v["env"]["A"], "1");
        // Someone else's Stop hook stays, ours comes after it.
        let stop = v["hooks"]["Stop"].as_array().unwrap();
        assert_eq!(stop.len(), 2);
        assert_eq!(stop[0]["hooks"][0]["command"], "say done");
        assert_eq!(stop[1]["hooks"][0]["command"], format!("/usr/bin/perl '{SCRIPT}' claude"));
        for event in CLAUDE_EVENTS {
            assert!(v["hooks"][event].is_array(), "{event}");
        }
        // Twice is the same as once.
        assert_eq!(claude_connect(&after, SCRIPT).unwrap(), after);
    }

    #[test]
    fn claude_disconnect_takes_out_only_ours() {
        let before = r#"{ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "say done" }] }] } }"#;
        let after = claude_disconnect(&claude_connect(before, SCRIPT).unwrap(), SCRIPT).unwrap();
        let v: Value = serde_json::from_str(&after).unwrap();
        assert_eq!(v, serde_json::from_str::<Value>(before).unwrap());
        // With nothing else there, nothing of ours is left behind.
        let empty = claude_disconnect(&claude_connect("{}", SCRIPT).unwrap(), SCRIPT).unwrap();
        assert_eq!(empty.trim(), "{}");
    }

    #[test]
    fn claude_starts_from_no_file_and_refuses_a_broken_one() {
        assert!(claude_connected(&claude_connect("", SCRIPT).unwrap(), SCRIPT));
        assert!(claude_connect("{ nope", SCRIPT).is_err());
        assert!(claude_connect("[]", SCRIPT).is_err());
        assert!(claude_connect(r#"{ "hooks": [] }"#, SCRIPT).is_err());
        assert!(!claude_connected("{ nope", SCRIPT));
    }

    #[test]
    fn claude_command_quotes_the_path() {
        assert_eq!(claude_command("/a b/it's.pl"), r#"/usr/bin/perl '/a b/it'\''s.pl' claude"#);
    }

    const CODEX: &str = r#"notify = ["/Apps/Sky", "turn-ended"]
# a comment that must stay
model = "gpt-5"

[mcp_servers]
x = 1
"#;

    #[test]
    fn codex_connect_runs_the_script_first_then_the_old_program() {
        assert!(!codex_connected(CODEX, SCRIPT));
        let after = codex_connect(CODEX, SCRIPT).unwrap();
        assert!(codex_connected(&after, SCRIPT));
        let doc = after.parse::<DocumentMut>().unwrap();
        let list = notify(&doc).unwrap().unwrap();
        assert_eq!(list, vec![PERL, SCRIPT, "codex", "--", "/Apps/Sky", "turn-ended"]);
        assert!(after.contains("# a comment that must stay"));
        assert_eq!(doc["mcp_servers"]["x"].as_integer(), Some(1));
        assert_eq!(codex_connect(&after, SCRIPT).unwrap(), after);
        // Back as it was.
        let back = codex_disconnect(&after, SCRIPT).unwrap();
        assert_eq!(notify(&back.parse().unwrap()).unwrap().unwrap(), vec!["/Apps/Sky", "turn-ended"]);
        assert!(back.contains("# a comment that must stay"));
    }

    #[test]
    fn codex_without_notify_gets_only_the_script_and_loses_it_again() {
        let text = "model = \"gpt-5\"\n\n[tools]\nweb = true\n";
        let after = codex_connect(text, SCRIPT).unwrap();
        let doc = after.parse::<DocumentMut>().unwrap();
        assert_eq!(notify(&doc).unwrap().unwrap(), vec![PERL, SCRIPT, "codex"]);
        // Still a top-level key, not one inside [tools].
        assert!(doc["tools"].get("notify").is_none());
        let back = codex_disconnect(&after, SCRIPT).unwrap();
        assert!(back.parse::<DocumentMut>().unwrap().get("notify").is_none());
        assert!(codex_connected(&codex_connect("", SCRIPT).unwrap(), SCRIPT));
    }

    #[test]
    fn codex_leaves_alone_what_is_not_ours() {
        assert_eq!(codex_disconnect(CODEX, SCRIPT).unwrap(), CODEX);
        assert!(codex_connect("notify = \"x\"", SCRIPT).is_err());
        assert!(codex_connect("notify = [1]", SCRIPT).is_err());
        assert!(codex_connect("= broken", SCRIPT).is_err());
    }

    #[test]
    fn the_opencode_plugin_writes_to_the_inbox() {
        let js = opencode_plugin("/Users/me/Library/Application Support/x/agents/inbox");
        assert!(opencode_is_ours(&js));
        assert!(js.contains(r#"const INBOX = "/Users/me/Library/Application Support/x/agents/inbox";"#));
        assert!(js.contains("export const Notching"));
        assert!(js.contains(r#"agent: "opencode""#));
        assert!(!opencode_is_ours("export const Other = 1"));
    }

    #[test]
    fn the_script_writes_files_named_by_time_and_hands_codex_on() {
        assert!(HOOK_SCRIPT.contains("dirname(__FILE__) . '/inbox'"));
        assert!(HOOK_SCRIPT.contains("if (-d $dir)"));
        assert!(HOOK_SCRIPT.contains("exec { $old[0] } @old;"));
    }
}
