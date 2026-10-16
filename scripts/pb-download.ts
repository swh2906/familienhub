// Lädt die in pocketbase/VERSION gepinnte PocketBase für dieses Betriebssystem
// und diese CPU, prüft die SHA-256-Prüfsumme und legt sie in pocketbase/bin/ ab.
// Aufruf: pnpm pb:download [--force]
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PB_BIN_DIR, PB_BINARY, PB_VERSION_FILE } from './lib/paths.ts';
import { parseChecksums, pbAssetName, pbBinaryName } from './lib/pocketbase.ts';
import { extractFile } from './lib/unzip.ts';

const force = process.argv.includes('--force');
const version = (await readFile(PB_VERSION_FILE, 'utf8')).trim();
const installedMarker = path.join(PB_BIN_DIR, '.version');

const installed = await readFile(installedMarker, 'utf8').catch(() => '');
if (!force && installed.trim() === version) {
	console.log(`PocketBase ${version} ist bereits vorhanden (${PB_BINARY}).`);
	process.exit(0);
}

const asset = pbAssetName(version, process.platform, process.arch);
const baseUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${version}`;

console.log(`Lade ${asset} …`);
const checksums = parseChecksums(await download(`${baseUrl}/checksums.txt`).then(String));
const expected = checksums.get(asset);
if (!expected) throw new Error(`Keine Prüfsumme für ${asset} in checksums.txt gefunden.`);

const zip = await download(`${baseUrl}/${asset}`);
const actual = createHash('sha256').update(zip).digest('hex');
if (actual !== expected) {
	throw new Error(`Prüfsumme stimmt nicht!\n  erwartet: ${expected}\n  erhalten: ${actual}`);
}
console.log('Prüfsumme OK.');

const binary = extractFile(zip, pbBinaryName(process.platform));
if (!binary) throw new Error(`${pbBinaryName(process.platform)} nicht im Archiv gefunden.`);

await mkdir(PB_BIN_DIR, { recursive: true });
await writeFile(PB_BINARY, binary);
await chmod(PB_BINARY, 0o755);
await writeFile(installedMarker, version + '\n');
console.log(`PocketBase ${version} installiert: ${PB_BINARY}`);

async function download(url: string): Promise<Buffer> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}): ${url}`);
	return Buffer.from(await response.arrayBuffer());
}
