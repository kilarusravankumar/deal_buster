// Production build of the web chat, for the Worker to serve as static assets.
//
// Separate from vite.config.ts on purpose: that config carries
// @cloudflare/vite-plugin, which runs the Worker inside the dev server (how
// `bun run web:dev` serves the agent at :5173) and wants to emit its own Worker
// bundle. For deploys the Worker is built by wrangler from `main` in
// wrangler.jsonc, so this build emits the browser bundle and nothing else.
//
// Output goes to dist/web, which wrangler.jsonc points its assets binding at.
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import agents from "agents/vite";

export default defineConfig({
  plugins: [agents(), react(), tailwindcss()],
  build: {
    outDir: "dist/web",
    emptyOutDir: true
  }
});
