# CLAUDE.md

VS Code extension ("Docker Compose Sorter") that sorts and formats Docker Compose files while preserving comments. Single-file implementation: all logic lives in `src/extension.ts` (formatter provider + `DockerComposeSorter` AST engine built on the `yaml` package).

## Commands

- `npm run compile` — TypeScript build to `out/`
- `npm run lint` / `npm run format` — ESLint / Prettier (Prettier owns formatting)
- `npm test` — Mocha/Chai suite via `vscode-test` (downloads VS Code on first run)
- `npx @vscode/vsce package` — build the VSIX locally

## Invariants — do not break

- **Marketplace ID `SashaBusinaro.yaml-compose-sorter` is immutable**: never rename the `name` field or the `yaml-compose-sorter.*` setting keys; only `displayName` may differ.
- Comments must survive sorting (AST manipulation only, never string-based rewrites).
- Top-level `x-*` extension fields stay **before** the keys that reference their anchors, in their original relative order (issue #6).
- Line endings (LF/CRLF), multi-document files (`---`), anchors/aliases and merge keys (`<<`) must round-trip; sorting must be idempotent. All covered by tests in `src/test/suite/sorter.test.ts` — add a regression test for every bug fix.

## Workflow

Conventional commits required (release-please derives versions/CHANGELOG from them). PRs need the `test` CI check green. Merging the release-please PR creates a GitHub Release, which triggers the Marketplace publish (`VSCE_PAT` secret). Pre-commit hook runs lint-staged (ESLint + Prettier).
