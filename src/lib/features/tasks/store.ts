// Aufgaben lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
import { repo } from '#lib/db/index.js';
import type { Task, TaskCompletion } from '#lib/db/types.js';
import { nextDueDate } from './recurrence.js';

export function tasksOf(household: string): Promise<Task[]> {
	return repo('tasks').table.where('household').equals(household).toArray();
}

export function completionsOf(taskIds: string[]): Promise<TaskCompletion[]> {
	return repo('task_completions').table.where('task').anyOf(taskIds).toArray();
}

export interface TaskForm {
	title: string;
	notes: string;
	assignees: string[];
	due_date: string;
	rrule: string;
}

/** Legt an oder speichert nur geänderte Felder. */
export async function saveTask(
	household: string,
	existing: Task | null,
	form: TaskForm
): Promise<void> {
	const fields = { ...form, title: form.title.trim(), notes: form.notes.trim() };
	if (!existing) {
		await repo('tasks').create({ household, ...fields, status: 'open', points: 0 });
		return;
	}
	const changes = Object.fromEntries(
		Object.entries(fields).filter(
			([key, value]) =>
				JSON.stringify(existing[key as keyof TaskForm] ?? '') !== JSON.stringify(value)
		)
	);
	await repo('tasks').update(existing.id, changes);
}

export async function deleteTask(task: Task): Promise<void> {
	await repo('tasks').remove(task.id);
}

export async function restoreTask(id: string): Promise<void> {
	await repo('tasks').update(id, { deleted_at: '' });
}

/** Was „Rückgängig“ nach dem Abhaken wiederherstellt. */
export interface CompletionUndo {
	taskId: string;
	completionId: string;
	before: { status: Task['status']; due_date: string };
	/** Neues Fälligkeitsdatum bei Wiederholung, sonst ''. */
	next: string;
}

/**
 * Abhaken: Erledigt-Eintrag anlegen; wiederkehrende Aufgaben rücken auf das nächste Datum,
 * einmalige bekommen den Status „done“. Beide Geräte rechnen offline vom selben Datum aus,
 * eine Aufgabe rückt also nicht doppelt weiter.
 */
export async function completeTask(
	task: Task,
	membership: string,
	today: string
): Promise<CompletionUndo> {
	const completion = await repo('task_completions').create({
		task: task.id,
		membership,
		completed_at: new Date().toISOString(),
		points: task.points ?? 0
	});
	const before = { status: task.status, due_date: task.due_date ?? '' };
	const next = task.rrule ? nextDueDate(task.rrule, task.due_date ?? '', today) : '';
	if (next) await repo('tasks').update(task.id, { due_date: next });
	else await repo('tasks').update(task.id, { status: 'done' });
	return { taskId: task.id, completionId: completion.id, before, next };
}

export async function undoCompletion(undo: CompletionUndo): Promise<void> {
	await repo('tasks').update(
		undo.taskId,
		undo.next ? { due_date: undo.before.due_date } : { status: 'open' }
	);
	await repo('task_completions').remove(undo.completionId);
}

/** Erledigte einmalige Aufgabe wieder öffnen. */
export async function reopenTask(task: Task): Promise<void> {
	await repo('tasks').update(task.id, { status: 'open' });
}
