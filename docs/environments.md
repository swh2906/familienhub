# Umgebungen

Primäre Strategie: **Devcontainer** (`.devcontainer/`). Ohne Docker läuft alles direkt auf dem Host mit Node 24 und pnpm (`pnpm run bootstrap`). Nix wird nicht verwendet.

## Geräte

| Gerät          | OS              | Container-Runtime | Paketmanager | GPU/CUDA       | Stand / Lücken                                    |
| -------------- | --------------- | ----------------- | ------------ | -------------- | ------------------------------------------------- |
| Arbeitsrechner | Windows 11      | Docker Desktop    | winget       | nicht benötigt | Node 24, pnpm, git, gh, rg, fd, jq, Claude-CLI ok |
| Linux-Rechner  | _Distribution?_ | _Docker/Podman?_  | _apt/dnf?_   | nicht benötigt | _ergänzen_                                        |
| Mac (ggf.)     | macOS           | _?_               | brew         | nicht benötigt | _ergänzen_                                        |

## Bekannte Unterschiede

| Thema                     | Windows                                    | macOS / Linux | Container                              |
| ------------------------- | ------------------------------------------ | ------------- | -------------------------------------- |
| PocketBase-Binary         | `pocketbase.exe` (über `pnpm pb:download`) | `pocketbase`  | Linux-Binary, eigener Download         |
| Hooks                     | laufen über Git Bash, `node` nötig         | `node` nötig  | `node` (Feature)                       |
| Zeilenenden               | `.gitattributes` erzwingt LF               | LF            | LF                                     |
| `node_modules`            | Host                                       | Host          | eigenes Volume (keine Binär-Konflikte) |
| Playwright-Abhängigkeiten | `pnpm test:e2e:install`                    | ebenso        | `--with-deps` im postCreate            |

## Neues Gerät

1. Git und Node 24 installieren (`corepack enable` für pnpm), Repo klonen.
2. `GITHUB_PERSONAL_ACCESS_TOKEN` als Benutzer-Umgebungsvariable setzen; `gh auth login`.
3. Mit Docker: in VS Code „Reopen in Container“. Ohne Docker: `pnpm run bootstrap`.
4. Plugin `devkit@swh-tools` installieren (siehe claude-code-kit), Claude Code öffnen, `/devkit:doctor`; `pnpm run doctor` und `pnpm run sync-check`.
