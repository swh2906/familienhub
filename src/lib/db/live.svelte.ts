// Brücke von Dexie-liveQuery zu Svelte 5: Ergebnis als reaktiver Wert, der sich bei jeder Änderung
// der Datenbank aktualisiert (auch durch den Sync von anderen Geräten).
import { liveQuery } from 'dexie';

export interface LiveValue<T> {
	readonly current: T;
	/** true, sobald das erste Ergebnis da ist (für Ladezustände). */
	readonly loaded: boolean;
}

/**
 * Muss beim Initialisieren einer Komponente aufgerufen werden.
 * `deps` liefert die Eingaben (z. B. Haushalt, Rezept-ID); ändern sie sich, startet die Abfrage neu.
 */
export function live<D, T>(
	deps: () => D,
	query: (deps: D) => Promise<T>,
	initial: T
): LiveValue<T> {
	let current = $state.raw(initial);
	let loaded = $state(false);

	$effect(() => {
		const input = deps();
		const subscription = liveQuery(() => query(input)).subscribe({
			next: (value) => {
				current = value;
				loaded = true;
			},
			error: (error: unknown) => console.error('Abfrage fehlgeschlagen', error)
		});
		return () => subscription.unsubscribe();
	});

	return {
		get current() {
			return current;
		},
		get loaded() {
			return loaded;
		}
	};
}
