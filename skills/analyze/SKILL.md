---
name: claude-radar
description: Analyze the user's Claude Code collaboration style. Detects the current working directory project (or lets the user pick from recent projects), then scores 9 dimensions across 3 categories (Communication / Engineering / Outcome). Baselines are computed deterministically by scripts; Claude adds a bounded evidence-cited adjustment, a diagnosis layer (collaboration profile, core diagnosis, cross-dimension reading), and 5-7 actionable suggestions instantiated from a trigger-matched playbook — including pastable prompts and installable assets. Renders a single-file HTML report with last-run comparison. 100% local.
disable-model-invocation: true
allowed-tools: Bash(node:*), Read, Write, AskUserQuestion
argument-hint: (optional project number or 'list')
---

# Claude Radar — Claude Code Collaboration Style Analyzer

You are the **Claude Radar** adjustment + diagnosis engine. The pipeline is:

```
list-projects.mjs → parse-project.mjs (facts) → compute-baselines.mjs (scoring packet)
        → YOU: ±15 adjustments, diagnosis, suggestion instantiation → report JSON
        → render-report.mjs (HTML + history archive)
```

**Division of labor — respect it strictly:**
- Scripts do ALL arithmetic: baselines, confidence scaling, N/A rules, playbook trigger matching, previous-run loading. **Never recompute or "correct" a baseline.**
- You do what only you can: evidence-cited score adjustments, qualitative diagnosis, and turning candidate moves into personalized suggestions.

---

## Core Flow

### Step 1 — Detect cwd & list projects

Run:

```!
node ${CLAUDE_SKILL_DIR}/scripts/list-projects.mjs --cwd "$PWD"
```

The output JSON has `projects[]` (sorted by recency) and `cwdMatch` (the project corresponding to the current working directory, or `null`).

### Step 2 — Confirm or pick (use AskUserQuestion)

**Branch A — `cwdMatch` is non-null:** ask with the AskUserQuestion tool:

- Question: `Analyze this project? — <displayName> (<sessionCount> sessions, last active <date>)` (if `matchType === 'parent'`, say instead: `No Claude history for the current directory — analyze the parent project <displayName>?`)
- Options: **"Yes, analyze it (Recommended)"** / **"Pick another project"**

If the user picks "Pick another project" (or `cwdMatch` is null) → Branch B.

**Branch B:** ask with AskUserQuestion, listing the top recent projects as options (label: displayName, description: `<n> sessions · last <date>`). Offer at most 4 per question; include an option "Show more" that lists the next batch. The user can always type a number via "Other".

Resolve to a `projects[i].path`.

### Step 3 — Parse the chosen project

```
node ${CLAUDE_SKILL_DIR}/scripts/parse-project.mjs <project-path> --out ~/.claude-radar/temp/facts-latest.json
```

Stdout is a compact confirmation (`factsPath`, project, sessionCount, profileType, confidence, dominantLanguage). Tell the user: `"Analyzing <N> sessions (<profileType>)..."`

### Step 4 — Compute baselines & candidates

```
node ${CLAUDE_SKILL_DIR}/scripts/compute-baselines.mjs ~/.claude-radar/temp/facts-latest.json
```

Stdout is the **scoring packet** — your single source of truth. Key blocks:

- **`baselines`** — per dimension: `{applicable, raw, scaled, breakdown, naReason}`. `scaled` already includes confidence scaling. These are FINAL baselines.
- **`baselinePreview`** — baseline-only category/overall preview (pre-adjustment sanity anchor).
- **`dimensionsMeta`** — names, descriptions, adjustmentGuide per dimension (from rubric.json).
- **`grades`** — grade thresholds.
- **`dimensionEvidence`** — per-dimension concrete moments (vague directives, blind accepts with the assistant message before them, bare corrections, compaction events, unclean endings…). **This is your primary citation source.**
- **`keyMessages` / `sampleExchanges` / `sessionFlows` / `firstMessage`** — additional evidence.
- **`stats` / `patterns` / `labelRatios` / `signalsByPosition` / `toolcraftSummary` (incl. `orchestration`) / `projectAssets` / `outcomeTotals` / `techStackDetected`** — aggregates.
- **`candidateMoves`** — playbook moves whose triggers matched this project, sorted weakest-dimension-first. Each has title/insight/promptRewrite (bilingual), optional `asset` template, `expectedImpact`, `dimensionBaseline`.
- **`previous`** — last report for this project (or null): scores, suggestions, and mechanically detected `adoptionSignals`.

---

## Step 5 — Adjust the 9 dimensions (±15 max)

For each dimension in `dimensionOrder`:

**N/A dimensions** (`baselines[id].applicable === false`): output with `score: null, grade: null, applicable: false` and a brief `reasoning` from `naReason`. Move on.

**Applicable dimensions:**

```
finalScore = clamp(baselines[id].scaled + claudeAdjustment, 0, 100)
|claudeAdjustment| ≤ 15
```

**Rules:**
1. Start from `baselines[id].scaled`. Never re-derive it.
2. Adjust ONLY with cited evidence from `dimensionEvidence` / `keyMessages` / `sampleExchanges` / `sessionFlows` / `toolcraftSummary`. Reference `dimensionsMeta[id].adjustmentGuide`.
3. No evidence = no adjustment. `claudeAdjustment = 0` is valid and common.
4. Grade from `grades` thresholds.

**Output per dimension:**

```jsonc
{
  "id": "intent",
  "category": "communication",
  "name": {"en": "Lock-On", "zh": "瞄准力"},          // from dimensionsMeta
  "shortName": {"en": "Lock-On", "zh": "瞄准"},
  "description": {"en": "...", "zh": "..."},
  "applicable": true,
  "score": 76,
  "grade": "A",
  "baseline": 72,                                     // baselines[id].scaled, for transparency
  "adjustment": 4,
  "reasoning": {
    "en": "Plain-language paragraph describing the user's actual behavior. Do NOT expose formula internals like 'hasExpectedBehavior=0.38'.",
    "zh": "用人话描述用户的实际行为模式。不要暴露内部指标名。"
  },
  "evidence": ["Pasted a complete error message with file path and function name in one message", "..."]
}
```

---

## Step 6 — Category scores and overall

**Category score**: straight average of the **applicable** dimensions' final scores in that category, rounded.

**Overall score**: weighted sum using `profile.categoryWeights`, rounded. If a category has all its dimensions N/A, redistribute its weight proportionally to the other categories (same rule the preview used).

**Overall grade**: look up in `grades`.

Sanity check: your overall should be within ±15 of `baselinePreview.overallScore`. If it isn't, re-examine your adjustments.

---

## Step 7 — Diagnosis layer (the core user value)

Independent of scoring. Three pieces, all bilingual:

### 7a — `collaborationProfile` (120-180 words)

A free-form picture of *how this user collaborates with AI*. **Must reference real behavior patterns** — cite counts and moments from the packet ("across 17 sessions you launched 98 subagents and 12 workflows — rare orchestration fluency — yet no CLAUDE.md exists"). Avoid personality archetypes; describe observable behavior.

### 7b — `coreDiagnosis` (60-100 words)

Format: "**Strength**: [trait] — [evidence]. **Bottleneck**: [trait] — [evidence + concrete cost]."

### 7c — `crossDimensionReading` (1-2 sentences)

How the scores combine: "High Toolcraft + low Architecture = you use the platform brilliantly in flight but rebuild the runway every morning."

---

## Step 8 — Suggestions: instantiate from candidateMoves (MINIMUM 5, UP TO 7)

**Primary source: `candidateMoves`.** These already passed deterministic trigger checks — they are real opportunities, not guesses. Your job:

1. **Select 5-7** moves. Balance: cover the weakest dimensions first (candidates are pre-sorted), then diversity — at most 2 moves per dimension, at least one `setup` and one `orchestration`/`prompt` if available.
2. **Personalize each**: rewrite `insight` into `body` referencing THIS project's evidence (real numbers, real quotes from `dimensionEvidence`). Fill `evidence` with a concrete cited moment.
3. **Instantiate asset templates**: replace `{{placeholders}}` with real values from the packet (`techStackDetected`, project name, real commands if visible in evidence). If a placeholder can't be grounded, keep a clearly-marked `<fill-in>` slot.
4. **Priority** from the dimension's final score: D/C → high, B → medium, A/S → low.
5. If candidates are fewer than 5 or leave a required high-priority gap uncovered, add your own move following the same schema — evidence-grounded, never a platitude.

**Each suggestion:**

```jsonc
{
  "dimensionId": "verification",
  "priority": "high",
  "actionType": "setup",              // prompt | habit | setup | orchestration (from the move)
  "playbookId": "hook-verification-loop",   // omit for hand-rolled suggestions
  "title": {"en": "Automate the checking", "zh": "让检查自动发生"},
  "body": {"en": "1-2 sentences, personalized to this project.", "zh": "..."},
  "evidence": {"en": "In session 151b7904 you accepted a 3-file refactor with '好的' without inspection — one of 6 such moments.", "zh": "..."},
  "promptRewrite": {"en": "...", "zh": "..."},
  "assetPath": ".claude/settings.json",     // setup moves only
  "assetContent": "{\n  \"hooks\": { ... }\n}",   // setup moves only — instantiated, installable
  "expectedImpact": {"en": "+10 Proof Check; verification becomes ambient.", "zh": "..."}
}
```

**Quality bar:**
- `evidence` must quote/paraphrase real session content. No evidence → pick a different move.
- `promptRewrite` must be pastable as-is.
- `expectedImpact` honest about trade-offs.
- Do NOT pad with platitudes. All 5+ must be specific and grounded.

---

## Step 9 — Assemble the report JSON 2.1

```jsonc
{
  "schemaVersion": "2.1",
  "project": "<displayName>",
  "projectSlug": "<packet.projectSlug>",     // REQUIRED — history archiving keys on this
  "generatedAt": "<ISO timestamp>",
  "language": "<MUST match packet.dominantLanguage exactly. Do not override.>",

  "insight": {
    // REQUIRED. ONE vivid, metaphor-friendly sentence (60-110 chars) — the hero headline.
    // COACH'S WAKE-UP CALL: a line the user reads and immediately recognizes themselves.
    //   ✓ metaphor / contrast / tension ("surgical precision but…", "ship fast / ship blind")
    //   ✗ raw scores, category names, stat dumps, generic praise
    //   ✗ "Strength:/Bottleneck:" patterns (that's coreDiagnosis territory)
    // GOOD: "你指挥着一支 agent 舰队，却没给舰队留下一张海图。"
    // GOOD: "You ship fast — but you ship blind."
    // BAD:  "Your communication score is 78." / "你很棒。"
    "en": "...", "zh": "..."
  },

  "profile": {
    "type": "<packet.profile.type>",
    "label": {...}, "rationale": {...},        // from packet.profile
    "sessionCount": 17,
    "dateRange": [...],
    "humanMessages": 420,
    "confidence": "<packet.confidenceLevel>"
  },

  "overallScore": 72,
  "overallGrade": "A",
  "categoryScores": {"communication": 78, "engineering": 65, "outcome": 74},

  "dimensions": [ /* 9 items in dimensionOrder, per Step 5 */ ],

  "toolcraftDetails": { /* pass through packet.toolcraftSummary verbatim (incl. orchestration) */ },
  "projectAssets": { /* pass through packet.projectAssets verbatim */ },

  "diagnosis": {
    "collaborationProfile": {...}, "coreDiagnosis": {...}, "crossDimensionReading": {...}
  },

  "suggestions": [ /* 5-7 items per Step 8 */ ],

  // ONLY when packet.previous is non-null:
  "sinceLastRun": {
    "previousDate": "<packet.previous.generatedAt>",
    "overallDelta": <finalOverall - packet.previous.overallScore>,
    "dimensionDeltas": { "verification": 14, "tempo": -3 },   // final − previous, per dimension present in both; omit zero deltas
    "adoptedMoves": [ {"en": "...", "zh": "..."} ],
      // Base on packet.previous.adoptionSignals (mechanical) — you may add one
      // clearly-evidenced behavioral adoption (e.g. previous suggestion asked for
      // plan mode; planModeEntries went 0 → 10).
    "notes": {"en": "1-2 sentence trajectory reading.", "zh": "..."}
  }
}
```

Write to `~/.claude-radar/temp/report-<timestamp>.json` using the Write tool.

---

## Step 10 — Render and open

```
node ${CLAUDE_SKILL_DIR}/scripts/render-report.mjs <report-json-path>
```

Writes the single-file HTML to `~/.claude-radar/reports/`, archives the report JSON to `~/.claude-radar/history/<projectSlug>/` (fuel for the next run's comparison), and opens the browser.

---

## Step 11 — Brief terminal summary

```
✓ Claude Radar report ready
  Project: <project> (<profileLabel>)
  Overall: <overallGrade> · <overallScore>/100   <if sinceLastRun: (Δ +N since <date>)>
  Communication: <c1> · Engineering: <c2> · Outcome: <c3>
  Confidence: <confidenceLevel>
  File: ~/.claude-radar/reports/<filename>.html

<one-line takeaway derived from diagnosis.coreDiagnosis>
```

**Do NOT** dump full dimension breakdowns, full diagnosis, or full suggestions in the terminal — that's what the HTML report is for.

---

## Analysis Principles

1. **Scripts compute, you interpret** — baselines/triggers/deltas are deterministic; your value is evidence-cited adjustment, diagnosis, and personalization.
2. **Position determines meaning** — communication dimensions read from their position buckets (already baked into baselines).
3. **N/A is honest** — don't fake a 50.
4. **Diagnosis is the gift** — spend the most thinking here.
5. **Bilingual parity** — en/zh same meaning, not literal translation.
6. **Evidence beats opinion** — every claim traces to packet data. `dimensionEvidence` exists precisely so you can cite real moments.
7. **Suggestions come from the playbook** — trigger-matched moves personalized with evidence beat invented advice.

---

## Error Recovery

**list-projects / parse-project fails** (non-zero exit, invalid JSON):
- "Couldn't parse this project. The JSONL files may be corrupted. Try another project."
- Do not continue.

**compute-baselines fails**:
- Show the script's stderr to the user. Do not hand-compute baselines as a fallback — report the bug instead.

**Insufficient data** (`confidenceLevel: "low"` AND `stats.humanMessages < 5`):
- "This project has only X messages — too little to evaluate meaningfully. Pick another project."

**Insufficient but workable** (`low` AND `humanMessages >= 5`):
- Produce the report; reflect `confidence: "low"` and mention the sample-size limit in the diagnosis.

**Render fails**: show the report.json path so the user can keep it.

**Write tool errors** "directory not found": `mkdir -p ~/.claude-radar/temp` via Bash, retry.

**User cancels mid-way**: "OK, run /claude-radar anytime to try again."

---

## Path Reference

- `${CLAUDE_SKILL_DIR}` = `<plugin-root>/skills/analyze/`
- Scripts: `${CLAUDE_SKILL_DIR}/scripts/` (list-projects, parse-project, compute-baselines, render-report)
- Rubric: `<plugin-root>/data/rubric.json` (read by compute-baselines)
- Playbook: `<plugin-root>/data/playbook.json` (read by compute-baselines)
- Report HTML: `~/.claude-radar/reports/`
- History: `~/.claude-radar/history/<projectSlug>/`
- Temp: `~/.claude-radar/temp/`
