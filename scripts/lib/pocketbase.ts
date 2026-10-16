// Reine Hilfsfunktionen rund um PocketBase-Releases (ohne Netzwerk, gut testbar).

const OS_NAMES: Record<string, string> = {
	win32: 'windows',
	linux: 'linux',
	darwin: 'darwin'
};

const ARCH_NAMES: Record<string, string> = {
	x64: 'amd64',
	arm64: 'arm64',
	arm: 'armv7'
};

/** Dateiname des Release-Archivs, z. B. `pocketbase_0.40.5_windows_amd64.zip`. */
export function pbAssetName(version: string, platform: string, arch: string): string {
	const os = OS_NAMES[platform];
	const cpu = ARCH_NAMES[arch];
	if (!os || !cpu) {
		throw new Error(`PocketBase gibt es nicht für ${platform}/${arch}.`);
	}
	return `pocketbase_${version}_${os}_${cpu}.zip`;
}

/** Name der ausführbaren Datei im Archiv. */
export function pbBinaryName(platform: string): string {
	return platform === 'win32' ? 'pocketbase.exe' : 'pocketbase';
}

/** Liest `checksums.txt` (Format: `<sha256>  <dateiname>` pro Zeile). */
export function parseChecksums(text: string): Map<string, string> {
	const result = new Map<string, string>();
	for (const line of text.split(/\r?\n/)) {
		const match = /^([a-f0-9]{64})\s+\*?(\S+)$/i.exec(line.trim());
		if (match) result.set(match[2], match[1].toLowerCase());
	}
	return result;
}
