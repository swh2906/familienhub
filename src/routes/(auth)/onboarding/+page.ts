import { guardPage } from '#lib/auth/load.js';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url }) => {
	await guardPage('onboarding', url);
};
