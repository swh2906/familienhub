// Zugriff der Oberfläche auf die lokale Datenbank: ein Repository pro Collection.
import { getDb } from './database.js';
import { Repository } from './repository.js';
import type { CollectionName } from './types.js';

export function repo<N extends CollectionName>(name: N): Repository<N> {
	return new Repository(getDb(), name);
}

export type * from './types.js';
