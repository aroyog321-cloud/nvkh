# Mission Control

Mission Control is a Windows-first, local developer command center built around
one authoritative Node.js process/session engine. It now has two clients:

- **Groundstation**, an Electron/React desktop control surface with real
  one-, two-, four-, and six-pane xterm.js layouts, Overview, Attention, and
  Activity.
- **TUI**, an Ink-based supervision and recovery client.

Both clients preserve one source of truth for every session: the PTY created and
owned by `SessionEngine` behind the public `EngineAPI` boundary.

## Groundstation desktop preview

Groundstation connects to the real engine through Protocol v1. It does not use
demo state and does not spawn replacement shells to render terminals.

```powershell
npm install
npm run groundstation -- --config D:\Projects\app\termctl.config.json
```

Omit `--config` to use `termctl.config.json` in the current directory. If that
default file is absent, Groundstation starts the same one-shell onboarding
workspace as the TUI.

The current desktop preview provides:

- Real workspace health and worker status
- One-, two-, four-, and six-pane existing-PTY terminal layouts
- Project-specific layout and pane-assignment restoration
- Focused-pane keyboard input and ConPTY resize forwarding
- Terminal focus/fullscreen mode
- New-worker and saved-preset creation through the real EngineAPI
- Stopped-worker editing, rename, removal, and restore-policy controls
- Start, restart, confirmed stop, and attention acknowledgement
- Durable activity and attention views
- Bounded replay-before-live terminal handoff
- Secure preload bridge with context isolation, renderer sandboxing, strict IPC
  validation, destructive-action confirmation, and no raw Node access

Electron owns no separate session engine: its main process hosts the same
`EngineAPI`, workspace lease, persistence, and shutdown rules used by the TUI.
Closing Groundstation stops owned PTYs before releasing the workspace lease. A
stuck PTY blocks safe close instead of allowing a second owner to start duplicate
processes.

This is a developer preview, not yet a signed Windows installer. Complete the
checks in `WINDOWS_ACCEPTANCE.md` on Windows 11 before treating native ConPTY
behavior as verified.

## Current capabilities

- Snapshot list with `idle`, `starting`, `running`, `exited`, and `failed` lifecycle state
- Read-only, bounded, live Tail for the selected PTY
- Full Attach to the same existing PTY (no duplicate shell or command)
- Exit code, spawn error, command, working directory, start time, and runtime
- Safe restart that waits for the old PTY to exit before spawning a replacement
- Kill confirmation and rename prompt
- Persistent create, rename, and remove operations through the Engine API
- Controlled workspace restore with automatic and manual-start sessions
- Explicit start and persisted startup-policy controls without duplicate PTYs
- Transaction-safe editing of stopped worker launch definitions
- Saved worker presets that remain inert until explicitly instantiated
- Full Groundstation worker management through Protocol v1, including create,
  preset instantiation, edit, rename, remove, and startup policy
- Groundstation layouts for single, horizontal, vertical, 2x2, and 3x2 terminal
  arrangements, with unique worker assignment and optional empty panes
- Atomic JSON workspace saves with schema and session validation
- Workspace-relative working directories and per-session environment overrides
- Throttled output-driven UI updates
- Deterministic output classification with sticky, acknowledgeable attention
- Fail-closed workspace startup and a no-process `--check` validation command
- Per-workspace single-instance lease that prevents duplicate session launches
- Coordinated shutdown that retains workspace ownership until PTYs exit
- Configurable workspace path with `--config`
- Keyboard guide, cyclic attention navigation, and last-output timestamps
- Engine facade with `list`, `getSnapshot`, `subscribe`, `write`, and
  `attachRawStream`
- Versioned, JSON-serializable engine state and ordered event envelopes used by
  the desktop Protocol v1 client
- Bounded, replayable activity history for lifecycle, attention, workspace,
  and attach events without retaining raw terminal-output events twice
- Durable activity history for persistent workspaces, with monotonic event
  sequences preserved across Mission Control restarts
- Compact recent-activity surface in the TUI, driven by real engine events
- Transaction-safe workspace mutations that fail before runtime state can
  diverge from the saved configuration
- Per-session lifecycle serialization so restart/removal races cannot orphan a
  replacement PTY, with shutdown waiting for in-flight lifecycle work
- Observer isolation so a faulty UI/event subscriber cannot interrupt PTY
  creation, ownership, or later subscribers

Interactive Split Attach is intentionally not part of this phase. The stable
interaction ladder is Snapshot → Tail → Full Attach.

## Requirements

- Windows 11
- Node.js 22.12+ LTS recommended for Groundstation
- PowerShell, cmd, or another configured terminal command

`node-pty` is the only native dependency. Use Node.js 20 or 22 LTS; Node 22 is
recommended for Windows. The previous unused `better-sqlite3` dependency was
removed so persistence does not add a second native build failure surface.

## Install and run

```powershell
npm install
npm start
```

Use another workspace file or validate one without starting any commands:

```powershell
npm start -- --config D:\Projects\app\termctl.config.json
node bin\termctl.js --config D:\Projects\app\termctl.config.json --check
```

An explicitly selected, malformed, or unreadable workspace fails closed. Mission
Control does not replace it with a fallback shell. When the default
`termctl.config.json` is absent, the original one-shell onboarding fallback is
still used.

Only one Mission Control process can own a persistent workspace at a time. The
workspace lock records the owner PID and is removed during normal shutdown;
stale locks left by a crashed process are recovered on the next launch.
Normal quit waits for every owned PTY to report exit before releasing that
lease. If a PTY is stuck, shutdown pauses and Mission Control remounts instead
of opening a window where another instance could launch duplicate work.

Mission Control reads `termctl.config.json` from the current working directory.
If that default file is missing, it starts one platform-default shell. If the
file exists but is invalid, startup stops with an error.
Valid workspace files use schema version `1`. Legacy files without `version`
remain supported and are upgraded when Mission Control first saves them.

Commands containing spaces, such as `npm run dev`, run through the platform
shell. For a direct executable with explicit arguments, use an `args` array:

```json
{
  "sessions": [
    {
      "id": "pwsh",
      "name": "PowerShell",
      "command": "powershell.exe",
      "args": ["-NoLogo"],
      "powershellCompatibility": true,
      "cwd": "."
    },
    {
      "id": "server",
      "name": "Dev server",
      "command": "npm run dev",
      "cwd": "./web",
      "env": { "PORT": "3000" },
      "autoStart": false
    }
  ],
  "commands": [
    { "id": "checks", "name": "Run all checks", "command": "npm test", "cwd": "." },
    {
      "id": "build",
      "name": "Production build",
      "command": "npm run build",
      "cwd": ".",
      "autoStart": true
    }
  ]
}
```

Relative working directories resolve from the directory containing
`termctl.config.json`, not from whichever directory later launches the app.
Environment values are passed to the child PTY, but only environment key names
are exposed through snapshots so secrets do not leak into the dashboard.

Top-level `commands` are saved worker presets. They are validated when the
workspace loads but never launch a process at that time. Press `p` to choose a
preset; Mission Control atomically adds it to `sessions` through the same
EngineAPI creation path used by the normal wizard. Presets default to manual
startup, so selecting one registers an idle worker and `s` starts it. Set
`"autoStart": true` on a preset only when selecting it should launch
immediately. Invalid presets are isolated and do not block valid sessions or
other presets. Environment values in presets are never exposed by state,
events, activity history, or picker data.

`powershellCompatibility` is an explicit Windows fallback for terminal hosts
where PSReadLine cannot accept byte-stream input after Full Attach. It disables
PSReadLine for that session, so leave it off when normal PowerShell editing and
history already work. When enabled, put the executable in `command` and every
option in `args`; Mission Control does not guess how to split a command line.

Sessions start automatically by default for backward compatibility. Set
`"autoStart": false` to restore a worker as `idle` without launching its PTY.
Press `s` to start it explicitly and `u` to change its saved restore policy.
Changing the policy never starts or stops the current process. The New Session
wizard can also register a manual session without executing it.

Creating, renaming, or removing a session in the TUI updates the same workspace
file atomically. Create and rename are persisted before runtime mutation. A
running session is stopped before removal is persisted, then removed from the
engine only after the save succeeds. If that save fails, Mission Control keeps
the stopped session tracked and reports a hard failure; it never abandons an
owned PTY or claims that an unsaved mutation succeeded.

Press `e` on an idle, exited, or failed worker to edit its command, arguments,
working directory, environment overrides, or PowerShell compatibility. Mission
Control never stops or restarts a process implicitly for an edit; a running
worker must be stopped first. Changes are saved before runtime state is updated,
and the edited worker remains idle until `s` starts it. Blank edit fields keep
their current values. Environment input accepts a JSON object, pre-fills only
key names rather than saved values, and accepts `{}` to clear all overrides.

Start, restart, policy, and remove operations for the same session are
serialized across the entire EngineAPI transaction. Shutdown first blocks new
lifecycle work, waits
for any in-flight operation, and then stops the final owned PTYs. If shutdown
cannot stop a PTY, the API reopens so the operator can take corrective action.

## Controls

| Key | Snapshot | Tail | Full Attach |
|---|---|---|---|
| `j` / `k` | Move selection | — | Forwarded to PTY |
| `Enter` | Open Tail | — | Forwarded to PTY |
| `Esc` | — | Return to Snapshot | Press twice to detach |
| `F` | Full Attach | Full Attach to same PTY | Forwarded after attach starts |
| `Ctrl+]` | — | — | Detach without stopping session |
| `Ctrl+C` | Quit signal outside attach | — | Forwarded to the child session |
| `s` | Start selected idle/exited worker | — | — |
| `r` | Restart | — | — |
| `u` | Toggle automatic/manual startup | — | — |
| `e` | Edit selected stopped worker | — | — |
| `p` | Open saved worker presets | — | — |
| `g` | Cycle through sessions needing attention | — | — |
| `a` | Acknowledge selected attention item | — | — |
| `c` | Create session | — | — |
| `n` | Rename | — | — |
| `x` | Kill with typed confirmation | — | — |
| `d` | Remove with typed confirmation | — | — |
| `q` | Quit Mission Control | — | — |
| `?` / `h` | Open keyboard guide | — | — |

`Ctrl+\\` is also accepted as a Full Attach detach fallback. `Ctrl+]` is the
recommended unambiguous detach key.

## Tests

```powershell
npm test
```

The suite uses an injected fake PTY for deterministic lifecycle, attachment,
listener-cleanup, restart/removal races, bounded-buffer, environment redaction,
workspace persistence, and high-output tests. It also mounts the real Ink
component tree to verify Tail input behavior and redraw throttling.

The repository CI runs on Node.js 20 and 22 on Linux, plus Node.js 22 on
Windows. Generated dependencies and machine-local `termctl.config.json` files
are intentionally excluded from source control.

Real Windows ConPTY behavior—especially VS Code raw-mode ownership, Ctrl+C,
resize, and full-screen terminal programs—must still be manually tested on
Windows. Unit tests cannot prove those host-specific behaviors.

## Architecture boundary

TUI components and `CommandRouter` use `EngineAPI`; they do not receive a
public `SessionEngine` reference or read `SessionEngine.sessions`.
Full Attach obtains a small raw adapter from `attachRawStream(id)` with explicit
`write`, `resize`, `onData`, and `onExit` methods. It never launches a process.
Workspace mutations use the same facade and an atomic, human-readable JSON
store. Groundstation now consumes this boundary through a separate versioned
protocol; its renderer never receives `EngineAPI`, `SessionEngine`, or Node
process access.

Protocol v1 validates fixed request/response envelopes, bounds every request
and terminal stream, gates destructive actions, and separates overview events
from explicit raw-terminal subscriptions. Terminal open registers the live
listener before reading replay, queues output until renderer activation, and
rejects stale stream identifiers after restart, exit, reload, or close.

Groundstation worker forms use the same protocol actions as the TUI and never
receive private engine or workspace-store objects. Editing a stopped worker
prefills environment key names only; existing values remain unchanged unless
the operator explicitly replaces the environment object. Terminal layout state
contains only layout identifiers and worker IDs and is stored per persistent
workspace in Electron renderer storage. Reassigning or emptying a pane disposes
its existing terminal stream before another worker is opened.

`EngineAPI.getState()` returns a JSON-serializable contract envelope with
`contractVersion`, the latest event `sequence`, workspace facts, and session
summaries. It also includes the latest bounded activity window. Subscription
events include the same contract version plus a strictly increasing sequence
and timestamp. Re-entrant observer actions are queued so every subscriber sees
the same sequence order.

Session summaries expose `autoStart` separately from lifecycle `status`. An
idle session is a real engine-owned definition with no PTY; `EngineAPI.start()`
is serialized with restart, removal, and shutdown so concurrent controls cannot
orphan a newly started process. `session:autostart` records policy changes in
the same ordered activity contract.

`EngineAPI.reconfigure(id, patch)` serializes with start, restart, removal, and
shutdown. It rejects live sessions and immutable ID changes, validates the
merged definition, atomically persists it, then updates the stopped runtime
session without spawning a PTY. `getSessionConfiguration(id)` exposes editable
facts while returning environment key names only. The resulting
`session:reconfigured` event and durable activity record never contain
environment values.

`EngineAPI.listSavedCommands()` exposes sanitized preset summaries, including
environment key names but never values. `createFromSavedCommand(id)` reuses the
transaction-safe `create()` path, so a failed workspace save launches no PTY
and a successful preset can own at most one session/process. The additive
`saved-command:instantiated` event records the source preset without copying
its environment into the public contract.

`EngineAPI.getActivity({ afterSequence, limit })` supports bounded replay and
reports `gap` when a client asks for history older than the retained window.
Raw `session:output` events remain live-only because terminal snapshots already
own bounded output; lifecycle, attention, workspace-save, load-error, and
attach-rejection events are retained. Persistent workspaces save at most 200
activity records in an atomic JSON sidecar next to the workspace file. Event
sequences continue across launches. Raw output is never written there, and
output-derived attention reasons are removed before persistence. Corrupt or
oversized history is surfaced as an activity error without blocking valid
workspace sessions.

Contract version `1` is additive: future clients can reject unknown major
versions instead of guessing at an incompatible payload.

The attention model is also engine-owned. Known error output, spawn failures,
and unexpected non-zero exits create a sticky `attentionRequired` fact. Later
progress output cannot silently clear it; the user explicitly acknowledges it
with `a`, and every client receives the same `session:supervision` event.
