// Reine Logik des Heute-Dashboards: Kennzahlen, „Als Nächstes“, die nächsten 7 Tage, Filter „Nur meins“.
import type { MealPlanEntry, Recipe, Task } from '#lib/db/types.js';
import { conflictsWith, findConflicts } from '#lib/features/calendar/conflicts.js';
import { addDaysTo, onDay, type Occurrence } from '#lib/features/calendar/expand.js';
import {
	DEFAULT_PREP_MINUTES,
	MEAL_TIMES,
	daySpan,
	fromMinutes,
	toMinutes
} from '#lib/features/hints/cooking.js';
import { SLOTS } from '#lib/features/meals/plan.js';
import { isAssignedTo, isOpen } from '#lib/features/tasks/list.js';

/** Alles aus der Familie oder nur, was mich betrifft. */
export type Scope = 'all' | 'mine';

export const SCOPE_STORAGE_KEY = 'fh-today-scope';

/** Gespeicherte Auswahl dieses Geräts; ohne Auswahl sehen Kinder „Nur meins“, Erwachsene alles. */
export function loadScope(isChild: boolean): Scope {
	try {
		const value = localStorage.getItem(SCOPE_STORAGE_KEY);
		if (value === 'all' || value === 'mine') return value;
	} catch {
		// Speicher gesperrt (privates Fenster): Standard verwenden.
	}
	return isChild ? 'mine' : 'all';
}

export function saveScope(scope: Scope): void {
	try {
		localStorage.setItem(SCOPE_STORAGE_KEY, scope);
	} catch {
		// nicht speicherbar – gilt dann nur bis zum Neuladen
	}
}

/** Termin betrifft mich: ich bin dabei, oder er gilt für die ganze Familie (keine Teilnehmer). */
export function isMyEvent(occurrence: Occurrence, membership: string): boolean {
	const participants = occurrence.event.participants ?? [];
	return participants.length === 0 || participants.includes(membership);
}

/** Aufgabe betrifft mich: mir zugewiesen oder niemandem (dann darf sie jeder erledigen). */
export function isMyTask(task: Task, membership: string): boolean {
	return (task.assignees ?? []).length === 0 || isAssignedTo(task, membership);
}

export function eventsInScope(
	occurrences: readonly Occurrence[],
	scope: Scope,
	membership: string
): Occurrence[] {
	return scope === 'all' ? [...occurrences] : occurrences.filter((o) => isMyEvent(o, membership));
}

export function tasksInScope(tasks: readonly Task[], scope: Scope, membership: string): Task[] {
	return scope === 'all' ? [...tasks] : tasks.filter((t) => isMyTask(t, membership));
}

/** Offene Aufgaben, die bis einschließlich `date` fällig sind (überfällige zählen mit). */
export function dueBy(tasks: readonly Task[], date: string): Task[] {
	return tasks.filter((task) => isOpen(task) && !!task.due_date && task.due_date <= date);
}

export interface Stats {
	/** Termine heute (ganztägige eingeschlossen). */
	events: number;
	/** Davon noch nicht vorbei. */
	eventsLeft: number;
	shopping: number;
	/** Heute fällige und überfällige Aufgaben. */
	tasks: number;
	overdue: number;
	/** Überschneidungen heute: Paare von Terminen derselben Person, die sich überlappen. */
	conflicts: number;
}

export function stats(input: {
	todayEvents: readonly Occurrence[];
	tasks: readonly Task[];
	openShopping: number;
	today: string;
	now: number;
}): Stats {
	const due = dueBy(input.tasks, input.today);
	return {
		events: input.todayEvents.length,
		eventsLeft: input.todayEvents.filter((o) => o.allDay || o.end > input.now).length,
		shopping: input.openShopping,
		tasks: due.length,
		overdue: due.filter((t) => t.due_date < input.today).length,
		conflicts: conflictPairs(input.todayEvents)
	};
}

/** Anzahl der Termin-Paare, die sich überschneiden (A mit B zählt einmal). */
export function conflictPairs(occurrences: readonly Occurrence[]): number {
	const conflicting = findConflicts(occurrences);
	const timed = occurrences.filter((o) => conflicting.has(o.key));
	let count = 0;
	for (const o of timed) {
		count += conflictsWith(
			{
				start: o.start,
				end: o.end,
				participants: o.event.participants ?? [],
				allDay: false,
				ignore: o.event.id
			},
			timed
		).length;
	}
	return count / 2;
}

export type UpNextItem =
	| {
			kind: 'event';
			key: string;
			/** Uhrzeit, ab der es relevant ist (HH:MM, Wanduhrzeit des Haushalts). */
			at: string;
			occurrence: Occurrence;
			/** Läuft gerade. */
			running: boolean;
			/** Titel der Termine derselben Person, die sich überschneiden. */
			clashes: string[];
	  }
	| {
			kind: 'meal';
			key: string;
			/** Beginn der Kochzeit. */
			at: string;
			/** Essenszeit. */
			mealTime: string;
			entry: MealPlanEntry;
			minutes: number;
			estimated: boolean;
	  };

/**
 * Was heute noch ansteht, zeitlich sortiert: Termine mit Uhrzeit (laufende zuerst) und das
 * Kochen für geplante Mahlzeiten (Beginn = Essenszeit minus Zubereitungszeit). Mahlzeiten, die
 * schon gegessen oder als gekocht beantwortet sind, fallen weg. Höchstens `limit` Einträge.
 */
export function upNext(input: {
	todayEvents: readonly Occurrence[];
	meals: readonly MealPlanEntry[];
	recipes: readonly Recipe[];
	today: string;
	/** Jetzt in Minuten seit Mitternacht (Zeitzone des Haushalts). */
	nowMinutes: number;
	limit?: number;
}): UpNextItem[] {
	const { today, nowMinutes, limit = 3 } = input;
	const items: { item: UpNextItem; sort: number }[] = [];

	const timed = input.todayEvents.filter((o) => !o.allDay);
	const conflicting = findConflicts(timed);
	for (const o of timed) {
		const span = daySpan(o, today);
		if (!span || span[1] <= nowMinutes) continue;
		const people = new Set(o.event.participants ?? []);
		const clashes = conflicting.has(o.key)
			? timed
					.filter(
						(other) =>
							other.key !== o.key &&
							conflicting.has(other.key) &&
							other.start < o.end &&
							o.start < other.end &&
							(other.event.participants ?? []).some((p) => people.has(p))
					)
					.map((other) => other.event.title)
			: [];
		items.push({
			item: {
				kind: 'event',
				key: o.key,
				at: fromMinutes(span[0]),
				occurrence: o,
				running: span[0] <= nowMinutes,
				clashes
			},
			sort: span[0]
		});
	}

	const recipes = new Map(input.recipes.map((r) => [r.id, r]));
	for (const entry of input.meals) {
		if (entry.deleted_at || entry.date !== today || entry.cooked) continue;
		const mealTime = MEAL_TIMES[entry.slot];
		const prep = entry.recipe ? (recipes.get(entry.recipe)?.prep_minutes ?? 0) : 0;
		const minutes = prep > 0 ? prep : DEFAULT_PREP_MINUTES;
		const end = toMinutes(mealTime);
		if (end <= nowMinutes) continue;
		const start = end - minutes;
		items.push({
			item: {
				kind: 'meal',
				key: entry.id,
				at: fromMinutes(start),
				mealTime,
				entry,
				minutes,
				estimated: prep <= 0
			},
			sort: start
		});
	}

	return items
		.sort((a, b) => a.sort - b.sort || a.item.kind.localeCompare(b.item.kind))
		.slice(0, limit)
		.map(({ item }) => item);
}

export interface WeekDay {
	date: string;
	isToday: boolean;
	events: Occurrence[];
	/** Personen der Termine des Tages (Mitgliedschaften, ohne Doppelte, in Reihenfolge). */
	people: string[];
	/** Familien-Termine (ohne Teilnehmer) an diesem Tag. */
	familyEvents: number;
	hasConflict: boolean;
	/** Mahlzeiten nach Tageszeit sortiert. */
	meals: MealPlanEntry[];
	/** An diesem Tag fällige offene Aufgaben (heute: inklusive überfälliger). */
	tasks: number;
}

/** Die nächsten `days` Tage ab heute für den Wochenstreifen. */
export function weekStrip(input: {
	occurrences: readonly Occurrence[];
	meals: readonly MealPlanEntry[];
	tasks: readonly Task[];
	today: string;
	days?: number;
}): WeekDay[] {
	const { today, days = 7 } = input;
	const result: WeekDay[] = [];
	for (let i = 0; i < days; i++) {
		const date = addDaysTo(today, i);
		const events = onDay(input.occurrences, date);
		const people: string[] = [];
		for (const o of events) {
			for (const p of o.event.participants ?? []) if (!people.includes(p)) people.push(p);
		}
		const meals = input.meals
			.filter((e) => !e.deleted_at && e.date === date)
			.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
		const tasks = input.tasks.filter(
			(t) => isOpen(t) && !!t.due_date && (i === 0 ? t.due_date <= date : t.due_date === date)
		).length;
		result.push({
			date,
			isToday: i === 0,
			events,
			people,
			familyEvents: events.filter((o) => (o.event.participants ?? []).length === 0).length,
			hasConflict: findConflicts(events).size > 0,
			meals,
			tasks
		});
	}
	return result;
}
