# Mission Control Windows acceptance checklist

This checklist covers native behavior that automated fake-PTY and Linux tests
cannot prove. Run it on Windows 11 with Node.js 22 LTS in both Windows Terminal
and the VS Code integrated terminal. Record the Node, Electron, Windows, shell,
and Mission Control versions with every result.

## TUI and shared engine

- [ ] PowerShell starts with PSReadLine enabled when compatibility mode is off.
- [ ] Explicit PowerShell compatibility mode accepts ordinary line input.
- [ ] `cmd.exe`, `pwsh.exe`, and an ordinary executable with `args` all launch.
- [ ] Full Attach uses the existing PID and never creates a second shell.
- [ ] `Ctrl+C` reaches the attached child without quitting Mission Control.
- [ ] `Ctrl+]` and double `Esc` detach and restore host input modes.
- [ ] Repeated attach/detach leaves no data, exit, or resize listeners behind.
- [ ] Tail and Full Attach reject exited workers without writing to dead PTYs.
- [ ] Rapid restart owns one replacement PTY and never overlaps processes.
- [ ] Close while restart/remove is in progress leaves no orphaned PTY.

## Groundstation desktop

- [ ] Groundstation opens the real workspace and holds its single-instance lock.
- [ ] Overview, Attention, and Activity match the EngineAPI state.
- [ ] Add a manual worker and confirm no process launches until **Start**.
- [ ] Add an automatic worker and confirm exactly one ConPTY process launches.
- [ ] Instantiate a saved preset and confirm it uses the configured startup policy.
- [ ] Edit a stopped worker, restart it, and confirm the new command/cwd are used.
- [ ] Confirm a running worker cannot be edited without stopping it first.
- [ ] Rename and remove workers; confirm removal stops one live PTY and persists.
- [ ] Switch through 1, 1x2, 2x1, 2x2, and 3x2 terminal layouts.
- [ ] Reassign and empty panes repeatedly; confirm no duplicate process appears.
- [ ] Restart Groundstation and confirm the persistent workspace layout restores.
- [ ] Six live terminals render ANSI colors, cursor movement, and scrollback.
- [ ] Clicking a pane routes keyboard input only to that pane.
- [ ] Start, Restart, Stop, and Acknowledge affect exactly one selected worker.
- [ ] Maximizing and restoring a pane preserves its existing PTY and screen.
- [ ] Pane and window resizing reports correct columns/rows to ConPTY.
- [ ] Reloading the renderer cleans old streams and reconnects without duplicates.
- [ ] Closing Groundstation stops owned PTYs before releasing the workspace lock.
- [ ] A stuck PTY blocks close and keeps the workspace lock held.

## Terminal programs and stress

- [ ] PowerShell command editing/history behaves normally.
- [ ] `vim` or `nvim` enters/exits alternate-screen mode cleanly.
- [ ] A full-screen TUI such as `htop`/`btop` or a Windows equivalent resizes.
- [ ] Unicode, emoji, and split UTF-8 output are not corrupted.
- [ ] A worker producing at least 10 MB of output does not freeze other panes.
- [ ] Ten workers remain responsive during simultaneous output.
- [ ] Twenty idle/running workers do not cause global redraw storms.
- [ ] Sleep/wake and terminal focus changes do not leave enhanced input modes set.

## Failure and recovery

- [ ] Invalid workspace JSON fails before any configured process starts.
- [ ] A second Groundstation/TUI instance cannot open the same workspace.
- [ ] A crashed owner leaves a stale lock that a later process safely recovers.
- [ ] Spawn failures remain visible in Overview and Attention.
- [ ] Non-zero exits show the correct code and do not become false successes.
- [ ] Renderer crash/reload leaves engine-owned workers alive and reconnectable.
- [ ] Main-process crash behavior is documented; orphan checks find no child PTY.

Do not mark a Windows developer preview production-ready until every critical
item above passes or has a documented, user-visible limitation.
