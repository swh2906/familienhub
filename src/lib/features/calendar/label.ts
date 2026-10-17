// Texte für Termine: Zeitspanne und vorlesbare Beschriftung.
import type { Membership } from '#lib/db/types.js';
import { m } from '#lib/paraglide/messages.js';
import type { Occurrence } from './expand.js';

export function timeRange(o: Occurrence): string {
	return o.allDay ? m.cal_all_day() : `${o.startTime}–${o.endTime}`;
}

/**
 * Vorlesbare Beschriftung. Beginnt mit dem, was in der jeweiligen Ansicht sichtbar zuerst steht
 * (WCAG 2.5.3, Sprachsteuerung): 'title' = „Zahnarzt, 16:00–16:45, …“ (Woche/Tag),
 * 'range' = „16:00–16:45, Zahnarzt, …“ (Liste), 'start' = „16:00 Zahnarzt, bis 16:45, …“ (Monat).
 * Danach Ort, Personen und ggf. „Überschneidung“.
 */
export function describeOccurrence(
	o: Occurrence,
	members: ReadonlyMap<string, Membership>,
	conflict: boolean,
	lead: 'title' | 'range' | 'start' = 'title'
): string {
	const people = (o.event.participants ?? [])
		.map((id) => members.get(id)?.display_name)
		.filter(Boolean)
		.join(', ');
	const title = o.event.title;
	const head =
		lead === 'range'
			? [timeRange(o), title]
			: lead === 'start' && !o.allDay
				? [`${o.startTime} ${title}`, m.cal_until({ time: o.endTime })]
				: [title, timeRange(o)];
	return [...head, o.event.location, people, conflict ? m.cal_conflict() : '']
		.filter(Boolean)
		.join(', ');
}

/** Farbe eines Termins: erste beteiligte Person, sonst die Kalenderfarbe. */
export function occurrenceColor(o: Occurrence, members: ReadonlyMap<string, Membership>): string {
	const first = (o.event.participants ?? []).map((id) => members.get(id)).find(Boolean);
	return first?.color ?? 'var(--color-calendar)';
}
