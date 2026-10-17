// Erzeugt die App-Icons (PNG) für die PWA aus einer SVG-Vorlage.
// Nutzt das ohnehin installierte Playwright-Chromium, daher keine zusätzliche Bibliothek.
// Aufruf: pnpm icons
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT } from './lib/paths.ts';

const PETROL = '#0e6e66';
const OUT = path.join(ROOT, 'static', 'icons');

/** „F“ aus Flächen (keine Schrift), Größe als Anteil der Kantenlänge. */
function letter(scale: number): string {
	const s = (n: number) => (n * scale).toFixed(2);
	const offset = (64 - 64 * scale) / 2;
	return `<g fill="#fff" transform="translate(${offset} ${offset})">
		<rect x="${s(21)}" y="${s(14)}" width="${s(8.5)}" height="${s(36)}" rx="${s(2)}"/>
		<rect x="${s(21)}" y="${s(14)}" width="${s(24)}" height="${s(8)}" rx="${s(2)}"/>
		<rect x="${s(21)}" y="${s(29)}" width="${s(19)}" height="${s(7.5)}" rx="${s(2)}"/>
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
		<rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${PETROL}"/>${letter(scale)}</svg>`;
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
	await page.locator('svg').screenshot({ path: path.join(OUT, file), omitBackground: true });
	console.log(`static/icons/${file}`);
}
await browser.close();
