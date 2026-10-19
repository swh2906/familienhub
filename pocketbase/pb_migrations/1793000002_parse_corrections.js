/// <reference path="../pb_data/types.d.ts" />

// Schritt 11 A3: gelernte Korrekturen der Zutatenerkennung. Korrigiert jemand eine eingefügte Zeile
// („1 Schuss Milch“ → 50 ml Milch), wird dieselbe Zeile beim nächsten Einfügen gleich richtig erkannt.
// Schlüssel = normalisierte Zeile, je Familie eindeutig (feste ID daraus, siehe pantry/learn.ts).

migrate(
	(app) => {
		const member = (h, roles) =>
			`(@collection.memberships.user ?= @request.auth.id && @collection.memberships.household ?= ${h}` +
			` && @collection.memberships.deleted_at ?= ""` +
			(roles
				? ` && (${roles.map((r) => `@collection.memberships.role ?= "${r}"`).join(' || ')})`
				: '') +
			')';
		const editor = member('household', ['admin', 'adult']);
		const users = app.findCollectionByNameOrId('users');
		const households = app.findCollectionByNameOrId('households');

		const corrections = new Collection({
			type: 'base',
			name: 'parse_corrections',
			fields: [
				{
					name: 'household',
					type: 'relation',
					collectionId: households.id,
					maxSelect: 1,
					required: true,
					cascadeDelete: true
				},
				{ name: 'key', type: 'text', required: true, max: 300 },
				{ name: 'input', type: 'text', max: 300 },
				{ name: 'result', type: 'json', maxSize: 4000 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'deleted_at', type: 'date' },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE INDEX idx_parse_corrections_household_updated ON parse_corrections (household, updated)',
				'CREATE UNIQUE INDEX idx_parse_corrections_household_key ON parse_corrections (household, key)'
			],
			listRule: member('household'),
			viewRule: member('household'),
			createRule: editor,
			updateRule: `@request.body.household:changed = false && ${editor}`,
			deleteRule: null
		});
		app.save(corrections);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('parse_corrections'));
	}
);
