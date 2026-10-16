# FamilienHub

Familien-Organisations-App (Arbeitstitel): Essensplan, Einkaufsliste, Kalender, Aufgaben.
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
| PWA | vite-plugin-pwa (SvelteKit-Integration) |
| i18n | Paraglide JS, Deutsch Standard |
| Styling | Eigenes CSS mit Custom Properties (Hell/Dunkel, Mitgliedsfarben). Bits UI nur für barrierearme Dialoge/Menüs |
| Wiederholungen | rrule (RFC 5545) |
| Tests | Vitest (Logik), Playwright (E2E) |
| Werkzeuge | Node LTS, pnpm, ESLint, Prettier |
| Hosting | Später auf kleinem Server (alter PC, Raspberry Pi oder Mini-VPS). Während der Entwicklung läuft PocketBase lokal |

PocketBase ist noch vor 1.0: Version fest pinnen, Schema nur über Migrationen in `pb_migrations/`, vor Updates Changelog lesen.

## Architektur in Kürze

- Die Oberfläche liest und schreibt **nur** in Dexie. Nie direkt auf PocketBase aus Komponenten zugreifen.
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
| `recipes` | `title`, `servings`, `instructions`, `tags[]`, `is_favorite` | `households` |
| `recipe_ingredients` | `name`, `amount`, `unit`, `category`, `sort` | `recipes` |
| `meal_plan_entries` | `date`, `slot` (breakfast, lunch, dinner), `note`, `servings` | `households`, `recipes` (optional) |
| `shopping_items` | `name`, `amount`, `unit`, `category`, `checked`, `checked_at` | `households`, `memberships` (added_by, checked_by), `meal_plan_entries` (optional) |
| `events` | `title`, `start`, `end`, `all_day`, `location`, `rrule`, `exdates[]`, `reminder_minutes` | `households`, `memberships` (participants) |
| `tasks` | `title`, `notes`, `due_date`, `status`, `rrule`, `points` | `households`, `memberships` (assignees) |
| `task_completions` | `completed_at`, `points` | `tasks`, `memberships` |

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
2. **Datenmodell als Migrationen + Rechte-Regeln mit Tests** ← aktueller Schritt
3. Anmeldung und Familienraum
4. Sync-Grundgerüst
5. Einkaufsliste
6. Aufgaben
7. Kalender
8. Essensplan und Rezepte
9. Heute-Ansicht
10. Feinschliff, Offline-Tests, Deployment, Backups

Details, Aufgaben und Abnahmekriterien pro Schritt stehen in **PLAN.md**. Dort Checkboxen abhaken, sobald etwas erledigt ist.

Jeder Schritt endet mit lauffähigem, getestetem Stand und einem Commit. Vor jedem neuen Schritt kurz den Plan zeigen und auf Freigabe warten.

## Git-Ablauf

- Repo: https://github.com/swh2906/familienhub (privat). Lokaler Ordner: `C:\Users\201707\Documents\Projekte\FamilyPlanner`.
- Nie direkt auf `main` committen oder pushen. Pro Schritt ein Branch `feat/schritt-<n>-<kurzname>` (ausgehend vom aktuellen `main`).
- Am Ende des Schritts: Branch pushen und Pull Request öffnen. **Gemergt wird erst, wenn der Entwickler den PR geprüft und freigegeben hat.**
- Nach dem Merge: `main` lokal aktualisieren, erst dann den nächsten Schritt beginnen.

## Qualitätsregeln

- TypeScript strict, keine `any` ohne Begründung.
- Keine unnötigen Abhängigkeiten: vor jeder neuen Bibliothek kurz begründen.
- Logik (Sync, Mengen-Zusammenfassung, Wiederholungen, Konflikte) immer mit Unit-Tests.
- README aktuell halten: Voraussetzungen, Startbefehl, Projektstruktur.
- DSGVO-Grundsätze: Datensparsamkeit, keine Tracker, keine externen CDNs oder Schriften.
