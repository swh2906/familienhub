// Reine Logik der Aufgabenliste: Reiter, Sortierung, Fälligkeit, Rechte in der Oberfläche.
import type { Task, TaskCompletion } from '#lib/db/types.js';
import { parseUtc } from '#lib/features/calendar/tz.js';

export type Tab = 'mine' | 'all' | 'done';

export function isOpen(task: Task): boolean {
	return !task.deleted_at && task.status !== 'done';
}

export function isOverdue(task: Task, today: string): boolean {
	return isOpen(task) && !!task.due_date && task.due_date < today;
}

export function isAssignedTo(task: Task, membership: string): boolean {
	return (task.assignees ?? []).includes(membership);
}

/** Admins und Erwachsene haken alles ab, Kinder eigene und nicht zugewiesene (CLAUDE.md). */
export function canComplete(task: Task, membership: string, canEdit: boolean): boolean {
	return canEdit || (task.assignees ?? []).length === 0 || isAssignedTo(task, membership);
}

/**
 * Offene Aufgaben eines Reiters, sortiert: mir zugewiesene zuerst, dann überfällige,
 * dann nach Fälligkeit (ohne Datum zuletzt), dann nach Titel.
 * „Meine“ = mir zugewiesen oder niemandem zugewiesen.
 */
export function tasksForTab(
	tasks: readonly Task[],
	tab: Exclude<Tab, 'done'>,
	membership: string,
	today: string
): Task[] {
	return tasks
		.filter(isOpen)
		.filter(
			(task) =>
				tab === 'all' || (task.assignees ?? []).length === 0 || isAssignedTo(task, membership)
		)
		.sort(
			(a, b) =>
				Number(isAssignedTo(b, membership)) - Number(isAssignedTo(a, membership)) ||
				Number(isOverdue(b, today)) - Number(isOverdue(a, today)) ||
				(a.due_date || '9999').localeCompare(b.due_date || '9999') ||
				a.title.localeCompare(b.title, 'de')
		);
}

export interface DoneEntry {
	completion: TaskCompletion;
	task: Task | undefined;
}

/** Zuletzt Erledigtes, neueste zuerst. */
export function recentCompletions(
	completions: readonly TaskCompletion[],
	tasks: readonly Task[],
	limit = 50
): DoneEntry[] {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	return completions
		.filter((c) => !c.deleted_at)
		.sort((a, b) => b.completed_at.localeCompare(a.completed_at))
		.slice(0, limit)
		.map((completion) => ({ completion, task: byId.get(completion.task) }));
}

/**
 * Pro Aufgabe nur der neueste Erledigt-Eintrag lässt sich zurücknehmen – ältere würden die
 * Fälligkeit einer Serie sonst durcheinanderbringen.
 */
export function revertibleCompletions(entries: readonly DoneEntry[]): Set<string> {
	const latest = new Map<string, TaskCompletion>();
	for (const { completion } of entries) {
		const current = latest.get(completion.task);
		// Zeitpunkte vergleichen, nicht Text: Server („… 08:00:00.000Z“) und Gerät (ISO) schreiben verschieden.
		if (!current || parseUtc(completion.completed_at) > parseUtc(current.completed_at)) {
			latest.set(completion.task, completion);
		}
	}
	return new Set([...latest.values()].map((c) => c.id));
}

/**
 * Fälligkeit nach dem Zurücknehmen einer wiederkehrenden Aufgabe: wieder fällig am Tag des
 * Abhakens (bzw. am alten Datum, falls das früher liegt). Das genaue frühere Datum ist nicht
 * gespeichert; so taucht die Aufgabe sicher wieder als fällig auf.
 */
export function dueAfterRevert(currentDue: string, completedOn: string): string {
	return currentDue && currentDue < completedOn ? currentDue : completedOn;
}

export type DueKind = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';

/** Art der Fälligkeit für Anzeige und Farbe. */
export function dueKind(due: string, today: string): DueKind {
	if (!due) return 'none';
	if (due < today) return 'overdue';
	if (due === today) return 'today';
	const [y, m, d] = today.split('-').map(Number);
	const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
	return due === tomorrow ? 'tomorrow' : 'later';
}
