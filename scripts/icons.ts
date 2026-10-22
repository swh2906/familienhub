// Erzeugt die Homi-App-Icons (PNG) für die PWA aus einer SVG-Vorlage.
// Nutzt das ohnehin installierte Playwright-Chromium, daher keine zusätzliche Bibliothek.
// Aufruf: pnpm icons
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/paths.ts';

const BRAND = '#a3461f'; // Terrakotta (Akzent seit Schritt 14)
const OUT = path.join(ROOT, 'static', 'icons');

/** Haus aus H (wie src/lib/ui/Logo.svelte), Größe als Anteil der Kantenlänge, mittig. */
function letter(scale: number): string {
	const offset = (64 - 64 * scale) / 2;
	return `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round"
		transform="translate(${offset} ${offset}) scale(${scale})">
		<path d="M12 30 L32 13 L52 30" stroke-width="5"/>
		<path d="M21 29 V51 M43 29 V51 M21 40 H43" stroke-width="6.5"/>
	</g>`;
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
	await page.locator('svg').screenshot({ path: path.join(OUT, file), omitBackground: true });
	console.log(`static/icons/${file}`);
}
await browser.close();
