# ccusage-statusline-custom

Custom statusline integration for [Claude Code](https://claude.com/claude-code) with usage statistics.

## Overview

This tool provides a customizable statusline for Claude Code's `/statusline` feature, displaying model info, session cost, and context usage metrics.

**Output Format:** `Model | $Cost | Usage%`

Example: `Opus | $0.23 | 42%`

## Features

- TypeScript ESM architecture
- Always outputs exactly one visible line (NEVER silent)
- Responds within 300ms (no network calls in hot path)
- Exit code always 0
- Graceful degradation on invalid input
- Extended metrics via file-based cache (optional)
- Cross-platform support (macOS, Linux)

## Installation

```bash
npm install
npm run build
```

## Usage

The CLI reads JSON input from stdin and outputs a statusline to stdout:

```bash
echo '{"model":{"display_name":"Claude Opus 4.5"},"cost":{"total_cost_usd":0.23},"context_window":{"used_percentage":42}}' | ./dist/index.js
# Output: Opus | $0.23 | 42%
```

The built artifact is directly executable (has shebang and execute permissions).

### Input Schema

The CLI accepts Claude Code's status JSON:

```typescript
{
  model?: { display_name?: string; id?: string } | string;
  cost?: { total_cost_usd?: number };
  cost_usd?: number;  // backward compat
  context_window?: { used_percentage?: number };
}
```

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

## Extended Metrics

When `CCUSAGE_EXTENDED_METRICS=true`, the statusline includes cached metrics:

```
Opus | $0.23 | 42% | $1.50 today | $0.25/hr
```

### Cache Updater

Update the cache periodically (e.g., via cron):

```bash
./dist/index.js --update-cache
```

The cache is stored in `~/.cache/ccusage-statusline/` (configurable).

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CCUSAGE_EXTENDED_METRICS` | `false` | Enable extended metrics from cache |
| `CCUSAGE_CACHE_DIR` | `~/.cache/ccusage-statusline` | Cache directory path |
| `CCUSAGE_CACHE_TTL` | `60` | Cache TTL in seconds |
| `CCUSAGE_CONTEXT_LOW_THRESHOLD` | `50` | Low context usage threshold (%) |
| `CCUSAGE_CONTEXT_MEDIUM_THRESHOLD` | `80` | Medium context usage threshold (%) |
| `CCUSAGE_DEBUG` | `false` | Enable debug output |

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
├── types/
│   ├── claude-code.ts    # Claude Code input types
│   ├── cache.ts          # Cache entry types
│   └── metrics.ts        # Formatted metrics types
├── config/
│   └── env.ts            # Environment variable config
├── core/
│   ├── parser.ts         # JSON parsing
│   ├── statusline.ts     # Statusline generation
│   ├── formatter.ts      # Metric formatters
│   ├── cache.ts          # Cache write utilities
│   ├── cache-reader.ts   # Cache read (hot path)
│   └── cache-updater.ts  # Cache update subcommand
└── utils/
    ├── stdin.ts          # Stdin reading
    └── format.ts         # Number formatting
tests/
├── integration/          # E2E tests
│   ├── statusline.test.ts
│   ├── update-cache.test.ts
│   └── no-network.test.ts  # Issue #455 regression
└── fixtures/             # Test data
```

## Guarantees

1. **NEVER silent:** Always outputs at least one visible line to stdout
2. **Exit code:** Always exits with code 0
3. **Performance:** Responds within 300ms
4. **No network:** Hot path never makes network calls (Issue #455)
5. **Fallback:** Returns visible fallback string on any error

## Test Coverage

Minimum 80% code coverage required (currently 94%+).

## License

MIT
