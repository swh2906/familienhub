// IDs entstehen auf dem Gerät, im selben Format wie bei PocketBase: 15 Zeichen aus [a-z0-9].
// So kann ein Datensatz offline angelegt und später unter derselben ID beim Server gespeichert werden.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 15;

export function newId(): string {
	// 252 ist das größte Vielfache von 36 unter 256: höhere Werte verwerfen, damit alle Zeichen gleich wahrscheinlich sind.
	let id = '';
	while (id.length < LENGTH) {
		const bytes = crypto.getRandomValues(new Uint8Array(LENGTH * 2));
		for (const byte of bytes) {
			if (byte < 252 && id.length < LENGTH) id += ALPHABET[byte % 36];
		}
	}
	return id;
}

export function isId(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9]{15}$/.test(value);
}

/**
 * Feste ID aus Bereich und Schlüssel (15 Zeichen a–z0–9, PocketBase-Format). Zwei Geräte, die
 * dasselbe anlegen (z. B. „Mehl“ oder eine Buchung zu einem Planeintrag), erzeugen dieselbe ID –
 * so entstehen keine Doppelten, auch offline.
 */
export function stableId(scope: string, key: string): string {
	const input = `${scope}|${key}`;
	// Drei FNV-1a-Varianten (32 Bit) → zusammen genug Länge, nur [a-z0-9].
	const hash = (seed: number) => {
		let h = seed >>> 0;
		for (let i = 0; i < input.length; i++) {
			h ^= input.charCodeAt(i);
			h = Math.imul(h, 16777619) >>> 0;
		}
		return h.toString(36).padStart(7, '0');
	};
	return (hash(2166136261) + hash(0x9747b28c) + hash(0x1b873593)).slice(0, 15);
}
