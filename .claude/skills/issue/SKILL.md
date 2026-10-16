---
name: issue
description: GitHub-Issue read-only lesen und Akzeptanzkriterien plus Plan extrahieren.
argument-hint: <issue-nr | url>
---

1. Über den GitHub-MCP (`issue_read`) nur Titel, Labels, Status, Body und relevante Kommentare holen (keine Reaktionen, keine Timeline).
2. Ausgabe:
   - **Kurzfassung** (2 Sätze)
   - **Akzeptanzkriterien** (Checkliste)
   - **Offene Fragen**
   - **Plan** (maximal 6 Bulletpoints, wie `/plan-task`)

Nichts auf GitHub schreiben.
