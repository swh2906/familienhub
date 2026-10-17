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
