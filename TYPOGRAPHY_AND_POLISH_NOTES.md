# Mission Control typography and primitives pass

## Outcome

This pass keeps the established Orbital Dark Groundstation and changes interaction plumbing rather than engine behavior. Warm graphite surfaces, restrained sage status color, compact workstation density, and the existing Groundstation composition remain intact.

## Accessible primitives

- Mission Command now uses `cmdk` for filtering, selection, arrow-key movement, Enter activation, empty results, and ARIA semantics. Recent commands, aliases, Ctrl/Cmd+K, and the engine-safety footer remain.
- Destructive confirmations now use Radix `AlertDialog`, giving them alert-dialog semantics, focus containment, Escape handling, and focus return.
- Worker Focus, Agent Deployment, and Workspace Recipes now use Radix `Dialog` with portal-backed overlays and managed focus.
- Empty terminal pane selection now uses Radix `DropdownMenu`.
- Recipe readiness and failure policies now use Radix `Select`.
- The Settings resource disclosure uses Radix `Popover` and `Tooltip`.

Quick Look remains a purpose-built press-and-hold surface because it is controlled by the global Space key lifecycle and must disappear on key release; treating it as a modal dialog would trap focus during a transient preview. The project switcher remains a direct route to the full Projects surface because project validation and safe worker shutdown require the existing confirmation workflow. Worker creation and folder building remain form-specific surfaces in this pass; their engine-safe validation and persistence behavior is unchanged.

## Type and spacing system

The renderer now uses a documented seven-step scale:

- 11px — micro labels, kickers, shortcut hints, compact metadata
- 12px — secondary UI text and dense controls
- 13px — default desktop body and navigation text
- 15px — emphasized controls and section headings
- 18px — prominent section titles
- 24px — page titles
- 32px — hero values and high-level status

UI text stays in Inter/system sans. Cascadia Code/JetBrains Mono is reserved for commands, keyboard shortcuts, terminal evidence, timers, counts, and tabular data. The spacing scale is 4, 8, 12, 16, 24, and 32px; existing 20/40px compatibility tokens remain only where established layouts depend on them.

Muted text contrast was raised, the minimum operational label size is now 11px, focus-visible rings are consistent, disabled controls are visibly subdued, and interactive state motion uses the restrained 140–220ms Orbital Dark easing. Reduced-motion behavior remains authoritative.

## Navigation and resources

The rail is 200px at normal desktop widths and returns to 184px on narrower windows. No Tasks, Logs, Git, Tests, Builds, Docker, Database, or Workers page was introduced; those remain contextual.

Settings now includes one unobtrusive Resources surface for Radix UI Primitives and cmdk. URLs cross the isolated preload bridge and are opened by Electron `shell.openExternal` only after an exact allow-list check.

## Boundary

No engine, PTY, session lifecycle, recovery, Protocol v1, or worker command behavior changed.
