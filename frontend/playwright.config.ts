import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8000",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [],
    },
  },
  timeout: 60000,
  reporter: "list",
});
