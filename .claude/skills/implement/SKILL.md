---
name: implement
description: Abgegrenzte Aufgabe oder freigegebenen Plan mit minimalem Diff umsetzen und gezielt testen.
argument-hint: <aufgabe>
---

Setze um: $ARGUMENTS

- Nur nötige Ausschnitte lesen; minimaler Diff im bestehenden Stil, keine Nebenbei-Refactorings.
- Zuerst Test ergänzen oder anpassen, dann Code.
- `pnpm test <betroffener pfad>`, anschließend `pnpm lint` und `pnpm check`.
- Bei Fehlern maximal 2 Fix-Versuche, danach Ursache berichten.
- Abschluss: geänderte Dateien (je 1 Zeile), Testergebnis. Keinen Code wiederholen.
