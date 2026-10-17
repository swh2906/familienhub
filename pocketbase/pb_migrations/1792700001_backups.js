/// <reference path="../pb_data/types.d.ts" />

// Schritt 10c: tägliche Backups (4 Uhr Serverzeit), die letzten 14 bleiben in pb_data/backups.
// Erstellen, Herunterladen und Zurückspielen geht in der Admin-Oberfläche (/_/ → Settings → Backups).

migrate(
	(app) => {
		const settings = app.settings();
		settings.backups.cron = '0 4 * * *';
		settings.backups.cronMaxKeep = 14;
		app.save(settings);
	},
	(app) => {
		const settings = app.settings();
		settings.backups.cron = '';
		app.save(settings);
	}
);
