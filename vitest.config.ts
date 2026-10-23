/**
 * Test-only config. The actual app/plugin bundles are built by the DHIS2
 * App Platform (see d2.config.js), which has its own, separate Vite setup;
 * this file only configures Vitest for `npm test`.
 */
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/.d2/**", "**/build/**", "**/dist/**"],
    environmentOptions: {
      jsdom: {
        url: "http://localhost/",
      },
    },
    setupFiles: ["./src/tests/setup.ts"],
  },
});
