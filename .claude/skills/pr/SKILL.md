---
name: pr
description: PR-Titel und Beschreibung (Zusammenfassung, Änderungen, Tests, Risiken) aus dem Diff erzeugen.
argument-hint: '[base-branch]'
---

1. Base = Argument `$ARGUMENTS`, sonst `main`. `git log --oneline <base>..HEAD` und `git diff --stat <base>...HEAD`; Hunks nur bei Bedarf lesen.
2. Ausgabe als Markdown:
   - Titel (Conventional Commit, maximal 72 Zeichen)
   - `## Zusammenfassung` (2–3 Sätze), `## Änderungen` (Bulletpoints), `## Tests`, `## Risiken`
3. PR **nicht** erstellen. Nur nach ausdrücklicher Bestätigung `gh pr create` ausführen (der Hook fragt erneut).
