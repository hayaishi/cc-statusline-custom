---
name: applying-commits
description: Drafts a Conventional Commit message from staged changes, confirms with the user, then runs git commit. Use when the user asks to commit staged changes.
---

# Applying Commits

## Instructions

Follow this workflow to draft and apply a git commit for the current repository.

### 1. Constraints

- **English output only**.
- **Staged changes only**: Verify with `git diff --staged`. If empty, stop and inform user. Do not run `git add`.
- **Minimal output**: Show draft, confirm, commit.

### 2. Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/).

```text
<type>(<scope>): <imperative summary>

- What: ...
- Why: ...
- Impact: ...

🤖 Assisted by [Gemini CLI](https://github.com/google-gemini/gemini-cli)

Co-Authored-By: Gemini CLI <gemini-cli@users.noreply.github.com>
```

**Requirements:**
- **Body**: Specific change, rationale, and impact (behavior/perf/breaking/migration or 'none').
- **Footer**: Include attribution unless explicitly omitted. Ensure blank line between tool signature and `Co-Authored-By`.

### 3. Workflow

1.  **Context Gathering**:
    ```bash
    git status --porcelain
    git diff --staged --stat
    git diff --staged
    ```

2.  **Drafting**: Present the message using the format above.

3.  **Confirmation**: Ask "Proceed to run git commit with this message? (yes/no)"

4.  **Execution** (if confirmed):
    - Write the exact drafted message to a temporary file.
    - Run:
      ```bash
      git commit -F "$TMP_FILE"
      rm -f "$TMP_FILE"
      git log -1 --oneline
      ```
