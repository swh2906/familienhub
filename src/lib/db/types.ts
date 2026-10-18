// Datentypen der synchronisierten Collections, wie sie lokal in Dexie liegen (Felder wie bei PocketBase).

/** Gemeinsame Felder aller Familien-Datensätze. `updated` ist leer, solange der Server sie noch nicht kennt. */
export interface BaseRecord {
	id: string;
	created: string;
	updated: string;
	updated_by: string;
	deleted_at: string;
}

export interface Household extends BaseRecord {
	name: string;
	timezone: string;
}

export interface Membership extends BaseRecord {
	user: string;
	household: string;
	role: 'admin' | 'adult' | 'child';
	color: string;
	display_name: string;
}

export interface Recipe extends BaseRecord {
	household: string;
	title: string;
	servings: number;
	instructions: string;
	tags: string[] | null;
	is_favorite: boolean;
	/** Dauer in Minuten, 0 = keine Angabe (fehlt bei älteren Rezepten). */
	prep_minutes?: number;
	/** 1 leicht, 2 mittel, 3 schwer; 0 = keine Angabe. */
	difficulty?: number;
}

export interface RecipeIngredient extends BaseRecord {
	recipe: string;
	name: string;
	amount: number;
	unit: string;
	category: string;
	sort: number;
}

export interface MealPlanEntry extends BaseRecord {
	household: string;
	date: string;
	slot: 'breakfast' | 'lunch' | 'dinner';
	/** Gericht als Text (z. B. „Gemüse-Lasagne“, „Reste“). */
	title: string;
	/** Link zum Rezept in einer anderen App (nur http/https). */
	recipe_url: string;
	/** Optional: Homi-Rezept. */
	recipe: string;
	note: string;
	servings: number;
}

export interface ShoppingItem extends BaseRecord {
	household: string;
	name: string;
	amount: number;
	unit: string;
	category: string;
	checked: boolean;
	checked_at: string;
	added_by: string;
	checked_by: string;
	meal_plan_entry: string;
}

export interface CalendarEvent extends BaseRecord {
	household: string;
	title: string;
	start: string;
	end: string;
	all_day: boolean;
	location: string;
	rrule: string;
	exdates: string[] | null;
	reminder_minutes: number;
	participants: string[];
}

export interface Task extends BaseRecord {
	household: string;
	title: string;
	notes: string;
	due_date: string;
	status: '' | 'open' | 'done';
	rrule: string;
	points: number;
	assignees: string[];
}

/** Testphase: Rückmeldung aus der Familie (Reiter „Feedback“ unter Aufgaben). */
export interface Feedback extends BaseRecord {
	household: string;
	text: string;
	/** Bereich der App, z. B. „Einkauf“. */
	area: string;
	/** Kurzbeschreibung des Geräts, z. B. „Handy · Android · Chrome“. */
	device: string;
	done: boolean;
	/** Mitgliedschaft der Person, die es geschrieben hat (setzt der Server). */
	created_by: string;
}

export interface TaskCompletion extends BaseRecord {
	task: string;
	membership: string;
	completed_at: string;
	points: number;
}

/** Name der Collection → Datentyp. */
export interface CollectionTypes {
	households: Household;
	memberships: Membership;
	recipes: Recipe;
	recipe_ingredients: RecipeIngredient;
	meal_plan_entries: MealPlanEntry;
	shopping_items: ShoppingItem;
	events: CalendarEvent;
	tasks: Task;
	task_completions: TaskCompletion;
	feedback: Feedback;
}

export type CollectionName = keyof CollectionTypes;

/**
 * Synchronisierte Collections mit dem Pfad zum Haushalt (für Filter bei Pull und Realtime).
 * Die Reihenfolge zählt beim ersten Abgleich: übergeordnete Datensätze zuerst.
 */
export const COLLECTIONS: readonly { name: CollectionName; scope: string }[] = [
	{ name: 'households', scope: 'id' },
	{ name: 'memberships', scope: 'household' },
	{ name: 'recipes', scope: 'household' },
	{ name: 'recipe_ingredients', scope: 'recipe.household' },
	{ name: 'meal_plan_entries', scope: 'household' },
	{ name: 'shopping_items', scope: 'household' },
	{ name: 'events', scope: 'household' },
	{ name: 'tasks', scope: 'household' },
	{ name: 'task_completions', scope: 'task.household' },
	{ name: 'feedback', scope: 'household' }
];

/** Felder, die nur der Server setzt; der Client schickt sie nie mit. */
export const SERVER_FIELDS = ['created', 'updated', 'updated_by'] as const;

/** Eine ausstehende Änderung in der Warteschlange (nur geänderte Felder). */
export interface OutboxEntry {
	seq?: number;
	collection: CollectionName;
	recordId: string;
	op: 'create' | 'update';
	fields: Record<string, unknown>;
	queuedAt: number;
	attempts: number;
	/** 1, solange die Änderung gerade gesendet wird (dann nicht mehr zusammenfassen). */
	inFlight: 0 | 1;
}

export interface MetaEntry {
	key: string;
	value: string;
}
