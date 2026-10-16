---
name: plan-task
description: Implementierungsplan mit betroffenen Dateien, Risiken und Tests erstellen, bevor Code geändert wird.
argument-hint: <aufgabe oder issue-nr>
---

Erstelle einen Plan für: $ARGUMENTS

1. Betroffene Stellen über code-graph finden (`project_map`, `find_references`), nicht durch Lesen ganzer Dateien.
2. Bei API-, Datenmodell- oder Routenänderung zuerst `/impact`.
3. Ausgabe (maximal 8 Bulletpoints insgesamt):
   - **Ziel** (1 Satz)
   - **Schritte** mit `datei:zeile`
   - **Risiken**
   - **Tests**: welche angepasst oder neu, Befehl `pnpm test <pfad>`

Keinen Code schreiben. Auf Freigabe warten.
