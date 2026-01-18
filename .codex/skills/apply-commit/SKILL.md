---
name: apply-commit
description: Draft a Conventional Commit message from staged changes, ask for confirmation, then run `git commit` using that message.
metadata:
  short-description: Draft + confirm + run git commit (staged-only)
---

# apply-commit Skill

## Goal
Draft a Conventional Commit message from **staged changes**, then (after explicit user confirmation) run `git commit`.

## Rules
- English-only output.
- Base the message on **staged** changes only (`git diff --cached`).
- If nothing is staged, say so and stop.
- Do not stage files automatically.
- Body must include **What / Why / Impact** (no filler).
- Output must be minimal: show the draft, ask for confirmation, then commit if confirmed.
- Attribution footer is included by default unless the user explicitly asks to omit it.
- Attribution formatting: include a blank line before `Co-Authored-By:` and ensure `Co-Authored-By:` starts at column 1.

## Draft output format (required)
```
<type>(<scope>): <imperative summary>

- What: ...
- Why: ...
- Impact: ...

🤖 Assisted by [OpenAI Codex](https://github.com/openai/codex)

Co-Authored-By: Codex <codex@users.noreply.github.com>
```

## Apply workflow
1) Draft the message exactly in the format above.
2) Ask the user:
`Proceed to run git commit with this message? (yes/no)`
3) If user says **yes**, run:
- `TMPFILE="$(mktemp)"`
- Write the drafted message verbatim into "$TMPFILE"
- `git commit -F "$TMPFILE"`
- `rm -f "$TMPFILE"`
4) Print minimal confirmation:
- `git log -1 --oneline`

If user says **no**, stop after drafting.
