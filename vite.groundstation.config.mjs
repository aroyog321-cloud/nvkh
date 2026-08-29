import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(repositoryRoot, "src", "groundstation", "renderer"),
  base: "./",
  // Keep this standalone app isolated from PostCSS configs in parent folders.
  // Without an inline config, Vite searches upward and can accidentally load
  // an unrelated config (for example D:\\Downloads\\postcss.config.js).
  css: {
    postcss: { plugins: [] }
  },
  build: {
    outDir: path.join(repositoryRoot, "dist", "groundstation", "renderer"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.join(repositoryRoot, "src", "groundstation", "renderer", "index.html"),
      onwarn(warning, warn) {
        const normalizedId = warning.id?.replaceAll("\\", "/") || "";
        const isDependencyClientDirective = warning.code === "MODULE_LEVEL_DIRECTIVE"
          && normalizedId.includes("/node_modules/")
          && warning.message?.includes('"use client"');
        if (isDependencyClientDirective) return;
        warn(warning);
      },
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll("\\", "/");
          if (normalized.includes("/node_modules/@xterm/") || normalized.endsWith("/TerminalPane.jsx")) return "workspace-terminal";
          if (normalized.includes("/node_modules/react") || normalized.includes("/node_modules/scheduler")) return "vendor-react";
          if (normalized.includes("/node_modules/@radix-ui/") || normalized.includes("/node_modules/cmdk/") || normalized.includes("/node_modules/@floating-ui/")) return "vendor-desktop-ui";
          if (/\/(MissionAI|McpGateway|MobileCompanion|PluginPlatform|AutomationWorkflows)\.jsx$/.test(normalized)) return "feature-integrations";
          if (/\/(AgentWorkspace|MissionGraph|WorkspaceRecipes)\.jsx$/.test(normalized)) return "feature-operations";
          return undefined;
        }
      }
    }
  }
});
