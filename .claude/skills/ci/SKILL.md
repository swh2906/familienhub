---
name: ci
description: Fehlgeschlagene GitHub-Actions-Runs analysieren und minimalen Fix vorschlagen.
argument-hint: '[run-id | branch]'
---

1. GitHub-MCP: `actions_list` (letzte fehlgeschlagene Runs), dann `get_job_logs` nur für fehlgeschlagene Jobs; nur die letzten Fehlerzeilen auswerten.
   Fallback: `gh run list --limit 5` und `gh run view <id> --log-failed`.
2. Den Fehler lokal reproduzieren: `pnpm test <pfad>` bzw. `pnpm lint` / `pnpm check`.
3. Ausgabe: Job, Fehler (1 Zeile), Ursache, minimaler Fix (`datei:zeile`). Erst nach Freigabe umsetzen; kein Re-Run ohne Bestätigung.
