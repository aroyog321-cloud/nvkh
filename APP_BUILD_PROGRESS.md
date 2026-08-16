# Mission Control build progress

Updated: 2026-08-16

Status legend:

- [x] Done and validated
- [~] In progress
- [ ] Not started or still requires deeper product/engine work

## Product foundation

- [x] Folder-first project opening and project-rooted terminals
- [x] Persistent recent-project switcher
- [x] Groundstation live project environment
- [x] Compact live activity summary
- [x] Visible Groundstation control deck linking upgraded daily workflows
- [x] Dedicated Workspace, Needs You, Agents, History, Projects, and Settings surfaces
- [x] Mission Command with fuzzy search, aliases, and recent commands
- [x] Global Alt navigation and Ctrl+N worker creation shortcut
- [x] Reduced blur, repaint containment, and smoother scrolling
- [x] Reduced background terminal cursor repainting
- [x] Complete automated accessibility and screen-reader audit
- [x] Localization and long-text resilience audit
- [x] Large-workspace performance profiling and Windows ConPTY acceptance pass

## Terminal Workspace

- [x] One, two, four, and six-pane terminal layouts
- [x] Per-project layout persistence
- [x] Add terminal worker directly into an available pane
- [x] Six built-in worker quick-start templates
- [x] Choose an existing worker for any pane
- [x] Drag and swap workers between panes
- [x] Focused terminal mode and Worker Intelligence inspector
- [x] Role-aware worker presentation and bounded-output telemetry
- [x] Workspace recipes with ordered startup and layout restoration
- [x] Direct drag-handle pane resizing with per-project persistence and double-click equalize
- [x] Visual worker grouping and dependency relationships
- [x] Automatic role folders and project-local custom terminal folders
- [x] Engine-backed recipe dependencies and readiness checks
- [x] Recipe pause, resume, and failure policies
- [x] Shared project recipe persistence

## AI agents

- [x] Dedicated Agents navigation and redesigned agent picker
- [x] Multiple supervised local AI agents
- [x] Live PTY-backed agent conversation
- [x] Locally stored mission label
- [x] Conversation evidence dashboard
- [x] Session activity summary and safe prompt starters
- [x] Durable engine-owned mission records
- [x] File, diff, command, test, and result evidence per mission
- [x] Permission scopes and approval previews
- [x] Multi-agent result comparison

## Needs You

- [x] Decision-oriented queue with evidence, impact, and recommendation
- [x] All, Critical, and Agent filters
- [x] Local New, Seen, and 15-minute Snoozed presentation states
- [x] Clear distinction between acknowledgement and verified recovery
- [x] Engine-owned New, Seen, Acting, Verifying, and Recovered lifecycle
- [x] Related-incident grouping
- [x] Severity policy and notification preferences
- [x] Notification quiet hours

## Project Memory

- [x] Searchable durable activity history
- [x] Worker, risk, actor, and text filtering
- [x] Selectable event investigation view
- [x] Recorded-evidence inspector
- [x] Clear separation between chronology and proven causality
- [x] Durable engine-owned structured worker evidence events and Evidence overview
- [x] Engine correlation IDs for worker-run event relationships
- [x] Failure-to-recovery chains and chapters
- [x] Engine-backed Why and Since I left summaries
- [x] Historical versus current-state separation

## Worker integrations

- [x] Worker role inference for agents, services, tests, builds, containers, databases, and shells
- [x] Bounded terminal parsing for ports, URLs, readiness, test totals, and build duration
- [x] Git worker recognition and bounded Git evidence
- [x] Engine-owned safe structured evidence snapshots for tests, builds, services, databases, containers, and Git
- [x] Confirmed service health checks
- [x] Structured test-suite and failed-test records
- [x] Docker container, image, and resource state
- [x] Database connectivity and migration state
- [x] Build phases and artifact records
- [x] Engine-backed Git branch, changed files, and diff attribution

## Future integrations

- [~] VS Code extension bridge — engine capability registered; launch handshake remains
- [~] Secure MCP-style assistant integration — permission boundary registered; transport remains
- [ ] Permission-controlled plugin platform
- [ ] Mobile supervision companion

## Current development focus

- [x] Add truthful Git worker recognition and recent-output evidence to Workspace telemetry
- [x] Add tests for Git telemetry classification
- [x] Validate production build and restart Groundstation
- [x] Plan engine-backed structured test, build, and Git records
- [x] Implement the first engine-owned structured worker evidence contract
- [x] Built-in Add Worker quick-start templates and command previews
- [x] Global keyboard navigation and create-worker shortcut
- [x] Surface engine-owned evidence as durable Project Memory events
- [x] Add engine correlation IDs and worker-run chapters
- [x] Connect failed runs to verified recovery runs
- [~] Build secure Integration Hub capability and permission contracts
