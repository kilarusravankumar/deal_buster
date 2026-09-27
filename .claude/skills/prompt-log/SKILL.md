---
name: prompt-log
description: Annotate PROMPTS.md with short outcome notes for prompts logged this session. Use when the user runs /prompt-log, asks to update the prompt history, or before committing at the end of a work session.
---

# prompt-log

`PROMPTS.md` is the AI prompt history required for the Cloudflare assignment submission. A `UserPromptSubmit` hook (`.claude/hooks/log-prompt.ts`) already appends every prompt verbatim. This skill only adds what the hook can't: what each prompt produced.

## Steps

1. Read `PROMPTS.md`. Find `**Prompt N**` entries that have no `*Outcome:*` line after their quoted text.
2. For each one from the current session, add a single line directly under the quote:
   `*Outcome:* <one sentence: what changed — files touched, decision made, or "no change (question/exploration)">`
   Base it on what actually happened in this session. For prompts from earlier sessions you have no record of, write `*Outcome:* (not recorded)` rather than guessing.
3. If the session produced commits, append the short hash(es) to the relevant outcome: `(commit abc1234)`.

## Rules

- Never edit, reword, reorder, or delete the quoted prompt text. It must stay verbatim.
- Never add prompts that aren't already in the file.
- Keep outcomes factual and one line each. No self-praise, no summaries of the whole session.
- Don't touch the `<!-- session:... -->` markers; the hook uses them.
