import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// E2E-Tests lenken den Proxy auf ein eigenes, leeres PocketBase um (siehe playwright.config.ts).
const POCKETBASE = process.env.FH_PB_URL ?? 'http://127.0.0.1:8090';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Reine SPA: alle unbekannten Pfade landen in index.html, das Routing macht der Browser.
			adapter: adapter({ fallback: 'index.html' }),
			// Absolute Pfade (/_app/…): Der Service Worker liefert dieselbe Hülle für jede Seite aus,
			// auch für verschachtelte wie /essen/wochenplan. Relative Pfade würden dort ins Leere zeigen.
			paths: { relative: false }
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// Kein Sprachpräfix in der URL; Sprache aus lokaler Einstellung, Browser oder Deutsch.
			strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
		})
	],
	server: {
		// PocketBase über denselben Ursprung erreichbar machen, damit es keine CORS-Probleme gibt.
		proxy: {
			'/api': { target: POCKETBASE, changeOrigin: true },
			'^/_/': { target: POCKETBASE, changeOrigin: true }
		}
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.ts'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				// Startet ein echtes PocketBase (pnpm test:integration), daher getrennt von den schnellen Unit-Tests.
				test: {
					name: 'integration',
					environment: 'node',
					include: ['tests/integration/**/*.test.ts'],
					testTimeout: 20_000,
					hookTimeout: 60_000
				}
			}
		]
	}
});
