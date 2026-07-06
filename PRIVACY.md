# Privacy

Claude Radar runs entirely on your machine — it reads your local Claude Code history and writes local HTML reports.

## Data Read

- `~/.claude/projects/` — scanned for project directories and their `.jsonl` session files (session count, last-modified time, and message/tool content for the project you choose to analyze). System-injected content (compaction summaries, subagent side-chains, command echoes) is filtered out of analysis; slash-command *names* are counted.
- From the analyzed project's resolved working directory, filesystem metadata only:
  - `CLAUDE.md` / `CLAUDE.local.md` / `AGENTS.md` — presence and file size (size only, not contents).
  - `.mcp.json` — presence only (never parsed, never read).
  - `.claude/memory/` — presence and count of `.md` files.
  - `.claude/agents/` — presence and count of `.md` files.
  - `.claude/commands/` — presence and count of `.md` files.
  - `.claude/skills/` — presence and count of skill directories.
  - `.claude/settings.json` and `.claude/settings.local.json` — presence, plus the **count of hook event keys** under `hooks` (the file is parsed only to count those keys; hook commands, matchers, and all other settings values are never read into the analysis or the report).

## Data Written

- `~/.claude-radar/reports/` — the generated single-file HTML report.
- `~/.claude-radar/temp/` — intermediate facts/report JSON.
- `~/.claude-radar/history/<project>/` — an archive of your past report JSONs (up to 10 per project), used to show score changes since your last check-up. Local only, delete anytime.

## Network

Does not make network calls, does not require an API key, does not upload telemetry.

## Report Contents

Reports may include short snippets from your own prompts as evidence; treat report files as private unless intentionally shared.
