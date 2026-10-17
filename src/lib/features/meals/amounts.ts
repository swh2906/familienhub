// Mengen lesen, formatieren und für eine andere Portionszahl umrechnen (deutsche Schreibweise).

const FRACTIONS: Record<string, number> = {
	'½': 0.5,
	'⅓': 1 / 3,
	'⅔': 2 / 3,
	'¼': 0.25,
	'¾': 0.75,
	'⅛': 0.125
};

/**
 * Liest eine Menge: „0,5“, „1.5“, „1/2“, „½“, „1 ½“. Leer oder unlesbar → 0 (= keine Menge).
 * Bei Bereichen wie „2-3“ zählt der erste Wert.
 */
export function parseAmount(input: string): number {
	const text = input.trim().replace(/\s+/g, ' ');
	if (!text) return 0;

	let total = 0;
	for (const part of text.split(/[-–]/)[0].trim().split(' ')) {
		if (part in FRACTIONS) {
			total += FRACTIONS[part];
			continue;
		}
		const unicodeFraction = /^(\d+)([½⅓⅔¼¾⅛])$/.exec(part);
		if (unicodeFraction) {
			total += Number(unicodeFraction[1]) + FRACTIONS[unicodeFraction[2]];
			continue;
		}
		const fraction = /^(\d+)\/(\d+)$/.exec(part);
		if (fraction && Number(fraction[2]) !== 0) {
			total += Number(fraction[1]) / Number(fraction[2]);
			continue;
		}
		const number = Number(part.replace(',', '.'));
		if (!Number.isFinite(number) || number < 0) return 0;
		total += number;
	}
	return total;
}

const formatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** „0,5“, „1.250“ (Tausender-Punkt), leer bei 0. */
export function formatAmount(amount: number | null | undefined): string {
	if (!amount || !Number.isFinite(amount)) return '';
	return formatter.format(amount);
}

/** Menge für eine andere Portionszahl, auf zwei Nachkommastellen gerundet. */
export function scaleAmount(amount: number, fromServings: number, toServings: number): number {
	if (!amount || fromServings <= 0 || toServings <= 0) return amount;
	return Math.round(((amount * toServings) / fromServings) * 100) / 100;
}
