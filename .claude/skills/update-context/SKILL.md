---
name: update-context
description: CLAUDE.md kompakt aktualisieren (Befehle, Struktur, Regeln), Setup-Abschnitt kompakt halten.
---

1. `package.json`-Scripts, die Top-Level-Struktur (`project_map`) und `.claude/` mit CLAUDE.md abgleichen.
2. Nur veraltete oder fehlende Punkte per minimalem Edit ändern; Token-Regeln beibehalten.
3. Wortzahl prüfen (Setup-Abschnitt maximal ~250 Wörter). Ausgabe: Liste der Änderungen, maximal 5 Zeilen.
