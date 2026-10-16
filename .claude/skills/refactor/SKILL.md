---
name: refactor
description: Verhaltenserhaltendes Refactoring in kleinen, getesteten Schritten.
argument-hint: <ziel>
---

Refactor: $ARGUMENTS

- Vorher: `/impact` für die betroffenen Symbole; Tests grün (`pnpm test`).
- Kleine Schritte; Verhalten und öffentliche API bleiben unverändert (sonst stoppen und fragen).
- Nach jedem Schritt die betroffenen Tests ausführen.
- Abschluss: was vereinfacht wurde (maximal 5 Zeilen), Testergebnis.
