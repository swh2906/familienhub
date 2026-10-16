// PocketBase-Client. Nur das Sync-Modul (src/lib/sync/) darf ihn verwenden –
// die Oberfläche liest und schreibt ausschließlich in Dexie (per ESLint erzwungen).
import PocketBase from 'pocketbase';

let client: PocketBase | undefined;

/** Gibt den gemeinsamen Client zurück. Die App und PocketBase laufen unter demselben Ursprung. */
export function getPocketBase(): PocketBase {
	client ??= new PocketBase(window.location.origin);
	return client;
}
