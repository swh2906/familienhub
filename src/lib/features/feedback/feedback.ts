// Testphase-Feedback: Gerätebeschreibung (datensparsam, ohne genaue Versionen) und Speichern.
import { repo } from '#lib/db/index.js';
import type { Feedback } from '#lib/db/types.js';

/** „Handy · Android · Chrome“ – grob genug für die Fehlersuche, ohne Fingerabdruck. */
export function deviceSummary(userAgent: string, width: number): string {
	const ua = userAgent.toLowerCase();
	const os = /iphone|ipad|ipod/.test(ua)
		? 'iOS'
		: ua.includes('android')
			? 'Android'
			: ua.includes('windows')
				? 'Windows'
				: ua.includes('mac os')
					? 'macOS'
					: ua.includes('linux')
						? 'Linux'
						: 'Unbekannt';
	const browser = ua.includes('edg/')
		? 'Edge'
		: ua.includes('firefox/')
			? 'Firefox'
			: ua.includes('chrome/') || ua.includes('crios/')
				? 'Chrome'
				: ua.includes('safari/')
					? 'Safari'
					: 'Browser';
	const size = width < 700 ? 'Handy' : width < 1100 ? 'Tablet' : 'Desktop';
	return `${size} · ${os} · ${browser}`;
}

/** Noch nicht gesendet (created leer) gilt als neuestes. */
const newest = (f: Feedback) => f.created || '￿';

/** Neueste zuerst, offene vor erledigten. */
export function sortFeedback(list: readonly Feedback[]): Feedback[] {
	return list
		.filter((f) => !f.deleted_at)
		.sort((a, b) => Number(a.done) - Number(b.done) || newest(b).localeCompare(newest(a)));
}

export function feedbackOf(household: string): Promise<Feedback[]> {
	return repo('feedback').table.where('household').equals(household).toArray();
}

export async function sendFeedback(
	household: string,
	membership: string,
	input: { text: string; area: string; device: string }
): Promise<void> {
	await repo('feedback').create({
		household,
		text: input.text.trim(),
		area: input.area,
		device: input.device,
		done: false,
		created_by: membership
	});
}

export async function setDone(item: Feedback, done: boolean): Promise<void> {
	await repo('feedback').update(item.id, { done });
}
