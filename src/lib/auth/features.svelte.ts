// Schalter für Testphasen-Funktionen (z. B. Feedback), vom Server über /api/fh/features.
// Der zuletzt bekannte Stand wird gemerkt, damit die Reiter auch offline gleich bleiben.
import { getPocketBase } from '#lib/pb/client.js';

const KEY = 'fh-features';

interface FeatureFlags {
	feedback: boolean;
}

function readCache(): FeatureFlags {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { feedback: JSON.parse(raw).feedback === true };
	} catch {
		// Speicher nicht verfügbar: Standard gilt.
	}
	return { feedback: false };
}

class Features {
	feedback = $state(readCache().feedback);

	/** Fragt den Server; ohne Verbindung bleibt der gemerkte Stand. */
	async load(): Promise<void> {
		try {
			const flags = await getPocketBase().send<FeatureFlags>('/api/fh/features', {});
			this.feedback = flags.feedback === true;
			localStorage.setItem(KEY, JSON.stringify({ feedback: this.feedback }));
		} catch {
			// Offline oder älterer Server: gemerkten Stand behalten.
		}
	}
}

export const features = new Features();
