import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseChecksums, pbAssetName, pbBinaryName } from './pocketbase.ts';
import { extractFile } from './unzip.ts';

describe('pbAssetName', () => {
	it('bildet Betriebssystem und CPU auf die Release-Namen ab', () => {
		expect(pbAssetName('0.40.5', 'win32', 'x64')).toBe('pocketbase_0.40.5_windows_amd64.zip');
		expect(pbAssetName('0.40.5', 'darwin', 'arm64')).toBe('pocketbase_0.40.5_darwin_arm64.zip');
		expect(pbAssetName('0.40.5', 'linux', 'arm')).toBe('pocketbase_0.40.5_linux_armv7.zip');
	});

	it('meldet nicht unterstützte Plattformen', () => {
		expect(() => pbAssetName('0.40.5', 'aix', 'x64')).toThrow();
	});
});

describe('pbBinaryName', () => {
	it('hängt unter Windows .exe an', () => {
		expect(pbBinaryName('win32')).toBe('pocketbase.exe');
		expect(pbBinaryName('linux')).toBe('pocketbase');
	});
});

describe('parseChecksums', () => {
	it('liest Prüfsummen-Zeilen und ignoriert Unsinn', () => {
		const hash = 'a'.repeat(64);
		const map = parseChecksums(`${hash}  pocketbase_x.zip\r\nkaputt\n`);
		expect(map.get('pocketbase_x.zip')).toBe(hash);
		expect(map.size).toBe(1);
	});
});

describe('extractFile', () => {
	it('entpackt eine deflate-komprimierte Datei', () => {
		const zip = buildZip('hallo.txt', Buffer.from('Hallo FamilienHub'));
		expect(extractFile(zip, 'hallo.txt')?.toString()).toBe('Hallo FamilienHub');
		expect(extractFile(zip, 'fehlt.txt')).toBeUndefined();
	});
});

/** Baut ein minimales ZIP mit einer Datei (genug für den Test, ohne CRC-Prüfung). */
function buildZip(name: string, content: Buffer): Buffer {
	const nameBuf = Buffer.from(name);
	const data = deflateRawSync(content);

	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(8, 8);
	local.writeUInt32LE(data.length, 18);
	local.writeUInt32LE(content.length, 22);
	local.writeUInt16LE(nameBuf.length, 26);

	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(8, 10);
	central.writeUInt32LE(data.length, 20);
	central.writeUInt32LE(content.length, 24);
	central.writeUInt16LE(nameBuf.length, 28);
	central.writeUInt32LE(0, 42);

	const centralOffset = local.length + nameBuf.length + data.length;
	const centralSize = central.length + nameBuf.length;
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(centralSize, 12);
	eocd.writeUInt32LE(centralOffset, 16);

	return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}
