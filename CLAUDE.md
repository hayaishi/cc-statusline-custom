# Commands

- `npm test` — run after every change (TDD is mandatory: write a failing test first)
- `npm run test:coverage` — unit test coverage must stay >= 80%
- `npm run check` — full lint + type check

# Testing

- Unit tests live next to source: `src/**/*.test.ts`
- Integration tests go in `tests/integration/`
- Test names follow: `should <expected behavior> when <condition>`

# Rules

- TypeScript with ESModules only (no CommonJS)
- `any` type is prohibited — use `unknown` with type guards
- **IMPORTANT:** Statusline must NEVER be silent — always return fallback output on error
- No `console.log` debug statements left in production code
- All documentation, comments, and commit messages must be in English
- Commits use Conventional Commits: `<type>(<scope>): <description>`

# MCP Tools (use when available)

- **Serena** — use for code search (do not use grep/rg directly)
- **Context7** — use for official docs lookup before implementing unfamiliar APIs

Full project guidelines: [AGENTS.md](./AGENTS.md)
