# Contributing

Contributions are welcome.

## Development checks

Run these before opening a pull request:

```bash
# The regression suite covers the whole deterministic layer:
# parser filtering, orchestration signals, asset detection,
# baseline arithmetic, playbook triggers, render + history archive.
node test/run.mjs

# Validate the plugin manifest (no build tooling — just confirm it's valid JSON)
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

# Syntax-check the scripts
node --check skills/analyze/scripts/list-projects.mjs
node --check skills/analyze/scripts/parse-project.mjs
node --check skills/analyze/scripts/compute-baselines.mjs
node --check skills/analyze/scripts/render-report.mjs
```

## Testing locally

Run the scripts directly against your own history:

```bash
node skills/analyze/scripts/list-projects.mjs --cwd "$PWD"
node skills/analyze/scripts/parse-project.mjs ~/.claude/projects/<slug> --out /tmp/facts.json
node skills/analyze/scripts/compute-baselines.mjs /tmp/facts.json
node skills/analyze/scripts/render-report.mjs <report-json-path>
```

Then test the installed experience by adding the repo as a marketplace and reinstalling:

```
/plugin marketplace add LeifDiao/claude-radar
/plugin install claude-radar@claude-radar-marketplace
```

Start a new session so the updated skill is picked up, then run `/claude-radar`.

## Contributing playbook moves

The highest-leverage contribution is a new suggestion "move" in `data/playbook.json`. A good move has:

1. **A deterministic trigger** — a structured condition over facts fields (see the `_doc` key for supported ops). If you can't express when the move applies as data, it isn't ready.
2. **Bilingual copy** (`title` / `insight` / `promptRewrite` / `expectedImpact`, en + zh) — specific, no platitudes. The insight should explain *why the detected pattern costs the user something*.
3. **A pastable prompt** the user can try in their next session, and — for `setup` moves — an `asset` template (CLAUDE.md section, hook config, `.mcp.json` entry, command file) with `{{placeholders}}` the skill can fill from facts.

Add a trigger test in `test/run.mjs` (Case 9 pattern) and run `node test/run.mjs`.

## Design principles

- Keep the plugin local-first — no network calls, no API key.
- Keep the deterministic layer deterministic: `parse-project.mjs` (same input → same facts) and `compute-baselines.mjs` (same facts → byte-identical baselines and candidate moves). The model only does bounded evidence-cited adjustments, diagnosis, and suggestion personalization.
- Avoid external dependencies unless they remove meaningful complexity. The plugin ships with zero runtime dependencies.
- Do not print raw session logs in normal output. The terminal summary stays brief; detail belongs in the HTML report.
- Make scoring changes explainable in `data/rubric.json` (structured `baselineTerms`) or parser comments, and update `docs/METHODOLOGY.md` (and `docs/METHODOLOGY_zh.md`) to match.
- Privacy promises in `PRIVACY.md` are load-bearing: filesystem detection reads metadata and key *counts* only, never contents or values.
