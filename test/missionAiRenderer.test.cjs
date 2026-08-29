"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const renderer = path.join(root, "src", "groundstation", "renderer");

test("Mission AI stays protected and is surfaced as a first-class dedicated screen", () => {
  const app = fs.readFileSync(path.join(renderer, "App.jsx"), "utf8");
  const missionAi = fs.readFileSync(path.join(renderer, "MissionAI.jsx"), "utf8");
  const missionAiScreen = fs.readFileSync(path.join(renderer, "MissionAIScreen.jsx"), "utf8");
  const main = fs.readFileSync(path.join(renderer, "main.jsx"), "utf8");
  const styles = fs.readFileSync(path.join(renderer, "premiumV3.css"), "utf8");

  assert.match(app, /import \{ MissionAISettings \} from "\.\/MissionAI\.jsx"/);
  assert.match(app, /import MissionAIScreen from "\.\/MissionAIScreen\.jsx"/);
  assert.match(app, /label: "Open Mission AI"/);
  assert.match(app, /<MissionAISettings/);
  assert.match(app, /<MissionAIScreen/);
  assert.doesNotMatch(app, /<MissionAIOverlay/);
  assert.match(app, /<IntegrationHubView/);
  assert.match(app, /initialPrompt=\{missionAiPrompt\}/);
  assert.match(app, /onAskAI=/);
  assert.doesNotMatch(app, /\["mission-ai",\s*"Mission AI"/);
  assert.match(missionAi, /request\("missionAi\.status"\)/);
  assert.match(missionAi, /request\("missionAi\.configure"/);
  assert.match(
    missionAi,
    /request\("missionAi\.configure",\s*\{\s*configuration:\s*\{[\s\S]*?model,[\s\S]*?includeTerminalEvidence[\s\S]*?\}\s*\}\)/,
    "Mission AI configuration must retain the Protocol-required configuration wrapper"
  );
  assert.match(missionAi, /request\("missionAi\.clear"/);
  assert.match(missionAi, /type="password"/);
  assert.match(missionAi, /confirm:missionAi\.clear/);
  assert.match(missionAi, /OBSERVE-ONLY INTELLIGENCE/);
  assert.match(missionAiScreen, /request\("missionAi\.status"/);
  assert.match(missionAiScreen, /request\("missionAi\.ask"/);
  assert.match(missionAiScreen, /request\("missionSupervisor\.plan"/);
  assert.match(missionAiScreen, /configuration: \{ model, includeTerminalEvidence:/);
  assert.match(missionAiScreen, /Project intelligence, grounded in evidence\./);
  assert.match(missionAiScreen, /Evidence used/);
  assert.match(missionAiScreen, /answer\.citations/);
  assert.match(missionAiScreen, /onEvidence/);
  assert.match(missionAiScreen, /initialPrompt/);
  assert.match(missionAiScreen, /minimumHours/);
  assert.match(missionAiScreen, /Nothing runs from this screen/);
  assert.match(missionAi, /Stateless provider requests; server storage disabled/);
  assert.match(missionAi, /Include bounded terminal evidence/);
  assert.doesNotMatch(missionAi, /localStorage|sessionStorage|window\.confirm/);
  assert.doesNotMatch(missionAiScreen, /localStorage|sessionStorage|window\.confirm|<select/);
  assert.match(main, /import "\.\/missionAi\.css";[\s\S]*import "\.\/premiumV3\.css";[\s\S]*import "\.\/redesign\/screens\.css";/);
  assert.match(styles, /Mission AI dedicated route/);
  assert.match(styles, /\.mission-ai-screen/);
  assert.match(styles, /\.mai-composer/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /\.mai-estimate/);
  assert.match(styles, /\.mai-evidence/);
});

test("Mission AI credentials and provider calls remain outside renderer ownership", () => {
  const credentialStore = fs.readFileSync(path.join(root, "src", "service", "missionAiCredentialStore.cjs"), "utf8");
  const service = fs.readFileSync(path.join(root, "src", "service", "missionAi.cjs"), "utf8");
  const mainProcess = fs.readFileSync(path.join(root, "src", "groundstation", "main", "index.cjs"), "utf8");

  assert.match(credentialStore, /safeStorage\.encryptString/);
  assert.match(credentialStore, /safeStorage\.decryptString/);
  assert.match(credentialStore, /basic_text/);
  assert.match(credentialStore, /will not store a plaintext API key/);
  assert.match(service, /generativelanguage\.googleapis\.com\/v1beta\/interactions/);
  assert.match(service, /"x-goog-api-key": this\.credentialStore\.apiKey\(\)/);
  assert.match(service, /store: false/);
  assert.match(service, /authority: "observe"/);
  assert.match(service, /includeOutput: preferences\.includeTerminalEvidence/);
  assert.doesNotMatch(service, /tools\s*:|functionDeclarations|function_declarations/);
  assert.match(mainProcess, /safeStorage/);
  assert.match(mainProcess, /MissionAiCredentialStore/);
  assert.match(mainProcess, /MissionAIService/);
});
