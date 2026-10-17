// Service Worker: speichert die gebaute App beim Installieren vorab, damit sie ohne Netz startet.
// Daten laufen nie über diesen Cache – die liegen in IndexedDB und kommen über /api.
// Neue Versionen warten, bis die Oberfläche „Neu laden“ bestätigt (UpdatePrompt.svelte).
// Eigene tsconfig (WebWorker-Typen), daher vom Haupt-tsconfig ausgenommen.
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `familienhub-${version}`;
// '/' ist die SPA-Hülle (index.html); alle Seiten werden im Browser daraus aufgebaut.
const SHELL = '/';
const PRECACHE = [SHELL, ...immutable.map((f) => `/${f.path}`), ...assets.map((f) => `/${f.path}`)];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
	// Caches älterer Versionen entfernen.
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
			)
	);
});

self.addEventListener('message', (event) => {
	if (event.data === 'skip-waiting') void self.skipWaiting();
});

function bypass(url: URL): boolean {
	// PocketBase-API und Admin-Oberfläche nie aus dem Cache.
	return (
		url.origin !== self.location.origin ||
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/_/')
	);
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (bypass(url)) return;
	// ignoreVary: Modul-Skripte senden einen Origin-Header, der Vorab-Download nicht. Mit
	// „Vary: Origin“ vom Server würden sie sonst nie aus dem Cache kommen.

	if (request.mode === 'navigate') {
		// Jede Seite aus der gespeicherten Hülle; ohne Cache (z. B. erster Start) übers Netz.
		event.respondWith(
			caches
				.match(SHELL, { cacheName: CACHE, ignoreVary: true })
				.then((cached) => cached ?? fetch(request))
		);
		return;
	}

	event.respondWith(
		caches
			.match(request, { cacheName: CACHE, ignoreVary: true })
			.then((cached) => cached ?? fetch(request))
	);
});
