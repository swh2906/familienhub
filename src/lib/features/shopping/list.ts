// Reine Logik der Einkaufsliste: Schnell-Eingabe lesen, nach Kategorien gruppieren, Mengen anzeigen.
import type { ShoppingItem } from '#lib/db/types.js';
import { formatAmount } from '#lib/features/meals/amounts.js';
import { CATEGORIES } from '#lib/features/meals/catalog.js';
import { parseIngredientLine } from '#lib/features/meals/paste.js';

export const FALLBACK_CATEGORY = 'Sonstiges';

export interface QuickInput {
	name: string;
	amount: number;
	unit: string;
}

/** „2 l Milch“ → Name, Menge, Einheit. Leere Eingabe → null. */
export function parseQuickInput(text: string): QuickInput | null {
	const parsed = parseIngredientLine(text);
	if (!parsed) return null;
	return { name: parsed.name, amount: parsed.amount, unit: parsed.unit };
}

/** „2 l“, „500 g“, „3“ oder '' */
export function formatQuantity(item: Pick<ShoppingItem, 'amount' | 'unit'>): string {
	return [formatAmount(item.amount), item.amount ? item.unit : ''].filter(Boolean).join(' ');
}

export interface CategoryGroup {
	category: string;
	items: ShoppingItem[];
}

export interface GroupedList {
	open: CategoryGroup[];
	done: ShoppingItem[];
}

/** Rang einer Kategorie: Ladenreihenfolge, eigene Kategorien danach, „Sonstiges“ zuletzt. */
function rank(category: string): number {
	if (category === FALLBACK_CATEGORY) return 1000;
	const index = (CATEGORIES as readonly string[]).indexOf(category);
	return index === -1 ? 500 : index;
}

/**
 * Offene Artikel nach Kategorie in Ladenreihenfolge (innerhalb alphabetisch),
 * erledigte separat, zuletzt abgehakte zuerst. Gelöschte fallen weg.
 */
export function groupItems(items: readonly ShoppingItem[]): GroupedList {
	const open = new Map<string, ShoppingItem[]>();
	const done: ShoppingItem[] = [];
	for (const item of items) {
		if (item.deleted_at) continue;
		if (item.checked) {
			done.push(item);
			continue;
		}
		const category = item.category?.trim() || FALLBACK_CATEGORY;
		open.set(category, [...(open.get(category) ?? []), item]);
	}

	const groups = [...open.entries()]
		.map(([category, list]) => ({
			category,
			items: list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
		}))
		.sort(
			(a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category, 'de')
		);

	done.sort((a, b) => (b.checked_at || '').localeCompare(a.checked_at || ''));
	return { open: groups, done };
}
