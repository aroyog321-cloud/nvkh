# Product foundation audit

Updated: 2026-08-16

## Accessibility and screen readers

- [x] Skip-to-content navigation targets the main workspace landmark.
- [x] Sidebar and primary navigation have accessible names and active-page state.
- [x] Decorative SVGs and shortcut glyphs are hidden from assistive technology.
- [x] Status and error messages use polite and assertive live regions.
- [x] Keyboard focus is visibly preserved across buttons, fields, and interactive timeline items.
- [x] Windows forced-colors mode retains component boundaries and state marks.
- [x] Automated source-contract coverage is in `test/productFoundation.test.cjs`.

## Localization and long text

- [x] The document language follows the operating-system/browser locale.
- [x] Prose and identifiers can wrap without forcing horizontal page overflow.
- [x] German, French, and Spanish action labels may expand instead of being forced to one line.
- [x] Existing tablet and mobile breakpoints remain enforced by automated coverage.

This audit verifies layout resilience; it does not claim that application copy has been translated.

## Large workspace performance

Profile scenario: 100 supervised workers, followed by one structured test-evidence update per worker and a complete state snapshot.

- Worker load: 115.88 ms
- Evidence processing: 24.82 ms
- State snapshot: 1.98 ms
- Total: 142.68 ms
- Activity remains bounded by the public state contract.
- Renderer containment, off-screen content visibility, coalesced state refreshes, active-only cursor blinking, and animation-frame terminal resizing are covered by regression checks.

Measurements are from this Windows workstation and will vary by hardware. The automated regression ceiling is intentionally generous to avoid flaky CI timing failures.

## Windows ConPTY acceptance

- [x] Real `node-pty` ConPTY process created outside the restricted sandbox.
- [x] PowerShell `-NoLogo -NoProfile` executed through the PTY.
- [x] Output marker `MC_CONPTY_OK` was received.
- [x] Process exited with code 0.
- [x] VT host-mode sequences were present and handled as terminal output.

Interactive prompt automation remained sensitive to PowerShell host formatting, so the acceptance command uses a deterministic non-interactive PowerShell command while still exercising the real ConPTY transport.
