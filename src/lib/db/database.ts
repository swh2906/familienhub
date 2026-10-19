// Lokale Datenbank (IndexedDB über Dexie). Die Oberfläche liest und schreibt nur hier;
// das Sync-Modul gleicht im Hintergrund mit PocketBase ab.
import { Dexie, type Table } from 'dexie';
import type { CollectionName, CollectionTypes, MetaEntry, OutboxEntry } from './types.js';

export const DB_NAME = 'familienhub';

export class FamilyDb extends Dexie {
	households!: Table<CollectionTypes['households'], string>;
	memberships!: Table<CollectionTypes['memberships'], string>;
	recipes!: Table<CollectionTypes['recipes'], string>;
	ingredients!: Table<CollectionTypes['ingredients'], string>;
	parse_corrections!: Table<CollectionTypes['parse_corrections'], string>;
	pantry_events!: Table<CollectionTypes['pantry_events'], string>;
	recipe_ingredients!: Table<CollectionTypes['recipe_ingredients'], string>;
	meal_plan_entries!: Table<CollectionTypes['meal_plan_entries'], string>;
	shopping_items!: Table<CollectionTypes['shopping_items'], string>;
	events!: Table<CollectionTypes['events'], string>;
	tasks!: Table<CollectionTypes['tasks'], string>;
	task_completions!: Table<CollectionTypes['task_completions'], string>;
	feedback!: Table<CollectionTypes['feedback'], string>;
	outbox!: Table<OutboxEntry, number>;
	meta!: Table<MetaEntry, string>;

	constructor(name = DB_NAME) {
		super(name);
		// Erstes Feld = Primärschlüssel, danach Indizes für Abfragen.
		this.version(1).stores({
			households: 'id, updated',
			memberships: 'id, household, user, updated',
			recipes: 'id, household, updated',
			recipe_ingredients: 'id, recipe, updated',
			meal_plan_entries: 'id, household, date, updated',
			shopping_items: 'id, household, updated',
			events: 'id, household, start, updated',
			tasks: 'id, household, updated',
			task_completions: 'id, task, updated',
			outbox: '++seq, [collection+recordId]',
			meta: 'key'
		});
		// Version 2: Feedback der Testphase.
		this.version(2).stores({ feedback: 'id, household, updated' });
		// Version 3: Basisartikel; Rezept-Zutaten zusätzlich nach Basisartikel abfragbar.
		this.version(3).stores({
			ingredients: 'id, household, key, updated',
			recipe_ingredients: 'id, recipe, ingredient, updated'
		});
		// Version 4: gelernte Korrekturen der Zutatenerkennung.
		this.version(4).stores({ parse_corrections: 'id, household, key, updated' });
		// Version 5: Vorrat (Buchungsjournal).
		this.version(5).stores({ pantry_events: 'id, household, ingredient, source, updated' });
	}

	/** Tabelle einer Collection; der Rückgabetyp passt zur Collection. */
	collection<N extends CollectionName>(name: N): Table<CollectionTypes[N], string> {
		return this.table(name) as Table<CollectionTypes[N], string>;
	}
}

let instance: FamilyDb | null = null;

/** Gemeinsame Datenbank der App (im Browser). */
export function getDb(): FamilyDb {
	instance ??= new FamilyDb();
	return instance;
}

/** Löscht alle lokalen Daten (beim Abmelden). */
export async function deleteLocalData(): Promise<void> {
	const db = getDb();
	db.close();
	await db.delete();
	instance = null;
}
