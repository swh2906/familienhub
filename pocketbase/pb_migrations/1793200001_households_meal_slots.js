/// <reference path="../pb_data/types.d.ts" />

// Schritt 16: Welche Mahlzeiten die Familie plant (Frühstück, Mittag, Abend).
// Leer = alle drei (bestehende Familien sehen keinen Unterschied).
// Admin und Erwachsene dürfen das ändern; Erwachsene nur dieses Feld (Name, Zeitzone und
// Löschen bleiben dem Admin vorbehalten).

const member = (h, roles) =>
	`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
	` && @collection.memberships.deleted_at ?= ""` +
	(roles
		? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
		: '') +
	')';

migrate(
	(app) => {
		const households = app.findCollectionByNameOrId('households');
		households.fields.add(
			new SelectField({
				name: 'meal_slots',
				values: ['breakfast', 'lunch', 'dinner'],
				maxSelect: 3
			})
		);
		const slotsOnly =
			`(${member('id', ['adult'])}` +
			['name', 'timezone', 'deleted_at']
				.map((field) => ` && @request.body.${field}:changed = false`)
				.join('') +
			')';
		households.updateRule = `${member('id', ['admin'])} || ${slotsOnly}`;
		app.save(households);
	},
	(app) => {
		const households = app.findCollectionByNameOrId('households');
		households.fields.removeByName('meal_slots');
		households.updateRule = member('id', ['admin']);
		app.save(households);
	}
);
