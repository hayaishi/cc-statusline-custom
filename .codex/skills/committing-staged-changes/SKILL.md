---
name: committing-staged-changes
description: >
  Drafts a Conventional Commit message from staged changes, confirms with the user,
  and runs `git commit` using that message. Use when you need to commit staged changes
  with a Conventional Commit message.
metadata:
  short-description: Draft + confirm + commit staged changes
---

# committing-staged-changes Skill

## Goal
Draft a Conventional Commit message from staged changes, confirm with the user, then run `git commit`.

## Rules
- English-only output.
- Base the message on staged changes only (`git diff --cached`).
- If nothing is staged, say so and stop.
- Do not stage files.
- Body must include What / Why / Impact (no filler).
- Output must be minimal: show the draft, ask for confirmation, then commit if confirmed.
- Attribution footer is included by default unless the user explicitly asks to omit it.
- Attribution formatting: include a blank line before `Co-Authored-By:` and ensure `Co-Authored-By:` starts at column 1.

## Draft message format
```
<type>(<scope>): <imperative summary>

- What: ...
- Why: ...
- Impact: ...

🤖 Assisted by [OpenAI Codex](https://github.com/openai/codex)

Co-Authored-By: Codex <codex@users.noreply.github.com>
```

## Workflow
1) Draft the message in the format above.
2) Ask the user: `Proceed to run git commit with this message? (yes/no)`
3) If the user says **yes**, run:
- `TMPFILE="$(mktemp)"`
- Write the drafted message verbatim into "$TMPFILE"
- `git commit -F "$TMPFILE"`
- `rm -f "$TMPFILE"`
4) Print minimal confirmation: `git log -1 --oneline`

If user says **no**, stop after drafting.
