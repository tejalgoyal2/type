import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the production build (vite preview), in
 * Chromium and WebKit, at desktop and phone sizes and with reduced motion.
 * TYPE_BROWSERS=chromium limits a local run to one engine.
 */
const only = process.env.TYPE_BROWSERS?.split(",");

const projects = [
  { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  { name: "chromium-phone", use: { ...devices["Pixel 7"] } },
  { name: "webkit-phone", use: { ...devices["iPhone 15"] } },
  {
    name: "chromium-reduced",
    use: { ...devices["Desktop Chrome"], contextOptions: { reducedMotion: "reduce" as const } }
  }
]
  .filter((p) => !only || only.some((b) => p.name.startsWith(b)));

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  projects,
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
