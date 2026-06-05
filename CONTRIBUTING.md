# Contributing

Contributions are welcome.

## Development checks

Run these before opening a pull request:

```bash
# Validate the plugin manifest (no build tooling — just confirm it's valid JSON)
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

# Syntax-check the scripts
node --check skills/analyze/scripts/list-projects.mjs
node --check skills/analyze/scripts/parse-project.mjs
node --check skills/analyze/scripts/render-report.mjs
```

## Testing locally

Run the scripts directly against your own history:

```bash
node skills/analyze/scripts/list-projects.mjs --cwd "$PWD"
node skills/analyze/scripts/parse-project.mjs ~/.claude/projects/<slug>
node skills/analyze/scripts/render-report.mjs <report-json-path>
```

Then test the installed experience by adding the repo as a marketplace and reinstalling:

```
/plugin marketplace add LeifDiao/claude-radar
/plugin install claude-radar@claude-radar-marketplace
```

Start a new session so the updated skill is picked up, then run `/claude-radar`.

## Design principles

- Keep the plugin local-first — no network calls, no API key.
- Keep the facts parser (`parse-project.mjs`) deterministic (same input → same facts); the model does scoring + diagnosis from facts + rubric.
- Avoid external dependencies unless they remove meaningful complexity. The plugin ships with zero runtime dependencies.
- Do not print raw session logs in normal output. The terminal summary stays brief; detail belongs in the HTML report.
- Make scoring changes explainable in `data/rubric.json` or parser comments, and update `docs/METHODOLOGY.md` (and `docs/METHODOLOGY_zh.md`) to match.
