import { describe, expect, it } from 'vitest';
import { mapImportedRecipe, parseDuration, parseYield, plainText, sourceLabel } from './import.js';

describe('parseDuration', () => {
	it('liest ISO-Dauern', () => {
		expect(parseDuration('PT45M')).toBe(45);
		expect(parseDuration('PT1H15M')).toBe(75);
		expect(parseDuration('P0DT0H30M')).toBe(30);
		expect(parseDuration(['PT20M'])).toBe(20);
		expect(parseDuration('PT90S')).toBe(2);
	});

	it('verwirft Unsinn und Ausreißer', () => {
		expect(parseDuration('45 Minuten')).toBeNull();
		expect(parseDuration('PT')).toBeNull();
		expect(parseDuration('P')).toBeNull();
		expect(parseDuration('PT0M')).toBeNull();
		expect(parseDuration('P3D')).toBeNull();
		expect(parseDuration(undefined)).toBeNull();
	});
});

describe('parseYield', () => {
	it('findet die Portionenzahl', () => {
		expect(parseYield('4 Portionen')).toBe(4);
		expect(parseYield(2)).toBe(2);
		expect(parseYield(['6', '6 Stück'])).toBe(6);
		expect(parseYield('Für 3 Personen')).toBe(3);
	});

	it('ohne Zahl oder unplausibel: keine Angabe', () => {
		expect(parseYield('ein Blech')).toBeNull();
		expect(parseYield('0')).toBeNull();
		expect(parseYield('250')).toBeNull();
		expect(parseYield(null)).toBeNull();
	});
});

describe('plainText', () => {
	it('entfernt HTML und löst Entities auf', () => {
		expect(plainText('<p>Mehl &amp; Zucker</p>')).toBe('Mehl & Zucker');
		expect(plainText('1&frac12; TL Salz')).toBe('1½ TL Salz');
		expect(plainText('Kn&ouml;del &#8211; &#x27;fein&#x27;')).toBe("Knödel – 'fein'");
		expect(plainText('Zeile 1<br>Zeile 2')).toBe('Zeile 1\nZeile 2');
		expect(plainText(42)).toBe('42');
		expect(plainText({})).toBe('');
	});
});

describe('mapImportedRecipe', () => {
	it('übernimmt ein typisches Rezept (HowToStep, Zeiten getrennt)', () => {
		const result = mapImportedRecipe(
			{
				name: 'Spaghetti Bolognese',
				recipeYield: '4 Portionen',
				prepTime: 'PT20M',
				cookTime: 'PT1H',
				recipeIngredient: ['500 g Hackfleisch', '1 Dose Tomaten', ' Salz &amp; Pfeffer '],
				recipeInstructions: [
					{ '@type': 'HowToStep', text: 'Zwiebeln hacken.' },
					{ '@type': 'HowToStep', text: 'Hack <b>scharf</b> anbraten.' }
				],
				recipeCategory: 'Hauptspeise',
				recipeCuisine: ['Italien', 'hauptspeise']
			},
			'https://www.chefkoch.de/rezepte/1/bolo.html'
		);
		expect(result).toEqual({
			title: 'Spaghetti Bolognese',
			servings: 4,
			prepMinutes: 80,
			instructions: 'Zwiebeln hacken.\nHack scharf anbraten.',
			ingredientLines: ['500 g Hackfleisch', '1 Dose Tomaten', 'Salz & Pfeffer'],
			tags: ['Hauptspeise', 'Italien'],
			sourceUrl: 'https://www.chefkoch.de/rezepte/1/bolo.html'
		});
	});

	it('Gesamtzeit hat Vorrang; Abschnitte werden zu Zwischenüberschriften', () => {
		const result = mapImportedRecipe(
			{
				name: ['Apfelkuchen'],
				totalTime: 'PT1H30M',
				prepTime: 'PT20M',
				recipeInstructions: [
					{
						'@type': 'HowToSection',
						name: 'Teig',
						itemListElement: [{ '@type': 'HowToStep', text: 'Kneten.' }]
					},
					{
						'@type': 'HowToSection',
						name: 'Belag',
						itemListElement: [{ '@type': 'HowToStep', name: 'Äpfel schneiden.' }]
					}
				]
			},
			'https://example.org/kuchen'
		);
		expect(result.prepMinutes).toBe(90);
		expect(result.instructions).toBe('Teig:\nKneten.\nBelag:\nÄpfel schneiden.');
		expect(result.servings).toBeNull();
		expect(result.ingredientLines).toEqual([]);
	});

	it('Anleitung als ein Text mit Zeilenumbrüchen', () => {
		const result = mapImportedRecipe(
			{ name: 'Tee', recipeInstructions: 'Wasser kochen.<br/>Ziehen lassen.\n\nTrinken.' },
			''
		);
		expect(result.instructions).toBe('Wasser kochen.\nZiehen lassen.\nTrinken.');
	});

	it('kaputte Daten führen zu leeren Werten statt Fehlern', () => {
		expect(mapImportedRecipe(null, '')).toEqual({
			title: '',
			servings: null,
			prepMinutes: null,
			instructions: '',
			ingredientLines: [],
			tags: [],
			sourceUrl: ''
		});
		expect(
			mapImportedRecipe({ recipeIngredient: 'Mehl', recipeInstructions: 5 }, '').ingredientLines
		).toEqual(['Mehl']);
	});
});

describe('sourceLabel', () => {
	it('zeigt den kurzen Seitennamen', () => {
		expect(sourceLabel('https://www.chefkoch.de/rezepte/1')).toBe('chefkoch.de');
		expect(sourceLabel('http://Lecker.de:443/x')).toBe('lecker.de');
		expect(sourceLabel('kein link')).toBe('');
	});
});
