// Texte für Termine: Zeitspanne und vorlesbare Beschriftung.
import type { Membership } from '#lib/db/types.js';
import { m } from '#lib/paraglide/messages.js';
import type { Occurrence } from './expand.js';

export function timeRange(o: Occurrence): string {
	return o.allDay ? m.cal_all_day() : `${o.startTime}–${o.endTime}`;
}

/** „Zahnarzt, 16:00–16:45, Mia, Überschneidung“ */
export function describeOccurrence(
	o: Occurrence,
	members: ReadonlyMap<string, Membership>,
	conflict: boolean
): string {
	const people = (o.event.participants ?? [])
		.map((id) => members.get(id)?.display_name)
		.filter(Boolean)
		.join(', ');
	return [o.event.title, timeRange(o), o.event.location, people, conflict ? m.cal_conflict() : '']
		.filter(Boolean)
		.join(', ');
}

/** Farbe eines Termins: erste beteiligte Person, sonst die Kalenderfarbe. */
export function occurrenceColor(o: Occurrence, members: ReadonlyMap<string, Membership>): string {
	const first = (o.event.participants ?? []).map((id) => members.get(id)).find(Boolean);
	return first?.color ?? 'var(--color-calendar)';
}
