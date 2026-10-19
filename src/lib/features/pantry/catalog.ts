// Basisartikel: verschiedene Schreibweisen einer Zutat („Mehl“, „Weizenmehl Typ 405“, „Mehl 405“)
// landen beim selben Artikel. Grundlage für Vorrat und Einkaufsliste. Reine Logik, auf dem Gerät.

export interface StarterIngredient {
	/** Anzeigename. */
	name: string;
	/** Weitere Schreibweisen (werden normalisiert verglichen). */
	aliases: string[];
	/** Übliche Einheit für Bestand und Einkauf. */
	unit: string;
	/** Übliche Packungsgröße (0 = unbekannt), in `unit`. */
	pack: number;
}

/** Startwörterbuch häufiger Grundzutaten; die Familie ergänzt es durch Korrekturen. */
const S = (name: string, unit: string, pack: number, ...aliases: string[]): StarterIngredient => ({
	name,
	aliases,
	unit,
	pack
});

export const STARTER_INGREDIENTS: StarterIngredient[] = [
	// Trockenware
	S(
		'Mehl',
		'g',
		1000,
		'Weizenmehl',
		'Weizenmehl 405',
		'Mehl 405',
		'Weizenmehl Type 405',
		'Weißmehl'
	),
	S('Dinkelmehl', 'g', 1000, 'Dinkelmehl 630', 'Dinkelmehl Typ 630'),
	S('Vollkornmehl', 'g', 1000, 'Weizenvollkornmehl'),
	S('Speisestärke', 'g', 400, 'Stärke', 'Maisstärke'),
	S('Zucker', 'g', 1000, 'Weißer Zucker', 'Kristallzucker'),
	S('Puderzucker', 'g', 250),
	S('Brauner Zucker', 'g', 500, 'Rohrzucker'),
	S('Vanillezucker', 'Packung', 10),
	S('Backpulver', 'Packung', 5),
	S('Natron', 'g', 50),
	S('Trockenhefe', 'Packung', 3),
	S('Hefe', 'Würfel', 1, 'Frische Hefe', 'Frischhefe'),
	S('Nudeln', 'g', 500, 'Pasta'),
	S('Spaghetti', 'g', 500),
	S('Penne', 'g', 500),
	S('Lasagneplatten', 'g', 500, 'Lasagnenudeln'),
	S('Reis', 'g', 1000, 'Langkornreis', 'Basmatireis', 'Jasminreis'),
	S('Risottoreis', 'g', 500, 'Arborio'),
	S('Haferflocken', 'g', 500),
	S('Couscous', 'g', 500),
	S('Bulgur', 'g', 500),
	S('Linsen', 'g', 500, 'Rote Linsen'),
	S('Paniermehl', 'g', 200, 'Semmelbrösel'),
	S('Kakao', 'g', 250, 'Kakaopulver', 'Backkakao'),
	S('Schokolade', 'g', 100, 'Zartbitterschokolade', 'Kuvertüre'),
	S('Honig', 'g', 500),
	S('Nüsse', 'g', 200, 'Walnüsse', 'Haselnüsse'),
	S('Mandeln', 'g', 200, 'Gemahlene Mandeln'),
	// Gewürze & Öle
	S('Salz', 'g', 500, 'Speisesalz', 'Meersalz'),
	S('Pfeffer', 'g', 50, 'Schwarzer Pfeffer'),
	S('Paprikapulver', 'g', 50, 'Paprika edelsüß', 'Paprika rosenscharf'),
	S('Zimt', 'g', 50),
	S('Muskat', 'g', 50, 'Muskatnuss'),
	S('Oregano', 'g', 20),
	S('Curry', 'g', 50, 'Currypulver'),
	S('Gemüsebrühe', 'g', 200, 'Brühe', 'Gemüsebrühepulver', 'Instantbrühe'),
	S('Olivenöl', 'ml', 500),
	S('Öl', 'ml', 1000, 'Pflanzenöl', 'Rapsöl', 'Sonnenblumenöl', 'Speiseöl'),
	S('Essig', 'ml', 500, 'Weißweinessig', 'Balsamico'),
	S('Senf', 'g', 250),
	S('Ketchup', 'ml', 500),
	S('Sojasoße', 'ml', 250, 'Sojasauce'),
	// Kühlregal
	S('Milch', 'ml', 1000, 'Vollmilch', 'Frische Milch'),
	S('Butter', 'g', 250),
	S('Margarine', 'g', 500),
	S('Sahne', 'ml', 200, 'Schlagsahne', 'Kochsahne'),
	S('Schmand', 'g', 200),
	S('Saure Sahne', 'g', 200),
	S('Crème fraîche', 'g', 200, 'Creme fraiche'),
	S('Quark', 'g', 500, 'Magerquark', 'Speisequark'),
	S('Joghurt', 'g', 500, 'Naturjoghurt'),
	S('Frischkäse', 'g', 200),
	S('Mozzarella', 'Stück', 1),
	S('Parmesan', 'g', 100, 'Parmigiano'),
	S('Gouda', 'g', 400),
	S('Reibekäse', 'g', 200, 'Geriebener Käse', 'Käse gerieben'),
	S('Feta', 'g', 200, 'Schafskäse'),
	S('Eier', 'Stück', 10, 'Ei'),
	S('Speck', 'g', 125, 'Speckwürfel', 'Bacon'),
	S('Schinken', 'g', 100, 'Kochschinken'),
	// Fleisch & Fisch
	S('Hackfleisch', 'g', 500, 'Rinderhack', 'Gemischtes Hack', 'Hack'),
	S('Hähnchenbrust', 'g', 400, 'Hähnchenbrustfilet', 'Hühnerbrust'),
	S('Würstchen', 'Stück', 6, 'Wiener'),
	S('Lachs', 'g', 250, 'Lachsfilet'),
	S('Thunfisch', 'Dose', 1),
	// Obst & Gemüse
	S('Zwiebel', 'Stück', 0, 'Zwiebeln'),
	S('Rote Zwiebel', 'Stück', 0),
	S('Knoblauch', 'Zehe', 0, 'Knoblauchzehe'),
	S('Kartoffel', 'g', 2000, 'Kartoffeln'),
	S('Möhre', 'Stück', 0, 'Karotte', 'Mohrrübe', 'Möhren', 'Karotten'),
	S('Tomate', 'Stück', 0, 'Tomaten'),
	S('Cherrytomate', 'g', 250, 'Cherrytomaten', 'Kirschtomaten'),
	S('Paprika', 'Stück', 0, 'Paprikaschote'),
	S('Zucchini', 'Stück', 0),
	S('Aubergine', 'Stück', 0),
	S('Gurke', 'Stück', 0, 'Salatgurke'),
	S('Brokkoli', 'g', 500),
	S('Blumenkohl', 'Stück', 1),
	S('Spinat', 'g', 450, 'Blattspinat'),
	S('Lauch', 'Stange', 0, 'Porree'),
	S('Champignons', 'g', 250, 'Pilze'),
	S('Salat', 'Kopf', 1, 'Kopfsalat', 'Eisbergsalat'),
	S('Rucola', 'g', 125),
	S('Petersilie', 'Bund', 1, 'Glatte Petersilie', 'Krause Petersilie'),
	S('Schnittlauch', 'Bund', 1),
	S('Basilikum', 'Bund', 1),
	S('Ingwer', 'g', 0),
	S('Zitrone', 'Stück', 0, 'Zitronen'),
	S('Limette', 'Stück', 0, 'Limetten'),
	S('Apfel', 'Stück', 0, 'Äpfel'),
	S('Banane', 'Stück', 0, 'Bananen'),
	// Konserven & Sonstiges
	S('Passierte Tomaten', 'g', 500, 'Passata', 'Tomaten passiert'),
	S('Gehackte Tomaten', 'Dose', 1, 'Tomaten gehackt', 'Stückige Tomaten', 'Dosentomaten'),
	S('Tomatenmark', 'g', 200),
	S('Kokosmilch', 'ml', 400),
	S('Kichererbsen', 'Dose', 1),
	S('Kidneybohnen', 'Dose', 1),
	S('Mais', 'Dose', 1),
	S('Erbsen', 'g', 450, 'TK-Erbsen'),
	S('Brot', 'Stück', 1),
	S('Toast', 'Packung', 1, 'Toastbrot'),
	S('Wein', 'ml', 750, 'Weißwein', 'Rotwein'),
	S('Wasser', 'ml', 0)
];

// Wörter, die nie zur Zutat gehören („Typ 405“, „Bio“, „TK“).
const ALWAYS = new Set(['bio', 'tk', 'typ', 'type', 'ca', 'etwa', 'z', 'b']);
// Beschreibende Wörter: werden erst in der zweiten Stufe ignoriert („frische Petersilie“ →
// Petersilie), damit „Gehackte Tomaten“ (Konserve) nicht mit „Tomate“ zusammenfällt.
const DESCRIPTIVE = new Set([
	'frisch',
	'frische',
	'frischer',
	'frisches',
	'gehackt',
	'gehackte',
	'gemahlen',
	'gemahlene',
	'getrocknet',
	'getrocknete',
	'fein',
	'grob',
	'klein',
	'kleine',
	'gross',
	'grosse',
	'mittelgross',
	'mittelgrosse',
	'reif',
	'reife'
]);

/** Für Vergleiche: klein, ohne Akzente, Zahlen und Satzzeichen; optional ohne Beschreibungen. */
export function normalizeName(text: string, dropDescriptive = true): string {
	return text
		.toLocaleLowerCase('de')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^a-z\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w && !ALWAYS.has(w) && !(dropDescriptive && DESCRIPTIVE.has(w)))
		.join(' ');
}

/** Einfache Einzahl für den Vergleich: „tomaten“ → „tomate“, „kartoffeln“ → „kartoffel“. */
function singular(word: string): string {
	if (word.length > 5 && /(?:en|ln|rn)$/.test(word) && !/(?:ien)$/.test(word)) {
		return word.slice(0, -1);
	}
	if (word.length > 5 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
	return word;
}

function keyOf(text: string, dropDescriptive: boolean): string {
	return normalizeName(text, dropDescriptive).split(' ').filter(Boolean).map(singular).join(' ');
}

/** Schlüssel einer Zutat (mit beschreibenden Wörtern, in Einzahl); Grundlage der festen ID. */
export function ingredientKey(text: string): string {
	return keyOf(text, false);
}

/** Grobschlüssel ohne beschreibende Wörter (zweite Vergleichsstufe). */
function baseKey(text: string): string {
	return keyOf(text, true);
}

/**
 * Feste ID je Familie und Schlüssel (15 Zeichen a–z0–9, PocketBase-Format). Legen zwei Geräte
 * gleichzeitig „Mehl“ an, entsteht dieselbe ID statt zwei Artikeln.
 */
export function ingredientId(household: string, key: string): string {
	const input = `${household}|${key}`;
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

export interface KnownIngredient {
	id?: string;
	name: string;
	aliases: string[];
}

export interface Match {
	/** Schlüssel des Basisartikels (Grundlage der festen ID). */
	key: string;
	/** Anzeigename des Basisartikels. */
	name: string;
	/** Bekannter Artikel der Familie bzw. aus dem Startwörterbuch. */
	known: KnownIngredient | StarterIngredient | null;
	/** 'known' = Familie, 'starter' = Wörterbuch, 'new' = neuer Artikel. */
	source: 'known' | 'starter' | 'new';
}

/** Großschreibung am Anfang für neue Artikel („mehl“ → „Mehl“). */
function displayName(text: string): string {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	return trimmed.charAt(0).toLocaleUpperCase('de') + trimmed.slice(1);
}

/**
 * Basisartikel zu einem Zutatennamen. Reihenfolge: Artikel der Familie (mit gelernten
 * Schreibweisen), dann Startwörterbuch – zuerst genau, dann ohne beschreibende Wörter.
 * Sonst ein neuer Artikel mit dem eigenen Namen.
 */
export function matchIngredient(name: string, known: readonly KnownIngredient[]): Match {
	const fromFamily = (item: KnownIngredient): Match => ({
		key: ingredientKey(item.name),
		name: item.name,
		known: item,
		source: 'known'
	});
	const fromStarter = (item: StarterIngredient): Match => {
		const key = ingredientKey(item.name);
		// Hat die Familie den Wörterbuch-Artikel schon angelegt, gilt ihr Artikel.
		const own = known.find((k) => ingredientKey(k.name) === key);
		return own ? fromFamily(own) : { key, name: item.name, known: item, source: 'starter' };
	};

	for (const toKey of [ingredientKey, baseKey]) {
		const wanted = toKey(name);
		if (!wanted) break;
		const hit = (item: { name: string; aliases: string[] }) =>
			[item.name, ...item.aliases].some((alias) => toKey(alias) === wanted);
		const family = known.find(hit);
		if (family) return fromFamily(family);
		const starter = STARTER_INGREDIENTS.find(hit);
		if (starter) return fromStarter(starter);
	}

	return {
		key: ingredientKey(name),
		name: displayName(name),
		known: null,
		source: 'new'
	};
}

/** Startdaten für einen neuen Basisartikel (Einheit/Packung aus dem Wörterbuch, falls bekannt). */
export function starterFor(match: Match): { unit: string; pack: number } {
	if (match.source === 'starter' && match.known && 'pack' in match.known) {
		return { unit: match.known.unit, pack: match.known.pack };
	}
	return { unit: '', pack: 0 };
}
