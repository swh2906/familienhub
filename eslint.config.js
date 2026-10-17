import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// PocketBase-Migrationen und -Hooks laufen in PocketBases eigener JS-Umgebung (CommonJS,
		// globale Helfer wie `migrate`, `$app`). Die Typen kommen per Referenz aus pb_data/types.d.ts.
		files: ['pocketbase/pb_migrations/**/*.js', 'pocketbase/pb_hooks/**/*.js'],
		languageOptions: { sourceType: 'commonjs' },
		rules: {
			'@typescript-eslint/triple-slash-reference': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			// Svelte-Regel stürzt bei CommonJS-Dateien ab und ist hier ohnehin nicht relevant.
			'svelte/no-inner-declarations': 'off'
		}
	},
	{
		// Architekturregel: Nur das Sync-Modul spricht mit PocketBase, die Oberfläche nutzt Dexie.
		files: ['src/**/*.{ts,js,svelte}'],
		ignores: ['src/lib/pb/**', 'src/lib/sync/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [{ name: 'pocketbase', message: 'Nur src/lib/sync/ darf PocketBase nutzen.' }],
					patterns: [
						{
							group: ['#lib/pb', '#lib/pb/*', '$lib/pb', '$lib/pb/*', '**/pb/client*'],
							message: 'Nur src/lib/sync/ darf PocketBase nutzen.'
						}
					]
				}
			]
		}
	}
);
