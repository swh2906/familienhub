// Hinweis-Steuerung (Schritt 11 D2) – reine Logik.
// Grundsatz: höchstens ein aktiver Hinweis, der Rest gebündelt. Jede Person kann antworten:
// „Später“ (3 Stunden), „Nicht heute“ (bis Mitternacht), „Nie wieder so“ (diese Art Hinweis nie
// mehr) – oder den Hinweis erledigen. Antworten gelten je Person auf allen Geräten.
import type { HintResponse } from '#lib/db/types.js';

export type HintKind = 'conflict' | 'cooked' | 'stock' | 'shopping';

export interface HintBase {
	/** Eindeutig je Gegenstand, z. B. „conflict:<Planeintrag>“. */
	key: string;
	kind: HintKind;
	/** Kleiner = wichtiger. */
	priority: number;
	/** Betroffener Tag (JJJJ-MM-TT) für die Reihenfolge. */
	date: string;
}

/** Wichtigkeit je Art: Konflikte vor Einkauf vor Vorratsfragen vor „Gekocht?“. */
export const KIND_PRIORITY: Record<HintKind, number> = {
	conflict: 0,
	shopping: 1,
	stock: 2,
	cooked: 3
};

export type HintAnswer = HintResponse['response'];

/** Schlüssel für „Nie wieder so“ einer Art. */
export function kindKey(kind: HintKind): string {
	return `kind:${kind}`;
}

/** Bis wann eine Antwort den Hinweis ausblendet (ISO; leer = dauerhaft). */
export function responseUntil(answer: HintAnswer, now: Date): string {
	if (answer === 'later') return new Date(now.getTime() + 3 * 3_600_000).toISOString();
	if (answer === 'not_today') {
		const midnight = new Date(now);
		midnight.setHours(24, 0, 0, 0);
		return midnight.toISOString();
	}
	return '';
}

function hides(response: HintResponse, now: Date): boolean {
	if (response.deleted_at) return false;
	if (response.response === 'done' || response.response === 'never') return true;
	return !!response.until && Date.parse(response.until) > now.getTime();
}

/** Sichtbare Hinweise einer Person, wichtigste zuerst. */
export function visibleHints<T extends HintBase>(
	hints: readonly T[],
	responses: readonly HintResponse[],
	now: Date
): T[] {
	const active = new Set(responses.filter((r) => hides(r, now)).map((r) => r.key));
	return hints
		.filter((h) => !active.has(h.key) && !active.has(kindKey(h.kind)))
		.sort(
			(a, b) =>
				a.priority - b.priority || a.date.localeCompare(b.date) || a.key.localeCompare(b.key)
		);
}

/** Aufteilung für Heute: ein aktiver Hinweis, der Rest gebündelt. */
export function splitHints<T>(hints: readonly T[]): { active: T | null; more: T[] } {
	return { active: hints[0] ?? null, more: hints.slice(1) };
}
