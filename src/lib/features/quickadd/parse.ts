// Schnelleingabe für alles: erkennt aus einer Zeile, ob ein Termin, eine Aufgabe oder ein Einkauf
// gemeint ist, und zieht Datum, Uhrzeit und Personen heraus. Läuft nur lokal (keine KI, kein Server).
//
// Regeln (in dieser Reihenfolge):
// 1. Präfix „Termin:“, „Aufgabe:“, „Einkauf:“ legt die Art fest.
// 2. Mit Uhrzeit → Termin.
// 3. Mit Tätigkeit („aufräumen“, „gießen“, „rausbringen“ …) → Aufgabe.
// 4. „… kaufen/besorgen“ → Einkauf.
// 5. Mit Datum (ohne Uhrzeit) → ganztägiger Termin („Oma Geburtstag Samstag“).
// 6. Sonst → Einkauf („2 l Milch“).
import { addDaysTo } from '#lib/features/calendar/expand.js';

export type QuickKind = 'event' | 'task' | 'shopping';

export interface QuickPerson {
	id: string;
	name: string;
}

export interface QuickResult {
	kind: QuickKind;
	/** Titel ohne Datum, Uhrzeit und Füllwörter (bei Aufgaben auch ohne führenden Namen). */
	title: string;
	/** JJJJ-MM-TT oder '' (keine Angabe). */
	date: string;
	/** HH:MM oder ''. */
	startTime: string;
	endTime: string;
	/** Erkannte Personen (Mitgliedschaften), in der Reihenfolge ihres Auftretens. */
	people: string[];
	/** Art per Präfix festgelegt. */
	explicit: boolean;
}

const PREFIXES: Record<string, QuickKind> = {
	termin: 'event',
	aufgabe: 'task',
	einkauf: 'shopping',
	einkaufen: 'shopping',
	kaufen: 'shopping'
};

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const SHORT_WEEKDAYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];

/** Wortenden typischer Tätigkeiten im Haushalt (auch in Zusammensetzungen: „wegräumen“). */
const TASK_STEMS = [
	'räumen',
	'putzen',
	'gießen',
	'bringen',
	'tragen',
	'schreiben',
	'saugen',
	'waschen',
	'wischen',
	'spülen',
	'bügeln',
	'füttern',
	'reparieren',
	'rufen',
	'zahlen',
	'weisen',
	'holen',
	'hängen',
	'trocknen',
	'mähen',
	'fegen',
	'sortieren',
	'kündigen',
	'buchen',
	'packen',
	'lernen',
	'üben',
	'erledigen',
	'machen',
	'leeren',
	'beziehen',
	'hausaufgaben'
];

const SHOPPING_WORDS = /\s+(kaufen|besorgen|einkaufen|mitbringen)$/i;

/** Wortgrenze, die auch Umlaute kennt (\b tut das nicht). */
const L = 'A-Za-zÄÖÜäöüß';
const before = `(?<![${L}0-9])`;
const after = `(?![${L}0-9])`;

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

function time(h: string, m: string | undefined): string | null {
	const hour = Number(h);
	const minute = m ? Number(m) : 0;
	if (!Number.isInteger(hour) || hour > 23 || minute > 59) return null;
	return `${pad(hour)}:${pad(minute)}`;
}

function plusHour(t: string): string {
	const [h, m] = t.split(':').map(Number);
	return `${pad((h + 1) % 24)}:${pad(m)}`;
}

function weekdayOf(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Nächster genannter Wochentag ab heute (heute selbst zählt); „nächsten …“ frühestens morgen. */
function nextWeekday(today: string, weekday: number, next: boolean): string {
	let diff = (weekday - weekdayOf(today) + 7) % 7;
	if (next && diff === 0) diff = 7;
	return addDaysTo(today, diff);
}

interface Cut {
	text: string;
	found: RegExpExecArray | null;
}

/** Erstes Vorkommen entfernen und mitliefern. */
function cut(text: string, pattern: RegExp): Cut {
	const found = pattern.exec(text);
	if (!found) return { text, found: null };
	return {
		text: text.slice(0, found.index) + ' ' + text.slice(found.index + found[0].length),
		found
	};
}

function findTime(text: string): { text: string; start: string; end: string } {
	// „15–16 Uhr“, „von 15 bis 16:30 Uhr“, „15:00-16:00“
	const range = [
		new RegExp(
			`${before}(?:von\\s+|um\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr\\s*)?(?:-|–|bis)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*uhr${after}`,
			'i'
		),
		new RegExp(
			`${before}(?:von\\s+)?(\\d{1,2}):(\\d{2})\\s*(?:-|–|bis)\\s*(\\d{1,2}):(\\d{2})${after}`
		)
	];
	for (const pattern of range) {
		const { text: rest, found } = cut(text, pattern);
		if (!found) continue;
		const start = time(found[1], found[2]);
		const end = time(found[3], found[4]);
		if (start && end) return { text: rest, start, end };
	}
	// „15 Uhr“, „15:30 Uhr“, „15.30 Uhr“, „um 15:30“, „15:30“, „um 15“
	const single = [
		new RegExp(`${before}(?:um\\s+|ab\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*uhr${after}`, 'i'),
		new RegExp(`${before}(?:um\\s+|ab\\s+)?(\\d{1,2}):(\\d{2})${after}`, 'i'),
		new RegExp(`${before}um\\s+(\\d{1,2})(?![.:\\d])${after}`, 'i')
	];
	for (const pattern of single) {
		const { text: rest, found } = cut(text, pattern);
		if (!found) continue;
		const start = time(found[1], found[2]);
		if (start) return { text: rest, start, end: plusHour(start) };
	}
	return { text, start: '', end: '' };
}

function findDate(text: string, today: string): { text: string; date: string } {
	const words: [RegExp, (m: RegExpExecArray) => string | null][] = [
		[new RegExp(`${before}übermorgen${after}`, 'i'), () => addDaysTo(today, 2)],
		[new RegExp(`${before}morgen${after}`, 'i'), () => addDaysTo(today, 1)],
		[new RegExp(`${before}heute${after}`, 'i'), () => today],
		[
			new RegExp(
				`${before}(?:(?:am|diesen|nächsten|nächster|kommenden)\\s+)*(${WEEKDAYS.join('|')})${after}`,
				'i'
			),
			(m) => nextWeekday(today, WEEKDAYS.indexOf(m[1].toLowerCase()), /nächst|kommend/i.test(m[0]))
		],
		[
			new RegExp(`${before}(?:am\\s+)?(${SHORT_WEEKDAYS.join('|')})\\.(?=\\s|$)`, 'i'),
			(m) => nextWeekday(today, SHORT_WEEKDAYS.indexOf(m[1].toLowerCase()), false)
		],
		[
			new RegExp(`${before}(?:am\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?${after}`, 'i'),
			(m) => {
				const day = Number(m[1]);
				const month = Number(m[2]);
				if (day < 1 || day > 31 || month < 1 || month > 12) return null;
				const [thisYear] = today.split('-').map(Number);
				let year = m[3] ? Number(m[3]) : thisYear;
				if (year < 100) year += 2000;
				let date = `${year}-${pad(month)}-${pad(day)}`;
				if (!m[3] && date < today) date = `${year + 1}-${pad(month)}-${pad(day)}`;
				return date;
			}
		]
	];
	for (const [pattern, toDate] of words) {
		const { text: rest, found } = cut(text, pattern);
		if (!found) continue;
		const date = toDate(found);
		if (date) return { text: rest, date };
	}
	return { text, date: '' };
}

function findPeople(text: string, people: readonly QuickPerson[]): QuickPerson[] {
	return people
		.map((person) => {
			const name = person.name.trim();
			if (!name) return null;
			const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const found = new RegExp(`${before}${escaped}${after}`, 'i').exec(text);
			return found ? { person, index: found.index } : null;
		})
		.filter((hit): hit is { person: QuickPerson; index: number } => hit !== null)
		.sort((a, b) => a.index - b.index)
		.map((hit) => hit.person);
}

function hasTaskWord(text: string): boolean {
	return text
		.toLowerCase()
		.split(/[^a-zäöüß]+/)
		.some((word) => TASK_STEMS.some((stem) => word.endsWith(stem)));
}

function tidy(text: string): string {
	return text
		.replace(/\s+/g, ' ')
		.replace(/^[\s,.;:–-]+|[\s,;:–-]+$/g, '')
		.trim();
}

/** Bei Aufgaben: führenden Namen („Mia Zimmer aufräumen“) und „für Mia“ aus dem Titel nehmen. */
function withoutNames(text: string, people: readonly QuickPerson[]): string {
	let rest = text;
	for (const person of people) {
		const escaped = person.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		rest = rest
			.replace(new RegExp(`^\\s*${escaped}${after}[,:]?`, 'i'), ' ')
			.replace(new RegExp(`${before}(?:für|von)\\s+${escaped}${after}`, 'i'), ' ');
	}
	return rest;
}

export function parseQuick(
	input: string,
	options: { today: string; people: readonly QuickPerson[] }
): QuickResult | null {
	let text = input.trim();
	if (!text) return null;

	let kind: QuickKind | null = null;
	const prefix = /^(termin|aufgabe|einkauf|einkaufen|kaufen)\s*:\s*/i.exec(text);
	if (prefix) {
		kind = PREFIXES[prefix[1].toLowerCase()];
		text = text.slice(prefix[0].length);
	}

	const timed = findTime(text);
	const dated = findDate(timed.text, options.today);
	const people = findPeople(dated.text, options.people);
	let rest = dated.text.replace(new RegExp(`${before}(?:am|um)${after}`, 'gi'), ' ');

	const explicit = kind !== null;
	if (!kind) {
		if (timed.start) kind = 'event';
		else if (hasTaskWord(rest)) kind = 'task';
		else if (SHOPPING_WORDS.test(tidy(rest))) kind = 'shopping';
		else if (dated.date) kind = 'event';
		else kind = 'shopping';
	}

	if (kind === 'task') rest = withoutNames(rest, people);
	if (kind === 'shopping') rest = tidy(rest).replace(SHOPPING_WORDS, '');
	const title = tidy(rest);
	if (!title) return null;

	return {
		kind,
		title,
		date: dated.date,
		startTime: timed.start,
		endTime: timed.end,
		people: people.map((person) => person.id),
		explicit
	};
}
