## Description

<!-- Describe your changes in detail. Focus on the rationale and architecture. -->

## Related Issues

<!-- Link any related issues, e.g. Closes #123, Fixes #456 -->

## Type of Change

- [ ] `fix`: Bug fix (patch release)
- [ ] `feat`: New feature (minor release)
- [ ] `perf`: Performance improvement
- [ ] `refactor`: Code refactoring with no behavior change
- [ ] `docs`: Documentation updates
- [ ] `chore`: Tooling, dependencies, or maintenance
- [ ] ⚠️ Breaking change (requires major release and explicit discussion)

## Invariants Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (used by Release Please)
- [ ] Pure AST engine (`src/core/`) has zero VS Code runtime dependencies
- [ ] Comments survive sorting without loss
- [ ] Top-level `x-*` anchor ordering and merge keys (`<<`) are preserved
- [ ] Multi-document files (`---`) and line endings (LF/CRLF) round-trip idempotently
- [ ] Marketplace ID (`SashaBusinaro.yaml-compose-sorter`) and `yaml-compose-sorter.*` settings remain unchanged
- [ ] Unit tests pass: `npm run test:unit`
- [ ] Linting & formatting pass: `npm run lint && npm run format:check`
