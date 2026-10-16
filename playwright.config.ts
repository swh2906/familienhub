import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	use: { baseURL: 'http://localhost:4173' },
	// Die gebaute App testen (wie später auf dem Server), getrennt vom Dev-Server.
	webServer: {
		command: 'pnpm run build && pnpm run preview --port 4173 --strictPort',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'mobil', use: { ...devices['Pixel 7'] } },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }
	]
});
