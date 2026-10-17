import { describe, expect, it } from 'vitest';
import { redirectFor, safeNext } from './guard.js';

const guest = { loggedIn: false, hasHousehold: false };
const newcomer = { loggedIn: true, hasHousehold: false };
const member = { loggedIn: true, hasHousehold: true };

describe('safeNext', () => {
	it('lässt interne Pfade zu', () => {
		expect(safeNext('/einkauf')).toBe('/einkauf');
		expect(safeNext('/join/abc?x=1')).toBe('/join/abc?x=1');
	});

	it('verwirft leere, externe und präparierte Ziele', () => {
		for (const value of [
			null,
			undefined,
			'',
			'einkauf',
			'https://evil.test',
			'//evil.test',
			'/\\evil.test'
		]) {
			expect(safeNext(value)).toBeNull();
		}
	});
});

describe('redirectFor', () => {
	it('App-Seiten: ohne Anmeldung zum Login mit Rücksprung, ohne Familie zum Onboarding', () => {
		expect(redirectFor('app', guest, '/einkauf')).toBe('/login?next=%2Feinkauf');
		expect(redirectFor('app', newcomer, '/einkauf')).toBe('/onboarding');
		expect(redirectFor('app', member, '/einkauf')).toBeNull();
	});

	it('Anmelden/Registrieren: nur für Gäste, danach zum Rücksprungziel oder Onboarding', () => {
		expect(redirectFor('guest', guest, '/login')).toBeNull();
		expect(redirectFor('guest', member, '/login', '/kalender')).toBe('/kalender');
		expect(redirectFor('guest', member, '/login', '//evil.test')).toBe('/');
		expect(redirectFor('guest', newcomer, '/login', '/kalender')).toBe('/onboarding');
		expect(redirectFor('guest', newcomer, '/login', '/join/abc')).toBe('/join/abc');
	});

	it('Onboarding: braucht Anmeldung, mit Familie geht es weiter', () => {
		expect(redirectFor('onboarding', guest, '/onboarding')).toBe('/login?next=%2Fonboarding');
		expect(redirectFor('onboarding', newcomer, '/onboarding')).toBeNull();
		expect(redirectFor('onboarding', member, '/onboarding')).toBe('/');
	});
});
