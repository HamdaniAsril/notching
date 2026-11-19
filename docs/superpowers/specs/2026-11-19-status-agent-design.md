# Status agent AI — design (19 Nov)

Owner, 19 Nov: "pantau status ai agent (opencode, codex, claude, dll) di notch",
then "langsung aja, nanti aku review". So every call below is mine, written
down for review; nothing here was decided by the owner beyond the request.

## Intent

The owner runs several coding agents at once and works in other windows while
they run. The notch should say, without opening each agent, which ones are
working, which one is waiting for the owner, and which just finished.

## Approaches (my call)

1. **Hooks the agents already offer** (chosen). Claude Code runs commands on
   its hook events, Codex runs one `notify` program when a turn ends, OpenCode
   loads plugins that hear its events. Each sends one small message to
   Notching. Exact and cheap; needs a one-time "Hubungkan" per agent, which
   writes into that agent's own config.
2. Watching processes and CPU. Needs no setup, but cannot tell "waiting for
   you" from "thinking", and guesses wrong on long tool runs.
3. Reading the agents' session files on disk. Formats are private and change
   between versions; breaks silently.

## How the news travels

- Notching keeps a folder `<app data>/agents/inbox/` and a small perl script
  `<app data>/agents/hook.pl` (perl is already relied on by Musik).
- Each agent's hook runs the script with the agent's name. The script writes
  one JSON file per event into the inbox (temp file, then rename), holding the
  agent name, the raw stdin (Claude), the argv (Codex), the time in ms and the
  app it runs in (`__CFBundleIdentifier`, so a click can bring that app up).
  It never fails and never blocks the agent: no Notching, no harm.
- OpenCode's plugin writes the same kind of file itself, from JavaScript.
- Notching reads the inbox twice a second, in name order (name starts with the
  time), parses each file in Rust (pure, tested) and deletes it.

## What each agent's news means

| Agent | News | State |
|---|---|---|
| Claude Code | UserPromptSubmit, PostToolUse | Bekerja |
| | Notification permission_prompt, elicitation_dialog, elicitation_url_dialog, agent_needs_input, or no type (older versions) | Menunggu kamu |
| | Notification elicitation_complete / elicitation_response | Bekerja |
| | Any other Notification (idle_prompt comes after Stop) | nothing |
| | Stop, StopFailure (an API error) | Selesai |
| | SessionEnd | gone |
| Codex | notify agent-turn-complete | Selesai (Codex says nothing when it starts) |
| OpenCode | session.status busy, permission.replied | Bekerja |
| | permission.asked / permission.updated | Menunggu kamu |
| | session.idle, session.status idle, session.error | Selesai |
| | session.deleted | gone |

A session is keyed by agent + session id. Its project is the last part of its
folder (`cwd`). A "Selesai" heard before any start is dropped, except from
Codex (it tells only the end). News older than what a session already heard
is dropped (late files). News older than a minute when read (Notching was
closed) updates the card but makes no notice.

Claude Code's hooks are run in step, not `async`: an async PostToolUse could
land after Stop and leave a finished session "working". The script takes
about 12 ms.

## What shows

- **Beside the notch** (the status line Timer uses): the module's icon and the
  number of sessions working or waiting. Red dot (Running) while any works.
  Nothing when none are.
- **Notices** (the notch's own notifications, two channels the owner can turn
  off in Notifikasi): "Menunggu kamu" (on, with sound) and "Selesai" (on,
  without sound). Title: agent and project; detail: Claude's message or
  Codex's last line, cut short.
- **The module's card** in the notch: one row per session, newest first —
  agent, project, state, how long ago. A click brings up the app it runs in.
- Finished sessions stay on the card 10 minutes. A session that says nothing
  for 30 minutes while "working" is dropped (a crashed or killed agent).

The module is "Agent AI" (en "AI agents"), opt-in, in the Katalog after
Keyboard Cleaning Mode. Its inbox exists only while it is on, so a switched-off
module gets no files; uninstalling it runs Lepaskan for every agent.

## Hubungkan (Settings, the module's page)

One row per agent: Claude Code, Codex, OpenCode. Each says Terhubung / Belum
terhubung / Tidak terpasang, with a Hubungkan or Lepaskan button.

- **Claude Code**: adds a command hook to `~/.claude/settings.json` for
  UserPromptSubmit, PostToolUse, Notification, Stop, SessionEnd. Everything
  else in the file stays; Lepaskan removes only entries naming our script.
- **Codex**: `notify` holds only one program, and it is already used (Codex
  Computer Use). Hubungkan puts our script first and the old program after
  `--`; the script passes every turn on to the old program. Lepaskan puts the
  old value back.
- **OpenCode**: writes `~/.config/opencode/plugins/notching.js`; Lepaskan
  deletes it.
- Notching Dev and Notching each hook their own script path (and OpenCode
  plugin file, named by the app's id), so they never undo each other.
- Before Notching first changes one of these files, it keeps a copy beside it
  ending in `.before-notching`. Agents already open read the change only
  after a restart.

## Non-goals

- Answering the agent from the notch (approve / deny). Read-only first.
- Agents other than these three (Gemini CLI, Cursor…): later, same inbox.
- Token counts, costs, transcripts.

## Left to the builder

Card layout and sizes, wording of labels, the module icon.
