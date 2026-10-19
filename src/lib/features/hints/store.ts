// Antworten auf Hinweise und Aktionen aus Hinweisen – nur über die lokale Datenbank.
import { stableId } from '#lib/db/ids.js';
import { repo } from '#lib/db/index.js';
import type { HintResponse, MealPlanEntry, Recipe } from '#lib/db/types.js';
import { saveTask } from '#lib/features/tasks/store.js';
import { m } from '#lib/paraglide/messages.js';
import type { CookingConflict } from './cooking.js';
import { responseUntil, type HintAnswer } from './engine.js';

/** Eigene Antworten (die Rechte-Regeln liefern ohnehin nur die eigenen). */
export async function responsesOf(household: string, membership: string): Promise<HintResponse[]> {
	const all = await repo('hint_responses').table.where('membership').equals(membership).toArray();
	return all.filter((r) => r.household === household && !r.deleted_at);
}

/** Antwort speichern; feste ID je Person und Hinweis, damit es keine Doppelten gibt. */
export async function respond(
	household: string,
	membership: string,
	key: string,
	answer: HintAnswer,
	now = new Date()
): Promise<void> {
	const id = stableId(household, `hint:${membership}:${key}`);
	const until = responseUntil(answer, now);
	const existing = await repo('hint_responses').get(id);
	if (existing) {
		await repo('hint_responses').update(id, { response: answer, until, deleted_at: '' });
	} else {
		await repo('hint_responses').create({
			id,
			household,
			membership,
			key,
			response: answer,
			until
		});
	}
}

/** Zwei Planeinträge tauschen die Tage (Mahlzeit bleibt gleich). */
export async function swapEntries(a: MealPlanEntry, b: MealPlanEntry): Promise<void> {
	await repo('meal_plan_entries').update(a.id, { date: b.date });
	await repo('meal_plan_entries').update(b.id, { date: a.date });
}

/** Ein schnelleres Rezept statt des geplanten. */
export async function replaceRecipe(entry: MealPlanEntry, recipe: Recipe): Promise<void> {
	await repo('meal_plan_entries').update(entry.id, { recipe: recipe.id, title: recipe.title });
}

/** Aufgabe „… vorbereiten“ für den Vortag, mit dem Grund in den Notizen. */
export async function prepareAhead(
	household: string,
	conflict: CookingConflict,
	day: string
): Promise<void> {
	const blocking = conflict.blocking[0];
	await saveTask(household, null, {
		title: m.hint_prepare_task({ title: conflict.entry.title }),
		notes: blocking
			? m.hint_prepare_notes({
					event: blocking.event.title,
					from: blocking.startTime,
					to: blocking.endTime
				})
			: '',
		assignees: [],
		due_date: day,
		rrule: ''
	});
}

/** „Nie wieder so“ zurücknehmen: alle dauerhaft ausgeblendeten Arten wieder zeigen. */
export async function resetNever(household: string, membership: string): Promise<number> {
	const never = (await responsesOf(household, membership)).filter((r) => r.response === 'never');
	for (const response of never) await repo('hint_responses').remove(response.id);
	return never.length;
}
