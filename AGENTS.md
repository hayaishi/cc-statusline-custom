# AGENTS.md - cc-statusline-custom Development Guidelines

This document defines required rules for human and AI contributors.
`CLAUDE.md` is the compact subset; this file is the full source of truth.

## Project Scope

- Project: `cc-statusline-custom` (ccusage integration for Claude Code `/statusline`)
- Runtime targets: macOS and Linux
- Priority goals:
  1. Reliability: statusline must always return output
  2. Performance: target response within 300ms
  3. Maintainability: test-first, clear structure

## Language and Coding Rules

- Language: TypeScript with ESModules only (no CommonJS)
- Import paths: use relative imports; do not use TS-only aliases like `@/`
- Naming:
  - Files: kebab-case
  - Classes/types/interfaces: PascalCase
  - Functions/variables: camelCase
  - Constants/env vars: SCREAMING_SNAKE_CASE
- `any` is prohibited; use `unknown` + type guards
- Do not leave debug `console.log` statements in production code
- Do not hardcode secrets
- Do not use `set -e` in shell scripts for statusline-related flows

## Development Workflow (Mandatory TDD)

Follow this cycle for all changes:

1. RED: write a failing test first
2. GREEN: implement the minimum code to pass
3. REFACTOR: improve code while keeping tests green

Required practices:

- Run `npm test` after every change
- Unit tests live next to source: `src/**/*.test.ts`
- Integration tests live in `tests/integration/`
- Test names follow: `should <expected behavior> when <condition>`
- Unit coverage must remain >= 80%

Useful commands:

- `npm test`
- `npm run test:coverage`
- `npm run check`
- `npm run build`

## Reliability and Error Handling

Critical rule: statusline must never be silent.

- Top-level flows must catch errors and return fallback output
- Prefer recovery order:
  1. defaults and continue
  2. cached data
  3. explicit fallback display
- Log errors with a stable prefix (no token leakage)

## Security Rules

- Validate all external input (stdin, env vars, files)
- Keep OAuth tokens in memory when possible; never log full token values
- Mask sensitive values in logs
- When writing sensitive cache/token files, use restrictive permissions (`600`)

## Architecture Snapshot (Current Repository)

- `src/index.ts`: CLI entrypoint
- `src/config/`: env + plugin config
- `src/core/`: parser, formatter, cache, plugin segments, statusline
- `src/updater/`: token and cache update execution
- `src/experimental/subscription-usage/`: optional subscription segments
- `src/utils/`: CLI args, time/format/color/hash/debug helpers
- `src/types/`: shared types
- `tests/`: integration tests, fixtures, helpers
- `dist/`: build output

Dependency direction should stay one-way:
CLI/config -> core/updater -> utils -> types

Avoid circular dependencies.

## Dependency Policy

Before adding a dependency, confirm:

1. It is necessary (cannot be implemented simply in-house)
2. It is lightweight and actively maintained
3. It passes security checks (`npm audit`)

Preferred existing lightweight choices in this repo include `picocolors` and `yaml`.

Avoid introducing heavy general-purpose packages when small focused alternatives exist
(for example: avoid adding `moment`, `lodash`, or `chalk`).

## Git and Documentation Rules

- Branch naming:
  - `feature/<issue>-<summary>`
  - `fix/<issue>-<summary>`
  - `refactor/<summary>`, `docs/<summary>`, `test/<summary>`
- Commit messages: Conventional Commits
  - `<type>(<scope>): <description>`
  - types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
- Breaking changes must be called out clearly in PR and `CHANGELOG.md`
- Repository language is English-only for docs, comments, logs, and commit messages

## AI Agent Notes

- Read `AGENTS.md` and `CLAUDE.md` before starting changes
- When changing code, add/update related tests in the same task
- Check existing patterns before introducing new structure
- If MCP is available:
  - Use Serena for code search/navigation/refactors
  - Use Context7 when unsure about external APIs and prefer official docs

## References

- `README.md`
- `CLAUDE.md`
- `CHANGELOG.md`
