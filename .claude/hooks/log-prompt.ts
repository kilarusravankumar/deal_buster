// Claude Code UserPromptSubmit hook: appends every prompt to PROMPTS.md.
// Receives JSON on stdin: { session_id, prompt, cwd, ... }.
// Must print nothing to stdout (stdout would be injected into Claude's context).
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

try {
  const input = JSON.parse(await Bun.stdin.text());
  const prompt: string = (input.prompt ?? "").trim();
  const sessionId: string = input.session_id ?? "unknown";
  const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const file = join(root, "PROMPTS.md");

  // Skip empty prompts and built-in housekeeping commands.
  if (!prompt || /^\/(clear|compact|exit|quit|cost|help|status|resume)\b/.test(prompt)) process.exit(0);

  if (!existsSync(file)) {
    writeFileSync(
      file,
      "# Prompt History\n\nEvery prompt sent to Claude Code while building this project, captured automatically by a `UserPromptSubmit` hook (`.claude/hooks/log-prompt.ts`). Outcome notes are added afterwards via the `prompt-log` skill.\n",
    );
  }

  const log = readFileSync(file, "utf8");
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  let out = "";

  // New Claude Code session → new section header.
  if (!log.includes(`<!-- session:${sessionId} -->`)) {
    const date = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
    out += `\n## Session ${date} <!-- session:${sessionId} -->\n`;
  }

  const n = (log.match(/^\*\*Prompt \d+\*\*/gm)?.length ?? 0) + 1;
  const quoted = prompt.split("\n").map((l) => `> ${l}`).join("\n");
  out += `\n**Prompt ${n}** · ${time}\n${quoted}\n`;

  appendFileSync(file, out);
} catch {
  // Never block the prompt because logging failed.
}
process.exit(0);
