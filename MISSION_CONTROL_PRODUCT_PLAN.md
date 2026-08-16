# Mission Control product, UI/UX, and implementation plan

This plan is based on the v1.6.3 Groundstation renderer, engine boundaries, README,
release notes, and the supplied UI/UX review. It is a product plan only. It does not
change React, CSS, Electron, PTY ownership, Protocol v1, or engine behavior.

## Executive direction

Mission Control should become a quiet, high-trust developer operations room. Its job
is not to display every tool at once. Its job is to interpret project state, connect
events, identify what needs human judgment, and offer the safest useful next action.

The product promise is:

> In five seconds, I know what is running, what changed, what needs me, and what I
> should do next.

The durable mental model is **project -> missions -> workers -> evidence -> decisions**.
Terminals, tests, Git, Docker, and AI agents are evidence-producing workers. “Needs
You” is the decision layer. History explains cause and recovery.

## Current-state assessment

### What v1.6.3 already improved

- Groundstation has a distinct product vocabulary: Project Pulse, Worker Canvas,
  Needs You, Agent Operations, Mission Command, and Project Memory.
- Workspace supports one-, two-, four-, and six-pane terminal layouts over existing
  engine-owned PTYs.
- Terminal focus, expansion, worker selection, empty-pane assignment, and a contextual
  inspector exist.
- Local AI adapters are allow-listed and launch Claude Code, Codex, Gemini CLI, and
  OpenCode without accepting arbitrary executables through the agent protocol.
- Attention and activity are engine-owned, durable, and consumed through Protocol v1.
- Projects can be switched and restored with transactional recovery behavior.
- Interface density, type scale, terminal font size, and reduced motion are exposed.
- The visual system already avoids bright gaming-neon styling and keeps terminal
  surfaces opaque.

### What is still weak

- Groundstation remains a composition of a hero, operations ribbon, worker cards,
  quick look, Docker panel, and agent rail. This reads as a polished dashboard rather
  than a live operating environment.
- Worker state is repeated across too many surfaces, increasing scanning rather than
  reducing it.
- Seven primary destinations expose too much product structure. Agents, Projects, and
  Settings do not need equal daily prominence.
- Worker types share nearly identical cards even though persistent services, test
  watchers, databases, one-shot builds, and AI agents have different behaviors.
- Agent progress is shown as a fixed 68% while running. Unknown progress must never be
  presented as a measured percentage.
- Agent mission and risk labels are inferred from liveness rather than supported by
  evidence.
- “Mark resolved” performs acknowledgement. Acknowledgement and verified recovery are
  different states.
- Mission Command styles the first result as selected and advertises arrow/Enter
  navigation, but it does not implement a real active-result keyboard model.
- History is chronological but mostly generic; it does not connect command, actor,
  affected worker, files, tests, failure, intervention, and recovery.
- Much operational copy is 7–10px, below a comfortable all-day desktop baseline.
- Continuous orbit/breathing animations imply activity without communicating a state
  transition.
- Native confirmation dialogs interrupt the otherwise custom desktop experience.

## Product architecture plan

### Primary navigation

Keep four daily destinations:

1. **Groundstation** — the active project scene and next action.
2. **Workspace** — direct control of terminals and workers.
3. **Needs You** — prioritized human decisions.
4. **History** — causal project memory.

Move these out of primary navigation:

- **Agents** becomes an Agent Dock plus inspector inside Groundstation/Workspace.
- **Projects** becomes a project switcher in the title bar and Mission Command.
- **Settings** becomes an application menu destination.
- **Git, tests, builds, Docker, logs, and diagnostics** remain contextual inspectors,
  drawers, or overlays.

### Groundstation scene

Replace stacked summaries with a single spatial scene:

- A compact top Pulse Strip shows project name, branch, health statement, active
  workers, active agents, and attention count.
- The central area shows worker groups and their dependencies. It is not a node graph
  by default; relationships appear only when they explain startup, failure, or impact.
- A narrow activity edge shows the last meaningful change and expands into History.
- The Agent Dock shows each agent's current mission phase and blocking state.
- A collapsed Needs You shelf appears only when decisions exist.
- Selecting anything updates one consistent inspector. It does not create a second
  summary elsewhere.

Project health should use explainable language such as “Healthy — all required
services responding” or “Degraded — API stopped; frontend still available.” Do not
ship a numeric score until its inputs, weighting, and trend are inspectable.

### Worker model

Use a shared frame but type-specific bodies:

| Worker type | Primary information | Primary actions |
| --- | --- | --- |
| Service | health, port, uptime, dependency state | open, restart, stop |
| Test watcher | pass/fail/skip, last run, failing suites | rerun failed, inspect failure |
| Database | connectivity, migration state, dependent services | inspect, reconnect, restart |
| Build/CI | phase, duration, artifact/result | inspect step, retry |
| Git | branch, dirty files, incoming/outgoing state | inspect changes, open editor |
| Terminal | live output, shell identity, cwd | focus, clear, restart |
| AI agent | mission, phase, evidence, permissions, blocker | inspect, instruct, approve, stop |

Worker states use a common vocabulary: **starting, healthy, busy, waiting, needs-you,
failed, stopping, stopped, completed**. “Acknowledged” is an event, not a health state.

### Needs You decision model

Every queue item must include:

- What happened.
- Why the developer is needed.
- Impact if ignored.
- Relevant evidence.
- One recommended action and safe alternatives.
- Verification state after an action.

The lifecycle is **new -> seen -> action chosen -> action running -> verifying ->
recovered/failed/dismissed**. Dismissal suppresses a decision; it does not change the
underlying worker state.

Examples:

- “API exited with code 1. Port 8080 is occupied.” Actions: **Stop conflicting
  process and restart**, View logs, Dismiss.
- “Codex requests `npm test`.” Actions: **Approve once**, Approve for this mission,
  Reject. Show command, cwd, environment redactions, and expected risk.
- “3 tests failed after Agent A changed 4 files.” Actions: **Inspect failures**, Revert
  agent changes, Ask agent to repair.

### AI agent model

Treat agents as supervised workers, not chatbots. Each agent surface displays:

- Mission: the outcome requested by the human.
- Phase: orienting, planning, editing, validating, waiting, complete, or failed.
- Current action: evidence-backed command/file/activity when available.
- Evidence: files touched, commands run, tests, diagnostics, and diffs.
- Permissions: current allow-list and pending approvals.
- Risk: derived from concrete actions, not a decorative “low risk” badge.
- Result: what changed, what was verified, and what remains uncertain.

Use indeterminate phase activity when completion cannot be measured. Percentages are
allowed only when a bounded process reports real completed/total units.

### Mission Command

Mission Command becomes the universal operational entry point:

- True keyboard selection with Up/Down, Enter, Escape, and visible focus.
- Categories: Actions, Workers, Projects, Missions, History, Files, Logs, Settings.
- Context-first ranking: focused worker actions precede global navigation.
- Fuzzy search, aliases, recent commands, and stable shortcuts.
- Chained commands with a preview: “restart API then run failed tests.”
- Natural language may propose a command plan, but execution still uses known protocol
  actions and approval gates.
- Destructive actions always show target, effect, and recovery path.

Initial commands should include: restart focused worker, open terminal, rerun failed
tests, show recent errors, switch project, start saved workspace, inspect agent changes,
and open Needs You.

### History and causality

Extend events into causal groups without storing raw terminal output twice:

`actor -> action -> affected resources -> result -> validation -> recovery`

History should support:

- Filters by worker, mission, agent, risk, and time range.
- Event correlation IDs and parent/child relationships.
- A “Why?” expansion that reveals preceding evidence.
- Session chapters such as startup, feature work, failure, and recovery.
- “Since I left” and end-of-session summaries.
- Deep links back to the relevant worker, terminal snapshot, diff, or decision.

Session scrubbing is a later enhancement and must clearly distinguish recorded state
from the live workspace.

## UI/UX plan

### Layout and hierarchy

- Let the working surface occupy at least 70% of the default viewport.
- Use one inspector model across workers, agents, tests, Git, and events.
- Keep important operational text at 12–14px and metadata at 11px minimum by default.
- Reserve uppercase tracked labels for rare section markers, not routine metadata.
- Reduce nested bordered containers; separate major zones with surface changes and
  hairlines.
- Keep hit targets at least 32px in dense desktop mode and 40px in comfortable mode.
- Preserve the current high-contrast opaque terminal surface.

### Visual system

Recommended “Obsidian Signal” base:

| Token | Value |
| --- | --- |
| App background | `#080A0F` |
| Surface | `#10141D` |
| Elevated surface | `#171D28` |
| Glass | `rgba(25, 32, 45, 0.76)` |
| Border | `rgba(255, 255, 255, 0.09)` |
| Primary text | `#F2F5FA` |
| Secondary text | `#A7B0C0` |
| Muted text | `#707A8D` |
| Running/success | `#43D39A` |
| Needs You | `#F0C56A` |
| Failure | `#FF6575` |
| AI | `#9B88FF` |
| Terminal/focus | `#70B8FF` / `#79AFFF` |

Color communicates state, never worker identity alone. Red means actionable failure,
not an ordinary stopped state. AI purple identifies agent-related elements but does
not become a universal accent.

Glass is limited to Mission Command, Quick Look, transient inspectors, project
switcher, context menus, and approval previews. Logs, terminals, diffs, long text, and
the primary workspace remain opaque. Provide reduced-transparency fallbacks.

### Motion system

- Micro feedback: 100–160ms.
- Hover/focus: 120–180ms.
- Drawers/inspectors: 220–320ms.
- Workspace restore sequence: 300–700ms total, reflecting real dependency startup.
- Use motion when state or spatial ownership changes; keep healthy idle scenes still.
- Agent animation reflects phase changes or current activity and stops immediately
  when waiting or complete.
- Reduced-motion mode removes transforms and looping animation while preserving state
  changes through color, icon, and copy.

### Interaction details

- **Select** updates the inspector.
- **Quick Look** is a temporary preview, ideally hover + Space.
- **Focus** expands the live operational surface.
- Destructive confirmation uses a contextual dialog with target, consequence, and
  shortcut—not a native browser prompt.
- Empty states offer one best next step. Loading states describe the current restore
  phase. Errors offer recovery and diagnostics.
- Notifications are quiet by default; sound and strong movement are opt-in for blocking
  events only.

## Implementation plan

### Phase 0 — Measurement and contracts (1 week)

- Define activation, time-to-understand, time-to-recover, approval latency, false
  attention rate, and command-palette success metrics.
- Inventory every renderer view and duplicated status field.
- Define the worker-state and decision-state vocabularies.
- Document which UI facts already exist in Protocol v1 and which require additive
  protocol fields.
- Add accessibility baselines: keyboard reachability, focus order, contrast, reduced
  motion, reduced transparency, and default font-size minimums.

**Exit criteria:** every planned UI element names its data source; no design depends on
invented progress, health, or risk.

### Phase 1 — Trust and usability repairs (1–2 weeks)

- Replace fixed agent percentages with phase/indeterminate status.
- Rename “Mark resolved” to “Acknowledge” until verified resolution exists.
- Implement real Mission Command keyboard selection and remove unsupported hints.
- Replace native confirmations with contextual dialogs.
- Raise typography minimums and validate 100%, 125%, and 150% scaling.
- Remove decorative continuous animation from idle status surfaces.
- Unify Select, Quick Look, and Focus language.

**Exit criteria:** keyboard-only operation passes; UI labels match actual engine actions;
no fabricated operational data remains.

### Phase 2 — Information architecture and scene (2–4 weeks)

- Reduce daily navigation to four destinations.
- Build the compact Pulse Strip and project switcher.
- Replace the Groundstation stack with the worker-group scene.
- Consolidate Quick Look and the agent rail into the shared inspector/Dock model.
- Introduce type-specific worker bodies using existing session facts.
- Preserve Workspace as the direct terminal control surface.

**Exit criteria:** each operational fact has one primary home; a usability test user can
answer the five core questions in under five seconds.

### Phase 3 — Needs You as a decision queue (3–5 weeks)

- Introduce explicit decision records and lifecycle states.
- Attach evidence, recommended actions, alternatives, and verification.
- Separate acknowledge, dismiss, retry, approve, reject, and recovered semantics.
- Group duplicate symptoms into one incident.
- Add severity, snooze, and notification preferences.

**Exit criteria:** every decision identifies why a human is required and verifies the
result of the chosen action.

### Phase 4 — Missions and evidence-based agents (4–6 weeks)

- Add mission metadata and agent phases.
- Correlate agent activity with commands, file changes, tests, and approvals.
- Add mission summaries and side-by-side agent comparison.
- Add permission scopes and approval previews.
- Transform Tasks into lightweight Missions; do not add boards, sprints, or backlog
  management.

**Exit criteria:** users can explain what each agent is doing, what changed, what was
verified, and what needs approval without reading the full terminal.

### Phase 5 — Causal history and daily workspaces (4–6 weeks)

- Add correlation and causal relationships to activity events.
- Build chapters, “Why?”, “Since I left,” and session summaries.
- Add saved workspace recipes with dependency order, health checks, layout restore,
  pause/resume, and failure handling.
- Show startup progress as real dependency transitions.

**Exit criteria:** a user can trace a failure to actor/action and recovery; a known
workspace starts reliably with one deliberate action.

## Future updates plan

### Near term (next 1–2 releases)

- Trust repairs, typography, keyboard palette, custom confirmation dialogs.
- Four-destination navigation and unified inspector.
- Groundstation scene and worker-specific treatments.
- Decision-oriented Needs You MVP.

### Medium term (following 2–4 releases)

- Missions and evidence-backed agent phases.
- Git/test/build correlation and causal History.
- Daily workspace recipes and morning briefing.
- Notification controls, quiet hours, and session summaries.

### Long term ecosystem

#### VS Code bridge

A local extension should connect through an authenticated loopback transport and expose
terminal identities, active file, diagnostics, Git state, and open-file commands. The
Groundstation shows clear connection ownership and per-capability permissions. It does
not silently commandeer VS Code terminals. Deep links open the exact file/line or
Problems entry in VS Code.

#### Mobile supervision companion

Mobile is for health, summaries, approvals, safe restart, and bounded log excerpts—not
a general remote shell. Pair devices with short-lived keys, show desktop presence,
require biometric confirmation for sensitive approvals, allow immediate revocation,
and keep an audit trail.

#### MCP-style integration and integrated assistant

Expose read-only tools first: project state, workers, recent events, diagnostics, test
status, and Git summary. Mutation tools are individually allow-listed and capability
scoped. Commands include cwd, exact arguments, timeout, environment redactions, risk,
and approval policy. Protect secrets at collection and rendering boundaries. Maintain
an immutable audit record and provide rollback where the underlying operation supports
it. Local-only mode is the default.

#### Plugins

Plugins declare data access, actions, UI surfaces, and permissions. They cannot receive
raw terminal streams or secrets by default. Initial plugin targets should be test
runners, Docker, common dev servers, GitHub Actions status, and framework diagnostics.

## Prioritization rules

Use this order when scope conflicts arise:

1. Trustworthiness of state and actions.
2. Reduction of mental load.
3. Keyboard speed and recovery speed.
4. Clear causality and agent evidence.
5. Visual refinement and motion.
6. Ecosystem expansion.

Do not add mobile, MCP mutation, natural-language execution, or elaborate canvas
visualization before the decision model and safety/audit foundations are complete.

## Success measures

- Median time to answer the five core questions is under five seconds.
- At least 90% of common worker actions are reachable by keyboard.
- Zero UI labels claim resolution without verified recovery.
- Zero synthetic progress or risk values.
- Attention precision improves while duplicate decision items decline.
- Median failure-to-recovery time decreases release over release.
- Daily workspace launch completes with explicit dependency and health feedback.
- Users can attribute an agent change and its validation evidence from one surface.

## Change summary

### Already changed in v1.6.3

The product has moved from a basic terminal/control dashboard toward Groundstation,
Workspace, Needs You, Agents, History, project restoration, persistent layouts,
allow-listed AI workers, contextual inspection, interface preferences, and a restrained
dark visual identity. The engine and PTY architecture are strong foundations and should
remain intact.

### Planned next

The next work should correct trust and accessibility issues, simplify navigation,
replace the dashboard stack with a live project scene, make Needs You a verified
decision workflow, make agents mission/evidence driven, and turn History from an event
list into causal project memory.

### Planned later

Once those foundations are proven, add daily workspace recipes, VS Code bridging,
mobile supervision, safe MCP-style tools, an integrated operational assistant, and a
permissioned plugin ecosystem.

## Remaining roadmap after the trust-first implementation

The current implementation covers navigation simplification, explainable health,
role-aware workers, agent conversations and multiple-agent launch, a decision-oriented
Needs You UI, Mission Command keyboard operation, Project Memory search, local agent
missions, per-project “Since You Last Checked” briefings, hold-Space Worker Quick Look,
fuzzy Mission Command with aliases/recents, start/stop-all workspace controls, and
project-local recipes that capture worker startup order and terminal layout.

Work still requiring engine or product expansion:

1. **Verified decision lifecycle** — explicit new/seen/action/verifying/recovered
   records, incident grouping, snooze, severity policy, and notification preferences.
2. **Evidence-backed agent missions** — durable engine mission metadata, file changes,
   diffs, commands, tests, permission scopes, approval previews, results, and multi-agent
   comparison. Current mission labels are local UI context only.
3. **Worker-specific telemetry** — real ports and health checks for services, test
   suites and failures, database connectivity/migrations, Docker/container state,
   build phases/artifacts, and Git branch/change data.
4. **Causal project memory** — correlation IDs, parent/child events, failure-to-recovery
   chains, chapters, “Why?”, “Since I left,” session summaries, and historical/live
   state separation.
5. **Workspace recipe orchestration** — named local recipes now capture multiple workers,
   explicit startup order, and atomic terminal layout restoration. Engine-backed dependency
   graphs, readiness checks, failure policy, pause/resume, and shared persistence remain.
6. **Mission Command expansion** — fuzzy ranking, aliases, recent-use ranking,
   context-aware worker actions, chained previews, and approval-gated natural language.
7. **Spatial worker scene** — dependency and impact relationships, worker-type bodies,
   Spacebar Quick Look, drag/resize/grouping, and calmer focus transitions.
8. **Git/test/build integration** — contextual diffs and failures tied to the worker or
   agent that caused them, without turning Mission Control into a full Git client.
9. **VS Code bridge** — authenticated loopback extension, terminal/diagnostic/Git
   mirroring, active-file context, and precise open-in-editor links.
10. **Mobile companion** — paired supervision, summaries, bounded logs, approvals,
    biometric confirmation, safe restart, revocation, and audit history.
11. **MCP and integrated assistant** — read-only tools first, capability-scoped mutation,
    command previews, secret redaction, human approval, audit trail, and rollback.
12. **Plugin platform** — declared permissions and constrained surfaces for test runners,
    Docker, CI, framework diagnostics, and project-specific integrations.
13. **Final quality program** — automated accessibility checks, screen-reader review,
    complete keyboard maps, contrast validation, localization resilience, performance
    profiling, notification quiet hours, and manual Windows ConPTY acceptance.
