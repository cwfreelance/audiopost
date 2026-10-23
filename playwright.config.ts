import { defineConfig } from "@playwright/test";

// PORT lets parallel checkouts run the smoke test side by side; `next start` reads it too.
const url = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: url },
  webServer: {
    command: "pnpm run build && pnpm run start",
    url,
    reuseExistingServer: !process.env.CI,
  },
});
