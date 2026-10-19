// Was fehlt für den Essensplan? (Schritt 11 C1) – reine Logik.
// Geplante Homi-Rezepte der nächsten Tage → Mengen auf die Portionen umrechnen, je Zutat und
// Einheit summieren, mit Vorrat und offenen Einkaufsartikeln vergleichen. Nichts wird still
// entschieden: Unsicheres heißt „bitte prüfen“, Optionales wird nur angeboten.
import type {
	Ingredient,
	MealPlanEntry,
	Recipe,
	RecipeIngredient,
	ShoppingItem
} from '#lib/db/types.js';
import { addDaysTo } from '#lib/features/calendar/expand.js';
import { scaleAmount } from '#lib/features/meals/amounts.js';
import { normalize } from '#lib/features/meals/recipes.js';
import { formatShortWeekday } from '#lib/features/meals/week.js';
import { m } from '#lib/paraglide/messages.js';
import { matchIngredient } from './catalog.js';
import { convertAmount, isUncertain, type Stock } from './stock.js';

export type DemandStatus = 'missing' | 'check' | 'optional' | 'covered';

export interface DemandMeal {
	entry: string;
	title: string;
	date: string;
}

export interface DemandLine {
	key: string;
	/** Basisartikel (leer, wenn die Zeile keinem zugeordnet ist). */
	ingredient: string;
	name: string;
	category: string;
	unit: string;
	/** Benötigte Menge in `unit`; 0 = „etwas“ (nach Geschmack, ohne Menge). */
	needed: number;
	/** Fehlende Menge in `unit` (0, wenn gedeckt oder unbekannt). */
	missing: number;
	/** Vorschlag zum Kaufen (auf Packungen gerundet, falls bekannt). */
	buy: { amount: number; unit: string; packs: number };
	/** Packungsgröße in `unit` (0 = unbekannt). */
	pack: number;
	status: DemandStatus;
	/** Warum „bitte prüfen“ bzw. „gedeckt“. */
	because: 'unknown_stock' | 'uncertain_stock' | 'in_stock' | 'on_list' | 'no_amount' | '';
	meals: DemandMeal[];
	stock: Stock | null;
	/** Offener Einkaufsartikel derselben Zutat (zum Zusammenführen). */
	onList: ShoppingItem | null;
}

export interface DemandInput {
	today: string;
	days?: number;
	entries: readonly MealPlanEntry[];
	recipes: readonly Recipe[];
	rows: readonly RecipeIngredient[];
	ingredients: readonly Ingredient[];
	stocks: ReadonlyMap<string, Stock>;
	openItems: readonly ShoppingItem[];
}

interface Group {
	key: string;
	ingredient: Ingredient | null;
	name: string;
	category: string;
	unit: string;
	needed: number;
	optionalNeeded: number;
	required: boolean;
	someWithoutAmount: boolean;
	meals: DemandMeal[];
}

const STATUS_ORDER: Record<DemandStatus, number> = {
	missing: 0,
	check: 1,
	optional: 2,
	covered: 3
};
const round = (n: number) => Math.round(n * 100) / 100;

/** Bedarf der nächsten `days` Tage (ab heute, ohne Gekochtes), sortiert: Fehlendes zuerst. */
export function computeDemand(input: DemandInput): DemandLine[] {
	const { today, days = 7 } = input;
	const until = addDaysTo(today, days - 1);
	const recipes = new Map(input.recipes.filter((r) => !r.deleted_at).map((r) => [r.id, r]));
	const ingredients = new Map(input.ingredients.map((i) => [i.id, i]));
	const rowsByRecipe = new Map<string, RecipeIngredient[]>();
	for (const row of input.rows) {
		if (row.deleted_at || !row.name.trim()) continue;
		const list = rowsByRecipe.get(row.recipe) ?? [];
		list.push(row);
		rowsByRecipe.set(row.recipe, list);
	}

	const groups = new Map<string, Group>();
	for (const entry of input.entries) {
		if (entry.deleted_at || entry.cooked === 'yes' || !entry.recipe) continue;
		if (entry.date < today || entry.date > until) continue;
		const recipe = recipes.get(entry.recipe);
		if (!recipe) continue;
		const base = Math.max(1, recipe.servings || 1);
		const servings = entry.servings > 0 ? entry.servings : base;
		const meal = { entry: entry.id, title: entry.title || recipe.title, date: entry.date };

		for (const row of rowsByRecipe.get(recipe.id) ?? []) {
			const ingredient = (row.ingredient && ingredients.get(row.ingredient)) || null;
			const amount = row.amount > 0 ? scaleAmount(row.amount, base, servings) : 0;
			// In die Einheit des Basisartikels umrechnen, wenn möglich (300 g + 1 kg → 1300 g).
			const target = ingredient?.unit || row.unit;
			const converted =
				amount > 0 ? convertAmount(amount, row.unit, target, ingredient?.pack_amount) : 0;
			const unit = converted === null ? row.unit : target;
			const value = converted ?? amount;
			const id = ingredient ? ingredient.id : `name:${normalize(row.name)}`;
			const key = `${id}|${unit}`;
			const group = groups.get(key) ?? {
				key,
				ingredient,
				name: ingredient?.name ?? row.name.trim(),
				category: ingredient?.category || row.category || '',
				unit,
				needed: 0,
				optionalNeeded: 0,
				required: false,
				someWithoutAmount: false,
				meals: []
			};
			if (row.optional) group.optionalNeeded += value;
			else {
				group.required = true;
				group.needed += value;
			}
			if (!value) group.someWithoutAmount = true;
			if (!group.meals.some((m) => m.entry === meal.entry)) group.meals.push(meal);
			groups.set(key, group);
		}
	}

	const known = input.ingredients.map((i) => ({
		id: i.id,
		name: i.name,
		aliases: i.aliases ?? []
	}));
	const open = input.openItems.filter((i) => !i.deleted_at && !i.checked);
	const onListFor = (group: Group): ShoppingItem | null => {
		if (group.ingredient) {
			const id = group.ingredient.id;
			const linked = open.find((i) => i.ingredient === id);
			if (linked) return linked;
			const byName = open.find((i) => {
				const match = matchIngredient(i.name, known);
				return (
					match.source === 'known' && match.known && 'id' in match.known && match.known.id === id
				);
			});
			if (byName) return byName;
		}
		return open.find((i) => normalize(i.name) === normalize(group.name)) ?? null;
	};

	const lines: DemandLine[] = [];
	for (const group of groups.values()) {
		const optional = !group.required;
		const needed = round(optional ? group.optionalNeeded : group.needed);
		const ingredient = group.ingredient;
		const stock = ingredient ? (input.stocks.get(ingredient.id) ?? null) : null;
		// Vorrat zählt nur, wenn er in derselben Einheit geführt wird.
		const stockUsable = !!stock && stock.unit === group.unit;
		const onList = onListFor(group);
		const listAmount = onList
			? onList.amount > 0
				? convertAmount(onList.amount, onList.unit, group.unit, ingredient?.pack_amount)
				: null
			: 0;

		let status: DemandStatus;
		let because: DemandLine['because'] = '';
		let missing = 0;

		if (onList && listAmount === null) {
			// Steht ohne (vergleichbare) Menge auf der Liste: gilt als eingeplant.
			status = 'covered';
			because = 'on_list';
		} else if (needed === 0) {
			if (stock?.status === 'empty') status = 'missing';
			else if (!stock || stock.status === 'unknown' || isUncertain(stock)) {
				status = 'check';
				because = stock && stock.status !== 'unknown' ? 'uncertain_stock' : 'unknown_stock';
			} else {
				status = 'covered';
				because = 'in_stock';
			}
			if (status !== 'covered') because = because || 'no_amount';
		} else {
			// Vorrat nur, wenn in derselben Einheit geführt und nicht völlig unbekannt.
			const known = stockUsable && stock.status !== 'unknown' ? stock : null;
			const available = (known?.amount ?? 0) + (listAmount ?? 0);
			missing = round(Math.max(0, needed - available));
			if (missing <= 0) {
				status = 'covered';
				because = (listAmount ?? 0) >= needed ? 'on_list' : 'in_stock';
				if (because === 'in_stock' && known && isUncertain(known)) {
					status = 'check';
					because = 'uncertain_stock';
				}
			} else if (!known) {
				status = 'check';
				because = 'unknown_stock';
			} else if (known.amount === null) {
				// „Noch da“, aber wie viel? Lieber nachsehen als doppelt kaufen.
				status = 'check';
				because = 'uncertain_stock';
			} else {
				status = 'missing';
				if (isUncertain(known)) because = 'uncertain_stock';
			}
		}
		if (optional && status !== 'covered') status = 'optional';

		lines.push({
			key: group.key,
			ingredient: ingredient?.id ?? '',
			name: group.name,
			category: group.category,
			unit: group.unit,
			needed,
			missing,
			buy: buyFor(missing || (status === 'covered' ? 0 : needed), group.unit, ingredient),
			pack: ingredient && ingredient.unit === group.unit ? ingredient.pack_amount : 0,
			status,
			because,
			meals: [...group.meals].sort((a, b) => a.date.localeCompare(b.date)),
			stock,
			onList
		});
	}

	return lines.sort((a, b) =>
		a.status === b.status
			? a.name.localeCompare(b.name, 'de')
			: STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
	);
}

/** Kaufvorschlag: auf ganze Packungen aufrunden, wenn die Packungsgröße bekannt ist. */
export function buyFor(
	amount: number,
	unit: string,
	ingredient: Pick<Ingredient, 'unit' | 'pack_amount'> | null
): DemandLine['buy'] {
	if (amount <= 0) return { amount: 0, unit, packs: 0 };
	const pack =
		ingredient && ingredient.pack_amount > 0 && ingredient.unit === unit
			? ingredient.pack_amount
			: 0;
	if (!pack) return { amount: round(amount), unit, packs: 0 };
	const packs = Math.ceil(round(amount / pack));
	return { amount: packs * pack, unit, packs };
}

/** Begründung für die Einkaufsliste: „Für Reispfanne (Mo.), Kuchen (Mi.)“ – höchstens drei Gerichte. */
export function reasonFor(meals: readonly DemandMeal[]): string {
	if (meals.length === 0) return '';
	const shown = meals
		.slice(0, 3)
		.map((meal) => `${meal.title} (${formatShortWeekday(meal.date)})`)
		.join(', ');
	return m.shopping_reason_meals({ meals: meals.length > 3 ? `${shown} …` : shown });
}
