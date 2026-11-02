// Rezept-Import per Link (Schritt 12 A): macht aus den Rezeptdaten einer Webseite (schema.org
// `Recipe`, vom Server geholt) Werte für den Editor. Reine Logik; die Zutatenzeilen erkennt danach
// derselbe Erkenner wie bei „Zutaten aus Text einfügen“ (inklusive gelernter Korrekturen).

export interface ImportedRecipe {
	title: string;
	servings: number | null;
	prepMinutes: number | null;
	instructions: string;
	ingredientLines: string[];
	tags: string[];
	sourceUrl: string;
}

const ENTITIES: Record<string, string> = {
	amp: '&',
	quot: '"',
	apos: "'",
	lt: '<',
	gt: '>',
	nbsp: ' ',
	frac12: '½',
	frac14: '¼',
	frac34: '¾',
	auml: 'ä',
	ouml: 'ö',
	uuml: 'ü',
	Auml: 'Ä',
	Ouml: 'Ö',
	Uuml: 'Ü',
	szlig: 'ß',
	deg: '°',
	ndash: '–',
	hellip: '…'
};

/** Text ohne HTML-Tags und mit aufgelösten Entities, Leerraum zusammengefasst. */
export function plainText(value: unknown): string {
	if (typeof value !== 'string' && typeof value !== 'number') return '';
	return String(value)
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, code: string) => {
			if (code[0] !== '#') return ENTITIES[code] ?? all;
			const n =
				code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
			return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all;
		})
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.trim();
}

/** ISO-8601-Dauer wie `PT1H15M` oder `P0DT0H45M` → Minuten; sonst null. */
export function parseDuration(value: unknown): number | null {
	const text = Array.isArray(value) ? value[0] : value;
	if (typeof text !== 'string') return null;
	const match =
		/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
			text.trim()
		);
	if (!match || match.slice(1).every((part) => part === undefined)) return null;
	const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
	const total = Math.round(days * 1440 + hours * 60 + minutes + seconds / 60);
	return total > 0 && total <= 1440 ? total : null;
}

/** „4 Portionen“, 4, ["4", "4 Stück"] → 4; sonst null. */
export function parseYield(value: unknown): number | null {
	const values = Array.isArray(value) ? value : [value];
	for (const item of values) {
		const match = /\d+/.exec(plainText(item));
		const n = match ? Number(match[0]) : 0;
		if (n >= 1 && n <= 99) return n;
	}
	return null;
}

function asList(value: unknown): unknown[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

function typeOf(node: Record<string, unknown>): string {
	const type = asList(node['@type']).find((t) => typeof t === 'string');
	return typeof type === 'string' ? type.replace(/^.*[:/]/, '') : '';
}

/** Schritte als Zeilen: Text, HowToStep, HowToSection (Name als Zwischenüberschrift). */
function stepLines(value: unknown, depth = 0): string[] {
	if (depth > 4) return [];
	if (typeof value === 'string') {
		return plainText(value)
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
	}
	const lines: string[] = [];
	for (const item of asList(value)) {
		if (typeof item === 'string') {
			lines.push(...stepLines(item, depth + 1));
		} else if (item && typeof item === 'object' && !Array.isArray(item)) {
			const node = item as Record<string, unknown>;
			if (typeOf(node) === 'HowToSection' || node.itemListElement) {
				const name = plainText(node.name);
				if (name) lines.push(`${name}:`);
				lines.push(...stepLines(node.itemListElement, depth + 1));
			} else {
				lines.push(...stepLines(plainText(node.text) || plainText(node.name), depth + 1));
			}
		} else if (Array.isArray(item)) {
			lines.push(...stepLines(item, depth + 1));
		}
	}
	return lines;
}

/** Kategorie und Küche als Tags (Stichwörter sind meist zu viele und zu ungenau). */
function tagsOf(raw: Record<string, unknown>): string[] {
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const value of [...asList(raw.recipeCategory), ...asList(raw.recipeCuisine)]) {
		for (const part of plainText(value).split(',')) {
			const tag = part.trim();
			if (!tag || tag.length > 30 || seen.has(tag.toLowerCase())) continue;
			seen.add(tag.toLowerCase());
			tags.push(tag);
		}
	}
	return tags.slice(0, 4);
}

/** Rezeptdaten (schema.org `Recipe`) → Werte für den Editor. */
export function mapImportedRecipe(raw: unknown, sourceUrl: string): ImportedRecipe {
	const data =
		raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const total = parseDuration(data.totalTime);
	const parts = [parseDuration(data.prepTime), parseDuration(data.cookTime)].filter(
		(n): n is number => n !== null
	);
	const sum = parts.reduce((a, b) => a + b, 0);
	return {
		title: plainText(asList(data.name)[0]).slice(0, 200),
		servings: parseYield(data.recipeYield ?? data.yield),
		prepMinutes: total ?? (sum > 0 && sum <= 1440 ? sum : null),
		instructions: stepLines(data.recipeInstructions).join('\n'),
		ingredientLines: asList(data.recipeIngredient ?? data.ingredients)
			.map((line) => plainText(line).replace(/\n/g, ' '))
			.filter(Boolean)
			.slice(0, 100),
		tags: tagsOf(data),
		sourceUrl
	};
}

/** Kurzer Name der Quelle für die Anzeige: „chefkoch.de“. */
export function sourceLabel(url: string): string {
	const match = /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(url.trim());
	return match ? match[1].toLowerCase() : '';
}
