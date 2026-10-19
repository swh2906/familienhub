// Buchungen im Vorrat (Schritt 11 B2) – nur über die lokale Datenbank; der Sync erledigt den Rest.
// Einkauf abgehakt → Kauf; „Ja, gekocht“ → Verbrauch der Rezeptzutaten; Antworten im Vorrat →
// Bestand bzw. „noch da“. Wieder geöffnet oder „doch nicht gekocht“ → Storno (neue Buchung).
import { repo } from '#lib/db/index.js';
import type { Ingredient, MealPlanEntry, PantryEvent, ShoppingItem } from '#lib/db/types.js';
import { addDaysTo } from '#lib/features/calendar/expand.js';
import { scaleAmount } from '#lib/features/meals/amounts.js';
import { entriesBetween } from '#lib/features/meals/plan-store.js';
import type { DemandInput } from './demand.js';
import { ingredientId, matchIngredient } from './catalog.js';
import { computeStock, answerEntry, type Stock, type StockAnswer } from './stock.js';
import { baseIngredientsOf } from './store.js';

export function eventsOf(household: string): Promise<PantryEvent[]> {
	return repo('pantry_events').table.where('household').equals(household).toArray();
}

/** Bestand je Basisartikel (ID → Bestand). */
export function stockMap(
	ingredients: readonly Ingredient[],
	events: readonly PantryEvent[],
	now = new Date()
): Map<string, Stock> {
	const byIngredient = new Map<string, PantryEvent[]>();
	for (const event of events) {
		const list = byIngredient.get(event.ingredient) ?? [];
		list.push(event);
		byIngredient.set(event.ingredient, list);
	}
	const result = new Map<string, Stock>();
	for (const item of ingredients) {
		result.set(
			item.id,
			computeStock(byIngredient.get(item.id) ?? [], {
				unit: item.unit,
				pack: item.pack_amount,
				now
			})
		);
	}
	return result;
}

/** Basisartikel zu einem Einkaufsartikel – nur bekannte Artikel der Familie, nichts wird angelegt. */
function knownIngredient(name: string, list: readonly Ingredient[]): Ingredient | undefined {
	const match = matchIngredient(
		name,
		list.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [] }))
	);
	if (match.source !== 'known' || !match.known || !('id' in match.known)) return undefined;
	const id = match.known.id;
	return list.find((i) => i.id === id);
}

async function book(
	data: Pick<PantryEvent, 'household' | 'ingredient' | 'kind' | 'amount' | 'unit' | 'source'> &
		Partial<Pick<PantryEvent, 'ref'>>,
	id?: string
): Promise<void> {
	if (id && (await repo('pantry_events').get(id))) return;
	await repo('pantry_events').create({
		...(id ? { id } : {}),
		ref: '',
		...data,
		amount: Math.max(0, data.amount),
		at: new Date().toISOString()
	});
}

/** Noch nicht stornierte Buchungen einer Herkunft. */
async function openBookings(household: string, source: string): Promise<PantryEvent[]> {
	const events = await repo('pantry_events').table.where('source').equals(source).toArray();
	const mine = events.filter((e) => e.household === household && !e.deleted_at);
	const undone = new Set(mine.filter((e) => e.kind === 'undo').map((e) => e.ref));
	return mine.filter((e) => e.kind !== 'undo' && !undone.has(e.id));
}

async function undoAll(household: string, source: string): Promise<void> {
	for (const event of await openBookings(household, source)) {
		await book(
			{
				household,
				ingredient: event.ingredient,
				kind: 'undo',
				amount: 0,
				unit: '',
				source,
				ref: event.id
			},
			ingredientId(household, `undo:${event.id}`)
		);
	}
}

/** Einkauf abgehakt: Kauf buchen (ohne Menge eine Packung bzw. „irgendeine Menge“). */
export async function bookPurchase(household: string, item: ShoppingItem): Promise<void> {
	const list = await baseIngredientsOf(household);
	const ingredient =
		(item.ingredient && list.find((i) => i.id === item.ingredient)) ||
		knownIngredient(item.name, list);
	if (!ingredient) return;
	const source = `shopping:${item.id}`;
	if ((await openBookings(household, source)).length > 0) return;
	// Ohne Menge: eine Packung (ist die Packungsgröße unbekannt, gilt nur „ist da“).
	const amount = item.amount > 0 ? item.amount : 1;
	const unit = item.amount > 0 ? item.unit : 'Packung';
	await book({ household, ingredient: ingredient.id, kind: 'purchase', amount, unit, source });
}

/** Einkauf wieder geöffnet: Kauf stornieren. */
export function undoPurchase(household: string, item: ShoppingItem): Promise<void> {
	return undoAll(household, `shopping:${item.id}`);
}

/**
 * Antwort auf „Habt ihr … gekocht?“. Bei „Ja“ wird der Verbrauch der Rezeptzutaten gebucht
 * (auf die geplanten Portionen umgerechnet; optionale Zutaten und solche ohne Menge zählen nicht).
 * Feste IDs je Planeintrag und Zutat, damit zwei Geräte nicht doppelt buchen.
 */
export async function answerCooked(
	household: string,
	entry: MealPlanEntry,
	cooked: 'yes' | 'no'
): Promise<void> {
	await repo('meal_plan_entries').update(entry.id, { cooked });
	const source = `meal:${entry.id}`;
	if (cooked === 'no' || !entry.recipe) {
		await undoAll(household, source);
		return;
	}
	const recipe = await repo('recipes').get(entry.recipe);
	if (!recipe || recipe.deleted_at) return;
	const rows = (
		await repo('recipe_ingredients').table.where('recipe').equals(recipe.id).toArray()
	).filter((row) => !row.deleted_at && row.ingredient && !row.optional && row.amount > 0);
	const base = Math.max(1, recipe.servings || 1);
	const servings = entry.servings > 0 ? entry.servings : base;
	const all = (await repo('pantry_events').table.where('source').equals(source).toArray()).filter(
		(e) => e.household === household && !e.deleted_at
	);
	const undone = new Set(all.filter((e) => e.kind === 'undo').map((e) => e.ref));

	// Gleiche Zutat mehrfach im Rezept (Teig und Streusel): je Zutat und Einheit zusammenfassen.
	const needs = new Map<string, { ingredient: string; unit: string; amount: number }>();
	for (const row of rows) {
		const ingredient = row.ingredient ?? '';
		const key = `${ingredient}|${row.unit}`;
		const need = needs.get(key) ?? { ingredient, unit: row.unit, amount: 0 };
		need.amount += scaleAmount(row.amount, base, servings);
		needs.set(key, need);
	}
	for (const [key, need] of needs) {
		const consumed = all.filter(
			(e) => e.kind === 'consume' && e.ingredient === need.ingredient && e.unit === need.unit
		);
		if (consumed.some((e) => !undone.has(e.id))) continue;
		// Runde = Anzahl stornierter Buchungen: „Ja → Nein → Ja“ bucht neu, zwei Geräte gleich.
		await book(
			{ household, kind: 'consume', source, ...need, amount: Math.round(need.amount * 100) / 100 },
			ingredientId(household, `cook:${entry.id}:${key}:${consumed.length}`)
		);
	}
}

/** Antwort im Vorrat: „Ja, habe ich noch“, „Nein, ist alle“, „Ungefähr die Hälfte“. */
export async function answerStock(
	household: string,
	ingredient: Ingredient,
	stock: Stock,
	answer: StockAnswer
): Promise<void> {
	const entry = answerEntry(answer, stock, ingredient.pack_amount);
	await book({
		household,
		ingredient: ingredient.id,
		...entry,
		unit: entry.unit || ingredient.unit,
		source: 'manual'
	});
}

/** Alles, was die Bedarfsrechnung braucht (Essensplan ab heute, Rezepte, Vorrat, offene Liste). */
export async function loadDemandInput(
	household: string,
	today: string,
	days = 7
): Promise<DemandInput> {
	const entries = await entriesBetween(household, today, addDaysTo(today, days - 1));
	const ids = [...new Set(entries.map((e) => e.recipe).filter(Boolean))];
	const recipes = ids.length ? await repo('recipes').table.where('id').anyOf(ids).toArray() : [];
	const rows = ids.length
		? await repo('recipe_ingredients').table.where('recipe').anyOf(ids).toArray()
		: [];
	const ingredients = await baseIngredientsOf(household);
	const openItems = (
		await repo('shopping_items').table.where('household').equals(household).toArray()
	).filter((i) => !i.deleted_at && !i.checked);
	return {
		today,
		days,
		entries,
		recipes,
		rows,
		ingredients,
		stocks: stockMap(ingredients, await eventsOf(household)),
		openItems
	};
}
