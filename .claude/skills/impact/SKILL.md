---
name: impact
description: Code-Graph-Impact-Analyse für eine geplante Änderung an Funktion, API, Datenmodell oder Route.
argument-hint: <symbol | datei | route>
---

Ziel: $ARGUMENTS

1. code-graph: `find_references` und `get_call_graph` (Aufrufer und Aufgerufene), `module_overview` für das Modul.
2. Betroffene Tests über Referenzen in den Testverzeichnissen bestimmen.
3. `rg` nur für dynamische Verwendungen (Strings, Routen, Config).
4. Ausgabe: direkte und indirekte Abhängige (gruppiert, maximal 15), betroffene Tests, Breaking-Risiko (niedrig/mittel/hoch) mit Grund.
