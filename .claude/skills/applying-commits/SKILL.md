---
name: applying-commits
description: >
  Creates Conventional Commit messages from staged changes and commits them.
  Use when ready to commit staged work with a structured, informative message.
---

# Applying Commits

Draft a Conventional Commit message from staged changes, confirm with user, then commit.

## Context gathering

```bash
git status --porcelain
git diff --cached --stat
git diff --cached
```

## Draft format

```
<type>(<scope>): <imperative summary>

- What: [essential change description]
- Why: [motivation or problem solved]
- Impact: [affected behavior or components]

🤖 Assisted by [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Type conventions

| Type | Use for |
|------|---------|
| `feat` | New capability |
| `fix` | Bug correction |
| `refactor` | Code restructure (no behavior change) |
| `docs` | Documentation only |
| `test` | Test additions/changes |
| `chore` | Build, config, dependencies |

## Workflow

1. **Draft** the message in the format above
2. **Ask**: `Proceed to run git commit with this message? (yes/no)`
3. **If yes**, commit using temp file:
   ```bash
   TMPFILE="$(mktemp)"
   # write message to $TMPFILE
   git commit -F "$TMPFILE"
   rm -f "$TMPFILE"
   ```
4. **Confirm**: `git log -1 --oneline`

## Rules

- Work only with **staged changes** (stop if nothing staged)
- Never auto-stage files with `git add`
- Keep body essential (no filler sentences)
- Repository language: English
- Include attribution footer unless user explicitly opts out
- Blank line before `Co-Authored-By:` line

## If nothing staged

```
No staged changes found. Stage files with:
  git add <file>
```
