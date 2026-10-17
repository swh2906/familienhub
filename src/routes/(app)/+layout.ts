// App-Seiten brauchen Anmeldung und einen Familienraum.
import { guardPage } from '#lib/auth/load.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
	await guardPage('app', url);
};
