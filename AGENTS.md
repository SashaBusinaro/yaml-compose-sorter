# AGENTS.md — Development Guidelines for AI Agents

Guidelines and architectural invariants for autonomous AI coding agents working on **Docker Compose Sorter**.

---

## 1. Project Overview & Identity

- **Extension Display Name**: `Docker Compose Sorter` (formerly `YAML Compose Sorter`)
- **Marketplace Package Name**: `yaml-compose-sorter`
- **Publisher**: `SashaBusinaro`
- **Marketplace Identifier**: `SashaBusinaro.yaml-compose-sorter`
- **Core Purpose**: VS Code extension that formats, sorts, and organizes Docker Compose files while preserving all comments (inline, block, header) and document structure.

---

## 2. Architecture & Directory Structure

The codebase is strictly partitioned into two layers:

```
src/
├── core/                  # PURE AST ENGINE (Zero VS Code dependencies)
│   ├── constants.ts       # Default key ordering, service groups, and recognized keys
│   ├── types.ts           # Type definitions and sorter configuration interfaces
│   ├── sorter.ts          # Core sorting engine (DockerComposeSorter) using 'yaml' AST
│   └── index.ts           # Public exports for the core engine
│
├── test/
│   ├── suite/
│   │   ├── sorter.test.ts     # Core AST engine unit tests
│   │   ├── adversary.test.ts  # Stress, boundary, and adversarial tests
│   │   ├── extension.test.ts  # VS Code API integration tests
│   │   └── index.ts           # Test runner setup
│   └── helpers.ts             # Test utility helpers
│
└── extension.ts           # VS CODE INTEGRATION LAYER
                           # Formatting provider, command registration, VS Code settings
```

### Layer Rules

- **`src/core/` must NEVER import `'vscode'`**. It must remain a pure Node.js / TypeScript module depending solely on the `yaml` npm package. This allows blazing fast (<100ms) unit testing outside of the VS Code Electron host.
- **`src/extension.ts`** connects VS Code's `DocumentFormattingEditProvider` and command palette to `src/core/`.

---

## 3. Immutable Invariants — Do Not Violate

1. **Marketplace ID & Settings Keys are Immutable**:
   - Never change `"name": "yaml-compose-sorter"` in `package.json`.
   - Never rename existing `yaml-compose-sorter.*` configuration keys. Changing them breaks user settings across thousands of installs.
2. **Pure AST Manipulation Only**:
   - Never perform string-based or regex replacements to sort YAML keys or manipulate comments.
   - All sorting, spacing, and transformations must operate on the Abstract Syntax Tree / Concrete Syntax Tree (`yaml` Document, Node, Pair, YAMLMap, YAMLSeq).
3. **Comment Preservation**:
   - Comments must survive sorting without displacement or loss.
   - Header comments stay at the top of the file/block.
   - Key-associated comments move with their respective keys.
   - Trailing comments at section boundaries must not accumulate empty blank lines on repeated runs (idempotency).
4. **Extension Fields (`x-*`) and Anchor Ordering**:
   - Top-level `x-*` blocks must remain **before** the services or keys that reference their YAML anchors (`*anchor`), maintaining their original relative order (issue #6).
5. **Round-Trip & Idempotency Fidelity**:
   - Line endings (LF vs CRLF) must be detected and preserved.
   - Multi-document YAML files separated by `---` must be preserved and sorted per document.
   - YAML merge keys (`<<: *anchor`) must round-trip cleanly.
   - Running the sorter multiple times on already sorted YAML must produce zero changes (`formatted === input`).
6. **Regression Testing**:
   - Every bug fix must include a regression test in `src/test/suite/sorter.test.ts` or `src/test/suite/adversary.test.ts`.

---

## 4. Commands & Verification

| Task                  | Command                    | Description                                                  |
| :-------------------- | :------------------------- | :----------------------------------------------------------- |
| **Compile**           | `npm run compile`          | TypeScript compiler build to `out/`                          |
| **Typecheck**         | `npm run typecheck`        | Strict type checking without emitting files (`tsc --noEmit`) |
| **Lint**              | `npm run lint`             | ESLint check across TypeScript sources                       |
| **Format Check**      | `npm run format:check`     | Prettier code style check                                    |
| **Format Fix**        | `npm run format`           | Prettier automatic formatting                                |
| **Unit Tests**        | `npm run test:unit`        | Fast pure-Node Mocha test suite (<100ms)                     |
| **Integration Tests** | `npm test`                 | VS Code extension test runner via `@vscode/test-cli`         |
| **Coverage**          | `npm run test:coverage`    | Full VS Code suite with coverage reporting (text and lcov)   |
| **Package VSIX**      | `npx @vscode/vsce package` | Package local `.vsix` bundle                                 |

---

## 5. Git & Release Workflow

- **Conventional Commits**: All commit messages and PR titles must adhere to the Conventional Commits specification:
  - `feat: ...` (triggers MINOR version bump)
  - `fix: ...` (triggers PATCH version bump)
  - `perf: ...` (triggers PATCH version bump)
  - `refactor: ...` (code change with no behavior change)
  - `docs: ...`, `chore: ...`, `test: ...`, `ci: ...`
- **Release Please**: Releases, version bumps, and `CHANGELOG.md` updates are automated via Google's Release Please.
  - Release Please creates release PRs targeting `main`.
  - When the release PR is merged, GitHub Actions automatically packages the `.vsix`, attaches it to the GitHub Release, and publishes to the VS Code Marketplace and Open VSX.
- **Pre-commit Hooks**:
  - Husky runs `lint-staged` (ESLint fix + Prettier write) and `npm run test:unit` before each commit.
  - Husky runs `commitlint` on the commit message.
