---
name: env-doctor
description: Umgebung, Tools, MCP-Server, Container und OS-Probleme prüfen und kompakt berichten.
---

1. `pnpm run doctor` ausführen.
2. MCP-Status: `claude mcp list` (falls die CLI verfügbar ist), sonst `.mcp.json` mit den in der Session aktiven Tools vergleichen.
3. Mit `docs/environments.md` abgleichen (bekannte OS-Unterschiede).
4. Ausgabe: nur Probleme, jeweils `Problem → konkreter Fix-Befehl`. Nichts ohne Bestätigung installieren.
