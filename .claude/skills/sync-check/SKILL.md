---
name: sync-check
description: Prüfen, ob Claude- und Projekt-Konfiguration portabel und frei von Secrets ist.
---

1. `pnpm run sync-check` (Secrets, absolute Pfade, OS-Befehle außerhalb `scripts/`, unerlaubt versionierte Dateien).
2. Zusätzlich prüfen: `.gitignore` deckt `.env`, `.code-graph/` und `.claude/settings.local.json` ab; `.mcp.json` nutzt nur `${VAR}`.
3. Ausgabe: `OK` oder eine Liste `datei:zeile – Problem → Fix`. Secrets nie im Klartext wiedergeben.
