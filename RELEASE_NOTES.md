# Mission Control 1.2.0 — Groundstation Worker Management & Terminal Layouts

This milestone closes the remaining multi-terminal desktop-management gap.
Groundstation can now configure the workspace through the existing Protocol v1
and EngineAPI paths instead of requiring the TUI or hand-edited JSON.

## Added

- New-worker form with manual or automatic startup
- Saved-preset picker backed by workspace `commands`
- Stopped-worker command, arguments, cwd, environment, restore-policy, and
  PowerShell compatibility editing
- Rename, remove, startup-policy, start, restart, stop, and acknowledge controls
- Single, horizontal, vertical, 2x2, and 3x2 terminal layouts
- Per-workspace layout and pane-assignment restoration
- Worker selection and explicit empty panes without duplicate terminal streams

## Reliability and security

- Every mutation remains routed through Protocol v1 and the public EngineAPI
- Destructive removal still requires main-process protocol confirmation
- Running workers cannot be reconfigured implicitly
- Environment values are never used for edit prefill and remain unchanged by
  default; replacement requires an explicit operator choice
- Pane reassignment closes the prior stream before the replacement opens
- Layout persistence stores only layout identifiers and worker IDs
- Renderer-side validation mirrors engine limits but the engine remains the
  authoritative validator and PTY owner

## Verification boundary

- Form validation, secret-preserving edit patches, required layout sizes,
  unique pane assignment, public action routing, destructive confirmation, and
  the production renderer build are automated.
- Native ConPTY behavior and the visible Electron interaction flow still require
  Windows 11 acceptance testing.

# Mission Control 1.1.0 — Groundstation Protocol & Real Terminal Matrix

This milestone begins the visible desktop product without rewriting the stable
Node engine. A transport-independent Protocol v1 and Electron host connect a
real React/xterm.js Groundstation to the same engine-owned PTYs used by the TUI.

## Added

- Versioned local request/response protocol with structured errors and limits
- Snapshot/event activation handoff with ordered non-terminal engine events
- Same-PTY terminal streams with bounded replay-before-live activation
- Stream IDs and terminal epochs that reject stale input and resize requests
- Electron engine host with workspace validation, leasing, and safe shutdown
- Sandboxed/context-isolated preload bridge and main-frame IPC enforcement
- Groundstation Overview, Terminals, Attention, and Activity surfaces
- Real four-pane xterm.js matrix with input, resize, focus mode, and controls
- Explicit Windows 11 acceptance checklist

## Reliability and security

- General IPC events exclude raw terminal output; panes subscribe explicitly
- One terminal stream per session/connection prevents competing writers
- Request, input, dimension, replay, live queue, and batch sizes are bounded
- Output overflow is observable and asks the pane to resynchronize
- Destructive actions require an exact main-process-validated confirmation
- Renderer reload disposes terminal listeners before reconnecting
- Workspace locks remain held when shutdown cannot stop an owned PTY
- Environment values remain outside state, event, activity, and renderer data

## Verification boundary

- Protocol, same-PTY routing, replay/live ordering, overflow, cleanup, IPC,
  workspace-host lifecycle, renderer bridge, engine regressions, and the Vite
  production build are automated.
- The Electron binary can be installed on this Linux build host, but no display
  server or native Windows ConPTY is available here. Windows 11 behavior remains
  an explicit acceptance gate.

# Mission Control 1.0.0 — Saved Worker Presets

This milestone completes the saved-command slice of the Workspace Engine.
Optional builds, checks, databases, and AI agents can remain available without
launching during restore or cluttering the active worker list.

## Added

- Optional top-level `commands` workspace definitions
- Public, redacted `EngineAPI.listSavedCommands()` contract
- Transaction-safe `createFromSavedCommand(id)` operation
- Ordered `saved-command:instantiated` activity events
- TUI saved-preset picker on `p`
- CLI validation and counts for saved commands
- `CommandRouter` support for future Groundstation clients

## Reliability

- Presets never launch while a workspace is loading
- Presets default to manual startup unless explicitly opted into automatic
- Instantiation reuses the single EngineAPI/SessionEngine creation path
- Failed workspace saves create no worker and launch no PTY
- Invalid and duplicate presets are isolated from valid sessions
- Preset environment values stay out of state, events, activity, and TUI data
- Structural workspace validation completes before EngineAPI load state changes

## Compatibility

- Workspace schema remains version 1 and `commands` is optional
- Existing workspaces need no migration
- Windows 11 ConPTY acceptance testing remains required for native attachment

# Mission Control 0.9.0 — Transaction-Safe Worker Reconfiguration

This milestone completes the core saved-worker lifecycle. Operators can change
a stopped worker's launch definition from Mission Control without hand-editing
workspace JSON or accidentally starting another process.

## Added

- Public `EngineAPI.reconfigure(id, patch)` operation
- Sanitized `getSessionConfiguration(id)` edit-prefill contract
- TUI worker editor for command, arguments, working directory, environment,
  and PowerShell compatibility
- Ordered `session:reconfigured` events and durable activity records
- `CommandRouter` support for future Groundstation edit clients

## Reliability

- Live workers reject edits without being stopped or restarted implicitly
- Reconfiguration serializes with start, restart, removal, and shutdown
- Workspace changes persist before runtime mutation and roll back on failure
- Edited launch definitions remain idle until explicitly started
- Prior output and lifecycle state are cleared when the launch definition
  changes, so old process facts are not presented as current
- Environment values never enter snapshots, edit-prefill data, event
  envelopes, or activity history
- Unknown patch fields and session-ID changes are rejected

## Compatibility

- Workspace schema remains version 1 and existing files need no migration
- Custom per-session fields are preserved during supported edits
- Windows 11 ConPTY acceptance testing remains required for native attachment

# Mission Control 0.8.0 — Controlled Workspace Restore

This milestone makes workspace restoration safe for larger projects. Saved
workers can now remain registered and observable without launching a process
until the operator explicitly starts them.

## Added

- Persisted `autoStart` policy with backward-compatible automatic startup
- Real `idle` lifecycle state for registered sessions with no owned PTY
- Public `EngineAPI.start(id)` and `setAutoStart(id, enabled)` operations
- Ordered `session:autostart` contract events and durable activity records
- TUI start control, startup-policy toggle, status counts, and metadata
- New Session wizard choice for automatic or manual workers

## Reliability

- Manual workspace restore creates zero PTYs for opted-out sessions
- Explicit start owns exactly one PTY and rejects duplicate live starts
- Start, restart, removal, and shutdown share lifecycle serialization
- Startup-policy saves complete before runtime state changes
- Failed policy saves leave both runtime and workspace JSON unchanged
- Changing startup policy never starts or stops the current process

## Compatibility

- Existing workspaces continue to start sessions automatically
- `autoStart: false` is an additive schema-v1 field; no migration is required
- Windows 11 ConPTY acceptance testing remains required for native attachment

# Mission Control 0.7.0 — Durable Activity & Attach Reliability

This milestone integrates the Windows Full Attach fixes from the updated GitHub
tree, closes their failure-path and performance gaps, and completes durable
Phase 2 activity history without introducing a database or native dependency.

## Added

- Atomic, bounded activity persistence beside persistent workspace files
- Event sequence continuity across Mission Control restarts
- Isolated recovery from corrupt, incompatible, or oversized activity history
- Explicit `powershellCompatibility` workspace option
- Raw VT replay metadata so truncated history falls back safely

## Reliability

- Full Attach reclaims stdin synchronously and keeps the CLI lifecycle alive
- Dead-session attach checks use fresh EngineAPI state
- Partial listener setup and live host-output failures clean up and return to
  Mission Control instead of leaking listeners or escaping PTY callbacks
- PowerShell host-input modes are filtered across chunk boundaries and disabled
  before Ink remounts
- Raw replay uses byte-accounted, coalesced chunks instead of repeatedly copying
  a one-megabyte string
- UTF-8 is never split during replay truncation; incomplete VT history is not
  replayed as if it were a valid screen
- The PSReadLine workaround is opt-in for configured sessions and enabled only
  for the Windows onboarding shell by default
- Raw output and output-derived attention reasons are excluded from the durable
  activity file

## Verification boundary

- Lifecycle, listener cleanup, bounded replay, persistence recovery, redaction,
  and sequence continuity are covered by automated tests.
- Windows 11 ConPTY, VS Code raw mode, Ctrl+C, resizing, and full-screen terminal
  applications still require manual host acceptance testing.

# Mission Control 0.6.0 — Replayable Activity Contract

This milestone gives future Groundstation clients a bounded way to learn what
changed without coupling them to Ink, PTYs, or Session Engine internals.

## Added

- Engine-owned, JSON-serializable activity history with sequence cursors
- Bounded replay through `EngineAPI.getActivity({ afterSequence, limit })`
- Explicit replay-gap and pagination metadata
- Workspace load/save failures and attach rejections in the versioned event
  stream
- Compact recent-activity feed in the TUI

## Reliability

- Raw terminal output remains live-only and is not duplicated into the
  activity history
- Activity records are bounded and returned as defensive copies
- Re-entrant subscriber actions are serialized so later observers never see
  sequence 2 before sequence 1
- Observer failures remain isolated from event publication and PTY ownership

## Current boundary

- Activity history is in-memory and resets between Mission Control launches.
  Durable timeline persistence remains a later Workspace Engine milestone.
- Windows 11 ConPTY behavior still requires manual host acceptance testing.

# Mission Control 0.5.0 — Engine Contract & Transaction Safety

This milestone turns the Engine API into a safer foundation for the future
Groundstation desktop client without introducing IPC or coupling the engine to
a GUI framework.

## Added

- Versioned, JSON-serializable `EngineAPI.getState()` envelopes
- Ordered subscription events with contract version, sequence, and timestamp
- Public EngineAPI resize operation for terminal clients and command routing
- Regression coverage for disk-write failures and API boundary leaks
- Per-session lifecycle serialization and shutdown coordination with in-flight
  restarts/removals
- Observer isolation so client callback failures cannot unwind engine lifecycle
  operations or starve later subscribers

## Changed

- The Session Engine and Workspace Store are private implementation details of
  `EngineAPI`
- `CommandRouter` now dispatches only through public EngineAPI methods
- Create and rename persist before runtime mutation
- Removal stops the owned PTY, persists deletion, then finalizes engine removal
- WorkspaceStore mutations commit in memory only after the atomic disk write
  succeeds
- Atomic workspace writes now flush temporary-file contents before replacement
- Shutdown blocks new lifecycle actions, waits for in-flight work, and reopens
  the API if a stuck PTY prevents a safe stop

## Failure behavior

- A failed create save spawns no PTY
- A failed rename save leaves both runtime and JSON names unchanged
- A failed remove save keeps the safely stopped session tracked and returns a
  hard error instead of a success-with-warning result

## Verification boundary

- Transaction ordering, rollback state, contract serialization, monotonic event
  sequences, same-PTY attachment, and architecture boundaries are covered by
  automated tests.
- Windows 11 ConPTY behavior still requires manual host acceptance testing.

# Mission Control 0.4.0 — Startup Safety

This milestone hardens the boundary between a workspace definition and the
processes Mission Control owns. It also improves operator clarity without
changing the one-PTY-per-session architecture.

## Added

- `--config`, `--check`, `--help`, and `--version` CLI options
- No-process workspace validation with actionable per-session errors
- Atomic per-workspace lease with PID metadata and stale-lock recovery
- Duplicate-instance protection before any workspace PTY can spawn
- Coordinated all-session shutdown before workspace ownership is released
- Keyboard help overlay and cyclic attention navigation
- Persistent/temporary workspace indicator and last-output timestamps

## Changed

- Existing malformed workspaces now fail closed instead of silently launching
  an unrelated fallback shell
- Explicit missing config paths exit with an actionable error
- The default one-shell fallback remains available only when the default config
  path is absent

## Verification

- CLI validation tests prove `--check` does not need to launch configured
  commands.
- Lease tests cover live-owner rejection, stale recovery, idempotent release,
  partial-write protection, cross-host safety, and ownership-token protection.
- Engine and mounted Ink tests cover last-output metadata, attention cycling,
  and Windows enhanced-Escape help dismissal.
- Native Windows ConPTY behavior still requires manual Windows 11 testing.

# Mission Control 0.3.0 — Attention Foundation

This milestone preserves the Workspace Engine and same-PTY attach architecture
while adding the first deterministic supervision layer.

## Added

- Sticky `attentionRequired` state for classified error output, spawn failures,
  and unexpected non-zero exits
- `session:supervision` events and `EngineAPI.acknowledge(id)`
- Attention count, failure reason, jump-to-attention, and acknowledge controls
- Shared Windows enhanced-Escape handling across Tail and modal prompts
- Linux Node 20/22 and Windows Node 22 CI
- Package file allow-list and repository hygiene rules

## Fixed

- Full Attach handoff now registers Ink's exit wait before unmounting
- Full Attach handoff errors no longer become unhandled promise rejections
- Ink input integration tests wait for input readiness instead of relying on a
  host-speed timing assumption
- ANSI stripping now has one implementation shared by snapshots and
  classification

## Repository cleanup

- Generated `node_modules` content is no longer tracked
- Machine-local `termctl.config.json` is no longer tracked; the example remains

## Verification

- 56 engine, TUI integration, syntax, and module-loading tests pass.
- `npm pack --dry-run` produces a 23-file package without generated or local
  configuration content.
- Windows CI covers syntax, engine behavior, and Ink integration with Node 22.
- Manual Windows ConPTY/VS Code attach verification remains required.

# Mission Control 0.2.0 — Workspace Engine

This milestone continues from the verified same-PTY Phase 1 foundation. It does
not introduce cloud, mobile, split attach, or the Groundstation GUI.

## Added

- Versioned, human-readable workspace configuration
- Atomic workspace writes that preserve unrelated configuration fields
- Workspace-relative working directories
- Validated per-session arguments and environment overrides
- Persistent create, rename, and remove operations through `EngineAPI`
- Safe removal that waits for the owned PTY and aborts rather than abandoning it
- `session:removed` subscription events
- Cancellation of restart/removal waits during engine disposal
- Guided TUI session creation and typed removal confirmation
- Compact status overview, bounded session navigation, failure emphasis, PID,
  environment-key count, and recent-output preview
- Node.js LTS compatibility declaration

## Removed

- The unused `better-sqlite3` dependency and disconnected registry prototype.
  Workspace persistence now uses atomic JSON and leaves `node-pty` as the only
  native dependency.

## Verification

- 46 unit and Ink integration tests pass.
- Every `.js` and `.cjs` file passes `node --check`.
- ESM UI imports and CommonJS engine imports were exercised.
- The CLI mounted in a real Linux PTY and quit cleanly with exit code 0.
- The 50-session bounded-output stress test passes with one PTY per session.
- Static scans found no TUI process spawning, inherited-stdio attach, JSX, or
  direct TUI access to the Session Engine's session map.

## Not verified in this environment

Windows 11 ConPTY behavior, VS Code raw-mode ownership, Windows resize behavior,
and interactive full-screen terminal programs still require manual testing on
Windows with Node.js 22 LTS. The Linux runner uses Node 24 and cannot load the
native `node-pty` addon, so native PTY behavior is not claimed as runtime-tested
here.
