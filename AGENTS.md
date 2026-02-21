# Commands

- `npm test` — run after every change
- `npm run test:coverage` — coverage must stay >= 80%
- `npm run check` — full lint + type check
- `npm run build`

# Development Workflow (TDD is mandatory)

1. RED: write a failing test first
2. GREEN: implement the minimum code to pass
3. REFACTOR: improve code while keeping tests green

- Unit tests live next to source: `src/**/*.test.ts`
- Integration tests go in `tests/integration/`
- Test names follow: `should <expected behavior> when <condition>`

# Project Scope

- Runtime targets: macOS and Linux
- Priority goals:
  1. Reliability: statusline must always return output
  2. Performance: target response within 300ms
  3. Maintainability: test-first, clear structure

# Coding Rules

- TypeScript with ESModules only (no CommonJS)
- Import paths: use relative imports; do not use TS-only aliases like `@/`
- `any` is prohibited; use `unknown` + type guards
- No debug `console.log` statements in production code
- No hardcoded secrets
- Do not use `set -e` in shell scripts for statusline-related flows
- All documentation, comments, and commit messages must be in English

# Reliability and Error Handling

**IMPORTANT:** Statusline must NEVER be silent.

- Top-level flows must catch errors and return fallback output
- Recovery order:
  1. Defaults and continue
  2. Cached data
  3. Explicit fallback display

# Security

- Validate all external input (stdin, env vars, files)
- Keep OAuth tokens in memory when possible; never log full token values
- Mask sensitive values in logs; use a stable error prefix (no token leakage)
- Sensitive cache/token files must use restrictive permissions (`600`)

# Architecture

Dependency direction must stay one-way:
`CLI/config -> core/updater -> utils -> types`

Avoid circular dependencies.

# Dependencies

- Prefer existing lightweight packages: `picocolors`, `yaml`
- Avoid heavy general-purpose packages (`moment`, `lodash`, `chalk`)
- New dependencies must be necessary, lightweight, and pass `npm audit`

# Git Conventions

- Branch naming: `feature/<issue>-<summary>`, `fix/<issue>-<summary>`, `refactor/<summary>`, `docs/<summary>`, `test/<summary>`
- Commits use Conventional Commits: `<type>(<scope>): <description>`
- Breaking changes must be called out in PR and `CHANGELOG.md`
