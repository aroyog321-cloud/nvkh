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
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-terminal": ["@xterm/xterm", "@xterm/addon-fit"]
        }
      }
    }
  }
});
