/// <reference path="../pb_data/types.d.ts" />

// Schritt 13: Anmeldung 365 statt 7 Tage gültig. Die App verlängert sie bei jedem Start; so muss
// sich praktisch niemand neu anmelden, auch nach langer Zeit ohne Verbindung zum Server.
// Abhilfe bei verlorenem Gerät: Passwort ändern (macht alle Anmeldungen ungültig) oder Mitglied entfernen.

const YEAR = 365 * 24 * 60 * 60;
const WEEK = 7 * 24 * 60 * 60;

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.authToken.duration = YEAR;
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.authToken.duration = WEEK;
		app.save(users);
	}
);
