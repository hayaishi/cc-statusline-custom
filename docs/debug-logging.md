# Debug Logging Guide

This guide explains how debug logging works in `cc-statusline-custom`.

## Overview

When debug mode is enabled, the tool writes structured JSON lines (JSONL) to a debug log file.

Logged events:
- `statusline.stdin`: raw JSON payload received from stdin for statusline rendering
- `oauth.usage.response`: raw response body and status code from `https://api.anthropic.com/api/oauth/usage`

## Enable Debug Mode

Debug mode is enabled when either condition is true:
- CLI flag: `--debug`
- Environment variable: `CCSTATUSLINE_DEBUG=true` or `CCSTATUSLINE_DEBUG=1`

## Debug Log Behavior

- Log file writes are append-only.
- Rotation is size-based.
- Logging is best-effort and never interrupts statusline output.

## Debug Log Configuration

These environment variables control debug log output.

| Variable | Description | Default |
| --- | --- | --- |
| `CCSTATUSLINE_DEBUG_LOG_PATH` | Path to debug log file. | `${CCSTATUSLINE_CACHE_DIR}/debug/statusline-debug.log` |
| `CCSTATUSLINE_DEBUG_LOG_MAX_BYTES` | Max size (bytes) for active debug log before rotation. | `1048576` (1 MiB) |
| `CCSTATUSLINE_DEBUG_LOG_MAX_FILES` | Number of rotated log files to retain (`.1`, `.2`, ...). | `5` |

## Rotation Details

When the active log would exceed `CCSTATUSLINE_DEBUG_LOG_MAX_BYTES`:
1. Existing rotated files shift up (`.1` -> `.2`, etc.)
2. The oldest retained file is removed when exceeding `CCSTATUSLINE_DEBUG_LOG_MAX_FILES`
3. Current active log becomes `.1`
4. A new active log file is created and appended

## Example

```bash
CCSTATUSLINE_DEBUG=1 \
CCSTATUSLINE_DEBUG_LOG_MAX_BYTES=262144 \
node ./dist/index.js --disable-bg-update
```
