// Termine lesen und schreiben – nur über die lokale Datenbank; der Sync erledigt den Rest.
// Zeiten werden aus Wanduhrzeit der Haushalts-Zeitzone in UTC umgerechnet.
// Ganztägig: `start`/`end` = erster/letzter Tag als UTC-Mitternacht (siehe tz.ts).
import { repo } from '#lib/db/index.js';
import type { CalendarEvent } from '#lib/db/types.js';
import { shiftRrule } from '#lib/features/tasks/recurrence.js';
import { addDaysTo } from './expand.js';
import { allDayToDate, dateToAllDay, parseUtc, toUtcString, utcToZoned, zonedToUtc } from './tz.js';

export function eventsOf(household: string): Promise<CalendarEvent[]> {
	return repo('events').table.where('household').equals(household).toArray();
}

/** Was der Termin-Dialog bearbeitet: bestehender Termin (Vorkommen) oder neuer an Tag/Uhrzeit. */
export interface EventTarget {
	event?: CalendarEvent;
	occurrenceDate?: string;
	date: string;
	time?: string;
}

export interface EventForm {
	title: string;
	allDay: boolean;
	/** Erster Tag (JJJJ-MM-TT). */
	date: string;
	/** Letzter Tag bei ganztägigen Terminen (leer = derselbe Tag). */
	endDate: string;
	startTime: string;
	endTime: string;
	location: string;
	participants: string[];
	reminder_minutes: number;
	rrule: string;
}

/** Beginn und Ende in UTC; endet ein Termin vor seinem Beginn, liegt das Ende am Folgetag. */
export function formTimes(form: EventForm, timeZone: string): { start: number; end: number } {
	if (form.allDay) {
		const last = form.endDate && form.endDate > form.date ? form.endDate : form.date;
		return { start: Date.parse(dateToAllDay(form.date)), end: Date.parse(dateToAllDay(last)) };
	}
	const start = zonedToUtc(form.date, form.startTime, timeZone);
	let end = zonedToUtc(form.date, form.endTime || form.startTime, timeZone);
	if (end <= start)
		end = zonedToUtc(addDaysTo(form.date, 1), form.endTime || form.startTime, timeZone);
	return { start, end };
}

function fields(form: EventForm, timeZone: string) {
	const { start, end } = formTimes(form, timeZone);
	return {
		title: form.title.trim(),
		all_day: form.allDay,
		start: toUtcString(start),
		end: toUtcString(end),
		location: form.location.trim(),
		participants: form.participants,
		reminder_minutes: form.reminder_minutes,
		rrule: form.rrule
	};
}

export async function createEvent(
	household: string,
	form: EventForm,
	timeZone: string
): Promise<void> {
	await repo('events').create({ household, ...fields(form, timeZone), exdates: [] });
}

/** Formular eines Termins (bzw. eines Vorkommens einer Serie). */
export function formFromEvent(
	event: CalendarEvent,
	occurrenceDate: string,
	timeZone: string
): EventForm {
	if (event.all_day) {
		const first = allDayToDate(event.start);
		const last = allDayToDate(event.end) || first;
		const span = Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000);
		return {
			...common(event),
			allDay: true,
			date: occurrenceDate,
			endDate: addDaysTo(occurrenceDate, Math.max(0, span)),
			startTime: '',
			endTime: ''
		};
	}
	const start = utcToZoned(parseUtc(event.start), timeZone);
	const end = utcToZoned(parseUtc(event.end || event.start), timeZone);
	return {
		...common(event),
		allDay: false,
		date: occurrenceDate,
		endDate: '',
		startTime: start.time,
		endTime: end.time
	};
}

function common(event: CalendarEvent) {
	return {
		title: event.title,
		location: event.location ?? '',
		participants: [...(event.participants ?? [])],
		reminder_minutes: event.reminder_minutes ?? 0,
		rrule: event.rrule ?? ''
	};
}

/**
 * „Alle Termine“ ändern. Wurde ein Vorkommen auf einen anderen Tag gelegt, verschiebt sich die
 * ganze Serie um dieselbe Anzahl Tage. Gespeichert werden nur geänderte Felder.
 */
export async function updateSeries(
	event: CalendarEvent,
	occurrenceDate: string,
	form: EventForm,
	timeZone: string
): Promise<void> {
	const seriesStart = event.all_day
		? allDayToDate(event.start)
		: utcToZoned(parseUtc(event.start), timeZone).date;
	const days = (from: string, to: string) =>
		Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
	// Beginn der Serie um dieselbe Anzahl Tage verschieben wie das bearbeitete Vorkommen;
	// die Dauer (bei ganztägigen Terminen in Tagen) bleibt wie im Formular.
	const shift = days(occurrenceDate, form.date);
	const movedDate = addDaysTo(seriesStart, shift);
	const span = form.allDay && form.endDate ? Math.max(0, days(form.date, form.endDate)) : 0;
	const moved: EventForm = {
		...form,
		date: movedDate,
		endDate: form.allDay ? addDaysTo(movedDate, span) : '',
		// Wochentage/Monatstag wandern mit, außer die Wiederholung wurde im Dialog geändert.
		rrule: form.rrule === event.rrule ? shiftRrule(form.rrule, shift) : form.rrule
	};
	const next = fields(event.rrule ? moved : form, timeZone);
	const changes = Object.fromEntries(
		Object.entries(next).filter(
			([key, value]) =>
				JSON.stringify(event[key as keyof typeof next] ?? '') !== JSON.stringify(value)
		)
	);
	await repo('events').update(event.id, changes);
}

/** „Nur dieser Termin“: Tag in die Ausnahmen der Serie, dazu ein Einzeltermin. */
export async function updateOnlyThis(
	event: CalendarEvent,
	occurrenceDate: string,
	form: EventForm,
	timeZone: string
): Promise<void> {
	await repo('events').update(event.id, {
		exdates: [...new Set([...(event.exdates ?? []), occurrenceDate])]
	});
	await repo('events').create({
		household: event.household,
		...fields({ ...form, rrule: '' }, timeZone),
		exdates: []
	});
}

/** Löschen: ganze Serie bzw. Einzeltermin, oder nur ein Vorkommen (als Ausnahme). */
export async function deleteEvent(
	event: CalendarEvent,
	occurrenceDate: string | null
): Promise<() => Promise<void>> {
	if (occurrenceDate && event.rrule) {
		const before = [...(event.exdates ?? [])];
		await repo('events').update(event.id, {
			exdates: [...new Set([...before, occurrenceDate])]
		});
		return () => repo('events').update(event.id, { exdates: before });
	}
	await repo('events').remove(event.id);
	return () => repo('events').update(event.id, { deleted_at: '' });
}
