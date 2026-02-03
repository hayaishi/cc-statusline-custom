# CLAUDE.md

Full project guidelines and conventions are maintained in [AGENTS.md](./AGENTS.md).
The rules below are the essential subset that must always be followed.

---

## Development Workflow: TDD is mandatory

All work follows the TDD cycle strictly. Do not skip any phase.

```
1. RED   — Write a failing test first
2. GREEN — Write the minimal code to make it pass
3. REFACTOR — Improve code while keeping all tests passing
```

- Run tests with `npm test` after every change
- Unit tests live next to the source: `src/**/*.test.ts`
- Integration tests go in `tests/integration/`
- Test names follow: `should <expected behavior> when <condition>`
- Unit test coverage must stay at or above 80%

## Must-follow Rules

- Language: TypeScript with ESModules only (no CommonJS)
- `any` type is prohibited — use `unknown` with type guards
- Statusline must NEVER be silent — always return fallback output on error
- No `console.log` debug statements left in production code
- All documentation, comments, and commit messages must be in English
- Commits use Conventional Commits: `<type>(<scope>): <description>`

## MCP Tools (use when available)

- **Serena** — required for code search (do not use grep/rg directly)
- **Context7** — use for official docs lookup before implementing unfamiliar APIs
