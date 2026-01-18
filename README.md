# ccusage-statusline-custom

Custom statusline integration for [Claude Code](https://claude.com/claude-code) with ccusage statistics.

## Overview

This tool provides a customizable statusline for Claude Code's `/statusline` feature, integrating usage statistics from ccusage.

**Current Status:** Bootstrap phase - minimal CLI skeleton

## Features

- TypeScript ESM architecture
- Always outputs exactly one line (never silent, per Claude Code requirements)
- Responds within 300ms
- Cross-platform support (macOS, Linux)

## Installation

```bash
npm install
npm run build
```

## Usage

The CLI reads JSON input from stdin and outputs a statusline to stdout:

```bash
echo '{}' | ./dist/index.js
```

The built artifact is directly executable (has shebang and execute permissions).

### Claude Code Integration

Configure in Claude Code settings:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/dist/index.js",
    "padding": 0
  }
}
```

Note: Direct execution is preferred. The `node` prefix is not required.

## Development

### Prerequisites

- Node.js 20+
- npm

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run test` | Run tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |

### TDD Workflow

This project follows Test-Driven Development:

1. Write failing tests first (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor for clarity (REFACTOR)

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── types/                # Type definitions
│   └── claude-code.ts    # Claude Code input types
├── core/                 # Core logic
│   ├── parser.ts         # JSON parsing
│   └── statusline.ts     # Statusline generation
└── utils/                # Utilities
    └── stdin.ts          # Stdin reading
tests/
├── integration/          # E2E tests
└── fixtures/             # Test data
```

## Requirements

### Guarantees

1. **Never silent:** Always outputs at least one line to stdout
2. **Exit code:** Always exits with code 0
3. **Performance:** Responds within 300ms
4. **Fallback:** Returns a visible, non-empty fallback string on any error

### Test Coverage

Minimum 80% code coverage required (enforced by CI).

## License

MIT
