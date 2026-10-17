// Reine Logik der Heute-Ansicht: Begrüßung, nächster Termin, Aufgaben für heute.
import type { Task } from '#lib/db/types.js';
import type { Occurrence } from '#lib/features/calendar/expand.js';
import { isAssignedTo, isOpen, isOverdue } from '#lib/features/tasks/list.js';

export type Greeting = 'morning' | 'day' | 'evening' | 'night';

/** 5–10 Uhr Morgen, 11–17 Tag, 18–22 Abend, sonst Nacht. */
export function greetingFor(hour: number): Greeting {
	if (hour >= 5 && hour < 11) return 'morning';
	if (hour >= 11 && hour < 18) return 'day';
	if (hour >= 18 && hour < 23) return 'evening';
	return 'night';
}

/** Schlüssel des nächsten (oder gerade laufenden) Termins mit Uhrzeit, sonst null. */
export function nextOccurrence(occurrences: readonly Occurrence[], now: number): string | null {
	const upcoming = occurrences
		.filter((o) => !o.allDay && o.end > now)
		.sort((a, b) => a.start - b.start);
	return upcoming[0]?.key ?? null;
}

/** Vergangene Termine (bereits beendet) – werden abgeschwächt angezeigt. */
export function isPast(occurrence: Occurrence, now: number): boolean {
	return !occurrence.allDay && occurrence.end <= now;
}

/**
 * Heute fällige und überfällige offene Aufgaben: mir zugewiesene zuerst, dann nicht zugewiesene,
 * dann die übrigen; jeweils überfällige vor heutigen, dann nach Titel. Höchstens `limit`.
 */
export function tasksForToday(
	tasks: readonly Task[],
	membership: string,
	today: string,
	limit = 5
): { tasks: Task[]; total: number } {
	const rank = (task: Task) =>
		isAssignedTo(task, membership) ? 0 : (task.assignees ?? []).length === 0 ? 1 : 2;
	const due = tasks
		.filter((task) => isOpen(task) && !!task.due_date && task.due_date <= today)
		.sort(
			(a, b) =>
				rank(a) - rank(b) ||
				Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
				a.title.localeCompare(b.title, 'de')
		);
	return { tasks: due.slice(0, limit), total: due.length };
}
