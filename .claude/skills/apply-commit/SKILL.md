---
name: apply-commit
description: Draft a Conventional Commit message from staged changes, ask for confirmation, then run `git commit` using that message.
---

# apply-commit Skill

## Goal
Draft a high-quality Conventional Commit message from **staged changes** and (after user confirmation) run `git commit` with the drafted message.

## Operating rules
- Repository content is **English-only**.
- Use **only staged changes**. If nothing is staged, say so and stop.
- Do **not** run `git add` automatically.
- The body must contain an essential summary (no filler): **What / Why / Impact**.
- Output must be minimal: show the draft, ask for confirmation, then commit if confirmed.
- Attribution footer is included by default unless the user explicitly asks to omit it.
- Attribution formatting: insert a blank line between the tool line and `Co-Authored-By:`. `Co-Authored-By:` must start at column 1.

## How to gather context (recommended)
1. `git status --porcelain`
2. `git diff --cached --stat`
3. `git diff --cached`

## Draft format (required)
```
<type>(<scope>): <imperative summary>

- What: ...
- Why: ...
- Impact: ...

🤖 Assisted by [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Apply workflow
1) Draft the commit message exactly in the format above.
2) Ask the user:
`Proceed to run git commit with this message? (yes/no)`
3) If user says **yes**, run `git commit` using a temporary file to preserve formatting:
- `TMPFILE="$(mktemp)"`
- Write the drafted message verbatim into "$TMPFILE"
- `git commit -F "$TMPFILE"`
- `rm -f "$TMPFILE"`
4) Print minimal confirmation:
- `git log -1 --oneline`

If user says **no**, stop after drafting.
