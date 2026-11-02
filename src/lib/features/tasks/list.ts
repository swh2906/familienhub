// Reine Logik der Aufgabenliste: Reiter, Sortierung, Fälligkeit, Rechte in der Oberfläche.
import type { Task, TaskCompletion } from '#lib/db/types.js';
import { addDaysTo } from '#lib/features/calendar/expand.js';
import { parseUtc } from '#lib/features/calendar/tz.js';
import { nextDueDate } from './recurrence.js';

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

/** So lange bleibt Erledigtes sichtbar; danach löscht der Aufräum-Job es endgültig. */
export const DONE_VISIBLE_DAYS = 14;

/** Erledigtes der letzten 14 Tage, neueste zuerst. */
export function recentCompletions(
	completions: readonly TaskCompletion[],
	tasks: readonly Task[],
	now = Date.now(),
	limit = 50
): DoneEntry[] {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const since = now - DONE_VISIBLE_DAYS * 24 * 60 * 60 * 1000;
	return completions
		.filter((c) => !c.deleted_at && parseUtc(c.completed_at) >= since)
		.sort((a, b) => parseUtc(b.completed_at) - parseUtc(a.completed_at))
		.slice(0, limit)
		.map((completion) => ({ completion, task: byId.get(completion.task) }));
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

/**
 * Fälligkeit für Anzeige und Gruppen: das gespeicherte Datum, bei Wiederholungen ohne Datum das
 * nächste Vorkommen ab heute (einschließlich).
 */
export function effectiveDue(task: Task, today: string): string {
	if (task.due_date) return task.due_date;
	return task.rrule ? nextDueDate(task.rrule, '', addDaysTo(today, -1)) : '';
}

export type TaskGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';

const GROUP_ORDER: TaskGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Gruppe nach Fälligkeit: „week“ = morgen bis in 6 Tagen. */
export function groupOf(due: string, today: string): TaskGroup {
	if (!due) return 'none';
	if (due < today) return 'overdue';
	if (due === today) return 'today';
	return due <= addDaysTo(today, 6) ? 'week' : 'later';
}

/** Aufgaben in Gruppen (feste Reihenfolge, nur nicht leere); die Reihenfolge innerhalb bleibt. */
export function groupTasks(
	tasks: readonly Task[],
	today: string
): { group: TaskGroup; tasks: Task[] }[] {
	const groups = new Map<TaskGroup, Task[]>();
	for (const task of tasks) {
		const group = groupOf(effectiveDue(task, today), today);
		groups.set(group, [...(groups.get(group) ?? []), task]);
	}
	return GROUP_ORDER.filter((g) => groups.has(g)).map((group) => ({
		group,
		tasks: groups.get(group)!
	}));
}
