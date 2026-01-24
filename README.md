# ccusage-statusline-custom

Custom statusline integration for Claude Code that renders model, session cost, context usage, and subscription usage (from cache).

## Overview

The statusline output is a single line with ` | ` separators and emoji-prefixed segments:

```
🤖 <Model> | 💰 $<session> sess | 🧠 <used>/<limit> [████░░░░] <pct>% | 📦 <pct>% [████░░░░] (~h:mmam/pm)
```

Segments are omitted when their input data is missing or invalid. The 📦 segment is appended only if at least one other segment is present. When nothing can be rendered, the fallback is:

```
🤖 ? | ⏳ Loading...
```

## Output Examples

```
🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] 42% | 📦 55% [████░░░░] (~3:45pm)
🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] 42% | 📦 Loading...
🤖 Opus | 🧠 84.0k/200k [███░░░░░] 42% | 📦 Fetch Error...
```

## Installation

```bash
npm install
npm run build
```

The built artifact is directly executable (shebang included). If needed:

```bash
chmod +x dist/index.js
```

## Usage

The CLI reads JSON from stdin and outputs a single statusline:

```bash
echo '{"model":{"display_name":"Claude Opus 4.5"},"cost":{"total_cost_usd":0.23},"context_window":{"used_percentage":42,"context_window_size":200000,"current_usage":{"input_tokens":80000,"output_tokens":4000}}}' | ~/git/ccusage-statusline-custom/dist/index.js
```

From the repo root, direct execution works as well:

```bash
echo '{}' | ./dist/index.js
```

Update the cache (out-of-band):

```bash
~/git/ccusage-statusline-custom/dist/index.js --update-cache
```

### Segment Order/Visibility

Control which segments are shown and their order:

```bash
# Show only model and context
./dist/index.js --segments=model,context

# Short form
./dist/index.js -s model,ctx

# Reverse order
./dist/index.js -s context,cost_session,model
```

Available segment identifiers:

| Canonical ID | Aliases |
|--------------|---------|
| `model` | - |
| `cost_session` | `cost`, `cost_usd`, `cost_sess`, `sess` |
| `context` | `ctx` |
| `subscription_usage` | `usage`, `subscription`, `sub_usage`, `sub` |

Resolution order: **CLI > ENV > DEFAULT**

- Unknown tokens are silently ignored
- Empty/invalid CLI values fall back to default (not env)
- If multiple `--segments`/`-s` flags are provided, the last one wins

## Claude Code Integration

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/git/ccusage-statusline-custom/dist/index.js",
    "padding": 0
  }
}
```

Direct execution is supported; no `node` prefix is required.

### Optional: refresh cache via hooks (--update-cache)

The statusline hot path is offline/no-network and reads the local cache for 📦. Keep the cache fresh by running `dist/index.js --update-cache` in hooks; this keeps 📦 up to date without impacting the hot path. The hook command redirects stdout/stderr and uses `|| true` so it never breaks sessions. `--update-cache` may use network/child_process and is intentionally separated from the hot path.

Combined statusLine + hooks example (copy/paste):

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/git/ccusage-statusline-custom/dist/index.js",
    "padding": 0
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME\"/git/ccusage-statusline-custom/dist/index.js --update-cache >/dev/null 2>&1 || true",
            "timeout": 15
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME\"/git/ccusage-statusline-custom/dist/index.js --update-cache >/dev/null 2>&1 || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Hooks-only example:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME\"/git/ccusage-statusline-custom/dist/index.js --update-cache >/dev/null 2>&1 || true",
            "timeout": 15
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$HOME\"/git/ccusage-statusline-custom/dist/index.js --update-cache >/dev/null 2>&1 || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Input Schema

Relevant fields used by the statusline:

```typescript
{
  model?: { display_name?: string; id?: string } | string;
  cost?: { total_cost_usd?: number };
  cost_usd?: number; // backward compat
  context_window?: {
    used_percentage?: number;
    context_window_size?: number;
    current_usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
}
```

Notes:
- `model.display_name` is preferred, falling back to `model.id` or the string value. If the name contains "Opus", "Sonnet", or "Haiku", that family name is shown.
- `cost.total_cost_usd` (or `cost_usd`) renders as `💰 $X.XX sess`.
- `context_window.used_percentage` drives the percentage and progress bar. It is rounded with `Math.round` and clamped to 0–100 (e.g., 42.5 → 43).
- `context_window.current_usage` may be `null` or omitted; tokens show as `0` in that case. The current token count is the sum of input/output/cache token fields.
- Output is always a single visible line; invalid input never throws.

## Formatting Details

- Token formatting uses lowercase suffixes:
  - Current usage (numerator): 1 decimal for k/m (`84.0k`, `1.5m`).
  - Limit (denominator): compact k/m without `.0` (`200k`, `2m`).
  - Values under 1000 are shown as integers (`999`).
- Progress bars are 8 characters wide and use `█` (filled) and `░` (empty).
- Context bars and percentages are colorized (green/yellow/red) based on thresholds when ANSI colors are enabled.
- Reset time is rendered in local time as `~h:mmam/pm` (lowercase am/pm).

## Cache and Updater

### Cache files

Default cache directory: `~/.cache/ccusage-statusline` (override with `CCSTATUSLINE_CACHE_DIR`).

Files:
- `subscription-usage.json` (written by `--update-cache`)
- `cache.lock` (writer lock file; short-lived)

### 📦 segment behavior

The statusline reads cache synchronously (hot path) and never uses network or child processes.

- If `subscription-usage.json` is present, fresh (mtime < TTL), and contains a valid payload, the segment renders:
  `📦 <pct>% [████░░░░] (~h:mmam/pm)`
- If a cache entry exists, the last update attempt was recent (within TTL), and the payload is not usable, it renders:
  `📦 Fetch Error...`
- Otherwise it renders:
  `📦 Loading...`

TTL is mtime-based and controlled by `CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL` (seconds).

### --update-cache behavior

`--update-cache` runs out-of-band and may use both `child_process` and network:
- Reads an OAuth token from macOS Keychain (via `security`) or from `~/.claude.json` / `~/.config/claude/credentials.json`.
- Calls the OAuth usage endpoint over HTTPS.
- Writes `subscription-usage.json` atomically and removes `cache.lock` when finished.

It always prints a single visible line and exits with code 0. The hot path guarantees do not apply to the updater.

## Configuration

Environment variables (only these affect behavior):

| Variable | Default | Description |
|----------|---------|-------------|
| `CCSTATUSLINE_CACHE_DIR` | `~/.cache/ccusage-statusline` | Cache directory |
| `CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL` | `60` | Subscription usage cache TTL (seconds, mtime-based) |
| `CCSTATUSLINE_CONTEXT_LOW_THRESHOLD` | `50` | Green threshold for context usage (%) |
| `CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD` | `80` | Yellow threshold for context usage (%) |
| `CCSTATUSLINE_SEGMENTS` | (none) | Segment order/visibility (comma-separated) |

`CCSTATUSLINE_EXTENDED_METRICS` is parsed but currently unused (no effect).

## Guarantees

Hot path (statusline generation):
1. Always outputs exactly one visible line
2. Always exits with code 0
3. Completes within 300ms
4. No network or child_process usage in hot path modules
5. Visible fallback on any error: `🤖 ? | ⏳ Loading...`

The updater path (`--update-cache`) is intentionally excluded from the no-network/child_process guarantee.

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
│   ├── cache.ts          # Cache write utilities (updater)
│   └── cache-reader.ts   # Cache read (hot path)
├── updater/
│   ├── oauth.ts          # OAuth usage fetch
│   ├── token.ts          # OAuth token lookup
│   └── update-cache.ts   # Cache update logic
└── utils/
    ├── cli-args.ts       # CLI argument parsing
    ├── colors.ts         # ANSI coloring
    ├── format.ts         # Number formatting
    ├── stdin.ts          # Stdin reading
    └── time.ts           # Reset time formatting
tests/
├── integration/
│   ├── no-network.test.ts
│   ├── statusline.test.ts
│   └── update-cache.test.ts
├── fixtures/
│   └── claude-code-input.json
└── helpers/
    └── updater-mocks.mjs
```

## License

MIT
