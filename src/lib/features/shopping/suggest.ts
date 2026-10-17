// „Zuletzt gekauft“ und Vorschläge beim Hinzufügen (wie bei Bring: Kachel antippen = auf die Liste).
import type { ShoppingItem } from '#lib/db/types.js';
import { normalize } from '#lib/features/meals/recipes.js';

/** Häufige Artikel für Vorschläge, solange es noch wenig eigene Einkäufe gibt. */
export const COMMON_ITEMS = [
	'Äpfel',
	'Bananen',
	'Zitronen',
	'Tomaten',
	'Gurke',
	'Paprika',
	'Zucchini',
	'Karotten',
	'Kartoffeln',
	'Zwiebeln',
	'Knoblauch',
	'Salat',
	'Brokkoli',
	'Champignons',
	'Avocado',
	'Brot',
	'Brötchen',
	'Toast',
	'Milch',
	'Hafermilch',
	'Butter',
	'Käse',
	'Mozzarella',
	'Joghurt',
	'Quark',
	'Sahne',
	'Eier',
	'Hackfleisch',
	'Hähnchen',
	'Lachs',
	'Wurst',
	'Nudeln',
	'Reis',
	'Mehl',
	'Zucker',
	'Haferflocken',
	'Müsli',
	'Passierte Tomaten',
	'Kichererbsen',
	'Olivenöl',
	'Salz',
	'Pfeffer',
	'Honig',
	'Marmelade',
	'Kaffee',
	'Tee',
	'Wasser',
	'Saft',
	'Schokolade',
	'Kekse',
	'Chips',
	'Pizza',
	'Eis',
	'Spülmittel',
	'Waschmittel',
	'Toilettenpapier',
	'Küchenrolle',
	'Müllbeutel',
	'Zahnpasta',
	'Taschentücher'
];

/**
 * Zuletzt gekaufte Artikel: abgehakt, nicht gelöscht, je Name nur der jüngste,
 * neueste zuerst, höchstens `limit`. Namen, die gerade offen auf der Liste stehen, fallen weg.
 */
export function recentItems(items: readonly ShoppingItem[], limit = 24): ShoppingItem[] {
	const open = new Set(
		items.filter((i) => !i.deleted_at && !i.checked).map((i) => normalize(i.name))
	);
	const byName = new Map<string, ShoppingItem>();
	for (const item of items) {
		if (item.deleted_at || !item.checked) continue;
		const key = normalize(item.name);
		if (open.has(key)) continue;
		const current = byName.get(key);
		if (!current || (item.checked_at || '') > (current.checked_at || '')) byName.set(key, item);
	}
	return [...byName.values()]
		.sort((a, b) => (b.checked_at || '').localeCompare(a.checked_at || ''))
		.slice(0, limit);
}

export interface Suggestion {
	name: string;
	/** Vorhandener, abgehakter Artikel, der wieder geöffnet wird (statt einen neuen anzulegen). */
	item?: ShoppingItem;
}

/**
 * Vorschläge zur Eingabe: erst zuletzt gekaufte, dann häufige Artikel; Treffer am Wortanfang
 * zuerst. Bereits offene Artikel werden nicht vorgeschlagen.
 */
export function suggestions(
	query: string,
	items: readonly ShoppingItem[],
	limit = 8
): Suggestion[] {
	const q = normalize(query);
	if (!q) return [];
	const open = new Set(
		items.filter((i) => !i.deleted_at && !i.checked).map((i) => normalize(i.name))
	);
	const seen = new Set<string>();
	const candidates: (Suggestion & { score: number })[] = [];
	const consider = (name: string, item?: ShoppingItem, bonus = 0) => {
		const key = normalize(name);
		if (seen.has(key) || open.has(key) || !key.includes(q)) return;
		seen.add(key);
		const score = (key.startsWith(q) ? 0 : 10) + bonus;
		candidates.push({ name: item?.name ?? name, item, score });
	};
	for (const item of recentItems(items, 200)) consider(item.name, item, 0);
	for (const name of COMMON_ITEMS) consider(name, undefined, 1);
	return candidates
		.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name, 'de'))
		.slice(0, limit)
		.map(({ name, item }) => (item ? { name, item } : { name }));
}
