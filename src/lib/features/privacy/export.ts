// Datenexport (DSGVO): alle Daten des Familienraums als JSON-Datei. Liest aus der lokalen
// Datenbank, funktioniert also auch offline. Gelöschte Einträge und Sync-Interna bleiben draußen;
// Einladungen (Hashes) liegen gar nicht lokal.
import type { FamilyDb } from '#lib/db/database.js';
import { COLLECTIONS, type CollectionName } from '#lib/db/types.js';

export interface FamilyExport {
	format: 'familienhub-export';
	version: 1;
	exported_at: string;
	household: string;
	data: Partial<Record<CollectionName, unknown[]>>;
}

type Row = { deleted_at?: string } & Record<string, unknown>;

/** Baut den Export aus den Tabellen; nur nicht gelöschte Einträge. */
export function buildExport(
	household: string,
	tables: Partial<Record<CollectionName, readonly Row[]>>,
	now: Date
): FamilyExport {
	const data: Partial<Record<CollectionName, unknown[]>> = {};
	for (const { name } of COLLECTIONS) {
		data[name] = (tables[name] ?? []).filter((row) => !row.deleted_at);
	}
	return {
		format: 'familienhub-export',
		version: 1,
		exported_at: now.toISOString(),
		household,
		data
	};
}

/** „familienhub-familie-mueller-2026-10-17.json“ */
export function exportFileName(householdName: string, now: Date): string {
	const slug =
		householdName
			.toLowerCase()
			.replace(/ä/g, 'ae')
			.replace(/ö/g, 'oe')
			.replace(/ü/g, 'ue')
			.replace(/ß/g, 'ss')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'familie';
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	return `familienhub-${slug}-${date}.json`;
}

/** Liest alle Tabellen aus der lokalen Datenbank und baut den Export. */
export async function readExport(db: FamilyDb, household: string, now = new Date()) {
	const tables: Partial<Record<CollectionName, Row[]>> = {};
	for (const { name } of COLLECTIONS) {
		tables[name] = (await db.collection(name).toArray()) as unknown as Row[];
	}
	return buildExport(household, tables, now);
}
