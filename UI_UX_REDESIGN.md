# Mission Control product experience

## Critique of the previous interface

The previous Groundstation presented four large metrics before anything actionable. That made
the home screen read as an admin dashboard instead of a live development environment. Workers
were table rows with every possible action visible at once, so status, identity, attention and
configuration all competed for the same visual priority. The terminal workspace—the product's
core value—was visually subordinate to page headings and layout controls.

Navigation exposed the system's implementation categories. Overview, Terminals, Attention,
Activity and Logs separated information that belongs to the same workflow, while Projects,
Logs and Settings could lead to placeholder screens. Agents were shown as adapter cards rather
than working collaborators. Activity was a reverse list of event cards rather than a causal
project history. Small text, uniform bordered panels, symbolic glyphs and native prompts made
the whole experience feel like an internal control panel rather than a premium desktop app.

## Information architecture

The primary structure now contains only seven durable destinations:

1. **Groundstation** — Project Pulse, current motion and next action.
2. **Workspace** — the terminal workstation and contextual inspector.
3. **Needs You** — a filtered operator decision queue.
4. **Agents** — AI engineers, missions, progress, risk and terminal focus.
5. **History** — the durable causal timeline.
6. **Projects** — project selection and restoration.
7. **Settings** — runtime facts and interface preferences.

Logs, terminal details, runtime controls and diagnostics are contextual. They do not occupy
permanent navigation space.

## Design system

- **Identity:** Orbital Dark. Warm graphite surfaces and a restrained sage operational signal.
- **Surfaces:** Solid main workspace surfaces. Blur is reserved for Mission Command, dialogs and
  notifications.
- **Type:** Proportional UI typography with a clear display hierarchy; SF Mono/Cascadia Code for
  terminal data and tabular operational values.
- **Density:** Compact desktop controls around spacious narrative and decision areas.
- **Shape:** Soft 7–14px radii with circular status orbits. No giant statistic cards or neon glow.
- **Motion:** Short spring transitions for page entry, focus, hover, inspector and palette. The
  reduced-motion media query removes nonessential movement.
- **Focus:** Explicit focus rings, keyboard-openable controls, Enter to focus workers and Escape
  to unwind transient layers.

## Signature experiences

- **Project Pulse** answers what is happening and recommends the next action.
- **Worker Canvas** shows living processes with controls revealed contextually.
- **Needs You** removes monitoring noise and exposes only operator decisions.
- **Agent Operations** treats local AI CLIs as engineers rather than chat windows.
- **Mission Command** makes navigation, workers, actions and recent history keyboard-first.
- **Context Inspector** keeps deep worker detail beside the terminal instead of adding pages.
- **Project Memory** turns engine events into a readable timeline.

The redesign changes no engine, PTY ownership, recovery or Protocol v1 behavior.
