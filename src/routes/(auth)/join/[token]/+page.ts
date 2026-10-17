// Einladungslink: ohne Umleitung, die Seite bietet Anmelden/Registrieren oder Beitreten an.
import { session } from '#lib/auth/session.svelte.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	await session.ready();
	return { token: params.token };
};
