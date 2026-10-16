# FamilienHub

Familien-Organisations-App: Essensplan, Einkaufsliste, Kalender und Aufgaben. Läuft offline und synchronisiert live zwischen allen Geräten der Familie.

Konzept und Entscheidungen: [CLAUDE.md](CLAUDE.md) · Umsetzungsplan: [PLAN.md](PLAN.md)

## Voraussetzungen

| Werkzeug | Version | Hinweis                                                           |
| -------- | ------- | ----------------------------------------------------------------- |
| Git      | aktuell |                                                                   |
| Node.js  | 24 LTS  | siehe `.nvmrc`                                                    |
| pnpm     | 11.28.6 | über Corepack, Version steht in `package.json` (`packageManager`) |

pnpm aktivieren (einmalig):

```bash
corepack enable
```

Ohne Administratorrechte (z. B. Firmen-Windows) klappt das nicht. Dann den pnpm-Starter in den Benutzerordner legen:

```bash
corepack enable --install-directory "$(npm config get prefix)" pnpm
```

## Installation und Start

```bash
pnpm install
pnpm pb:download
pnpm dev
```

- `pnpm pb:download` lädt die in `pocketbase/VERSION` festgelegte PocketBase für dein System (Windows, macOS, Linux; x64 oder ARM), prüft die Prüfsumme und legt sie nach `pocketbase/bin/`.
- `pnpm dev` startet PocketBase und die App zusammen. **Strg+C** beendet beide.

| Was                         | Adresse                    |
| --------------------------- | -------------------------- |
| App (Entwicklung)           | http://localhost:5173      |
| PocketBase-Admin-Oberfläche | http://127.0.0.1:8090/_/   |
| PocketBase-API              | http://127.0.0.1:8090/api/ |

Beim ersten Start zeigt PocketBase in der Konsole einen Link zum Anlegen des Admin-Kontos (Superuser). Die App erreicht PocketBase über den Vite-Proxy (`/api`, `/_/`) unter derselben Adresse, daher gibt es keine CORS-Probleme.

## Befehle

| Befehl                  | Zweck                                              |
| ----------------------- | -------------------------------------------------- |
| `pnpm dev`              | PocketBase + App starten                           |
| `pnpm dev:web`          | nur die App (Vite) starten                         |
| `pnpm build`            | App bauen und nach `pocketbase/pb_public` kopieren |
| `pnpm preview`          | gebaute App lokal ansehen (Port 4173)              |
| `pnpm check`            | TypeScript- und Svelte-Prüfung                     |
| `pnpm lint`             | Formatierung (Prettier) und ESLint prüfen          |
| `pnpm format`           | Code automatisch formatieren                       |
| `pnpm test`             | Unit-Tests (Vitest)                                |
| `pnpm test:e2e:install` | Browser für E2E-Tests einmalig herunterladen       |
| `pnpm test:e2e`         | E2E-Tests (Playwright, Handy- und Desktop-Ansicht) |
| `pnpm pb:download`      | PocketBase herunterladen (`--force` lädt neu)      |

Nach `pnpm build` liefert PocketBase die App selbst aus: `pocketbase/bin/pocketbase serve` und dann http://127.0.0.1:8090 öffnen.

## Projektstruktur

```
├─ CLAUDE.md, PLAN.md     Konzept und Umsetzungsplan
├─ src/
│  ├─ lib/
│  │  ├─ pb/              PocketBase-Client (nur vom Sync-Modul genutzt, per ESLint erzwungen)
│  │  ├─ db/              Dexie-Schema (ab Schritt 4)
│  │  ├─ sync/            Sync-Modul (ab Schritt 4)
│  │  ├─ features/        household, shopping, tasks, calendar, meals, today
│  │  ├─ ui/              gemeinsame Komponenten, Theme (CSS-Variablen Hell/Dunkel, Akzentfarben)
│  │  └─ paraglide/       generierte Übersetzungsfunktionen (nicht bearbeiten)
│  └─ routes/             Seiten: / (Heute), /essen, /einkauf, /kalender, /aufgaben, /einstellungen
├─ messages/de.json       alle Texte der Oberfläche (Paraglide)
├─ project.inlang/        Paraglide-Einstellungen
├─ pocketbase/
│  ├─ VERSION             gepinnte PocketBase-Version
│  ├─ pb_migrations/      Datenbank-Schema als Migrationen
│  ├─ pb_hooks/           serverseitige Erweiterungen (JavaScript)
│  ├─ bin/                heruntergeladene PocketBase (nicht im Git)
│  ├─ pb_data/            Datenbank (nicht im Git)
│  └─ pb_public/          gebaute App (nicht im Git)
├─ scripts/               Hilfsskripte in TypeScript (laufen direkt mit Node 24)
├─ tests/e2e/             Playwright-Tests
└─ static/                statische Dateien
```

## Texte und Übersetzungen

Alle sichtbaren Texte stehen in `messages/de.json` und werden in Komponenten über `m.schluessel()` verwendet:

```svelte
<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
</script>

<h1>{m.nav_today()}</h1>
```

Hinweis: Paraglide lädt seine Plugins beim Kompilieren einmalig von jsdelivr (siehe `project.inlang/settings.json`) und speichert sie in `project.inlang/cache/`. Die fertige App lädt nichts von fremden Servern.

## PocketBase aktualisieren

1. Changelog lesen: https://github.com/pocketbase/pocketbase/releases
2. Neue Version in `pocketbase/VERSION` eintragen.
3. `pnpm pb:download` ausführen und alle Tests laufen lassen.
