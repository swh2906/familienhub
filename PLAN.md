# FamilienHub – Umsetzungsplan für Claude Code

Dieser Plan ergänzt CLAUDE.md (Entscheidungen, Datenmodell, Rechte). Hier steht, **was in welcher Reihenfolge gebaut wird** und **wann ein Schritt fertig ist**.

## Arbeitsregeln

1. Immer nur **einen Schritt** bearbeiten, den ersten mit offenen Checkboxen.
2. Vor dem Start: kurzen Plan für den Schritt zeigen (Dateien, neue Abhängigkeiten, Tests) und **auf Freigabe warten**.
3. Neue Abhängigkeit nur mit einem Satz Begründung. Die hier genannten gelten als freigegeben.
4. Nach jedem Teilziel: `pnpm check`, `pnpm lint`, `pnpm test` müssen grün sein.
5. Schritt fertig = alle Punkte unter „Fertig, wenn“ erfüllt. Dann Checkboxen hier abhaken, README aktualisieren, Commit (`feat: …`, `test: …`, `chore: …`).
6. Der Entwickler ist Einsteiger: am Ende jedes Schritts in 3–5 Sätzen erklären, was entstanden ist und wie man es ausprobiert.

**Startprompt für jede neue Sitzung:**

> Lies CLAUDE.md und PLAN.md. Nimm den nächsten offenen Schritt, zeig mir deinen Plan und warte auf meine Freigabe.

---

## Schritt 1 – Projektstruktur

**Ziel:** Leere, lauffähige App. Ein Befehl startet Frontend und PocketBase auf Linux, Windows und macOS.

**Abhängigkeiten:** SvelteKit, `@sveltejs/adapter-static`, TypeScript, Vite, Vitest, Playwright, ESLint, Prettier, `pocketbase` (JS-SDK).

- [x] Voraussetzungen prüfen: Git, Node 24 LTS, pnpm (über `corepack enable`). `engines` in `package.json` setzen, `.nvmrc` anlegen.
- [x] SvelteKit-Projekt mit TypeScript (strict) anlegen, `adapter-static`, `ssr = false`, Fallback `index.html`.
- [x] Ordnerstruktur anlegen:
  ```
  familienhub/
  ├─ CLAUDE.md, PLAN.md, README.md
  ├─ src/
  │  ├─ lib/
  │  │  ├─ pb/          # PocketBase-Client (nur vom Sync-Modul genutzt)
  │  │  ├─ db/          # Dexie-Schema (ab Schritt 4)
  │  │  ├─ sync/        # Sync-Modul (ab Schritt 4)
  │  │  ├─ features/    # household, shopping, tasks, calendar, meals, today
  │  │  └─ ui/          # gemeinsame Komponenten, Theme
  │  └─ routes/
  ├─ messages/          # Paraglide-Übersetzungen (de.json)
  ├─ pocketbase/
  │  ├─ VERSION         # gepinnte PocketBase-Version
  │  ├─ pb_migrations/
  │  ├─ pb_hooks/
  │  └─ pb_data/        # gitignored
  ├─ scripts/           # Node-Skripte in TypeScript
  ├─ tests/e2e/
  └─ static/
  ```
- [x] `scripts/pb-download.ts`: lädt die in `pocketbase/VERSION` gepinnte PocketBase für das aktuelle Betriebssystem und die CPU-Architektur aus den GitHub-Releases, prüft die Checksumme, entpackt nach `pocketbase/bin/` (gitignored).
- [x] `scripts/dev.ts`: startet PocketBase (Port 8090) und Vite parallel mit `child_process`, beendet beide sauber bei Strg+C. Keine zusätzliche Bibliothek.
- [x] Vite-Proxy: `/api` und `/_` auf `http://127.0.0.1:8090`, damit es keine CORS-Probleme gibt.
- [x] Paraglide JS einrichten, `messages/de.json` mit ersten Texten. Keine hartcodierten Strings.
- [x] Theme-Grundlage: CSS-Variablen für Hell und Dunkel, `prefers-color-scheme` plus manueller Umschalter (Wert lokal gespeichert).
- [x] App-Rahmen als Platzhalter: Kopfzeile, untere Leiste mit 5 Bereichen (Desktop: Seitenleiste), leere Seiten pro Bereich.
- [x] npm-Skripte: `dev`, `build` (Vite-Build, danach Kopie nach `pocketbase/pb_public`), `check` (svelte-check), `lint`, `format`, `test`, `test:e2e`, `pb:download`.
- [x] Ein Unit-Test (Vitest) und ein E2E-Test (Playwright: Startseite lädt, Leiste hat 5 Einträge).
- [x] README: Voraussetzungen, Installation, `pnpm dev`, Projektstruktur, wo die PocketBase-Admin-Oberfläche liegt.
- [x] `.gitignore`, `.editorconfig`, `.gitattributes` (Zeilenenden LF, wichtig für Windows).

**Fertig, wenn:**
- `pnpm install && pnpm pb:download && pnpm dev` auf einem frischen Klon läuft.
- `http://localhost:5173` zeigt den App-Rahmen, `http://127.0.0.1:8090/_/` die PocketBase-Admin-Oberfläche.
- Alle Tests und Prüfungen sind grün.

---

## Schritt 2 – Datenmodell und Rechte

**Ziel:** Alle Collections aus CLAUDE.md als Migrationen, Rechte-Regeln serverseitig durchgesetzt und getestet.

- [ ] Je eine Migration pro Collection in `pocketbase/pb_migrations/`, inklusive gemeinsamer Felder (`updated_by`, `deleted_at`).
- [ ] Auth-Collection `users`: Login per E-Mail **oder** Benutzername.
- [ ] API-Regeln pro Collection gemäß Rechte-Tabelle in CLAUDE.md. Grundregel: Zugriff nur, wenn eine Mitgliedschaft im selben Haushalt existiert.
- [ ] Kind-Einschränkungen: Einkaufsartikel nur eigene ändern oder löschen, beim Abhaken nur `checked`, `checked_at`, `checked_by` änderbar. Aufgaben: nur eigene und nicht zugewiesene abhaken.
- [ ] Indizes auf `household` und `updated` (für den Delta-Abgleich).
- [ ] `scripts/seed.ts`: Demo-Familie (Admin, Erwachsener, Kind) mit Beispieldaten für die Entwicklung.
- [ ] Integrationstests (Vitest): starten PocketBase mit temporärem Datenordner auf freiem Port, prüfen jede Zeile der Rechte-Tabelle mit allen drei Rollen plus einem Fremd-Haushalt.

**Fertig, wenn:**
- Leere Datenbank plus `pnpm dev` ergibt automatisch das komplette Schema.
- Ein Nutzer aus Haushalt A sieht nichts aus Haushalt B (getestet).
- Alle Rechte-Tests sind grün.

---

## Schritt 3 – Anmeldung und Familienraum

**Ziel:** Registrieren, anmelden, Familie anlegen, einladen, beitreten, Kinderprofile.

- [ ] Seiten: `/login`, `/register`, `/onboarding` (Familie anlegen oder beitreten), `/join/[token]`.
- [ ] Hook: Haushalt anlegen erzeugt in derselben Transaktion die Admin-Mitgliedschaft.
- [ ] Eigene Route `POST /api/fh/invites`: erzeugt Link-Token (zufällig, lang) und 8-stelligen Code, speichert nur Hashes, gibt Klartext einmalig zurück.
- [ ] Eigene Route `POST /api/fh/invites/redeem`: prüft Hash, Ablauf, Nutzungen, Widerruf. Fehlversuche drosseln.
- [ ] Eigene Route `POST /api/fh/children` (nur Admin): legt Kinderkonto mit Benutzername und Passwort plus Mitgliedschaft an.
- [ ] Einstellungen: Mitgliederliste, Rolle ändern, entfernen, Farbe wählen, Einladung erstellen und widerrufen, Kind anlegen.
- [ ] Sitzung bleibt erhalten (Token-Refresh). Abmelden löscht auch lokale Daten.
- [ ] Farbauswahl nur aus einer Palette mit ausreichendem Kontrast in beiden Modi.
- [ ] Tests: Hooks und Routen (Integration), E2E-Ablauf „Admin registriert sich → lädt ein → zweiter Nutzer tritt per Link bei“.

**Fertig, wenn:**
- Eine Familie mit drei Rollen lässt sich komplett über die Oberfläche einrichten.
- Abgelaufene oder widerrufene Einladungen funktionieren nicht (getestet).

---

## Schritt 4 – Sync-Grundgerüst

**Ziel:** Das Herzstück. Lesen nur lokal, Schreiben über die Warteschlange, Live-Updates, offline voll nutzbar.

**Abhängigkeiten:** `dexie`, für Tests `fake-indexeddb`.

- [ ] Dexie-Schema in `src/lib/db/`: eine Tabelle pro synchronisierter Collection, dazu `outbox` und `meta` (z. B. `lastSync` pro Collection).
- [ ] ID-Erzeugung auf dem Gerät im PocketBase-Format (15 Zeichen, `[a-z0-9]`).
- [ ] Repository-API pro Collection (`create`, `update`, `remove`, `liveQuery`). Schreibt in Dexie plus Outbox (nur geänderte Felder). `remove` setzt `deleted_at`.
- [ ] Sync-Engine in `src/lib/sync/`:
  - Push: Outbox der Reihe nach senden, Einträge erst nach Erfolg entfernen. Unterscheiden zwischen „später erneut“ (Netzfehler) und „verworfen mit Hinweis“ (z. B. Rechte-Fehler).
  - Pull: alle Datensätze mit `updated > lastSync` pro Collection holen.
  - Realtime: Abo pro Collection mit Haushaltsfilter, eingehende Änderungen nach Dexie, eigene Echos ignorieren.
  - Reconnect mit Backoff, Auslöser: Online-Event, App wieder sichtbar, Intervall.
- [ ] Sync-Status-Store (`synced`, `pending`, `offline`, `error`) und Anzeige in der Kopfzeile.
- [ ] Unit-Tests: Outbox-Reihenfolge, Feld-Merge, Lösch-Markierung, Wiederholung nach Netzfehler.
- [ ] E2E-Test mit zwei Browser-Kontexten: Änderung in A erscheint in B. A offline, ändert, wieder online, Änderung kommt an.

**Fertig, wenn:**
- Keine Komponente greift direkt auf PocketBase zu (nur das Sync-Modul).
- Der Zwei-Geräte- und der Offline-E2E-Test sind grün.

---

## Schritt 5 – Einkaufsliste

**Ziel:** Erstes echtes Feature. Beweist den Sync im Alltag.

- [ ] Liste gruppiert nach Kategorien (feste Liste aus CLAUDE.md), Erledigte eingeklappt unten.
- [ ] Schnell-Eingabe oben: Name, optional Menge und Einheit („2 l Milch“ wird erkannt).
- [ ] Kategorie-Vorschlag: zuerst aus früheren Einträgen des Haushalts, sonst aus einer kleinen Stichwortliste.
- [ ] Abhaken per Tipp auf die ganze Zeile, „hinzugefügt von“ als Initiale in Personenfarbe.
- [ ] „Erledigte leeren“ setzt `deleted_at` für alle abgehakten Artikel.
- [ ] Kinder: Oberfläche zeigt Bearbeiten und Löschen nur bei eigenen Artikeln.
- [ ] Tests: Mengen-Erkennung, Kategorie-Vorschlag (Unit). E2E: hinzufügen, abhaken, leeren, auch offline.

**Fertig, wenn:**
- Zwei Geräte bearbeiten die Liste gleichzeitig, beide sehen sofort dasselbe.
- Die Liste funktioniert im Flugmodus und gleicht danach ab.

---

## Schritt 6 – Aufgaben

**Abhängigkeiten:** `rrule`.

- [ ] Reiter: Meine, Alle, Erledigt. Eigene oben, überfällige markiert.
- [ ] Editor: Titel, Notiz, Zuständige (Mehrfachauswahl), Fälligkeit, Wiederholung als einfache Vorlagen (täglich, wöchentlich an Tagen X, monatlich), intern als RRULE gespeichert.
- [ ] Abhaken: Eintrag in `task_completions`. Bei Wiederholung springt `due_date` auf das nächste Datum, sonst Status `done`.
- [ ] Rechte für Kinder wie in CLAUDE.md, Oberfläche passend.
- [ ] Tests: Berechnung des nächsten Fälligkeitsdatums inklusive Monatsende und Zeitumstellung. E2E: anlegen, zuweisen, abhaken.

**Fertig, wenn:** Wiederkehrende Aufgaben rücken nach dem Abhaken korrekt weiter (getestet).

---

## Schritt 7 – Kalender

- [ ] Ansichten Tag, Woche, Monat als eigene schlanke Komponenten (keine schwere Kalender-Bibliothek).
- [ ] Zeiten in UTC speichern, in der Zeitzone des Haushalts anzeigen.
- [ ] Editor: Titel, Datum, Uhrzeit oder ganztägig, Ort, Teilnehmer, Erinnerungszeit (nur gespeichert, Push kommt in Phase 2), Wiederholung als Vorlagen.
- [ ] Wiederholungen: nur Regel plus `exdates` speichern, Termine für den sichtbaren Zeitraum berechnen. Ändern mit Auswahl „nur dieser Termin“ (Ausnahme plus Einzeltermin) oder „alle“.
- [ ] Personen-Filter als Chips.
- [ ] Konflikte: überlappende Termine derselben Person markieren, Warnung schon im Editor.
- [ ] Tests: Expansion von Wiederholungen, Ausnahmen, Konflikterkennung, Zeitumstellung (Unit). E2E: Serientermin anlegen und einzelnen Termin verschieben.

**Fertig, wenn:** Serientermine, Ausnahmen und Konflikte sind korrekt und getestet.

---

## Schritt 8 – Essensplan und Rezepte

- [ ] Rezepte: Liste mit Suche, Tag-Filter (vegetarisch, schnell, günstig, Reste), Favoriten oben. Editor mit Zutatenliste (Name, Menge, Einheit, Kategorie).
- [ ] Wochenplan: 7 Tage × Frühstück, Mittag, Abend. Rezept per Ziehen (Desktop) oder Antippen und Auswählen (Handy), alternativ Freitext-Notiz.
- [ ] Zutaten-Zusammenfassung als reine Funktion: Namen vereinheitlichen, g/kg und ml/l umrechnen und addieren, Stück, EL und TL getrennt lassen, Portionen skalieren.
- [ ] „Einkauf füllen“: Vorschau der Zutaten für einen Zeitraum, einzelne abwählbar, Übernahme mit Verweis auf den Essensplan-Eintrag. Erneute Übernahme erzeugt keine Duplikate.
- [ ] Tests: Zusammenfassung mit vielen Sonderfällen (Unit). E2E: Rezept anlegen, einplanen, auf die Einkaufsliste übernehmen.

**Fertig, wenn:** 300 g und 0,5 kg Mehl aus zwei Rezepten ergeben genau eine Zeile „800 g Mehl“.

---

## Schritt 9 – Heute-Ansicht

- [ ] Startseite mit vier Karten: Termine heute (Uhrzeit, Personenfarbe), Mahlzeiten heute, Zahl offener Einkäufe mit Schnell-Eingabe, offene Aufgaben (eigene zuerst).
- [ ] Desktop: Karten im Raster. Leere Zustände mit einem Satz und einem Knopf.
- [ ] Jede Karte führt per Tipp in ihren Bereich.
- [ ] E2E: Heute zeigt Daten aus allen vier Bereichen.

**Fertig, wenn:** Ein Blick am Morgen genügt, ohne in andere Bereiche zu wechseln.

---

## Schritt 10 – Feinschliff, Betrieb, Deployment

**Abhängigkeiten:** `vite-plugin-pwa` (SvelteKit-Integration), für Tests `@axe-core/playwright`.

- [ ] PWA: Manifest, Icons, Service Worker mit Vorab-Cache, Hinweis „Neue Version verfügbar“.
- [ ] Offline-E2E: App im Flugmodus starten, alle Bereiche bedienbar.
- [ ] Barrierefreiheit: axe-Prüfung aller Seiten in Hell und Dunkel, Tastaturbedienung, Fokus sichtbar, Kurzbefehl N für „Neu“.
- [ ] Datenschutz: Datenexport als JSON, Konto löschen (Einträge zeigen dann „Ehemaliges Mitglied“), Familienraum löschen.
- [ ] Aufräum-Job (PocketBase-Cron): Einträge mit `deleted_at` älter als 30 Tage endgültig löschen.
- [ ] Deployment:
  - `Dockerfile` (PocketBase plus gebaute App in `pb_public`) und `docker-compose.yml` mit Volume für `pb_data`.
  - Alternative ohne Docker: Anleitung für einen systemd-Dienst (z. B. Raspberry Pi).
  - Beispiel-`Caddyfile` für HTTPS auf einem VPS, Hinweis zu Tailscale für Geräte zu Hause.
- [ ] Backups: tägliches PocketBase-Backup per Zeitplan, Anleitung für eine verschlüsselte Kopie außer Haus.
- [ ] README-Abschnitt „Betrieb“: Installieren, Aktualisieren, Backup zurückspielen.

**Fertig, wenn:**
- Die App läuft auf dem Zielserver per HTTPS und ist auf Handy, Tablet und Desktop installiert.
- Ein Backup wurde einmal testweise zurückgespielt.

---

## Danach: Phase 2

Push-Benachrichtigungen für Erinnerungen, Punkte und Belohnungen, ICS-Kalender-Abo, Rezept-Import per Link und Fotos, native Apps über Capacitor.
