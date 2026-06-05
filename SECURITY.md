# Security

Claude Radar reads your local Claude Code session history under `~/.claude/projects/` and renders a single-file HTML report locally — no network access, no API key.

## Reporting Issues

Private report via GitHub security advisories when available, or contact the maintainer through the GitHub profile linked in this repo (https://github.com/LeifDiao).

## Scope

Security-sensitive areas:

- Accidental exposure of private prompt content (e.g. evidence snippets leaking more than intended).
- Unsafe handling of local paths (project-slug decoding, cwd resolution, report output paths).
- Unexpected network access.
- Report HTML injection bugs (session content rendered into the report template).

The tool intentionally avoids network calls and escapes report content before rendering HTML (`render-report.mjs` sanitizes the embedded JSON so it cannot break out of the `<script>` tag).
