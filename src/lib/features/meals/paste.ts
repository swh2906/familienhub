// „Zutaten aus Text einfügen“: macht aus kopiertem Text (z. B. per Live Text vom Foto einer
// Kochbuchseite) Zutaten-Zeilen. Läuft komplett auf dem Gerät; die Erkennung steckt in
// parse/ingredient.ts (Menge, Einheit, optional, Alternativen, „nach Geschmack“).
import type { CorrectedIngredient } from '#lib/db/types.js';
import { parseIngredient, type ParsedIngredient } from './parse/ingredient.js';
import type { IngredientDraft } from './recipes.js';

/** Erkannte Zutat für Vorschau und Editor (Draft plus Zusatzangaben). */
export type PastedIngredient = IngredientDraft & Omit<ParsedIngredient, 'name' | 'amount' | 'unit'>;

function toDraft(parsed: ParsedIngredient): PastedIngredient {
	return { ...parsed, category: '' };
}

/** Eine Zeile wie „300 g Mehl“, „Petersilie, optional“ oder „Salz und Pfeffer“ (→ zwei). */
export function parseIngredientLine(line: string): PastedIngredient[] {
	return parseIngredient(line).map(toDraft);
}

/** Mehrere Zeilen auf einmal; leere Zeilen und Überschriften fallen weg. */
export function parseIngredientText(text: string): PastedIngredient[] {
	return text.split(/\r?\n/).flatMap(parseIngredientLine);
}

/** Eine eingefügte Zeile: automatische Erkennung und – falls gelernt – die Korrektur der Familie. */
export interface PastedLine {
	raw: string;
	automatic: PastedIngredient[];
	items: PastedIngredient[];
	learned: boolean;
}

/**
 * Wie `parseIngredientText`, aber zeilenweise. Hat die Familie eine Zeile schon einmal
 * korrigiert (Schlüssel siehe pantry/learn.ts), gilt die gelernte Fassung.
 */
export function parsePastedLines(
	text: string,
	corrections: ReadonlyMap<string, CorrectedIngredient[]> = new Map(),
	keyOf: (line: string) => string = (line) => line
): PastedLine[] {
	const lines: PastedLine[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const automatic = parseIngredientLine(raw);
		if (automatic.length === 0) continue;
		const learned = corrections.get(keyOf(raw));
		lines.push({
			raw: raw.trim(),
			automatic,
			items: learned
				? learned.map((c) => ({ ...c, category: '', confidence: 'high' as const }))
				: automatic,
			learned: !!learned
		});
	}
	return lines;
}
