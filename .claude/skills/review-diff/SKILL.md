---
name: review-diff
description: Aktuellen Diff auf Bugs, Sicherheit, Lesbarkeit und Testabdeckung prüfen; priorisierte Kurzliste.
argument-hint: '[base-branch]'
---

1. `git diff --stat <base>...HEAD` (Base = Argument `$ARGUMENTS`, sonst `main`; ohne Branch: `git diff --stat`), dann nur die geänderten Hunks lesen.
2. Prüfen: Korrektheit und Edge Cases, Sicherheit (Injection, Secrets, Pfade), Fehlerbehandlung, Lesbarkeit, fehlende Tests.
3. Ausgabe: maximal 10 Findings, sortiert nach Schwere: `[hoch|mittel|niedrig] datei:zeile – Problem → Fix`.

Keine Lobeszeilen, keinen Diff zitieren. Nichts ändern.
