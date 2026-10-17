import { defineConfig, devices } from '@playwright/test';

// Eigenes, leeres PocketBase für die E2E-Tests, getrennt vom Entwicklungs-PocketBase auf 8090.
export const E2E_PB_URL = 'http://127.0.0.1:8091';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '**/*.e2e.ts',
	use: { baseURL: 'http://localhost:4173' },
	webServer: [
		{
			command: 'node scripts/e2e-pocketbase.ts 8091',
			url: `${E2E_PB_URL}/api/health`,
			reuseExistingServer: false
		},
		{
			// Die gebaute App testen (wie später auf dem Server); der Proxy zeigt auf das E2E-PocketBase.
			// VITE_E2E=1 baut den Test-Zugang window.__familienhub ein (im normalen Build nicht enthalten).
			command: 'pnpm run build && pnpm run preview --port 4173 --strictPort',
			port: 4173,
			env: { FH_PB_URL: E2E_PB_URL, VITE_E2E: '1' },
			reuseExistingServer: false
		}
	],
	projects: [
		{ name: 'mobil', use: { ...devices['Pixel 7'] } },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }
	]
});
