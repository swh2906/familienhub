# Homi – euer Familienplaner

Familien-Organisations-App (früher Arbeitstitel FamilienHub; technischer Name `familienhub` bleibt für Repo, Docker-Image, Datenbank und Pfade). Logo: kleines Haus aus einem H (`src/lib/ui/Logo.svelte`, Icons per `pnpm icons`): Essensplan, Einkaufsliste, Kalender, Aufgaben.
Zunächst nur für die eigene Familie. Muss offline laufen und zwischen allen Geräten live synchronisieren.

Vollständiges Konzept (Architektur, Datenmodell, Sitemap): https://claude.ai/code/artifact/b4c6f53d-62d6-4e5d-b778-065028f162c0

## Über den Entwickler

- Wenig bis keine Erfahrung mit TypeScript und Frameworks. Erkläre kurz, was du tust und warum, ohne zu dozieren.
- Entwickelt abwechselnd auf Linux, Windows und ggf. macOS. Alles muss auf allen drei Systemen identisch funktionieren.
- Keine Bash-only-Skripte: Hilfsskripte in Node/TypeScript, Pfade plattformneutral.

## Getroffene Entscheidungen

| Bereich | Entscheidung |
| --- | --- |
| Frontend | SvelteKit (Svelte 5) + TypeScript (strict), reine SPA (`adapter-static`, `ssr = false`), als PWA |
| Sync-Dienst / Backend | PocketBase (Go-Binary, SQLite): API, Auth, Rechte-Regeln, Realtime (SSE), liefert die gebaute App aus `pb_public` aus |
| Lokale Daten | Dexie (IndexedDB) |
| PWA | Eingebauter SvelteKit-Service-Worker (`src/service-worker/`) + statisches Manifest; vite-plugin-pwa unterstützt SvelteKit 3 nicht |
| i18n | Paraglide JS, Deutsch Standard |
| Styling | Eigenes CSS mit Custom Properties (Hell/Dunkel, Mitgliedsfarben). Bits UI nur für barrierearme Dialoge/Menüs |
| Wiederholungen | rrule (RFC 5545) |
| Tests | Vitest (Logik), Playwright (E2E) |
| Werkzeuge | Node LTS, pnpm, ESLint, Prettier |
| Hosting | Mini-PC mit ZimaOS: Docker-Image (`ghcr.io/swh2906/familienhub`, öffentlich) + Tailscale-Beiwagen für HTTPS im Heimnetz (`deploy/zimaos/`). Während der Entwicklung läuft PocketBase lokal |

PocketBase ist noch vor 1.0: Version fest pinnen, Schema nur über Migrationen in `pb_migrations/`, vor Updates Changelog lesen.

## Architektur in Kürze

- Die Oberfläche liest und schreibt **nur** in Dexie. Nie direkt auf PocketBase aus Komponenten zugreifen.
  Ausnahme: `src/lib/auth/` (Anmeldung, Familienraum, Einladungen, Mitglieder), das geht nur online.
- Sync-Modul (`src/lib/sync/`):
  - Schreiben: Dexie + Eintrag in Outbox (nur geänderte Felder).
  - Online: Outbox der Reihe nach senden, danach Delta-Pull aller Datensätze mit `updated > lastSync`.
  - Realtime: Abo pro Collection, gefiltert auf den Haushalt; eingehende Änderungen nach Dexie.
  - IDs werden auf dem Gerät erzeugt (15 Zeichen, PocketBase-Format).
  - Löschen = `deleted_at` setzen; Aufräum-Job entfernt nach 30 Tagen.
  - Konflikte: pro Feld gewinnt die zuletzt beim Server angekommene Änderung.
  - Sync-Status (online/offline/ausstehend) als Store für die Kopfzeile.
- Das Sync-Modul ist gekapselt und gut getestet, damit es austauschbar bleibt (Plan B: Jazz).

## Datenmodell (PocketBase-Collections)

Gemeinsame Felder aller Familien-Tabellen: `id`, `created`, `updated`, `updated_by`, `deleted_at`.

| Collection | Wichtige Felder | Verweist auf |
| --- | --- | --- |
| `users` (Auth) | `name`, `email` (Erwachsene), `username` (Kinder) | – |
| `households` | `name`, `timezone` | – |
| `memberships` | `role` (admin, adult, child), `color`, `display_name` | `users`, `households` |
| `invites` | `token_hash`, `code_hash`, `role`, `expires_at`, `uses_left`, `revoked` | `households`, `memberships` |
| `recipes` | `title`, `servings`, `instructions`, `tags[]`, `is_favorite`, `prep_minutes`, `difficulty` (0–3) | `households` |
| `ingredients` (Basisartikel) | `name`, `key` (je Familie eindeutig, feste ID daraus), `aliases[]`, `unit`, `category`, `pack_amount` | `households` |
| `recipe_ingredients` | `name`, `amount`, `unit`, `category`, `sort`, `optional`, `alternatives[]`, `amount_kind`, `note` | `recipes`, `ingredients` (optional) |
| `parse_corrections` | `key` (normalisierte Zeile), `input`, `result` (JSON) | `households` |
| `pantry_events` (Vorrat, nur anfügen) | `kind` (purchase, consume, set, present, undo), `amount`, `unit`, `at`, `ref`, `source` | `households`, `ingredients` |
| `meal_plan_entries` | `date`, `slot` (breakfast, lunch, dinner), `title`, `recipe_url`, `note`, `servings`, `cooked` | `households`, `recipes` (optional) |
| `shopping_items` | `name`, `amount`, `unit`, `category`, `checked`, `checked_at` | `households`, `memberships` (added_by, checked_by), `meal_plan_entries` (optional) |
| `events` | `title`, `start`, `end`, `all_day`, `location`, `rrule`, `exdates[]`, `reminder_minutes` | `households`, `memberships` (participants) |
| `tasks` | `title`, `notes`, `due_date`, `status`, `rrule`, `points` | `households`, `memberships` (assignees) |
| `task_completions` | `completed_at`, `points` | `tasks`, `memberships` |
| `feedback` (nur Testphase, `HOMI_FEEDBACK=1`) | `text`, `area`, `device`, `done` | `households`, `memberships` (created_by) |

## Rollen und Rechte (serverseitig über PocketBase-Regeln erzwingen)

| Aktion | Admin | Erwachsener | Kind |
| --- | --- | --- | --- |
| Mitglieder einladen/entfernen, Rollen ändern | ja | nein | nein |
| Familienraum umbenennen/löschen | ja | nein | nein |
| Termine sehen | ja | ja | ja |
| Termine, Rezepte, Essensplan bearbeiten | ja | ja | nein |
| Einkaufsartikel hinzufügen und abhaken | ja | ja | ja |
| Einkaufsartikel ändern/löschen | ja | ja | nur eigene |
| Aufgaben anlegen/zuweisen | ja | ja | nein |
| Aufgaben abhaken | ja | ja | eigene und nicht zugewiesene |

- Kinder: vom Admin angelegt, Login mit Benutzername + Passwort, keine E-Mail.
- Einladungslink: zufälliges Token, nur Hash gespeichert, 7 Tage gültig, Rolle fest, widerrufbar.
- Einladungscode: 8 Zeichen, 24 Stunden gültig, Fehlversuche gedrosselt.
- Mitgliedschaften entstehen nur über eigene Routen (Haushalt, Einladung, Kinderkonto). Konto löschen lässt die Mitgliedschaft ohne Konto und Namen stehen („Ehemaliges Mitglied“); Familienraum löschen nur über `/api/fh/households/delete`.

## MVP-Umfang

Im MVP: Familienraum, Heute-Ansicht, Essensplan + Rezepte + Zutatenübernahme mit Mengen-Zusammenfassung, Einkaufsliste, Kalender (Tag/Woche/Monat, Wiederholungen, Konfliktanzeige), Aufgaben, Offline + Live-Sync, Hell/Dunkel, PWA-Installation, Datenexport, Konto löschen.

Nicht im MVP (Phase 2 oder später): Push-Benachrichtigungen, Punkte/Belohnungen, ICS-Abo, Rezept-Import, native Apps (Capacitor), mehrere Einkaufslisten, weitere Sprachen.

## UI-Regeln

- Mobile First, untere Leiste mit 5 Bereichen (Heute, Essen, Einkauf, Kalender, Aufgaben); Desktop: Seitenleiste.
- Touch-Ziele mindestens 48 × 48 px, Personenfarbe immer mit Initiale.
- Kontraste WCAG AA in beiden Modi, Screenreader-Labels, volle Tastaturbedienung.
- Alle Texte über Paraglide, keine hartcodierten Strings in Komponenten.

## Umsetzungsplan

1. Projektstruktur ✓
2. Datenmodell als Migrationen + Rechte-Regeln mit Tests ✓
3. Anmeldung und Familienraum ✓
4. Sync-Grundgerüst ✓ – danach vorgezogen: Schritt 8 Rezepte und Wochenplan ✓
5. Einkaufsliste ✓
6. Aufgaben ✓
7. Kalender ✓
8. Essensplan und Rezepte ✓
9. Heute-Ansicht ✓
10. Feinschliff, Offline-Tests, Deployment, Backups ✓ (Abnahme auf ZimaOS steht aus)
11. **Zutaten, Vorrat und intelligente Einkaufsliste** ← aktueller Schritt (Phasen A–E in PLAN.md)

Details, Aufgaben und Abnahmekriterien pro Schritt stehen in **PLAN.md**. Dort Checkboxen abhaken, sobald etwas erledigt ist.

Jeder Schritt endet mit lauffähigem, getestetem Stand und einem Commit. Vor jedem neuen Schritt kurz den Plan zeigen und auf Freigabe warten.

## Git-Ablauf

- Repo: https://github.com/swh2906/familienhub (privat). Lokaler Ordner je Gerät beliebig (Geräte: `docs/environments.md`).
- Nie direkt auf `main` committen oder pushen. Pro Schritt ein Branch `feat/schritt-<n>-<kurzname>` (ausgehend vom aktuellen `main`).
- Am Ende des Schritts: Branch pushen und Pull Request öffnen. **Gemergt wird erst, wenn der Entwickler den PR geprüft und freigegeben hat.**
- Nach dem Merge: `main` lokal aktualisieren, erst dann den nächsten Schritt beginnen.

## Qualitätsregeln

- TypeScript strict, keine `any` ohne Begründung.
- Keine unnötigen Abhängigkeiten: vor jeder neuen Bibliothek kurz begründen.
- Logik (Sync, Mengen-Zusammenfassung, Wiederholungen, Konflikte) immer mit Unit-Tests.
- README aktuell halten: Voraussetzungen, Startbefehl, Projektstruktur.
- DSGVO-Grundsätze: Datensparsamkeit, keine Tracker, keine externen CDNs oder Schriften.

## Claude-Code-Setup

Befehle (immer diese verwenden):

| Zweck | Befehl |
| --- | --- |
| Setup neues Gerät | `pnpm run bootstrap` (install, Playwright-Chromium, PocketBase) |
| Entwickeln | `pnpm dev` (App + PocketBase), nur Oberfläche: `pnpm dev:web` |
| Build | `pnpm build` |
| Tests | `pnpm test <pfad>` (Vitest, gezielt), `pnpm test:integration` (Rechte gegen echtes PocketBase), `pnpm test:e2e <spec>` |
| Demo-Daten | `pnpm seed` (PocketBase muss laufen) |
| Lint/Typen | `pnpm lint`, `pnpm check` |
| Format | `pnpm format` |
| Aufräumen | `pnpm run clean [--all]` |
| Code-Graph | `pnpm run index [--rebuild]` |
| Umgebung | `pnpm run doctor`, `pnpm run sync-check` |

Workflow: `/devkit:issue` → `/devkit:plan` → `/devkit:implement` → `/devkit:test` → `/devkit:review` → `/devkit:pr` → `/devkit:ci`. Der GitHub-MCP ist read-only; Push, PR, Kommentar und Merge nur nach Freigabe (ein Hook fragt nach).

Ignorieren: node_modules, build, .svelte-kit, src/lib/paraglide (generiert), pocketbase/bin, pocketbase/pb_data, pocketbase/pb_public, test-results, playwright-report, .code-graph, pnpm-lock.yaml.

Token-Regeln:

1. Strukturfragen (Aufrufer, Importe, Tests, Impact) zuerst über code-graph (`find_references`, `get_call_graph`, `module_overview`). `.svelte`-Dateien kennt der Graph nicht, dafür `rg`.
2. Nur relevante Ausschnitte lesen, nie ganze große Dateien. PLAN.md nur beim aktuellen Schritt lesen.
3. Vor größeren Aufgaben: Plan mit maximal 8 Bulletpoints.
4. Minimaler Diff; keinen Code in Antworten wiederholen, `datei:zeile` nennen.
5. Such-, Issue-, PR- und CI-Ergebnisse kompakt (maximal ~10 Zeilen); bei GitHub zuerst Titel, Labels, Status.
6. Vor Datenmodell-, Migrations- oder Rechte-Regel-Änderungen `/devkit:impact`.
7. Gezielt testen, nur Fehlschläge berichten.
8. Breite Recherche an Subagents (`devkit:explorer`, `devkit:code-navigator`, `devkit:github-analyst`).
9. Bei großem Kontext `/compact` vorschlagen.
