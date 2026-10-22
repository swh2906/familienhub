// Erzeugt die Homi-App-Icons (PNG) für die PWA aus einer SVG-Vorlage.
// Nutzt das ohnehin installierte Playwright-Chromium, daher keine zusätzliche Bibliothek.
// Aufruf: pnpm icons
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/paths.ts';

const BRAND = '#a3461f'; // Terrakotta (Akzent seit Schritt 14)
const OUT = path.join(ROOT, 'static', 'icons');

/** Haus mit H (wie src/lib/ui/Logo.svelte, 24er-Raster), Anteil der Kantenlänge, mittig. */
export const LOGO_PATHS = [
	'M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
	'M9.5 21v-7M14.5 21v-7M9.5 16.5h5'
];

function letter(scale: number): string {
	// Im Entwurf nimmt das Zeichen gut 60 % der Fläche ein.
	const size = 64 * 0.62 * scale;
	const offset = (64 - size) / 2;
	return `<svg x="${offset}" y="${offset}" width="${size}" height="${size}" viewBox="0 0 24 24"
		fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
		${LOGO_PATHS.map((d) => `<path d="${d}"/>`).join('')}
	</svg>`;
}

const variants = [
	// Normales Icon mit abgerundeten Ecken.
	{ file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
	{ file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
	// „maskable“: volle Fläche, Zeichen im sicheren Bereich (Android schneidet selbst zu).
	{ file: 'maskable-512.png', size: 512, rounded: false, scale: 0.72 },
	// iOS rundet selbst ab und erwartet eine volle Fläche.
	{ file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.86 }
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, size, rounded, scale } of variants) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
		<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${BRAND}"/>${letter(scale)}</svg>`;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
	await page.locator('body > svg').screenshot({ path: path.join(OUT, file), omitBackground: true });
	console.log(`static/icons/${file}`);
}
await browser.close();

// Favicon als SVG (scharf in jeder Größe, wenige Bytes).
writeFileSync(
	path.join(ROOT, 'static', 'favicon.svg'),
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${BRAND}"/>${letter(1)}</svg>\n`
);
console.log('static/favicon.svg');
