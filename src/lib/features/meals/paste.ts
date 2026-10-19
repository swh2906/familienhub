// „Zutaten aus Text einfügen“: macht aus kopiertem Text (z. B. per Live Text vom Foto einer
// Kochbuchseite) Zutaten-Zeilen. Läuft komplett auf dem Gerät; die Erkennung steckt in
// parse/ingredient.ts (Menge, Einheit, optional, Alternativen, „nach Geschmack“).
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
