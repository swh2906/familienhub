// „Zutaten aus Text einfügen“: macht aus kopiertem Text (z. B. per Live Text vom Foto einer
// Kochbuchseite) Zutaten-Zeilen. Läuft komplett auf dem Gerät.
import { parseAmount } from './amounts.js';
import type { IngredientDraft } from './recipes.js';

// Schreibweisen → einheitliche Einheit (Schlüssel klein geschrieben).
const UNIT_ALIASES: Record<string, string> = {
	g: 'g',
	gr: 'g',
	gramm: 'g',
	kg: 'kg',
	kilo: 'kg',
	kilogramm: 'kg',
	ml: 'ml',
	milliliter: 'ml',
	cl: 'cl',
	l: 'l',
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
	pck: 'Packung',
	pkg: 'Packung',
	packung: 'Packung',
	packungen: 'Packung',
	päckchen: 'Packung',
	dose: 'Dose',
	dosen: 'Dose',
	bund: 'Bund',
	becher: 'Becher',
	tasse: 'Tasse',
	tassen: 'Tasse',
	zehe: 'Zehe',
	zehen: 'Zehe',
	scheibe: 'Scheibe',
	scheiben: 'Scheibe',
	msp: 'Msp.',
	handvoll: 'Handvoll'
};

// Menge am Zeilenanfang: Zahlen, Brüche, Unicode-Brüche, Bereiche („2-3“), auch „1 ½“.
const AMOUNT =
	/^((?:\d+\/\d+|\d*[½⅓⅔¼¾⅛]|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s+[½⅓⅔¼¾⅛]|\s+\d+\/\d+)?)\s*/;

/** Eine Zeile wie „300 g Mehl“, „2 EL Öl“, „3 Eier“ oder „Salz“ in eine Zutat umwandeln. */
export function parseIngredientLine(line: string): IngredientDraft | null {
	let text = line
		.trim()
		// Aufzählungszeichen und Nummerierung am Anfang
		.replace(/^(?:[-–•*·▪◦]|\d+[.)])\s+/, '')
		.trim();
	if (!text || /:$/.test(text)) return null; // Überschriften wie „Für den Teig:“

	let amount = 0;
	const amountMatch = AMOUNT.exec(text);
	if (amountMatch) {
		amount = parseAmount(amountMatch[1].replace(/\s*[-–]\s*\d+(?:[.,]\d+)?/, ''));
		text = text.slice(amountMatch[0].length);
	}

	let unit = '';
	const unitMatch = /^([A-Za-zÄÖÜäöüß]+)\.?(?:\s+|$)/.exec(text);
	if (unitMatch) {
		const alias = UNIT_ALIASES[unitMatch[1].toLocaleLowerCase('de')];
		// Einheit nur, wenn danach noch ein Name kommt („2 Zehen Knoblauch“, nicht „1 Zwiebel“).
		if (alias && text.slice(unitMatch[0].length).trim()) {
			unit = alias;
			text = text.slice(unitMatch[0].length);
		}
	}

	const name = text.replace(/\s+/g, ' ').trim();
	if (!name) return null;
	return { name, amount, unit, category: '' };
}

/** Mehrere Zeilen auf einmal; leere Zeilen und Überschriften fallen weg. */
export function parseIngredientText(text: string): IngredientDraft[] {
	return text
		.split(/\r?\n/)
		.map(parseIngredientLine)
		.filter((draft): draft is IngredientDraft => draft !== null);
}
