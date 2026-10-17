// Konflikte, Spalten-Layout der Zeitachse und Personen-Filter – reine Funktionen.
import type { Occurrence } from './expand.js';

function overlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
	return a.start < b.end && b.start < a.end;
}

function shareParticipant(a: Occurrence, b: Occurrence): boolean {
	const others = new Set(b.event.participants ?? []);
	return (a.event.participants ?? []).some((p) => others.has(p));
}

/**
 * Schlüssel aller Vorkommen, die sich mit einem anderen Termin derselben Person überschneiden.
 * Ganztägige Termine und Termine ohne Teilnehmer zählen nicht als Konflikt.
 */
export function findConflicts(occurrences: readonly Occurrence[]): Set<string> {
	const timed = occurrences.filter((o) => !o.allDay && (o.event.participants ?? []).length > 0);
	const keys = new Set<string>();
	for (let i = 0; i < timed.length; i++) {
		for (let j = i + 1; j < timed.length; j++) {
			if (overlap(timed[i], timed[j]) && shareParticipant(timed[i], timed[j])) {
				keys.add(timed[i].key);
				keys.add(timed[j].key);
			}
		}
	}
	return keys;
}

/** Für den Editor: Termine, mit denen ein geplanter Termin kollidieren würde. */
export function conflictsWith(
	candidate: {
		start: number;
		end: number;
		participants: string[];
		allDay: boolean;
		ignore?: string;
	},
	occurrences: readonly Occurrence[]
): Occurrence[] {
	if (candidate.allDay || candidate.participants.length === 0) return [];
	const people = new Set(candidate.participants);
	return occurrences.filter(
		(o) =>
			!o.allDay &&
			o.event.id !== candidate.ignore &&
			overlap(candidate, o) &&
			(o.event.participants ?? []).some((p) => people.has(p))
	);
}

export interface Placed {
	occurrence: Occurrence;
	/** Spalte innerhalb einer Gruppe überlappender Termine (0 …) und Anzahl der Spalten. */
	column: number;
	columns: number;
}

/** Überlappende Termine nebeneinander anordnen (Gruppen, die sich zeitlich berühren). */
export function layoutColumns(occurrences: readonly Occurrence[]): Placed[] {
	const sorted = [...occurrences].sort((a, b) => a.start - b.start || b.end - a.end);
	const placed: Placed[] = [];
	let group: Placed[] = [];
	let groupEnd = -Infinity;
	let columnEnds: number[] = [];

	const flush = () => {
		const columns = columnEnds.length;
		for (const p of group) p.columns = columns;
		placed.push(...group);
		group = [];
		columnEnds = [];
	};

	for (const occurrence of sorted) {
		if (occurrence.start >= groupEnd) {
			flush();
			groupEnd = -Infinity;
		}
		let column = columnEnds.findIndex((end) => end <= occurrence.start);
		if (column === -1) {
			column = columnEnds.length;
			columnEnds.push(occurrence.end);
		} else {
			columnEnds[column] = occurrence.end;
		}
		group.push({ occurrence, column, columns: 0 });
		groupEnd = Math.max(groupEnd, occurrence.end);
	}
	flush();
	return placed;
}

/** Personen-Filter: ohne Auswahl alles; sonst Termine dieser Personen und Familien-Termine. */
export function matchesFilter(occurrence: Occurrence, selected: ReadonlySet<string>): boolean {
	const participants = occurrence.event.participants ?? [];
	return (
		selected.size === 0 || participants.length === 0 || participants.some((p) => selected.has(p))
	);
}
