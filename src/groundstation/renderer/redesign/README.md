# Redesign layer

The renderer historically accumulated a chain of full-page redesign attempts.
Mission Control 2.19 no longer imports `experience27–30`, `redesign-v4`,
`reference-v5`, `reference-final`, `prototype2026`, or `theme-concept`. Their
files remain as dormant implementation history, but they do not enter the Vite
bundle or participate in the cascade. `premiumV3.css` remains below this layer
for route-specific surfaces such as Mission AI; it does not own shell geometry.

This directory is the **single authoritative layer**, imported last from
`main.jsx`:

| File | Responsibility |
|---|---|
| `tokens-bridge.css` | One semantic token system (deep graphite + one blue accent, green = success only). Repoints every legacy alias — `--void`, `--surface`, `--accent`, `--mc-*`, `--slate-*`, `--surface-raised` … — at the same values. Change palette **here**. |
| `base.css` | One `.shell` grid, labeled responsive sidebar, compact global status strip, type scale, focus ring, motion budget, and scrollbars. |
| `surfaces.css` | Shared primitives: panels, buttons, badges, status dots, menus, overlays, dialogs. |
| `workspace.css` | Terminal canvas geometry, per-layout split persistence, content-width container queries, balanced 3x2 sizing, and compact pane controls. |
| `screens.css` | Structural per-screen fixes plus the dense Groundstation register, prominent recipe action, asymmetric supporting panels, and safe inspector drawer/rail behavior. |

Selectors are scoped just tightly enough (`.shell .view-workspace …`,
`html body #root .shell`) to win over the historical `!important` rules without
escalating further. New rules should prefer tokens and avoid `!important` unless
overriding a legacy `!important` declaration.

## Change rule

New full-page styling belongs in this directory. Do not re-import a dormant
redesign file to solve one screen; move a genuinely route-specific rule into
the relevant feature stylesheet and keep shell, Workspace, and Groundstation
geometry authoritative here.
