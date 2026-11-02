/// <reference path="../../pb_data/types.d.ts" />

// Rezept-Import per Link (Schritt 12 A): POST /api/fh/recipes/import { household, url }.
// Der Server holt die Seite (der Browser darf fremde Seiten wegen CORS meist nicht lesen) und
// gibt die strukturierten Rezeptdaten (schema.org `Recipe` als JSON-LD) unverändert zurück.
// Das Umwandeln in Titel, Zutaten und Schritte macht die App (src/lib/features/meals/import.ts).
// Kein externer Dienst, keine KI; gespeichert wird hier nichts.

const IMPORT_TIMEOUT_S = 10;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const IMPORT_WINDOW_MS = 60 * 60 * 1000;
const IMPORT_MAX_PER_USER = 20;

// Endungen von Namen, die nur im Heim- oder Firmennetz gelten (inkl. Tailscale).
const INTERNAL_SUFFIX = /\.(localhost|local|lan|home|internal|intranet|corp|arpa|ts\.net)$/;

const NO_RECIPE =
	'Auf dieser Seite haben wir kein Rezept gefunden. Kopiere die Zutaten und nutze „Zutaten aus Text einfügen“.';

/** Hosts, die trotz Heimnetz-Sperre erlaubt sind (nur für Tests: HOMI_IMPORT_ALLOW_HOSTS=127.0.0.1). */
function allowedHosts() {
	return ($os.getenv('HOMI_IMPORT_ALLOW_HOSTS') || '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter((h) => h);
}

/** Ist eine IPv4-Adresse im Heimnetz, lokal oder sonst nicht öffentlich? */
function isPrivateIPv4(parts) {
	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		a >= 224 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168)
	);
}

/**
 * Prüft die Adresse und gibt den Fehlertext zurück, oder '' wenn sie geholt werden darf.
 * Erlaubt: http/https, öffentlicher Name oder öffentliche IPv4, Standard-Port.
 * Hinweis: Weiterleitungen und DNS-Antworten kann der Hook nicht prüfen; die Route ist darum
 * nur für Erwachsene der eigenen Familie offen und gedrosselt.
 */
function checkUrl(url) {
	const invalid = 'Bitte gib einen vollständigen Link ein, z. B. https://www.chefkoch.de/…';
	const blocked = 'Dieser Link zeigt ins Heimnetz und kann nicht geholt werden.';
	if (typeof url !== 'string' || url.length > 2000) return invalid;
	const match = /^(https?):\/\/([^/?#]*)/i.exec(url.trim());
	if (!match) return invalid;
	const authority = match[2];
	if (!authority || authority.includes('@')) return invalid;
	if (authority.startsWith('[')) return blocked;
	const hostPort = /^([^:]+)(?::(\d+))?$/.exec(authority);
	if (!hostPort) return invalid;
	const host = hostPort[1].toLowerCase().replace(/\.$/, '');
	if (allowedHosts().includes(host)) return '';
	const port = hostPort[2];
	if (port && port !== '80' && port !== '443') return blocked;
	if (!host.includes('.') || host === 'localhost' || INTERNAL_SUFFIX.test(host)) return blocked;
	if (host.split('.').every((label) => /^(\d+|0x[0-9a-f]*)$/.test(label))) {
		// Sieht nach IP-Adresse aus: nur die übliche Schreibweise a.b.c.d, und nur öffentlich.
		const quad = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
		if (!quad) return blocked;
		const parts = quad.slice(1).map(Number);
		if (parts.some((p) => p > 255) || isPrivateIPv4(parts)) return blocked;
	}
	return '';
}

/** Höchstens IMPORT_MAX_PER_USER Abrufe pro Konto und Stunde. */
function throttle(e) {
	const store = e.app.store();
	const key = 'fh_import_user_' + e.auth.id;
	const raw = store.get(key);
	const parts = raw ? String(raw).split(':') : [];
	const fresh = parts.length === 2 && Number(parts[1]) > Date.now();
	const count = fresh ? Number(parts[0]) : 0;
	const resetAt = fresh ? Number(parts[1]) : Date.now() + IMPORT_WINDOW_MS;
	if (count >= IMPORT_MAX_PER_USER) {
		throw new TooManyRequestsError('Zu viele Abrufe. Bitte in einer Stunde erneut versuchen.');
	}
	store.set(key, count + 1 + ':' + resetAt);
}

function isRecipeType(type) {
	const types = Array.isArray(type) ? type : [type];
	return types.some((t) => typeof t === 'string' && /(^|[:/])Recipe$/.test(t));
}

/** Sucht das erste `Recipe` in einem JSON-LD-Block (auch in Listen und `@graph`). */
function findRecipe(node, depth) {
	if (!node || typeof node !== 'object' || depth > 6) return null;
	if (Array.isArray(node)) {
		for (const item of node) {
			const found = findRecipe(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	if (isRecipeType(node['@type'])) return node;
	return findRecipe(node['@graph'], depth + 1) || findRecipe(node.mainEntity, depth + 1);
}

/** Alle JSON-LD-Blöcke einer Seite; kaputte Blöcke werden übersprungen. */
function recipeFromHtml(html) {
	const pattern =
		/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
	let match;
	while ((match = pattern.exec(html))) {
		let data;
		try {
			data = JSON.parse(match[1].trim().replace(/^<!--|-->$/g, ''));
		} catch {
			continue;
		}
		const recipe = findRecipe(data, 0);
		if (recipe) return recipe;
	}
	return null;
}

// Nur die Felder, die die App auswertet – der Rest der Seite bleibt auf dem Server.
const RECIPE_FIELDS = [
	'name',
	'recipeYield',
	'yield',
	'totalTime',
	'prepTime',
	'cookTime',
	'recipeIngredient',
	'ingredients',
	'recipeInstructions',
	'recipeCategory',
	'recipeCuisine'
];

/**
 * Manche Seiten (z. B. Chefkoch) hängen „von <Autor>“ an den Titel. Gekürzt wird nur, wenn das
 * Ende genau dem Autor-Feld entspricht – „Kuchen von Oma“ bleibt. Der Autor selbst bleibt hier.
 */
function withoutAuthor(name, author) {
	if (typeof name !== 'string') return name;
	const authors = Array.isArray(author) ? author : [author];
	for (const a of authors) {
		const who = typeof a === 'string' ? a : a && typeof a.name === 'string' ? a.name : '';
		const suffix = ' von ' + who.trim();
		if (who.trim() && name.endsWith(suffix) && name.length > suffix.length) {
			return name.slice(0, -suffix.length).trim();
		}
	}
	return name;
}

/** POST /api/fh/recipes/import: Rezeptdaten einer Webseite für den Editor. */
function importRecipe(e) {
	const { findMembership } = require(`${__hooks}/lib/familienhub.js`);
	const body = e.requestInfo().body || {};
	const household = typeof body.household === 'string' ? body.household : '';
	const membership = household ? findMembership(e.app, e.auth.id, household) : null;
	if (!membership || membership.getString('role') === 'child') {
		throw new ForbiddenError('Rezepte übernehmen dürfen nur Erwachsene des Familienraums.');
	}
	const url = typeof body.url === 'string' ? body.url.trim() : '';
	const problem = checkUrl(url);
	if (problem) throw new BadRequestError(problem);
	throttle(e);

	let res;
	try {
		res = $http.send({
			url,
			method: 'GET',
			timeout: IMPORT_TIMEOUT_S,
			headers: {
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'de-DE,de;q=0.9',
				'User-Agent': 'Mozilla/5.0 (compatible; Homi-Rezeptimport/1.0)'
			}
		});
	} catch {
		throw new BadRequestError('Die Seite hat nicht geantwortet. Stimmt der Link?');
	}
	if (res.statusCode < 200 || res.statusCode >= 300) {
		throw new BadRequestError(
			'Die Seite konnte nicht geladen werden (Fehler ' + res.statusCode + ').'
		);
	}
	if (res.body.length > IMPORT_MAX_BYTES) {
		throw new BadRequestError('Die Seite ist zu groß für den Import.');
	}
	const recipe = recipeFromHtml(toString(res.body));
	if (!recipe) throw new BadRequestError(NO_RECIPE);

	const picked = {};
	for (const field of RECIPE_FIELDS) {
		if (recipe[field] !== undefined) picked[field] = recipe[field];
	}
	if (typeof picked.name === 'string') picked.name = withoutAuthor(picked.name, recipe.author);
	return e.json(200, { recipe: picked, url });
}

module.exports = { importRecipe, checkUrl, recipeFromHtml };
