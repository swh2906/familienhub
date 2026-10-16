// Minimaler ZIP-Entpacker (nur "stored" und "deflate", kein ZIP64).
// Reicht für die PocketBase-Archive und spart eine Abhängigkeit.
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Gibt den Inhalt der Datei `name` aus dem ZIP-Archiv zurück (oder `undefined`). */
export function extractFile(zip: Buffer, name: string): Buffer | undefined {
	const eocd = findEndOfCentralDirectory(zip);
	const count = zip.readUInt16LE(eocd + 10);
	let offset = zip.readUInt32LE(eocd + 16);

	for (let i = 0; i < count; i++) {
		if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
			throw new Error('Ungültiges ZIP-Archiv (Zentralverzeichnis).');
		}
		const method = zip.readUInt16LE(offset + 10);
		const compressedSize = zip.readUInt32LE(offset + 20);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localOffset = zip.readUInt32LE(offset + 42);
		const entryName = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
		offset += 46 + nameLength + extraLength + commentLength;

		if (entryName !== name) continue;

		if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
			throw new Error('Ungültiges ZIP-Archiv (lokaler Kopf).');
		}
		const dataStart =
			localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
		const data = zip.subarray(dataStart, dataStart + compressedSize);
		if (method === 0) return Buffer.from(data);
		if (method === 8) return inflateRawSync(data);
		throw new Error(`Nicht unterstützte ZIP-Kompression: ${method}`);
	}
	return undefined;
}

function findEndOfCentralDirectory(zip: Buffer): number {
	// Der Abschluss-Datensatz steht am Ende, gefolgt von höchstens 64 KB Kommentar.
	const min = Math.max(0, zip.length - 22 - 0xffff);
	for (let i = zip.length - 22; i >= min; i--) {
		if (zip.readUInt32LE(i) === EOCD_SIGNATURE) return i;
	}
	throw new Error('Ungültiges ZIP-Archiv (kein Abschluss-Datensatz).');
}
