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

- [x] Je eine Migration pro Collection in `pocketbase/pb_migrations/`, inklusive gemeinsamer Felder (`updated_by`, `deleted_at`).
- [x] Auth-Collection `users`: Login per E-Mail **oder** Benutzername.
- [x] API-Regeln pro Collection gemäß Rechte-Tabelle in CLAUDE.md. Grundregel: Zugriff nur, wenn eine Mitgliedschaft im selben Haushalt existiert.
- [x] Kind-Einschränkungen: Einkaufsartikel nur eigene ändern oder löschen, beim Abhaken nur `checked`, `checked_at`, `checked_by` änderbar. Aufgaben: nur eigene und nicht zugewiesene abhaken.
- [x] Indizes auf `household` und `updated` (für den Delta-Abgleich).
- [x] `scripts/seed.ts`: Demo-Familie (Admin, Erwachsener, Kind) mit Beispieldaten für die Entwicklung.
- [x] Integrationstests (Vitest): starten PocketBase mit temporärem Datenordner auf freiem Port, prüfen jede Zeile der Rechte-Tabelle mit allen drei Rollen plus einem Fremd-Haushalt.

Umsetzungsnotizen:
- `recipe_ingredients` und `task_completions` haben kein eigenes `household`; Regeln und Delta-Abgleich laufen über `recipe.household` bzw. `task.household`.
- `added_by`, `checked_by`, `checked_at` und `updated_by` setzt ein Hook serverseitig. Der Ersteller eines Haushalts wird per Hook Admin.
- Datumsfelder ohne Uhrzeit (`meal_plan_entries.date`, `tasks.due_date`) sind Text im Format JJJJ-MM-TT, damit Zeitzonen keine Rolle spielen.
- Offen für Schritt 3: Registrierung ist noch für alle offen (`users.createRule = ""`); Einladungen einlösen und Kinderkonten anlegen kommen dort.

**Fertig, wenn:**
- Leere Datenbank plus `pnpm dev` ergibt automatisch das komplette Schema.
- Ein Nutzer aus Haushalt A sieht nichts aus Haushalt B (getestet).
- Alle Rechte-Tests sind grün.

---

## Schritt 3 – Anmeldung und Familienraum

**Ziel:** Registrieren, anmelden, Familie anlegen, einladen, beitreten, Kinderprofile.

- [x] Seiten: `/login`, `/register`, `/onboarding` (Familie anlegen oder beitreten), `/join/[token]`.
- [x] Haushalt anlegen erzeugt in derselben Transaktion die Admin-Mitgliedschaft (eigene Route statt Hook, s. u.).
- [x] Eigene Route `POST /api/fh/invites`: erzeugt Link-Token (zufällig, lang) und 8-stelligen Code, speichert nur Hashes, gibt Klartext einmalig zurück.
- [x] Eigene Route `POST /api/fh/invites/redeem`: prüft Hash, Ablauf, Nutzungen, Widerruf. Fehlversuche drosseln.
- [x] Eigene Route `POST /api/fh/children` (nur Admin): legt Kinderkonto mit Benutzername und Passwort plus Mitgliedschaft an.
- [x] Einstellungen: Mitgliederliste, Rolle ändern, entfernen, Farbe wählen, Einladung erstellen und widerrufen, Kind anlegen.
- [x] Sitzung bleibt erhalten (Token-Refresh). Abmelden löscht auch lokale Daten.
- [x] Farbauswahl nur aus einer Palette mit ausreichendem Kontrast in beiden Modi.
- [x] Tests: Hooks und Routen (Integration), E2E-Ablauf „Admin registriert sich → lädt ein → zweiter Nutzer tritt per Link bei“.

Umsetzungsnotizen:
- PocketBase führt API-Anlagen nicht in einer Transaktion aus. Daher `POST /api/fh/households` (Haushalt + Admin in `runInTransaction`); direktes Anlegen von `households` und `invites` über die Collections ist gesperrt.
- Drosselung: eigene Zählung nur der **Fehlversuche** (5 pro Konto, 20 pro IP in 15 Minuten), statt PocketBases Rate-Limit, das jede Anfrage zählt und eine Familie im selben WLAN gemeinsam bremsen würde.
- Einladungen haben `expires_at` (Link, 7 Tage) und `code_expires_at` (Code, 24 Stunden).
- Der letzte Admin kann weder herabgestuft noch entfernt werden (Hook auf Update-/Delete-Anfragen).
- `src/lib/auth/` darf direkt mit PocketBase sprechen (ESLint-Ausnahme); Seiten liegen in den Routengruppen `(app)` (mit Navigation, Anmeldung nötig) und `(auth)`.
- Abmelden entfernt Sitzung und zwischengespeicherte Mitgliedschaften; Hell/Dunkel und Akzentfarbe bleiben (Geräte-Einstellung). Die lokale Datenbank kommt in Schritt 4 dazu.
- E2E-Tests starten ein eigenes leeres PocketBase auf Port 8091 (`scripts/e2e-pocketbase.ts`).
- Offen: Passwort eines Kindes zurücksetzen, „Konto löschen“ (MVP, später) muss den letzten Admin berücksichtigen.

**Fertig, wenn:**
- Eine Familie mit drei Rollen lässt sich komplett über die Oberfläche einrichten.
- Abgelaufene oder widerrufene Einladungen funktionieren nicht (getestet).

---

## Schritt 4 – Sync-Grundgerüst

**Ziel:** Das Herzstück. Lesen nur lokal, Schreiben über die Warteschlange, Live-Updates, offline voll nutzbar.

**Abhängigkeiten:** `dexie`, für Tests `fake-indexeddb`.

- [x] Dexie-Schema in `src/lib/db/`: eine Tabelle pro synchronisierter Collection, dazu `outbox` und `meta` (z. B. `lastSync` pro Collection).
- [x] ID-Erzeugung auf dem Gerät im PocketBase-Format (15 Zeichen, `[a-z0-9]`).
- [x] Repository-API pro Collection (`create`, `update`, `remove`, `liveQuery`). Schreibt in Dexie plus Outbox (nur geänderte Felder). `remove` setzt `deleted_at`.
- [x] Sync-Engine in `src/lib/sync/`:
  - Push: Outbox der Reihe nach senden, Einträge erst nach Erfolg entfernen. Unterscheiden zwischen „später erneut“ (Netzfehler) und „verworfen mit Hinweis“ (z. B. Rechte-Fehler).
  - Pull: alle Datensätze mit `updated > lastSync` pro Collection holen.
  - Realtime: Abo pro Collection mit Haushaltsfilter, eingehende Änderungen nach Dexie, eigene Echos ignorieren.
  - Reconnect mit Backoff, Auslöser: Online-Event, App wieder sichtbar, Intervall.
- [x] Sync-Status-Store (`synced`, `pending`, `offline`, `error`) und Anzeige in der Kopfzeile.
- [x] Unit-Tests: Outbox-Reihenfolge, Feld-Merge, Lösch-Markierung, Wiederholung nach Netzfehler.
- [x] E2E-Test mit zwei Browser-Kontexten: Änderung in A erscheint in B. A offline, ändert, wieder online, Änderung kommt an.

Umsetzungsnotizen:
- Die Engine kennt nur die Schnittstelle `Remote` (`src/lib/sync/remote.ts`); PocketBase steckt allein in `pocketbase-remote.ts`. Unit-Tests nutzen einen Server im Speicher.
- Outbox fasst Änderungen nur zusammen, wenn der Datensatz ganz am Ende steht und nicht gerade gesendet wird; so bleibt die Reihenfolge bei Verweisen auf neuere Datensätze erhalten.
- Abgelehnte Änderungen (Rechte, ungültig): verwerfen, Serverstand wiederherstellen (oder lokal löschen, wenn es den Datensatz nicht gibt), Hinweis in der App. Abgelaufene Anmeldung pausiert den Sync mit Hinweis „Neu anmelden“.
- Eigene Live-Echos werden nicht herausgefiltert, sondern idempotent übernommen (Feld-Merge mit ausstehenden Feldern, ältere Stände werden ignoriert).
- Pull mit `updated >= lastSync` (Zeitstempel vom Server); doppelte Datensätze schaden nicht.
- Abmelden und ungültige Anmeldung löschen die lokale Datenbank.
- E2E: Test-Build mit `VITE_E2E=1` enthält `window.__familienhub` (Repositories, Status); im normalen Build nicht enthalten (geprüft).
- `pnpm dev` meldet einen belegten Port 8090 verständlich.
- Offen: Wenn nach einer Ablehnung der Serverstand nicht geholt werden kann (offline), bleibt die lokale Änderung bis zur nächsten Änderung am Datensatz stehen.

**Fertig, wenn:**
- Keine Komponente greift direkt auf PocketBase zu (nur das Sync-Modul).
- Der Zwei-Geräte- und der Offline-E2E-Test sind grün.

---

## Schritt 5 – Einkaufsliste

**Ziel:** Erstes echtes Feature. Beweist den Sync im Alltag.

- [x] Liste gruppiert nach Kategorien (feste Liste aus CLAUDE.md), Erledigte eingeklappt unten.
- [x] Schnell-Eingabe oben: Name, optional Menge und Einheit („2 l Milch“ wird erkannt).
- [x] Kategorie-Vorschlag: zuerst aus früheren Einträgen des Haushalts, sonst aus einer kleinen Stichwortliste.
- [x] Abhaken per Tipp auf die ganze Zeile, „hinzugefügt von“ als Initiale in Personenfarbe.
- [x] „Erledigte leeren“ setzt `deleted_at` für alle abgehakten Artikel.
- [x] Kinder: Oberfläche zeigt Bearbeiten und Löschen nur bei eigenen Artikeln.
- [x] Tests: Mengen-Erkennung, Kategorie-Vorschlag (Unit). E2E: hinzufügen, abhaken, leeren, auch offline.

Umsetzungsnotizen:
- Kategorien in Ladenreihenfolge (`src/lib/features/meals/catalog.ts`), eigene Kategorien danach, „Sonstiges“ zuletzt.
- Stichwortliste mit „längstes Stichwort gewinnt“ (Komposita: „Kokosmilch“ → Konserven); „TK …“ immer Tiefkühl.
- Schnell-Eingabe nutzt den Zutaten-Parser aus den Rezepten; Feld wird sofort geleert (kein Verlust bei schnellem Tippen).
- Oberfläche im Bring-Stil (auf Wunsch): Kacheln mit Emoji in der Akzentfarbe, nach Kategorien gruppiert. Antippen = gekauft; gekaufte Artikel erscheinen als graue Kacheln unter „Zuletzt gekauft“ und kommen mit einem Tipp zurück (derselbe Datensatz wird wieder geöffnet, kein Duplikat). Ersetzt „Erledigt“ und „Erledigte leeren“.
- Beim Tippen Vorschläge aus „Zuletzt gekauft“ und einem Katalog häufiger Artikel; eine getippte Menge gilt für den gewählten Vorschlag.
- Details über Bearbeiten-Modus (barrierefrei) oder langes Drücken/Rechtsklick; Löschen mit „Rückgängig“ (8 Sekunden). Kinder bearbeiten nur eigene Artikel.

**Fertig, wenn:**
- Zwei Geräte bearbeiten die Liste gleichzeitig, beide sehen sofort dasselbe.
- Die Liste funktioniert im Flugmodus und gleicht danach ab.

---

## Schritt 6 – Aufgaben

**Abhängigkeiten:** `rrule`.

- [x] Reiter: Meine, Alle, Erledigt. Eigene oben, überfällige markiert.
- [x] Editor: Titel, Notiz, Zuständige (Mehrfachauswahl), Fälligkeit, Wiederholung als einfache Vorlagen (täglich, wöchentlich an Tagen X, monatlich), intern als RRULE gespeichert.
- [x] Abhaken: Eintrag in `task_completions`. Bei Wiederholung springt `due_date` auf das nächste Datum, sonst Status `done`.
- [x] Rechte für Kinder wie in CLAUDE.md, Oberfläche passend.
- [x] Tests: Berechnung des nächsten Fälligkeitsdatums inklusive Monatsende und Zeitumstellung. E2E: anlegen, zuweisen, abhaken.

Umsetzungsnotizen:
- „Meine“ = mir zugewiesen oder niemandem zugewiesen. Vorlagen: keine, täglich, wöchentlich an Tagen, alle 2 Wochen, monatlich am Tag X; unbekannte RRULEs bleiben als „eigene Regel“ erhalten.
- Nächstes Datum = erstes Vorkommen nach dem späteren von Fälligkeit und heute (früh erledigt → übernächstes Mal, überfällig → nächstes kommendes). Rhythmus bleibt am Fälligkeitsdatum verankert; Rechnung in UTC-Kalendertagen.
- „Monatlich am 31.“ = `BYMONTHDAY=28,29,30,31;BYSETPOS=-1` (letzter vorhandener Tag ≤ 31).
- Migration `1792500001`: Kinder dürfen `due_date` nur bei wiederkehrenden Aufgaben (rrule gesetzt) weiterrücken.
- Abhaken und Löschen mit „Rückgängig“; „Erledigt“ zeigt wer und wann, einmalige Aufgaben lassen sich wieder öffnen.
- Repository wandelt zu speichernde Daten in einfache Objekte um (Svelte-Zustand als Proxy kann IndexedDB nicht speichern).
- Später (Phase 2): Punkte/Belohnungen über `points`.

**Fertig, wenn:** Wiederkehrende Aufgaben rücken nach dem Abhaken korrekt weiter (getestet).

---

## Schritt 7 – Kalender

- [x] Ansichten Tag, Woche, Monat als eigene schlanke Komponenten (keine schwere Kalender-Bibliothek).
- [x] Zeiten in UTC speichern, in der Zeitzone des Haushalts anzeigen.
- [x] Editor: Titel, Datum, Uhrzeit oder ganztägig, Ort, Teilnehmer, Erinnerungszeit (nur gespeichert, Push kommt in Phase 2), Wiederholung als Vorlagen.
- [x] Wiederholungen: nur Regel plus `exdates` speichern, Termine für den sichtbaren Zeitraum berechnen. Ändern mit Auswahl „nur dieser Termin“ (Ausnahme plus Einzeltermin) oder „alle“.
- [x] Personen-Filter als Chips.
- [x] Konflikte: überlappende Termine derselben Person markieren, Warnung schon im Editor.
- [x] Tests: Expansion von Wiederholungen, Ausnahmen, Konflikterkennung, Zeitumstellung (Unit). E2E: Serientermin anlegen und einzelnen Termin verschieben.

Umsetzungsnotizen:
- Zeitzonen ohne Bibliothek über `Intl` (`src/lib/features/calendar/tz.ts`): nicht existierende Uhrzeit → nach vorn, doppelte Stunde → erste. Zeitzone kommt aus `households.timezone`, sonst Gerät.
- Ganztägige Termine: `start`/`end` = erster/letzter Tag als UTC-Mitternacht (reines Datum, rutscht nie auf den Vortag).
- Serien werden in Wanduhrzeit expandiert (15:00 bleibt nach der Zeitumstellung 15:00); `exdates` = Tage (JJJJ-MM-TT).
- „Alle Termine“ mit anderem Tag verschiebt die Serie; Wochentage/Monatstag wandern mit (`shiftRrule`), außer die Wiederholung wurde geändert.
- Konflikt = gleiche Person, zeitliche Überschneidung; ganztägige und Termine ohne Teilnehmer zählen nicht.
- Woche: Zeitachse ab Tablet-Breite, Tagesliste auf dem Handy; Monat: Punkte (Handy) bzw. Titel, darunter der gewählte Tag.
- Vorlage „jährlich“ ergänzt (auch für Aufgaben).
- Später: „Diesen und alle folgenden Termine“, Erinnerungen per Push (Phase 2), ICS-Abo (Phase 2).

**Fertig, wenn:** Serientermine, Ausnahmen und Konflikte sind korrekt und getestet.

---

## Schritt 8 – Essensplan und Rezepte

- [x] Rezepte: Liste mit Suche, Tag-Filter (vegetarisch, schnell, günstig, Reste), Favoriten oben. Editor mit Zutatenliste (Name, Menge, Einheit, Kategorie). *(vorgezogen vor Schritt 5, eigener PR)*
  - Dazu: Rezeptansicht mit Portionen-Umrechnung, Zutaten-Zeilen mit ↑/↓ sortierbar, „Zutaten aus Text einfügen“ (Parser auf dem Gerät, z. B. für Text aus Live Text/Google Lens), Kinder nur lesend.
  - `/essen` öffnet bis zum Wochenplan direkt `/essen/rezepte`.
- [x] Wochenplan: 7 Tage × Frühstück, Mittag, Abend. Rezept per Ziehen (Desktop) oder Antippen und Auswählen (Handy), alternativ Freitext-Notiz.
  - Umgesetzt mit Gericht als Text (`title`) und Link zum Rezept in einer eigenen Rezept-App (`recipe_url`, nur http/https); FamilienHub-Rezepte werden bei gleichem Namen automatisch verknüpft.
  - Wochen blättern über `?woche=JJJJ-Www` (ISO-Kalenderwoche), „Diese Woche“ springt zurück; `/essen` öffnet den Wochenplan.
  - Mehrere Einträge pro Mahlzeit erlaubt (verhindert Überschreiben bei gleichzeitiger Offline-Planung).
  - Verschieben per Dialog (Tag/Mahlzeit) oder Ziehen auf dem Desktop; eingebautes `<dialog>` statt Bits UI.
  - Später: Anbindung der eigenen Rezept-App (z. B. Rezepte/Zutaten über deren API abrufen).
- [ ] Zutaten-Zusammenfassung als reine Funktion: Namen vereinheitlichen, g/kg und ml/l umrechnen und addieren, Stück, EL und TL getrennt lassen, Portionen skalieren.
- [ ] „Einkauf füllen“: Vorschau der Zutaten für einen Zeitraum, einzelne abwählbar, Übernahme mit Verweis auf den Essensplan-Eintrag. Erneute Übernahme erzeugt keine Duplikate.
- [ ] Tests: Zusammenfassung mit vielen Sonderfällen (Unit). E2E: Rezept anlegen, einplanen, auf die Einkaufsliste übernehmen.

**Fertig, wenn:** 300 g und 0,5 kg Mehl aus zwei Rezepten ergeben genau eine Zeile „800 g Mehl“.

---

## Schritt 9 – Heute-Ansicht

- [x] Startseite mit vier Karten: Termine heute (Uhrzeit, Personenfarbe), Mahlzeiten heute, Zahl offener Einkäufe mit Schnell-Eingabe, offene Aufgaben (eigene zuerst).
- [x] Desktop: Karten im Raster. Leere Zustände mit einem Satz und einem Knopf.
- [x] Jede Karte führt per Tipp in ihren Bereich.
- [x] E2E: Heute zeigt Daten aus allen vier Bereichen.

Umsetzungsnotizen:
- Begrüßung nach Tageszeit, Datum; Termine: nächster hervorgehoben, vergangene abgeschwächt, Konflikte markiert, Ausblick „Morgen: N Termine“.
- Einkauf: Schnell-Eingabe und bis zu 6 Kacheln (Antippen = gekauft); Aufgaben: heute fällige und überfällige, eigene zuerst, höchstens 5, direkt abhaken mit Rückgängig.
- Kartenkopf ist der Link in den Bereich; Knöpfe in leeren Zuständen haben eigene, handlungsorientierte Namen (keine doppelten Linknamen).
- Daten live aus den bestehenden Modulen (keine doppelte Logik).

**Fertig, wenn:** Ein Blick am Morgen genügt, ohne in andere Bereiche zu wechseln.

---

## Schritt 10 – Feinschliff, Betrieb, Deployment

In drei PRs: **10a** App-Qualität (PWA, Offline, Barrierefreiheit), **10b** Datenschutz und Aufräum-Job, **10c** Betrieb (Alter PC / Mini-PC, nur im WLAN zu Hause).

**Abhängigkeiten:** für Tests `@axe-core/playwright`. Statt `vite-plugin-pwa` den eingebauten Service Worker von SvelteKit (`src/service-worker/`): Das Plugin erzeugt mit SvelteKit 3 keinen Service Worker, und so entfällt eine Abhängigkeit.

- [x] PWA: Manifest, Icons (`pnpm icons`), Service Worker mit Vorab-Cache, Hinweis „Neue Version verfügbar“.
- [x] Offline-E2E: App im Flugmodus starten, alle Bereiche bedienbar.
- [x] Barrierefreiheit: axe-Prüfung aller Seiten in Hell und Dunkel, Tastaturbedienung, Fokus sichtbar, Kurzbefehl N für „Neu“.
- [x] Datenschutz: Datenexport als JSON, Konto löschen (Einträge zeigen dann „Ehemaliges Mitglied“), Familienraum löschen. Geräte ohne Zugriff (Familienraum gelöscht, Mitglied entfernt) verwerfen ihre lokalen Daten.
- [x] Aufräum-Job (PocketBase-Cron, täglich 3:30 Uhr): Einträge mit `deleted_at` älter als 30 Tage endgültig löschen (Mitgliedschaften bleiben); die Apps räumen lokal ebenso auf.
- [x] Deployment auf ZimaOS (Mini-PC): `Dockerfile` (PocketBase + App, x86/ARM), Image per GitHub Action nach `ghcr.io`, `deploy/zimaos/docker-compose.yml` mit Tailscale-Beiwagen für HTTPS im Heimnetz, Daten unter `/DATA/AppData/familienhub`.
- [x] Backups: täglich 4 Uhr per PocketBase (letzte 14), Zurückspielen über die Admin-Oberfläche. Kopie außer Haus: später.
- [x] README-Abschnitt „Betrieb auf ZimaOS“: Einrichten, Aktualisieren, Backup zurückspielen; `pnpm docker:smoke` als Testlauf.

- [x] Kochansicht (10d): Rezept als Karteikarte nach dem Vorbild der COOK-App, neue Felder `prep_minutes` und `difficulty`, Handschrift lokal mitgeliefert.

**Fertig, wenn:**
- Die App läuft auf dem Zielserver per HTTPS und ist auf Handy, Tablet und Desktop installiert.
- Ein Backup wurde einmal testweise zurückgespielt.

---

## Roadmap: als Nächstes

### 1. Performance bei vielen Einträgen

Lasttest am 18.10.2026 mit 10.000 Einträgen (1.000 Termine, davon 50 wöchentlich; 500 Rezepte mit 5.000 Zutaten; 2.000 Einkaufsartikel; 500 Aufgaben; 1.000 Essensplan-Einträge):

| | Ergebnis |
| --- | --- |
| Server (PocketBase) | ca. 90 MB RAM (Spitze 110 MB), CPU im Ruhezustand ~0 %, Datenbank 2,7 MB |
| Abgleich | neues Gerät holt alles in 0,5 s; laufender Abgleich 5 ms |
| Gerät | lokale Datenbank ~8 MB, JS-Speicher 30–50 MB |

Seitenzeiten (Rechner / CPU vierfach gedrosselt ≈ Mittelklasse-Handy):

| Seite | Rechner | gedrosselt |
| --- | --- | --- |
| Heute, Kalender Woche/Monat | 0,1–0,2 s | 0,5–0,7 s |
| Rezeptliste (500) | 0,9 s | 2,3 s |
| Einkauf (1.000 offen) | 1,9 s | 6,4 s |
| Aufgaben (500) | 1,4 s | 5,0 s |
| Rezeptsuche über 5.000 Zutaten | 2,4 s | 14,8 s |

Server und Sync sind unkritisch (256 MB-Grenze im Container reicht). Bei realistischen Mengen (20–50 offene Artikel, 30–100 Aufgaben, 100–200 Rezepte) bleibt alles flüssig; die drei langsamen Seiten skalieren aber schlecht.

- [ ] Rezeptsuche: Suchtext (Titel, Tags, Zutaten) einmal pro Datenänderung vorberechnen statt bei jeder Eingabe; Ursache der 2,4 s zuerst mit dem Profiler bestätigen.
- [ ] Lange Listen in Abschnitten nachladen bzw. nur Sichtbares rendern: Einkauf (offen und „Zuletzt gekauft“), Aufgaben.
- [ ] Lasttest als festes Skript (`pnpm perf`): Daten anlegen, Seiten mit CPU-Drossel messen, Grenzwerte prüfen, damit es nicht wieder langsamer wird.

**Fertig, wenn:** Mit den Mengen oben lädt jede Seite gedrosselt in unter 1,5 s, die Rezeptsuche reagiert in unter 300 ms.

### Vor dem Familientest (10h) – erledigt

- [x] Termine ziehen (verschieben, Dauer ändern, Serie: nur dieser/alle, Touch per langem Drücken).
- [x] Feedback-Reiter unter Aufgaben, nur in der Testphase (`HOMI_FEEDBACK=1`).
- [x] Tag/Woche springt zur aktuellen Uhrzeit.
- [ ] Vor dem Abschluss der Testphase: Feedback auswerten, `HOMI_FEEDBACK` auf '0' setzen.

### 2. Weitere offene Punkte

- Feinschliff der übrigen Bereiche: Kalender, Aufgaben, Einstellungen/Anmeldung (Vorgehen wie in Schritt 10e).
- HTTPS im Heimnetz über Tailscale (`deploy/zimaos/docker-compose.yml`), damit Installation als App und Offline-Start gehen.
- Abnahme Schritt 10 auf ZimaOS: App auf allen Familiengeräten im Einsatz, ein Backup testweise zurückgespielt.
- Phase „Produkt“ für andere Familien (Ende-zu-Ende-Verschlüsselung, DSGVO/ISO 27001) – erst nach dem Familientest entscheiden.

## Danach: Phase 2

Push-Benachrichtigungen für Erinnerungen, Punkte und Belohnungen, ICS-Kalender-Abo, Rezept-Import per Link und Fotos, native Apps über Capacitor.

Rezept-Import im Detail (Reihenfolge nach Nutzen/Aufwand):
1. Import per Webadresse: strukturierte Daten (schema.org `Recipe`, JSON-LD) serverseitig per PocketBase-Hook holen und in den Editor übernehmen.
2. Foto am Rezept speichern (PocketBase-Datei-Feld; offline: Bild in Dexie zwischenspeichern und später hochladen).
3. Scan direkt in der App: entweder Texterkennung auf dem Gerät (z. B. Tesseract.js, mehrere MB, mittlere Genauigkeit) oder KI-Erkennung über einen externen Dienst (sehr gut, aber Datenschutz-Entscheidung und API-Schlüssel nötig).
Bis dahin: „Zutaten aus Text einfügen“ zusammen mit der Texterkennung des Handys (Live Text, Google Lens).
