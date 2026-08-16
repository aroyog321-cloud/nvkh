# Mission Control Experience Audit

Updated: 2026-08-16

## Executive critique

Mission Control has strong operational concepts but does not yet feel like one coherent desktop instrument. The dominant pattern is still “heading, metrics, bordered cards, another heading, more cards.” Individual surfaces are polished in isolation, yet their combined vocabulary resembles a SaaS operations dashboard. The application needs fewer visual containers, fewer competing summaries, a stricter information hierarchy, and one shared interaction grammar.

The intended identity is a calm, project-rooted supervision workstation: terminals are the working material, the engine is the source of truth, and attention is exceptional. Every permanent element must help answer one of three questions: what is running, what changed, or what needs judgment.

## System-wide weaknesses

### Token fragmentation

The stylesheet contains more than 500 direct font-size declarations, at least a dozen radius values, and many overlapping green, violet, blue, amber, and graphite literals. Similar controls therefore differ subtly across screens. This feels assembled rather than authored. A compact semantic token system must replace one-off values before further screen styling.

### Typography is too small and too uniformly quiet

Seven-to-ten-pixel labels dominate. Dense software can be compact without becoming timid. Excessive uppercase microcopy, letter spacing, and low-contrast metadata make scanning slower. Operational values, worker names, actions, and explanations need distinct roles instead of all becoming small labels.

### Container inflation

Nearly every concept receives a border, radius, background, and internal heading. The repeated card treatment flattens hierarchy: a critical failure, a harmless statistic, and an optional preference can carry similar visual weight. Main surfaces should use structure, alignment, dividers, and negative space; elevated containers should be reserved for contextual layers.

### Competing accent systems

Sage communicates health, amber attention, red failure, blue service/history, and violet agents/integrations. These are useful semantic colors, but large tinted regions and many local variants make each destination feel like a separate product. Color should identify state or domain in small amounts, not repaint whole views.

### Too many permanent controls

The mission bar, page headers, local toolbars, inspector controls, cards, and footers often expose overlapping actions. This is web-dashboard behavior. Primary actions belong close to the object being acted on; secondary actions belong in menus, the command palette, or the contextual inspector.

### Motion lacks a single grammar

View entrances, transforms, glows, orbiting decoration, spring movement, and hover shifts coexist. Motion sometimes decorates rather than explains state. Keep only state transition, pane movement, selection continuity, disclosure, and attention arrival. Reduced-motion behavior must be a first-class equivalent.

## Information architecture decisions

Keep seven permanent destinations after the product decision to retain direct agent access:

1. Groundstation
2. Workspace
3. Needs You
4. Agents
5. History
6. Projects
7. Settings

Agents remain contextual to Groundstation and Workspace while also retaining a direct sidebar destination for frequent AI-crew operation.

Integrations should not be a permanent destination. Its current foundation belongs inside Settings. Worker management belongs inside Workspace. Logs, Git, tests, builds, containers, and databases belong in the inspector and History evidence, not separate pages.

## Screen critique

### Application shell

The left rail mixes primary navigation, workspace utilities, command access, health, shortcut hints, badges, and brand treatment. It is functional but visually busy. The mission bar repeats project identity, global status, recipes, presets, worker creation, and search. Together they consume attention before the developer reaches their work.

Remove persistent shortcut labels from navigation. Keep them in tooltips and the command palette. Move Integrations into Settings. Keep one global creation action and let its menu choose terminal or agent. Reduce the title bar to project switcher, command trigger, current health, and one contextual action.

### Groundstation

Groundstation's established live-project stage, vitals, activity summary, control deck, worker scene, attention shelf, and AI crew rail are retained by product decision. Future work should polish hierarchy, spacing, and responsive behavior without replacing this composition. The five-second scan remains the acceptance test: project health, active work, and required intervention must stay immediately visible.

### Workspace

Workspace is closest to the desired product. The terminal canvas is real working material, but three horizontal control bands precede it: command deck, intelligence strip, and folders. This makes the hero feel subordinate. The inspector also repeats terminal lines before structured facts.

Collapse canvas layout, folders, recipes, and add-worker actions into a single workstation toolbar. Keep terminal panes visually flat and edge-to-edge. Make structured facts the inspector’s first section; raw recent lines become a disclosure. Preserve direct resizing, focus mode, drag/swap, and layouts.

### Needs You

The decision model is the strongest product idea, but the surface still has a dashboard hero, three overview metrics, filters, lifecycle bar, policy panel, and large item cards. Notification policy interrupts decision work.

Move policy to Settings. Keep a compact queue header, filters, grouped incidents, and one focused decision inspector. Show evidence, impact, recommendation, and approval preview in that inspector. The queue itself should be concise and keyboard-driven.

### Agents

Agent Command improved after contextual tabs were introduced, but it still presents agents as a roster plus chat-shaped conversation. Persistent prompt starters, session summary, mission controls, evidence, comparison, terminal action, and lifecycle actions compete around the transcript.

Treat each agent as an engineer assignment: mission and current action at the top, workstream in the center, approvals at the point of interruption, and files/results in the inspector. Rename conversational language where possible. Hide prompt starters after the first instruction. Keep the PTY conversation as evidence, not the agent’s identity.

### History / Project Memory

History now contains summaries, evidence strip, recovery chains, current state, run chapters, filters, timeline, and an evidence inspector. The concepts are good but too many are simultaneously expanded. Current state and chronology are separated semantically, yet the amount of stacked content makes investigation expensive.

Use a two-level model: an engine summary and chapter list first; selecting a chapter opens its chronology and evidence. “Since you left” should be the default summary mode, not another permanent panel. Current state belongs in a narrow persistent strip or the inspector.

### Projects

Projects should be a fast switcher and onboarding surface, not a management dashboard. Recent projects, current project, folder selection, and initialization errors are sufficient. Reduce explanatory cards and prioritize recency, path, status, and keyboard opening.

### Settings

Settings should absorb notification policy, integrations, appearance, terminal preferences, accessibility, and diagnostics. It should use a stable category sidebar and plain setting rows rather than a grid of decorative panels.

### Dialogs, menus, command palette, and quick look

These are the correct places for restrained glass. They need one shared overlay, shadow, radius, focus-ring, and entrance/exit contract. Current variants use different values and visual emphasis. Adopt accessible focus management and keyboard behavior from established primitive patterns without inheriting a third-party visual identity.

## Removal list

- Remove Integrations from permanent navigation; move it into Settings.
- Keep Agents directly accessible while avoiding duplicate agent controls elsewhere.
- Remove persistent navigation shortcut glyphs.
- Remove notification policy from Needs You.
- Retain the current Groundstation structure; refine its tokens, spacing, and hierarchy without flattening or replacing it.
- Remove raw terminal evidence as the first inspector section.
- Remove always-visible prompt starters after an agent mission begins.
- Merge duplicate run chapters and recovery-chain presentations in History.
- Consolidate separate Add Agent and Add Worker entry points into one contextual creation flow.
- Avoid introducing Tasks, Logs, Git, Tests, Builds, Docker, Database, or Workers as permanent pages.

## Ordered redesign acceptance criteria

Each stage must be built and visually reviewed before the next:

1. Tokens: no new raw design values in feature CSS.
2. Typography: readable at normal Windows scaling; metadata never carries primary meaning alone.
3. Spacing: one density rhythm across all destinations.
4. Navigation: six permanent destinations and clear contextual entry points.
5. Shell: project, command, health, and context only.
6. Groundstation: five-second scan with no dashboard stack.
7. Workspace: terminals receive the majority of every usable window size.
8. Worker canvas: state and role are obvious without opening a card.
9. Inspector: structured facts first, contextual actions last.
10. Needs You: decision queue and focused evidence, not metrics.
11. Agents: engineer assignment model, not chatbot chrome.
12. History: summary → chapter → evidence progression.
13. Command palette: fastest route to every non-destructive action.
14–18. Empty, loading, motion, accessibility, and final consistency passes.
