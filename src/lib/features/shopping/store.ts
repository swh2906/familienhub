// Einkaufsliste lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
// `added_by`, `checked_by` und `checked_at` setzt der Server ohnehin selbst; lokal werden sie
// sofort mitgesetzt, damit die Anzeige nicht auf den Abgleich warten muss.
import { repo } from '#lib/db/index.js';
import type { Membership, ShoppingItem } from '#lib/db/types.js';
import { reasonFor, type DemandLine } from '#lib/features/pantry/demand.js';
import { bookPurchase, undoPurchase } from '#lib/features/pantry/journal.js';
import { convertAmount, displayAmount } from '#lib/features/pantry/stock.js';
import { m } from '#lib/paraglide/messages.js';
import { withFormerMembers } from '#lib/ui/members.js';
import { suggestCategory } from './categorize.js';
import type { QuickInput } from './list.js';

/** Alle Artikel des Haushalts (auch gelöschte; die Liste filtert selbst, Vorschläge nutzen alle). */
export function itemsOf(household: string): Promise<ShoppingItem[]> {
	return repo('shopping_items').table.where('household').equals(household).toArray();
}

/** Alle Mitglieder inkl. ehemaliger (für die Zuordnung alter Einträge); diese heißen „Ehemaliges Mitglied“. */
export async function membersOf(household: string): Promise<Membership[]> {
	const list = await repo('memberships').table.where('household').equals(household).toArray();
	return withFormerMembers(list, m.member_former());
}

export async function addItem(
	household: string,
	membership: string,
	input: QuickInput,
	history: readonly ShoppingItem[]
): Promise<ShoppingItem> {
	return repo('shopping_items').create({
		household,
		name: input.name,
		amount: input.amount,
		unit: input.amount ? input.unit : '',
		category: suggestCategory(input.name, history),
		checked: false,
		added_by: membership
	});
}

/**
 * Ausgewählte Zeilen aus dem Essensplan auf die Liste setzen (Schritt 11 C2). Steht dieselbe
 * Zutat schon offen auf der Liste, wird die Menge dort addiert statt doppelt angelegt.
 * Gibt die Anzahl neuer bzw. geänderter Artikel zurück.
 */
export async function addFromPlan(
	household: string,
	membership: string,
	lines: readonly DemandLine[],
	history: readonly ShoppingItem[]
): Promise<number> {
	let count = 0;
	for (const line of lines) {
		const reason = reasonFor(line.meals);
		const existing = line.onList;
		if (existing && !existing.checked && !existing.deleted_at) {
			const before =
				existing.amount > 0 ? convertAmount(existing.amount, existing.unit, line.unit) : 0;
			if (before === null) continue;
			// Gesamtmenge auf ganze Packungen runden (200 g + 400 g → 1 kg bei 500-g-Packungen).
			const sum = before + (line.missing || line.buy.amount);
			const rounded = line.pack > 0 ? Math.ceil(sum / line.pack) * line.pack : sum;
			const total = displayAmount(rounded, line.unit);
			await repo('shopping_items').update(existing.id, {
				amount: total.amount,
				unit: total.amount ? total.unit : '',
				reason,
				ingredient: line.ingredient || existing.ingredient || ''
			});
			count += 1;
			continue;
		}
		const shown = displayAmount(line.buy.amount, line.unit);
		await repo('shopping_items').create({
			household,
			name: line.name,
			amount: shown.amount,
			unit: shown.amount ? shown.unit : '',
			category: line.category || suggestCategory(line.name, history),
			checked: false,
			added_by: membership,
			meal_plan_entry: line.meals[0]?.entry ?? '',
			ingredient: line.ingredient,
			reason
		});
		count += 1;
	}
	return count;
}

/**
 * Gekauften Artikel wieder auf die Liste setzen (Bring: Kachel aus „Zuletzt gekauft“ antippen).
 * Optional mit neuer Menge, z. B. wenn „2 l Milch“ eingetippt und „Milch“ gewählt wurde.
 */
export async function reopenItem(item: ShoppingItem, input?: QuickInput): Promise<void> {
	await repo('shopping_items').update(item.id, {
		checked: false,
		reason: '',
		checked_at: '',
		checked_by: '',
		...(input && input.amount ? { amount: input.amount, unit: input.unit } : {})
	});
}

/** Abhaken oder wieder öffnen. Gehört der Artikel zu einem Basisartikel, wird der Kauf im Vorrat gebucht. */
export async function toggleItem(item: ShoppingItem, membership: string): Promise<void> {
	const checked = !item.checked;
	await repo('shopping_items').update(item.id, {
		checked,
		checked_at: checked ? new Date().toISOString() : '',
		checked_by: checked ? membership : ''
	});
	// Der Vorrat ist Zusatz: ein Fehler dort darf das Abhaken nicht verhindern.
	await (checked ? bookPurchase(item.household, item) : undoPurchase(item.household, item)).catch(
		(error: unknown) => console.error('Vorrat nicht gebucht', error)
	);
}

export interface ItemForm {
	name: string;
	amount: number;
	unit: string;
	category: string;
}

/** Speichert nur geänderte Felder. */
export async function updateItem(item: ShoppingItem, form: ItemForm): Promise<void> {
	const next: ItemForm = {
		name: form.name.trim(),
		amount: form.amount > 0 ? form.amount : 0,
		unit: form.amount > 0 ? form.unit.trim() : '',
		category: form.category
	};
	const changes = Object.fromEntries(
		Object.entries(next).filter(([key, value]) => (item[key as keyof ItemForm] ?? '') !== value)
	);
	await repo('shopping_items').update(item.id, changes);
}

export async function removeItems(items: readonly ShoppingItem[]): Promise<void> {
	for (const item of items) await repo('shopping_items').remove(item.id);
}

/** Rückgängig nach „Erledigte leeren“ oder Löschen. */
export async function restoreItems(ids: readonly string[]): Promise<void> {
	for (const id of ids) await repo('shopping_items').update(id, { deleted_at: '' });
}
