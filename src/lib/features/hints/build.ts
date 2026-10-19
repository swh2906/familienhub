// Alle Hinweise für Heute an einer Stelle (Schritt 11 D2) – reine Logik.
// Konflikte und „Gekocht?“ nur für Personen, die den Essensplan bearbeiten dürfen;
// Vorratsfragen für alle.
import type {
	Ingredient,
	MealPlanEntry,
	PantryEvent,
	Recipe,
	RecipeIngredient
} from '#lib/db/types.js';
import type { Occurrence } from '#lib/features/calendar/expand.js';
import { stockMap } from '#lib/features/pantry/journal.js';
import {
	neededSoon,
	pendingCooked,
	stockQuestions,
	type StockQuestion
} from '#lib/features/pantry/questions.js';
import {
	cookingConflicts,
	prepareDay,
	quickerRecipes,
	swapCandidates,
	type CookingConflict
} from './cooking.js';
import { KIND_PRIORITY, type HintBase } from './engine.js';

export interface ConflictHint extends HintBase {
	kind: 'conflict';
	conflict: CookingConflict;
	swaps: MealPlanEntry[];
	quicker: Recipe[];
	prepareOn: string | null;
}

export interface CookedHint extends HintBase {
	kind: 'cooked';
	entry: MealPlanEntry;
}

export interface StockHint extends HintBase {
	kind: 'stock';
	question: StockQuestion;
}

export type Hint = ConflictHint | CookedHint | StockHint;

export interface HintInput {
	today: string;
	nowMinutes?: number;
	now?: Date;
	canEdit: boolean;
	entries: readonly MealPlanEntry[];
	recipes: readonly Recipe[];
	rows: readonly RecipeIngredient[];
	ingredients: readonly Ingredient[];
	pantryEvents: readonly PantryEvent[];
	occurrences: readonly Occurrence[];
	adults: readonly string[];
}

export function buildHints(input: HintInput): Hint[] {
	const hints: Hint[] = [];

	if (input.canEdit) {
		const conflicts = cookingConflicts({
			today: input.today,
			entries: input.entries,
			recipes: input.recipes,
			occurrences: input.occurrences,
			adults: input.adults,
			nowMinutes: input.nowMinutes
		});
		for (const conflict of conflicts) {
			hints.push({
				key: `conflict:${conflict.entry.id}`,
				kind: 'conflict',
				priority: KIND_PRIORITY.conflict,
				date: conflict.entry.date,
				conflict,
				swaps: swapCandidates(conflict, input.entries, conflicts, input.today),
				quicker: quickerRecipes(conflict, input.recipes),
				prepareOn: prepareDay(conflict, input.today)
			});
		}
		for (const entry of pendingCooked(input.entries, input.today)) {
			hints.push({
				key: `cooked:${entry.id}`,
				kind: 'cooked',
				priority: KIND_PRIORITY.cooked,
				date: entry.date,
				entry
			});
		}
	}

	// Vorratsfragen: alle unsicheren, bald gebrauchten (die Steuerung begrenzt die Anzeige).
	const stocks = stockMap(input.ingredients, input.pantryEvents, input.now);
	const needed = neededSoon(input.entries, input.rows, input.today);
	for (const question of stockQuestions(input.ingredients, stocks, needed, new Set(), 10)) {
		hints.push({
			key: `stock:${question.ingredient.id}`,
			kind: 'stock',
			priority: KIND_PRIORITY.stock,
			date: question.date,
			question
		});
	}
	return hints;
}
