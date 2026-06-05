# Privacy

Claude Radar runs entirely on your machine — it reads your local Claude Code history and writes local HTML reports.

## Data Read

- `~/.claude/projects/` — scanned for project directories and their `.jsonl` session files (session count, last-modified time, and message/tool content for the project you choose to analyze).
- From the analyzed project's resolved working directory, filesystem metadata only:
  - `CLAUDE.md` — presence and file size (size only, not contents).
  - `.claude/memory/` — presence and count of `.md` files.
  - `.claude/agents/` — presence and count of `.md` files.
  - `.claude/commands/` — presence and count of `.md` files.
  - `.claude/settings.json` — presence only.

## Data Written

- `~/.claude-radar/reports/` — the generated single-file HTML report.
- `~/.claude-radar/temp/` — the intermediate report JSON.

## Network

Does not make network calls, does not require an API key, does not upload telemetry.

## Report Contents

Reports may include short snippets from your own prompts as evidence; treat report files as private unless intentionally shared.
