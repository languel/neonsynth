import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_TEST_PORT ?? '5173';
const baseURL = `http://127.0.0.1:${port}${process.env.GITHUB_ACTIONS ? '/neonsynth/' : '/'}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './e2e',
  timeout: 35_000,
  reporter: 'list',
  workers: 1,
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      args: ['--autoplay-policy=no-user-gesture-required', ...(executablePath ? ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'] : [])],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
