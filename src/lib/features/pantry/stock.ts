// Bestand aus dem Buchungsjournal berechnen (Schritt 11 B1) – reine Logik ohne Datenbank.
// Jede Änderung ist eine eigene Buchung (Kauf +, Verbrauch −, Bestand =, „noch da“); so gehen
// gleichzeitige oder offline gemachte Änderungen nicht verloren. Unsicherheit wird mitgerechnet:
// Verbrauch aus Rezepten ist eine Schätzung, und je länger niemand nachgesehen hat, desto unsicherer.

export type PantryKind = 'purchase' | 'consume' | 'set' | 'present' | 'undo';

export interface PantryEntry {
	id: string;
	kind: PantryKind;
	amount: number;
	unit: string;
	/** Zeitpunkt der Buchung (ISO). */
	at: string;
	/** Bei 'undo': die stornierte Buchung. */
	ref?: string;
	deleted_at?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'none';
export type StockStatus = 'unknown' | 'empty' | 'low' | 'ok';

export interface Stock {
	/** Menge in `unit`; null = unbekannt. */
	amount: number | null;
	unit: string;
	/** Laut letzter Auskunft vorhanden, Menge aber unbekannt. */
	present: boolean;
	status: StockStatus;
	confidence: Confidence;
	/** Typischer Verbrauch pro Woche (letzte 8 Wochen), in `unit`. */
	weekly: number;
	/** Letzte Buchung (ISO) oder leer. */
	lastAt: string;
}

const DAY = 86_400_000;

/** Einheiten, die sich ineinander umrechnen lassen (Faktor zur Grundeinheit). */
const DIMENSIONS: Record<string, { base: string; factor: number }> = {
	g: { base: 'g', factor: 1 },
	kg: { base: 'g', factor: 1000 },
	ml: { base: 'ml', factor: 1 },
	l: { base: 'ml', factor: 1000 },
	EL: { base: 'ml', factor: 15 },
	TL: { base: 'ml', factor: 5 },
	'': { base: 'Stück', factor: 1 },
	Stück: { base: 'Stück', factor: 1 }
};

/**
 * Rechnet eine Menge in die Zieleinheit um („1 kg“ → 1000 g, „2 EL“ → 30 ml, „1 Packung“ →
 * Packungsgröße). Gibt null zurück, wenn das nicht geht (z. B. „1 Bund“ in Gramm).
 */
export function convertAmount(amount: number, from: string, to: string, pack = 0): number | null {
	if (!Number.isFinite(amount)) return null;
	if (from === to) return amount;
	if (from === 'Packung' && pack > 0) return amount * pack;
	const a = DIMENSIONS[from];
	const b = DIMENSIONS[to];
	if (a && b && a.base === b.base) return (amount * a.factor) / b.factor;
	return null;
}

/** Wirksame Buchungen: ohne gelöschte und stornierte, in zeitlicher Reihenfolge. */
function effective(entries: readonly PantryEntry[]): PantryEntry[] {
	const live = entries.filter((e) => !e.deleted_at);
	const undone = new Set(live.filter((e) => e.kind === 'undo' && e.ref).map((e) => e.ref));
	return live
		.filter((e) => e.kind !== 'undo' && !undone.has(e.id))
		.sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}

export interface StockOptions {
	/** Standardeinheit des Basisartikels (leer = aus den Buchungen). */
	unit?: string;
	/** Übliche Packungsgröße in `unit` (0 = unbekannt). */
	pack?: number;
	now?: Date;
}

/** Bestand eines Basisartikels aus seinen Buchungen. */
export function computeStock(entries: readonly PantryEntry[], options: StockOptions = {}): Stock {
	const list = effective(entries);
	const now = (options.now ?? new Date()).getTime();
	const pack = options.pack ?? 0;
	const unit = options.unit || list.find((e) => e.unit)?.unit || '';
	const convert = (e: PantryEntry) => convertAmount(e.amount, e.unit, unit, pack);

	let amount: number | null = null;
	let present = false;
	let checkedAt = 0;
	let estimated = false;
	let weeklyTotal = 0;

	for (const e of list) {
		const value = convert(e);
		const time = Date.parse(e.at);
		switch (e.kind) {
			case 'set':
				amount = value;
				present = (value ?? 0) > 0;
				checkedAt = time;
				estimated = value === null;
				break;
			case 'present':
				present = true;
				if (amount !== null && amount <= 0) amount = null;
				checkedAt = time;
				estimated = amount !== null;
				break;
			case 'purchase':
				present = true;
				if (value === null) estimated = true;
				else amount = (amount ?? 0) + value;
				if (!checkedAt) checkedAt = time;
				break;
			case 'consume':
				if (value !== null && now - time <= 56 * DAY) weeklyTotal += value;
				if (amount !== null && value !== null) amount = Math.max(0, amount - value);
				estimated = true;
				break;
		}
	}

	const weekly = Math.round((weeklyTotal / 8) * 100) / 100;
	const lastAt = list.at(-1)?.at ?? '';

	let confidence: Confidence = 'none';
	if (list.length > 0) {
		const age = checkedAt ? (now - checkedAt) / DAY : Infinity;
		if (age <= 14 && !estimated) confidence = 'high';
		else if (age <= 45) confidence = 'medium';
		else confidence = 'low';
		// „Noch da“ ohne Menge ist nie ganz sicher.
		if (amount === null && confidence === 'high') confidence = 'medium';
	}

	let status: StockStatus;
	if (amount === null) status = present ? 'ok' : 'unknown';
	else if (amount <= 0) status = 'empty';
	else {
		const threshold = Math.max(weekly, pack > 0 ? pack * 0.25 : 0);
		status = threshold > 0 && amount < threshold ? 'low' : 'ok';
	}
	if (list.length === 0) status = 'unknown';

	return { amount, unit, present, status, confidence, weekly, lastAt };
}

/** Lohnt sich eine Rückfrage? (Bestand unbekannt oder unsicher.) */
export function isUncertain(stock: Stock): boolean {
	return stock.status === 'unknown' || stock.confidence === 'low' || stock.confidence === 'none';
}

export type StockAnswer = 'have' | 'empty' | 'half';

/**
 * Buchung zu einer Antwort im Vorrat: „Ja, habe ich noch“, „Nein, ist alle“, „Ungefähr die
 * Hälfte“ (der bekannten Menge bzw. einer Packung; sonst nur „noch da“).
 */
export function answerEntry(
	answer: StockAnswer,
	stock: Stock,
	pack = 0
): Pick<PantryEntry, 'kind' | 'amount' | 'unit'> {
	switch (answer) {
		case 'empty':
			return { kind: 'set', amount: 0, unit: stock.unit };
		case 'have':
			return { kind: 'present', amount: 0, unit: stock.unit };
		case 'half': {
			const base = stock.amount && stock.amount > 0 ? stock.amount : pack;
			return base > 0
				? { kind: 'set', amount: Math.round((base / 2) * 100) / 100, unit: stock.unit }
				: { kind: 'present', amount: 0, unit: stock.unit };
		}
	}
}

/** Menge für die Anzeige in handlicher Einheit: 1500 g → 1,5 kg, 2000 ml → 2 l. */
export function displayAmount(amount: number, unit: string): { amount: number; unit: string } {
	const round = (n: number) => Math.round(n * 100) / 100;
	if (unit === 'g' && amount >= 1000) return { amount: round(amount / 1000), unit: 'kg' };
	if (unit === 'ml' && amount >= 1000) return { amount: round(amount / 1000), unit: 'l' };
	return { amount: round(amount), unit };
}
