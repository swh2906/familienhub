// Wiederholung als kurzer deutscher Text für die Liste („wöchentlich: Mo, Do“).
import { m } from '#lib/paraglide/messages.js';
import { rruleToPreset } from './recurrence.js';

/** Kurze Wochentagsnamen, Montag zuerst. */
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = [
	'Montag',
	'Dienstag',
	'Mittwoch',
	'Donnerstag',
	'Freitag',
	'Samstag',
	'Sonntag'
];

export function describeRrule(rrule: string): string {
	const preset = rruleToPreset(rrule);
	switch (preset.kind) {
		case 'none':
			return '';
		case 'daily':
			return m.repeat_desc_daily();
		case 'weekly': {
			const days = preset.days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
			return preset.interval === 2
				? m.repeat_desc_biweekly({ days })
				: m.repeat_desc_weekly({ days });
		}
		case 'monthly':
			return m.repeat_desc_monthly({ day: preset.day });
		case 'yearly':
			return m.repeat_desc_yearly();
		case 'custom':
			return m.repeat_desc_custom();
	}
}
