// Wann fragt Homi nach? (Schritt 11 B2/B4) – reine Logik.
// Grundsatz: wenige, nützliche Fragen. „Gekocht?“ nur für vergangene Planeinträge mit Rezept;
// Vorratsfragen nur für Zutaten, die bald gebraucht werden und deren Bestand unsicher ist.
import type { Ingredient, MealPlanEntry, RecipeIngredient } from '#lib/db/types.js';
import { addDaysTo } from '#lib/features/calendar/expand.js';
import { isUncertain, type Stock } from './stock.js';

const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2 } as const;

/** Planeinträge der letzten Tage (nicht heute), für die „Gekocht?“ noch offen ist; neueste zuerst. */
export function pendingCooked(
	entries: readonly MealPlanEntry[],
	today: string,
	days = 3
): MealPlanEntry[] {
	const from = addDaysTo(today, -days);
	return entries
		.filter((e) => !e.deleted_at && e.recipe && !e.cooked && e.date >= from && e.date < today)
		.sort((a, b) =>
			a.date === b.date ? SLOT_ORDER[b.slot] - SLOT_ORDER[a.slot] : b.date.localeCompare(a.date)
		);
}

/**
 * Basisartikel, die in den nächsten Tagen laut Essensplan gebraucht werden (ohne optionale
 * Zutaten). Ergebnis: Artikel-ID → frühestes Datum.
 */
export function neededSoon(
	entries: readonly MealPlanEntry[],
	rows: readonly RecipeIngredient[],
	today: string,
	days = 7
): Map<string, string> {
	const until = addDaysTo(today, days);
	const byRecipe = new Map<string, RecipeIngredient[]>();
	for (const row of rows) {
		if (row.deleted_at || row.optional || !row.ingredient) continue;
		const list = byRecipe.get(row.recipe) ?? [];
		list.push(row);
		byRecipe.set(row.recipe, list);
	}
	const result = new Map<string, string>();
	for (const entry of entries) {
		if (entry.deleted_at || !entry.recipe || entry.date < today || entry.date > until) continue;
		for (const row of byRecipe.get(entry.recipe) ?? []) {
			const id = row.ingredient as string;
			const known = result.get(id);
			if (!known || entry.date < known) result.set(id, entry.date);
		}
	}
	return result;
}

export interface StockQuestion {
	ingredient: Ingredient;
	stock: Stock;
	/** Datum, an dem die Zutat gebraucht wird. */
	date: string;
}

/** Höchstens `limit` Vorratsfragen: bald gebraucht und unsicher, das Dringendste zuerst. */
export function stockQuestions(
	ingredients: readonly Ingredient[],
	stocks: ReadonlyMap<string, Stock>,
	needed: ReadonlyMap<string, string>,
	skipped: ReadonlySet<string> = new Set(),
	limit = 3
): StockQuestion[] {
	const questions: StockQuestion[] = [];
	for (const ingredient of ingredients) {
		const date = needed.get(ingredient.id);
		const stock = stocks.get(ingredient.id);
		if (!date || !stock || skipped.has(ingredient.id) || !isUncertain(stock)) continue;
		questions.push({ ingredient, stock, date });
	}
	return questions
		.sort((a, b) =>
			a.date === b.date
				? a.ingredient.name.localeCompare(b.ingredient.name, 'de')
				: a.date.localeCompare(b.date)
		)
		.slice(0, limit);
}
