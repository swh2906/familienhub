# Homi – euer Familienplaner

Familien-Organisations-App (technischer Name: `familienhub` – Repo, Docker-Image, Datenbank): Essensplan, Einkaufsliste, Kalender und Aufgaben. Läuft offline und synchronisiert live zwischen allen Geräten der Familie.

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

| Befehl                  | Zweck                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`              | PocketBase + App starten                                                  |
| `pnpm dev:web`          | nur die App (Vite) starten                                                |
| `pnpm build`            | App bauen und nach `pocketbase/pb_public` kopieren                        |
| `pnpm preview`          | gebaute App lokal ansehen (Port 4173)                                     |
| `pnpm check`            | TypeScript- und Svelte-Prüfung                                            |
| `pnpm lint`             | Formatierung (Prettier) und ESLint prüfen                                 |
| `pnpm format`           | Code automatisch formatieren                                              |
| `pnpm test`             | Unit-Tests (Vitest)                                                       |
| `pnpm test:integration` | Rechte-Tests gegen ein temporäres PocketBase                              |
| `pnpm test:e2e:install` | Browser für E2E-Tests einmalig herunterladen                              |
| `pnpm test:e2e`         | E2E-Tests (Playwright, Handy + Desktop, eigenes PocketBase auf Port 8091) |
| `pnpm pb:download`      | PocketBase herunterladen (`--force` lädt neu)                             |
| `pnpm seed`             | Demo-Familie anlegen (PocketBase muss laufen)                             |
| `pnpm docker:smoke`     | Docker-Image bauen und mit 128 MB RAM testen (Docker nötig)               |
| `pnpm icons`            | App-Icons (PNG) in `static/icons/` neu erzeugen                           |

Nach `pnpm build` liefert PocketBase die App selbst aus: `pocketbase/bin/pocketbase serve` und dann http://127.0.0.1:8090 öffnen.

## Offline und Sync

Die Oberfläche liest und schreibt nur in die lokale Datenbank (`repo('shopping_items').create(…)` aus `#lib/db`). Jede Änderung landet zusätzlich in einer Warteschlange (Outbox) und wird im Hintergrund gesendet:

```mermaid
flowchart LR
  UI[Oberfläche] -->|create/update/remove| Dexie[(Lokale DB)]
  Dexie -->|Outbox, der Reihe nach| PB[(PocketBase)]
  PB -->|Änderungen seit lastSync| Dexie
  PB -->|Live-Updates| Dexie
  Dexie -->|liveQuery| UI
```

- Ohne Verbindung arbeitet die App normal weiter; die Kopfzeile zeigt „Offline“ bzw. „N ausstehend“.
- Konflikte: pro Feld gewinnt die zuletzt beim Server angekommene Änderung.
- Lehnt der Server eine Änderung ab (z. B. fehlende Rechte), wird sie zurückgesetzt und ein Hinweis angezeigt.
- Abmelden löscht die lokale Datenbank.

## App installieren (PWA) und Barrierefreiheit

- Die gebaute App ist installierbar (Manifest `static/manifest.webmanifest`, Icons aus `pnpm icons`). Installation und Service Worker brauchen HTTPS (oder `localhost`).
- Der Service Worker (`src/service-worker/`) speichert beim ersten Besuch die komplette App, danach startet sie auch ohne Netz. Die Daten kommen nie aus diesem Cache, sondern aus der lokalen Datenbank; `/api` und `/_/` gehen immer direkt an PocketBase.
- Nach einem Update erscheint „Neue Version verfügbar“. Erst „Neu laden“ aktiviert sie, damit keine Eingaben verloren gehen.
- Tastatur: Der erste Tab-Stopp ist „Zum Inhalt springen“; die Taste **N** startet „Neu“ (Aufgabe, Termin, Rezept, Einkaufsfeld).
- `pnpm test:e2e` prüft alle Seiten mit axe (WCAG 2.1 AA) in Hell und Dunkel sowie den Offline-Start.

## Kochansicht

Auf jeder Rezeptseite öffnet „Kochen“ das Rezept als linierte Karteikarte (Prinzip aus der COOK-App): bildschirmfüllend, große Schrift, Portionen umrechnen, Zutaten abhaken (nur lokal), Bildschirm bleibt an (Wake Lock, wo der Browser es kann). Schwierigkeit (Kochmützen) und Dauer setzen Admins und Erwachsene; die Handschrift „Patrick Hand“ liegt lokal in `static/fonts/` (SIL Open Font License, keine externen Schriften).

## Datenschutz

- **Datenexport** (Einstellungen → Daten und Konto): alle Daten der Familie als JSON-Datei, direkt aus der lokalen Datenbank (geht auch offline). Gelöschte Einträge und Einladungen sind nicht enthalten.
- **Konto löschen**: mit Passwort. Das Konto verschwindet, die Mitgliedschaft bleibt ohne Namen bestehen; Einträge zeigen „Ehemaliges Mitglied“. Der letzte Admin muss vorher die Admin-Rolle übergeben oder den Familienraum löschen.
- **Familienraum löschen** (Admin): mit dem Namen als Bestätigung; alle Daten werden sofort endgültig gelöscht. Andere Geräte merken das beim nächsten Abgleich und verwerfen ihre lokalen Daten (ebenso, wenn jemand aus der Familie entfernt wurde).
- **Aufräum-Job**: Gelöschte Einträge (`deleted_at`) werden nach 30 Tagen endgültig entfernt, täglich um 3:30 Uhr (Serverzeit). Mitgliedschaften bleiben für „Ehemaliges Mitglied“.

## Datenmodell und Rechte

- Das Schema entsteht ausschließlich über Migrationen in `pocketbase/pb_migrations/` (eine Datei pro Collection). PocketBase wendet sie beim Start automatisch an; eine leere Datenbank hat nach `pnpm dev` sofort das komplette Schema.
- Die Rechte aus der Tabelle in `CLAUDE.md` stecken in den API-Regeln der Migrationen. Grundregel: Zugriff nur mit aktiver Mitgliedschaft (`memberships`, `deleted_at` leer) im selben Haushalt.
- `pocketbase/pb_hooks/` ergänzt, was Regeln allein nicht sicher können: `updated_by`, `added_by`, `checked_by`/`checked_at` setzt der Server; Verknüpfungen müssen zum selben Haushalt gehören; der letzte Admin bleibt Admin.
- Eigene Routen (nur angemeldet):

  | Route                            | Zweck                                                                    |
  | -------------------------------- | ------------------------------------------------------------------------ |
  | `POST /api/fh/households`        | Familienraum anlegen, das Konto wird Admin (eine Transaktion)            |
  | `POST /api/fh/invites`           | Admin: Link (7 Tage) und Code (24 Std.) erzeugen, nur Hashes gespeichert |
  | `POST /api/fh/invites/redeem`    | Mit Link-Token oder Code beitreten; Fehlversuche werden gedrosselt       |
  | `POST /api/fh/children`          | Admin: Kinderkonto mit Benutzername und Passwort anlegen                 |
  | `POST /api/fh/account/delete`    | Eigenes Konto löschen (Passwort); der letzte Admin muss erst übergeben   |
  | `POST /api/fh/households/delete` | Admin: Familienraum mit allen Daten löschen (Name zur Bestätigung)       |
  | `POST /api/fh/purge`             | Nur Superuser: Aufräum-Job sofort ausführen                              |

- Mitgliedschaften entstehen nur über diese Routen; direktes Anlegen über die API und direktes Löschen eines Familienraums sind gesperrt.
- `pnpm test:integration` startet PocketBase mit leerem Datenordner auf einem freien Port und prüft jede Regel mit Admin, Erwachsenem, Kind, entferntem Mitglied und fremdem Haushalt.
- `pnpm seed` legt die Demo-Familie an: `julia@demo.familienhub.test` (Admin), `tom@demo.familienhub.test` (Erwachsener), Benutzername `mia` (Kind), Passwort jeweils `demo-passwort`.

## Projektstruktur

```
├─ CLAUDE.md, PLAN.md     Konzept und Umsetzungsplan
├─ src/
│  ├─ lib/
│  │  ├─ pb/              PocketBase-Client (nur Sync- und Auth-Modul, per ESLint erzwungen)
│  │  ├─ auth/            Anmeldung, Sitzung, Familienraum verwalten (nur online)
│  │  ├─ db/              lokale Datenbank (Dexie): Schema, IDs, Repositories – hier liest/schreibt die Oberfläche
│  │  ├─ sync/            Abgleich mit PocketBase: Outbox senden, Änderungen holen, Live-Updates, Status
│  │  ├─ testing/         Test-Zugang für E2E (nur im Build mit VITE_E2E=1)
│  │  ├─ features/        household, shopping, tasks, calendar, meals, today
│  │  ├─ ui/              gemeinsame Komponenten, Theme (CSS-Variablen Hell/Dunkel, Akzentfarben)
│  │  └─ paraglide/       generierte Übersetzungsfunktionen (nicht bearbeiten)
│  ├─ service-worker/   Offline-Cache der App (eigene tsconfig mit WebWorker-Typen)
│  └─ routes/
│     ├─ (app)/           mit Navigation, Anmeldung nötig: / (Heute), /essen (/rezepte, /wochenplan), /einkauf, /kalender, /aufgaben, /einstellungen
│     └─ (auth)/          ohne Navigation: /login, /register, /onboarding, /join/[token]
├─ messages/de.json       alle Texte der Oberfläche (Paraglide)
├─ project.inlang/        Paraglide-Einstellungen
├─ pocketbase/
│  ├─ VERSION             gepinnte PocketBase-Version
│  ├─ pb_migrations/      Datenbank-Schema und API-Regeln als Migrationen
│  ├─ pb_hooks/           serverseitige Ergänzungen zu den Regeln (JavaScript)
│  ├─ bin/                heruntergeladene PocketBase (nicht im Git)
│  ├─ pb_data/            Datenbank (nicht im Git)
│  └─ pb_public/          gebaute App (nicht im Git)
├─ Dockerfile             Image für den Server (PocketBase + App)
├─ deploy/zimaos/         Compose-Datei für ZimaOS (mit Tailscale für HTTPS)
├─ .github/workflows/     baut das Docker-Image bei jedem Merge auf main
├─ scripts/               Hilfsskripte in TypeScript (laufen direkt mit Node 24)
├─ tests/e2e/             Playwright-Tests
├─ tests/integration/     Rechte-Tests gegen echtes PocketBase (Vitest)
└─ static/                statische Dateien: Manifest, Icons
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
4. Nach dem Merge baut GitHub ein neues Docker-Image; auf dem Server die App aktualisieren (siehe unten).

## Betrieb auf ZimaOS

Die App läuft als ZimaOS-App aus zwei Containern (zusammen ca. 50 MB RAM):

- **familienhub**: PocketBase mit der gebauten App, Image `ghcr.io/swh2906/familienhub:latest` (x86 und ARM, gebaut von `.github/workflows/docker.yml` bei jedem Merge auf `main`).
- **tailscale**: macht die App per HTTPS unter `https://familienhub.<euer-tailnet>.ts.net` erreichbar. HTTPS ist nötig, damit sich die App installieren lässt und offline startet. Am Router muss nichts freigegeben werden.

Ohne Tailscale ist die App im Heimnetz unter `http://<zima-ip>:8090` erreichbar, aber nur im Browser (ohne Installation und Offline-Start). Dafür gibt es die schlanke Variante `deploy/zimaos/docker-compose.lan.yml` (nur FamilienHub, kein Tailscale-Key nötig).

### Einmalig einrichten

1. **Image öffentlich machen** (nur beim allerersten Mal): GitHub → Profil → Packages → `familienhub` → Package settings → „Change visibility“ → Public. Das Image enthält nur den App-Code, keine Daten oder Zugangsdaten.
2. **Tailscale vorbereiten**: Konto unter https://login.tailscale.com anlegen. Unter DNS „MagicDNS“ und „HTTPS Certificates“ aktivieren. Unter Settings → Keys einen Auth-Key erzeugen („Pre-approved“ an, „Reusable“ aus).
3. **App installieren**: ZimaOS → App-Store → „+“ → „Benutzerdefinierte App installieren“ → „Importieren“ → Inhalt von `deploy/zimaos/docker-compose.yml` einfügen, `tskey-auth-HIER-EINTRAGEN` durch den Auth-Key ersetzen, installieren.
4. **Admin-Konto für PocketBase anlegen**: im ZimaOS-Terminal (oder per SSH)
   `docker exec familienhub /pb/pocketbase superuser upsert eure@email.de EIN-LANGES-PASSWORT --dir /pb/pb_data`
   Die Admin-Oberfläche liegt unter `https://familienhub.<tailnet>.ts.net/_/` bzw. `http://<zima-ip>:8090/_/`.
5. **Geräte einbinden**: Auf jedem Familiengerät die Tailscale-App installieren und im selben Tailnet anmelden (Kinder-Geräte: Familienmitglied einladen oder mit dem eigenen Konto anmelden). Dann die Adresse im Browser öffnen, registrieren bzw. einladen und „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.

### Aktualisieren

ZimaOS → App `familienhub` → „Aktualisieren“ (oder `docker compose pull && docker compose up -d`). Migrationen laufen beim Start automatisch. Vorher in der Admin-Oberfläche ein Backup erstellen.

### Backups

- PocketBase erstellt täglich um 4 Uhr ein Backup (ZIP der Datenbank), die letzten 14 bleiben in `/DATA/AppData/familienhub/pb_data/backups`.
- Von Hand: Admin-Oberfläche → Settings → Backups → „Initialize new backup“; dort lässt sich jedes Backup auch herunterladen.
- **Zurückspielen**: Admin-Oberfläche → Settings → Backups → beim gewünschten Backup „Restore“. PocketBase startet danach neu. Einmal testweise durchspielen, z. B. direkt nach der Einrichtung.
- Eine Kopie außer Haus (z. B. verschlüsselt auf eine USB-Platte) ist für später geplant; bis dahin gelegentlich ein Backup herunterladen.

### Testlauf vor einem Release

`pnpm docker:smoke` baut das Image lokal, startet es mit 128 MB RAM und prüft App, API, Migrationen und dass Daten einen Neustart überstehen.
