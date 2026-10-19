/// <reference path="../pb_data/types.d.ts" />

// Schritt 11 B: Vorrat als Buchungsjournal.
// - `pantry_events`: jede Änderung am Bestand ist eine eigene Buchung (Kauf, Verbrauch, Bestand,
//   „noch da“, Storno). Buchungen werden nie geändert oder gelöscht – Korrekturen sind neue
//   Buchungen. Alle Mitglieder dürfen buchen (auch Kinder haken Einkäufe ab).
// - `meal_plan_entries.cooked`: Antwort auf „Habt ihr … gekocht?“ (leer = noch nicht gefragt).

migrate(
	(app) => {
		const member = (h) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= "")`;
		const users = app.findCollectionByNameOrId('users');
		const households = app.findCollectionByNameOrId('households');
		const ingredients = app.findCollectionByNameOrId('ingredients');

		const events = new Collection({
			type: 'base',
			name: 'pantry_events',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'ingredient',
					type: 'relation',
					collectionId: ingredients.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{
					name: 'kind',
					type: 'select',
					values: ['purchase', 'consume', 'set', 'present', 'undo'],
					maxSelect: 1,
					required: true
				},
				{ name: 'amount', type: 'number', min: 0 },
				{ name: 'unit', type: 'text', max: 30 },
				{ name: 'at', type: 'date', required: true },
				{ name: 'ref', type: 'text', max: 15 },
				{ name: 'source', type: 'text', max: 60 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_pantry_events_household_updated ON pantry_events (household, updated)',
				'CREATE INDEX idx_pantry_events_ingredient ON pantry_events (ingredient)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: member('household'),
			updateRule: null,
			deleteRule: null
		});
		app.save(events);

		const plan = app.findCollectionByNameOrId('meal_plan_entries');
		plan.fields.add(new SelectField({ name: 'cooked', values: ['yes', 'no'], maxSelect: 1 }));
		app.save(plan);
	},
	(app) => {
		const plan = app.findCollectionByNameOrId('meal_plan_entries');
		plan.fields.removeByName('cooked');
		app.save(plan);
		app.delete(app.findCollectionByNameOrId('pantry_events'));
	}
);
