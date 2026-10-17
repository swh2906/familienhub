// „Essen“ öffnet bis zum Wochenplan (Schritt 8) direkt die Rezepte.
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	redirect(307, resolve('/(app)/essen/rezepte'));
};
