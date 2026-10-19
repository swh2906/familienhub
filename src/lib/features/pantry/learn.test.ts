import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteLocalData } from '#lib/db/database.js';
import { repo } from '#lib/db/index.js';
import type { CorrectedIngredient } from '#lib/db/types.js';
import { saveRecipe } from '#lib/features/meals/store.js';
import { ingredientId, ingredientKey } from './catalog.js';
import {
	correctionKey,
	correctionMap,
	correctionsOf,
	learnAlias,
	learnCorrection
} from './learn.js';
import { ensureIngredients } from './store.js';

const H = 'household000001';
const item = (over: Partial<CorrectedIngredient>): CorrectedIngredient => ({
	name: 'Milch',
	amount: 0,
	unit: '',
	amountKind: 'exact',
	optional: false,
	alternatives: [],
	note: '',
	...over
});

afterEach(async () => {
	await deleteLocalData();
});

describe('Zeilen-Korrekturen', () => {
	it('Schlüssel ignoriert Groß-/Kleinschreibung, Leerraum und Aufzählungszeichen', () => {
		expect(correctionKey('  - 1 Schuss   Milch ')).toBe('1 schuss milch');
		expect(correctionKey('2) 1 Schuss Milch')).toBe('1 schuss milch');
		expect(correctionKey('1 Schuss Milch')).toBe('1 schuss milch');
	});

	it('speichert abweichende Ergebnisse und verwirft sie, wenn sie wieder automatisch passen', async () => {
		const auto = [item({ name: 'Schuss Milch', amount: 1 })];
		const fixed = [item({ amount: 50, unit: 'ml' })];
		await learnCorrection(H, '1 Schuss Milch', auto, fixed);
		let map = correctionMap(await correctionsOf(H));
		expect(map.get('1 schuss milch')).toEqual(fixed);

		// Gleiche Korrektur auf einem zweiten Gerät: dieselbe feste ID, kein Duplikat.
		await learnCorrection(H, '1 schuss milch', auto, fixed);
		expect(await correctionsOf(H)).toHaveLength(1);

		await learnCorrection(H, '1 Schuss Milch', auto, auto);
		map = correctionMap(await correctionsOf(H));
		expect(map.has('1 schuss milch')).toBe(false);
	});

	it('legt nichts an, wenn die Erkennung schon stimmt', async () => {
		const auto = [item({ amount: 200, unit: 'ml' })];
		await learnCorrection(H, '200 ml Milch', auto, auto);
		expect(await correctionsOf(H)).toHaveLength(0);
	});
});

describe('Schreibweisen lernen', () => {
	it('merkt sich eine abweichende Schreibweise am gewählten Artikel', async () => {
		const id = await learnAlias(H, 'Spätzlemehl', 'Mehl');
		expect(id).toBe(ingredientId(H, ingredientKey('Mehl')));
		const mehl = await repo('ingredients').get(id);
		expect(mehl?.aliases).toEqual(['Spätzlemehl']);

		// Ab jetzt landet die Schreibweise automatisch bei Mehl.
		const links = await ensureIngredients(H, ['spätzlemehl']);
		expect(links.get('spätzlemehl')).toBe(id);
	});

	it('lernt nichts, wenn die Schreibweise ohnehin zum Artikel führt', async () => {
		const id = await learnAlias(H, 'Weizenmehl Typ 405', 'Mehl');
		expect((await repo('ingredients').get(id))?.aliases).toEqual([]);
	});

	it('Rezept speichern nutzt den von Hand gewählten Basisartikel', async () => {
		const recipe = await saveRecipe(
			H,
			null,
			{
				title: 'Spätzle',
				servings: 4,
				tags: [],
				is_favorite: false,
				instructions: '',
				prep_minutes: 0,
				difficulty: 0
			},
			[{ name: 'Spätzlemehl', amount: 500, unit: 'g', category: '', base: 'Mehl' }]
		);
		const [row] = await repo('recipe_ingredients').table.where('recipe').equals(recipe).toArray();
		expect(row.ingredient).toBe(ingredientId(H, 'mehl'));
		expect(row).not.toHaveProperty('base');
	});
});
