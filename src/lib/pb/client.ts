// PocketBase-Client. Nur das Sync-Modul (src/lib/sync/) darf ihn verwenden –
// die Oberfläche liest und schreibt ausschließlich in Dexie (per ESLint erzwungen).
import PocketBase from 'pocketbase';

/**
 * Höchstdauer einer Anfrage. Ist der Server nicht erreichbar, ohne die Verbindung abzulehnen
 * (z. B. unterwegs mit der Heimnetz-Adresse), hinge eine Anfrage sonst sehr lange. Nach Ablauf gilt
 * sie als Netzwerkfehler (Status 0): Die App arbeitet lokal weiter und versucht es später erneut.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

let client: PocketBase | undefined;

/** Gibt den gemeinsamen Client zurück. Die App und PocketBase laufen unter demselben Ursprung. */
export function getPocketBase(): PocketBase {
	if (!client) {
		client = new PocketBase(window.location.origin);
		client.beforeSend = (url, options) => {
			const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
			// Ein vorhandenes Signal (Abbruch durch das SDK) bleibt wirksam.
			options.signal =
				options.signal && 'any' in AbortSignal
					? AbortSignal.any([options.signal, timeout])
					: (options.signal ?? timeout);
			return { url, options };
		};
	}
	return client;
}
