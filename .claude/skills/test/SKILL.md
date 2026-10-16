---
name: test
description: Nur relevante Tests ausführen und Fehlschläge präzise zusammenfassen.
argument-hint: '[pfad|testname]'
---

1. Relevante Tests bestimmen: Argument `$ARGUMENTS`, sonst über `git diff --name-only` und code-graph `find_references` die zugehörigen Tests.
2. `pnpm test <pfade>` (Vitest; E2E: `pnpm test:e2e <spec>`); die volle Suite nur, wenn nichts Gezieltes gefunden wird.
3. Ausgabe: `N passed / M failed`. Pro Fehlschlag: Test, `datei:zeile`, Ursache (1 Satz), Fix-Vorschlag. Keine vollen Logs.
