const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const rendererRoot = path.join(__dirname, "..", "src", "groundstation", "renderer");
const read = (...parts) => fs.readFileSync(path.join(rendererRoot, ...parts), "utf8");

test("the primary sidebar keeps the seven operator destinations in scan order", () => {
  const app = read("App.jsx");
  const navigation = app.slice(app.indexOf("const NAVIGATION"), app.indexOf("const PRIMARY_NAV_COUNT"));
  const ids = [...navigation.matchAll(/\["([a-z-]+)", "/g)].map(match => match[1]);

  assert.deepEqual(
    ids.slice(0, 7),
    ["groundstation", "workspace", "needs", "agents", "recipes", "history", "settings"],
    "the primary seven must stay in this order"
  );
  // Recipes is a daily verb, so it holds a slot rather than living only in a
  // dialog. Integrations stays reachable but trails the seven.
  assert.equal(ids[4], "recipes");
  assert.equal(ids[7], "integrations");
  assert.match(app, /const PRIMARY_NAV_COUNT = 7;/);
});

test("Integrations renders as a contextual group below the primary seven", () => {
  const app = read("App.jsx");
  const cockpit = read("redesign", "cockpit.css");

  assert.match(app, /NAVIGATION\.slice\(0, PRIMARY_NAV_COUNT\)/);
  assert.match(app, /NAVIGATION\.slice\(PRIMARY_NAV_COUNT\)/);
  assert.match(app, /className="top-navigation__contextual" role="group" aria-label="Configuration"/);
  // The nav landmark itself is locked by productFoundation.test.cjs; the group
  // must sit inside it rather than becoming a second landmark.
  assert.match(app, /<nav className="top-navigation" aria-label="Mission Control navigation">/);
  assert.match(cockpit, /\.top-navigation__contextual \{[\s\S]*border-top: 1px solid var\(--mc-border\)/);

  // Every route into Recipes that existed before the promotion still exists.
  assert.match(app, /recipes: "Alt R"/);
  assert.match(app, /id: "workspace-recipes", label: "Open workspace recipes"/);
  assert.match(app, /<RecipesView/);
});

test("the cockpit density layer loads last and owns the shared reading grammar", () => {
  const main = read("main.jsx");
  const cockpit = read("redesign", "cockpit.css");

  // Order matters: this layer only works because it resolves after the
  // historical stylesheets it corrects.
  assert.match(main, /import "\.\/redesign\/screens\.css";[\s\S]*import "\.\/redesign\/cockpit\.css";/);
  assert.equal(
    main.trimEnd().split("\n").filter(line => line.startsWith("import ")).pop(),
    'import "./redesign/cockpit.css";',
    "cockpit.css must remain the final stylesheet import"
  );

  // One page-header row instead of a per-route hero slab.
  assert.match(cockpit, /\.pm-page-hero, \.page-command-header, \.settings-hero/);
  assert.match(cockpit, /font-size: 15px !important;/);
  // Statistics read as a register, not a billboard.
  assert.match(cockpit, /\.agent-overview, \.integration-score, \.history-snapshot/);
});

test("themes resolve because the legacy token layers are re-sited onto .shell", () => {
  const cockpit = read("redesign", "cockpit.css");

  // The bug this guards: aliases declared in a `:root` block substitute their
  // var() at :root, so they froze against the dark palette and never followed
  // `.theme-solar` / `.theme-contrast`, which are declared on `.shell`.
  assert.match(cockpit, /15 · Theme correctness/);
  for (const alias of ["--void: var(--mc-void);", "--base: var(--mc-canvas);", "--text: var(--mc-text);"]) {
    assert.ok(cockpit.includes(alias), `${alias} must be re-declared on .shell`);
  }
  // premiumDesign.css ships a second token layer rooted in --orbital-*.
  for (const alias of ["--theme-text-strong: var(--orbital-text);", "--text-strong: var(--theme-text-strong);"]) {
    assert.ok(cockpit.includes(alias), `${alias} must be re-declared on .shell`);
  }
  // Its four hardcoded colours must follow the palette rather than a literal.
  assert.match(cockpit, /--theme-text-default: var\(--mc-text-soft\);/);
  assert.match(cockpit, /--theme-accent-ink: var\(--mc-text-ink\);/);
  assert.doesNotMatch(cockpit, /--theme-text-muted: #/);

  // Every route canvas follows the palette instead of a hardcoded hex + glow.
  assert.match(cockpit, /\.experience \{\s*background: var\(--mc-canvas\) !important;\s*background-image: none !important;/);
});

test("one accent leads: the primary verb keeps a fill when its gradient is removed", () => {
  const cockpit = read("redesign", "cockpit.css");

  // Suppressing premiumDesign's colour-stop-free gradient without restating the
  // fill left "Run recipe" transparent with near-black ink.
  const primary = cockpit.slice(cockpit.indexOf(".btn-primary, .primary-button, .primary, .workspace-launch"));
  assert.match(primary, /background: var\(--mc-accent\) !important;/);
  assert.match(primary, /background-image: none !important;/);
  assert.match(primary, /color: var\(--mc-text-ink\) !important;/);
  // A recommended action sits one step below, so no row shows two loud buttons.
  assert.match(cockpit, /\.recommended \{[\s\S]*background: var\(--mc-accent-soft\) !important;/);
  // Six role-coloured pane rails collapse to one active edge.
  assert.match(cockpit, /\.terminal-pane__header \{[\s\S]*border-top: 0 !important;/);
});

test("Recipes and the command palette have real layout rules", () => {
  const cockpit = read("redesign", "cockpit.css");

  // Recipes shipped with no rules in any imported stylesheet and fell back to
  // block flow; it is a primary destination now, so it needs a register.
  for (const selector of [".recipes-status-strip", ".recipes-page-layout", ".recipe-flow", ".recipes-guide"]) {
    assert.ok(cockpit.includes(selector), `${selector} must be styled by the cockpit layer`);
  }
  // The palette is portalled outside .shell, so it is addressed directly, and
  // its rows must stack the label above its group rather than running together.
  assert.match(cockpit, /\.command-palette \[cmdk-item\] > span:not\(\.palette-icon\) \{\s*display: grid;/);
});

test("narrow terminal panes shed duplicated chrome before the worker name", () => {
  const cockpit = read("redesign", "cockpit.css");

  assert.match(cockpit, /container: pane-head \/ inline-size;/);
  // Priority order: the working directory goes first, the role tag last.
  const cwd = cockpit.indexOf("@container pane-head (max-width: 1000px)");
  const role = cockpit.indexOf("@container pane-head (max-width: 350px)");
  assert.ok(cwd > 0 && role > cwd, "facts must drop from lowest to highest value");
  // Everything shed here survives elsewhere, so no capability is lost.
  const pane = read("TerminalPane.jsx");
  assert.match(pane, /Focus pane · Alt \$\{shortcut\}/);
  assert.match(pane, /<span>Find in output<\/span>/);
});

test("a chosen multi-pane canvas survives an ordinary narrow window", () => {
  const workspace = read("redesign", "workspace.css");
  // Collapsing at 900px threw away a 2x2 layout on a 1024px window, where two
  // ~390px panes still show a usable width.
  assert.match(workspace, /@container workspace-stage \(max-width: 680px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/);
  const toolbar = workspace.indexOf("@container workspace-stage (max-width: 900px)");
  const grid = workspace.indexOf("@container workspace-stage (max-width: 680px)");
  assert.ok(toolbar > 0 && grid > toolbar, "the toolbar must stack before the canvas collapses");
});
