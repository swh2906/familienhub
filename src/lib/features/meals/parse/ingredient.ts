// Zutaten-Parser v2: zerlegt eine Zeile aus einem Rezepttext in Menge, Einheit, Name und
// Zusatzangaben (optional, Alternativen, „nach Geschmack“, Hinweise). Läuft komplett auf dem Gerät.
// Unsichere Erkennungen werden markiert statt geraten (confidence = 'low').
import { parseAmount } from '../amounts.js';

/** genau messbar · ungefähr („ca.“, „eine Prise“) · nicht messbar („nach Geschmack“). */
export type AmountKind = 'exact' | 'approx' | 'to_taste';

export interface ParsedIngredient {
	/** Name ohne Menge, Einheit und Zusätze, z. B. „Mehl“. */
	name: string;
	/** 0 = keine Menge. Bei Bereichen („2–3“) der obere Wert. */
	amount: number;
	/** Einheitliche Einheit („g“, „EL“ …) oder leer. */
	unit: string;
	amountKind: AmountKind;
	optional: boolean;
	/** Ersatz-Zutaten („oder Dinkelmehl“). */
	alternatives: string[];
	/** Zusätze wie „fein gehackt“, „2–3“, „400 g“, „nach Geschmack“. */
	note: string;
	/** 'low', wenn etwas nicht sicher erkannt wurde (z. B. unbekannte Einheit). */
	confidence: 'high' | 'low';
}

// Schreibweisen → einheitliche Einheit (Schlüssel klein geschrieben, ohne Punkt).
export const UNIT_ALIASES: Record<string, string> = {
	g: 'g',
	gr: 'g',
	gramm: 'g',
	kg: 'kg',
	kilo: 'kg',
	kilogramm: 'kg',
	mg: 'mg',
	ml: 'ml',
	milliliter: 'ml',
	cl: 'cl',
	dl: 'dl',
	l: 'l',
	ltr: 'l',
	liter: 'l',
	el: 'EL',
	esslöffel: 'EL',
	essl: 'EL',
	tl: 'TL',
	teelöffel: 'TL',
	teel: 'TL',
	stück: 'Stück',
	stk: 'Stück',
	st: 'Stück',
	prise: 'Prise',
	prisen: 'Prise',
	msp: 'Msp.',
	messerspitze: 'Msp.',
	messerspitzen: 'Msp.',
	pck: 'Packung',
	pkg: 'Packung',
	pk: 'Packung',
	packung: 'Packung',
	packungen: 'Packung',
	päckchen: 'Packung',
	pä: 'Packung',
	dose: 'Dose',
	dosen: 'Dose',
	glas: 'Glas',
	gläser: 'Glas',
	flasche: 'Flasche',
	flaschen: 'Flasche',
	becher: 'Becher',
	tasse: 'Tasse',
	tassen: 'Tasse',
	bund: 'Bund',
	zehe: 'Zehe',
	zehen: 'Zehe',
	scheibe: 'Scheibe',
	scheiben: 'Scheibe',
	zweig: 'Zweig',
	zweige: 'Zweig',
	stiel: 'Stiel',
	stiele: 'Stiel',
	blatt: 'Blatt',
	blätter: 'Blatt',
	stange: 'Stange',
	stangen: 'Stange',
	knolle: 'Knolle',
	knollen: 'Knolle',
	kopf: 'Kopf',
	köpfe: 'Kopf',
	würfel: 'Würfel',
	beutel: 'Beutel',
	tüte: 'Tüte',
	tüten: 'Tüte',
	rolle: 'Rolle',
	rollen: 'Rolle',
	handvoll: 'Handvoll',
	spritzer: 'Spritzer',
	schuss: 'Schuss',
	tropfen: 'Tropfen'
};

/** Einheiten, die nur ungefähr sind. */
const APPROX_UNITS = new Set(['Prise', 'Msp.', 'Handvoll', 'Spritzer', 'Schuss', 'Tropfen']);

/** Ausgeschriebene Mengen am Anfang („eine Prise“, „zwei Eier“, „eine halbe Zitrone“). */
const WORD_AMOUNTS: Record<string, number> = {
	ein: 1,
	eine: 1,
	einen: 1,
	einem: 1,
	einer: 1,
	zwei: 2,
	drei: 3,
	vier: 4,
	fünf: 5,
	sechs: 6,
	sieben: 7,
	acht: 8,
	neun: 9,
	zehn: 10,
	zwölf: 12,
	halbe: 0.5,
	halber: 0.5,
	halben: 0.5,
	halbes: 0.5
};

// Menge am Anfang: Zahlen, Brüche, Unicode-Brüche, „1 ½“, Bereiche („2-3“, „2 bis 3“).
const NUMBER = String.raw`(?:\d+\/\d+|\d*[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?)(?:\s+[½⅓⅔¼¾⅛]|\s+\d+\/\d+)?`;
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|bis)\s*(${NUMBER}))?\s*`, 'i');
// Menge mit Einheit am Ende („Mehl 500 g“, „Mehl: 500 g“).
const TRAILING_AMOUNT = new RegExp(String.raw`[:\s]\s*(${NUMBER})\s*([A-Za-zÄÖÜäöüß]+\.?)?\s*$`);

// Vorsätze für „ungefähr“.
const APPROX_PREFIX = /^(?:ca\.?|circa|etwa|ungefähr|rund|~)(?=[\s\d]|$)\s*/i;
// Markierungen für „optional“ (Rest der Zeile oder in Klammern).
const OPTIONAL_PATTERNS = [
	/\boptional\b/i,
	/\bnach belieben\b/i,
	/\bwer mag\b/i,
	/\bevtl\.?(?=\s|$)/i,
	/\beventuell\b/i,
	/\bfalls vorhanden\b/i,
	/\bbei bedarf\b/i,
	/\bzum garnieren\b/i,
	/\bzum bestreuen\b/i,
	/\bzum servieren\b/i
];
// „nicht messbar“: wird gebraucht, aber ohne feste Menge.
const TO_TASTE_PATTERNS = [/\bnach geschmack\b/i, /\bnach belieben\b/i, /\bbei bedarf\b/i];
// „etwas Salz“, „ein paar Blätter Basilikum“, „einige Tomaten“: ungenaue Mengenwörter am Anfang.
const VAGUE_PREFIX = /^(?:etwas|ein\s+wenig|ein\s+paar|einige|wenig|reichlich|viel)\s+/i;

/** Text vereinheitlichen: alle Leerzeichen-Arten (auch geschützte) zu einem. */
function tidy(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/** Liest eine einzelne Mengenangabe wie „1 ½“ oder „0,5“. */
function readNumber(text: string): number {
	return parseAmount(text);
}

/** Einheit erkennen, wenn danach noch ein Name folgt. */
function readUnit(text: string): { unit: string; rest: string; unknownWord: boolean } {
	const match = /^([A-Za-zÄÖÜäöüß]+)\.?(?:\s+|$)/.exec(text);
	if (!match) return { unit: '', rest: text, unknownWord: false };
	const alias = UNIT_ALIASES[match[1].toLocaleLowerCase('de')];
	const rest = text.slice(match[0].length).trim();
	// „1 Zwiebel“: kein Alias → das Wort ist der Name.
	if (!alias || !rest) return { unit: '', rest: text, unknownWord: false };
	// „1 Glas“ allein bleibt Name; „2 Zehen Knoblauch“ → Einheit.
	return { unit: alias, rest, unknownWord: false };
}

/** Klammern herausziehen: „Dose (400 g) Tomaten“ → Text ohne Klammer + Inhalt. */
function takeParentheses(text: string): { text: string; inner: string[] } {
	const inner: string[] = [];
	const without = text.replace(/\(([^)]*)\)/g, (_, content: string) => {
		inner.push(tidy(content));
		return ' ';
	});
	return { text: tidy(without), inner };
}

/** Prüft Muster und entfernt es aus dem Text. */
function stripPattern(text: string, pattern: RegExp): { text: string; found: boolean } {
	if (!pattern.test(text)) return { text, found: false };
	return { text: tidy(text.replace(pattern, ' ').replace(/\s*,\s*(?=,|$)/g, '')), found: true };
}

/** Teilt „Salz und Pfeffer“ in zwei Zutaten – nur bei kurzen Namen ohne Menge. */
function splitList(name: string): string[] | null {
	const parts = name
		.split(/\s+(?:und|&)\s+|\s*,\s*/)
		.map(tidy)
		.filter(Boolean);
	if (parts.length < 2) return null;
	if (parts.some((p) => p.split(' ').length > 2)) return null;
	return parts;
}

function empty(name: string): ParsedIngredient {
	return {
		name,
		amount: 0,
		unit: '',
		amountKind: 'exact',
		optional: false,
		alternatives: [],
		note: '',
		confidence: 'high'
	};
}

/**
 * Eine Zeile zerlegen. Ergebnis ist meist eine Zutat, bei Aufzählungen ohne Menge
 * („Salz und Pfeffer“) mehrere; leere Zeilen und Überschriften („Für den Teig:“) ergeben keine.
 */
export function parseIngredient(line: string): ParsedIngredient[] {
	let text = tidy(line)
		// Aufzählungszeichen und Nummerierung am Anfang
		.replace(/^(?:[-–•*·▪◦]|\d+[.)])\s+/, '');
	text = tidy(text);
	if (!text || /:$/.test(text)) return [];

	const notes: string[] = [];
	let optional = false;
	let toTaste = false;
	let approx = false;
	let confidence: 'high' | 'low' = 'high';

	// Klammern: „(optional)“, „(400 g)“, „(Typ 405)“
	const parens = takeParentheses(text);
	text = parens.text;
	for (const inner of parens.inner) {
		if (OPTIONAL_PATTERNS.some((p) => p.test(inner))) optional = true;
		if (TO_TASTE_PATTERNS.some((p) => p.test(inner))) toTaste = true;
		const rest = tidy(OPTIONAL_PATTERNS.reduce((t, p) => t.replace(p, ' '), inner));
		if (rest) notes.push(rest);
	}

	// Optional- und „nach Geschmack“-Angaben irgendwo in der Zeile
	for (const pattern of TO_TASTE_PATTERNS) {
		const r = stripPattern(text, pattern);
		if (r.found) {
			toTaste = true;
			if (/belieben|bedarf/i.test(pattern.source)) optional = true;
			notes.push(pattern.source.includes('geschmack') ? 'nach Geschmack' : '');
			text = r.text;
		}
	}
	for (const pattern of OPTIONAL_PATTERNS) {
		const r = stripPattern(text, pattern);
		if (r.found) {
			optional = true;
			text = r.text;
		}
	}
	text = tidy(text.replace(/^[,;:]\s*|\s*[,;:]$/g, ''));

	// „ca. 200 g“
	const approxPrefix = APPROX_PREFIX.exec(text);
	if (approxPrefix) {
		approx = true;
		text = text.slice(approxPrefix[0].length);
	}

	// Menge am Anfang (Ziffern oder Wörter)
	let amount = 0;
	const amountMatch = AMOUNT.exec(text);
	if (amountMatch) {
		const low = readNumber(amountMatch[1]);
		const high = amountMatch[2] ? readNumber(amountMatch[2]) : 0;
		amount = high > low ? high : low;
		if (high > low) notes.push(`${tidy(amountMatch[1])}–${tidy(amountMatch[2])}`);
		text = text.slice(amountMatch[0].length);
	} else {
		const vague = VAGUE_PREFIX.exec(text);
		if (vague) {
			toTaste = true;
			text = text.slice(vague[0].length);
		} else {
			const word = /^([A-Za-zÄÖÜäöüß]+)\s+/.exec(text);
			const value = word ? WORD_AMOUNTS[word[1].toLocaleLowerCase('de')] : undefined;
			if (word && value !== undefined) {
				amount = value;
				text = text.slice(word[0].length);
				// „eine halbe Zitrone“
				const half = /^(halbe[rns]?)\s+/i.exec(text);
				if (half) {
					amount *= 0.5;
					text = text.slice(half[0].length);
				}
			}
		}
	}

	// Einheit
	let unit = '';
	if (amount > 0 || approx) {
		const u = readUnit(text);
		unit = u.unit;
		text = u.rest;
	} else {
		// „Prise Salz“ ohne Zahl
		const u = readUnit(text);
		if (u.unit && APPROX_UNITS.has(u.unit)) {
			unit = u.unit;
			amount = 1;
			text = u.rest;
		}
	}

	// Menge am Ende: „Mehl 500 g“, „Mehl: 500 g“
	if (amount === 0 && !toTaste) {
		const trailing = TRAILING_AMOUNT.exec(text);
		if (trailing) {
			const alias = trailing[2]
				? UNIT_ALIASES[trailing[2].replace('.', '').toLocaleLowerCase('de')]
				: '';
			if (!trailing[2] || alias) {
				amount = readNumber(trailing[1]);
				unit = alias ?? '';
				text = tidy(text.slice(0, trailing.index).replace(/:$/, ''));
			}
		}
	}

	// Zusätze nach Komma: „Zwiebel, fein gehackt“ – aber nicht bei Aufzählungen von Nomen
	// („Salz, Pfeffer“: alle Teile großgeschrieben, keine Menge).
	const commaParts = text.split(',').map(tidy).filter(Boolean);
	const nounList =
		amount === 0 && commaParts.length > 1 && commaParts.every((p) => /^[A-ZÄÖÜ]/.test(p));
	const comma = nounList ? -1 : text.indexOf(',');
	if (comma > 0) {
		const extra = tidy(text.slice(comma + 1));
		text = tidy(text.slice(0, comma));
		if (extra) notes.push(extra);
	}

	// Alternativen: „Mehl oder Dinkelmehl“, „Butter/Margarine“
	let alternatives: string[] = [];
	const orParts = text
		.split(/\s+oder\s+|\s*\/\s*/)
		.map(tidy)
		.filter(Boolean);
	if (orParts.length > 1) {
		text = orParts[0];
		alternatives = orParts.slice(1);
	}

	if (unit && APPROX_UNITS.has(unit)) approx = true;
	const amountKind: AmountKind = toTaste && amount === 0 ? 'to_taste' : approx ? 'approx' : 'exact';

	// Ohne Menge und ohne Zusatz: Aufzählung („Salz und Pfeffer“) in mehrere Zutaten teilen.
	if (amount === 0 && alternatives.length === 0) {
		const list = splitList(text);
		if (list) {
			return list.map((name) => ({
				...empty(name),
				amountKind: toTaste ? 'to_taste' : 'exact',
				optional,
				note: tidy(notes.join(', '))
			}));
		}
	}

	const name = tidy(text);
	if (!name) return [];
	// Ziffern im Namen deuten auf eine nicht erkannte Menge hin.
	if (/\d/.test(name.replace(/typ\s*\d+/i, ''))) confidence = 'low';

	return [
		{
			name,
			amount,
			unit,
			amountKind,
			optional,
			alternatives,
			note: tidy(notes.filter(Boolean).join(', ')),
			confidence
		}
	];
}

/** Mehrere Zeilen; leere Zeilen und Überschriften fallen weg. */
export function parseIngredients(text: string): ParsedIngredient[] {
	return text.split(/\r?\n/).flatMap(parseIngredient);
}
