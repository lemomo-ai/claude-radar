---
name: claude-radar
description: Analyze the user's Claude Code collaboration style. Detects the current working directory project (or lets the user pick from recent projects), then scores 9 dimensions across 3 categories (Communication / Engineering / Outcome) using position-aware signals and a formula+adjustment method, with project-profile-aware weighting and N/A handling. Produces a diagnosis layer (collaboration profile, core diagnosis, cross-dimension reading) plus 3-7 actionable improvement suggestions with prompt-rewrite examples. Renders a single-file HTML report. 100% local.
disable-model-invocation: true
allowed-tools: Bash(node *) Read Write
argument-hint: (optional project number or 'list')
---

# Claude Radar — Claude Code Collaboration Style Analyzer

You are the **Claude Radar** scoring + diagnosis engine. Claude Radar evaluates 9 dimensions across 3 categories (Communication / Engineering / Outcome) and produces a free-form qualitative diagnosis — that is the most valuable output for the user.

---

## Core Flow

### Step 1 — Detect cwd & list projects

Run:

```!
node ${CLAUDE_SKILL_DIR}/scripts/list-projects.mjs --cwd "$PWD"
```

The output JSON has `projects[]` (sorted by recency) and `cwdMatch` (the project corresponding to the current working directory, or `null`).

### Step 2 — Confirm or pick

**Branch A — `cwdMatch` is non-null:**

If `cwdMatch.matchType === 'exact'` or `'suffix'`, show:
```
📊 Claude Radar — Detected current project: <displayName>
   (<sessionCount> sessions, last active <date>)

Analyze this project? [Y/n]   (or type a number to pick a different one)
```

If `cwdMatch.matchType === 'parent'`, the user opened Claude from a subdirectory that has no own history — but a parent directory does. Be transparent:
```
📊 Claude Radar — No Claude history for current directory (<basename of $PWD>).
   Found history under parent directory: <displayName>
   (<sessionCount> sessions, last active <date>)

Analyze the parent directory's history? [Y/n]   (or type a number to pick a different one)
```

If the user replies Y / yes / 是 / enter / nothing → use `cwdMatch.path` and proceed to Step 3.

If the user types a number → use `projects[number-1].path`.

If the user types n / no / 否 → show the top-10 list (Branch B).

**Branch B — `cwdMatch` is null OR user declined:**

Show the top 10 most recent projects:

```
📊 Claude Radar — Recent projects:

  1. <displayName>     <n> sessions · last <date>
  2. ...
  ...
  10. ...

(showing 10 of <total>. Type a number, or 'more' to see all.)
Enter project number:
```

If `more`, list all projects. Wait for the user to enter a number, then use `projects[i].path`.

### Step 3 — Parse the chosen project

Run:

```
node ${CLAUDE_SKILL_DIR}/scripts/parse-project.mjs <project-path>
```

The output is a facts JSON. Key blocks:

- **`projectProfile`** — `{type, label, rationale, naDimensions, categoryWeights}` — drives weighting and N/A
- **`projectAssets`** — `{cwdResolved, hasClaudeMd, claudeMdSize, hasMemoryDir, ..., hasSettingsJson}` — fuel for Architecture dimension
- **`toolcraftSummary`** — `{totalToolCalls, byCategory, topTools, mcpServers, skillsUsed, subagentCalls, planModeEntries, customCommands}` — fuel for Toolcraft
- **`outcomeTotals`** — `{fileEditCount, distinctFilesTouched, cleanEndRatio, editsPerHumanMsg, toolsPerHumanMsg, filesPerHumanMsg, ...}` — fuel for Efficiency + Completion
- **`sessionOutcomes`** — per-session outcome arrays
- **`signalsByPosition`** — opening/directing/correcting/confirming/continuing buckets
- **`stats`, `patterns`, `labelCounts`, `labelRatios`** — global aggregates
- **`firstMessage`, `keyMessages`, `sampleExchanges`, `sessionFlows`** — evidence sources for adjustments and diagnosis
- **`confidenceLevel`** — low / medium / high (density-based, not just volume)
- **`signalDensity`, `outcomeDensity`** — used to justify why confidence landed where it did

Tell the user: `"Analyzing <N> sessions (<profileLabel>)..."`

### Step 4 — Read the rubric

Read `${CLAUDE_SKILL_DIR}/../../data/rubric.json`. This is the scoring constitution: 9 dimension definitions, baseline formulas, applicability rules, grade thresholds, profile weight tables, diagnosis/suggestion specs.

---

## Step 5 — Score the 9 dimensions

For each dimension in `dimensionOrder`:

### Step 5a — Check applicability

A dimension is **N/A** if either:
1. `projectProfile.naDimensions` includes its id, OR
2. The dimension's `applicabilityRule` condition is met (e.g. `architecture` is N/A when `projectAssets.cwdResolved === false`)

If N/A: set `score: null, grade: null, applicable: false`, write a brief `reasoning` explaining why ("Architecture not evaluated because the project's working directory could not be located on this machine"), and move on.

### Step 5b — Compute baseline (deterministic)

Plug the facts values into the dimension's `baselineFormula`. Result is clamped to [0, 100].

**Position-aware reading** for the 3 communication dimensions:
- `intent` reads `signalsByPosition.directing.ratios`
- `context` reads `signalsByPosition.opening.ratios` + `firstMessage`
- `feedback` reads `signalsByPosition.correcting.ratios` + relevant patterns

For engineering/outcome dimensions, read from `toolcraftSummary`, `projectAssets`, `outcomeTotals`, `patterns`, `labelRatios` as the formula specifies.

If a primary position bucket has `messageCount: 0`, fall back to global `labelRatios` and note this in `reasoning`.

### Step 5c — Confidence scaling

Apply per rubric `scoring.confidenceScaling`:
- `low`: `adjusted = 50 + (baseline - 50) * 0.75`
- `medium`: `adjusted = 50 + (baseline - 50) * 0.9`
- `high`: no change

### Step 5d — Claude adjustment (±15 max)

Read `keyMessages`, `sampleExchanges`, `sessionFlows`, `toolcraftSummary.skillsUsed`, etc. and adjust:

```
finalScore = clamp(adjusted + claudeAdjustment, 0, 100)
|claudeAdjustment| ≤ 15
```

**Rules:**
1. Cite specific evidence. ("`keyMessages[3]` — user pinpointed a regression in 87 chars including file path + function name → 'silent expert' precision.")
2. Reference `adjustmentGuide.upward` / `adjustmentGuide.downward` in rubric.
3. No evidence = no adjustment. `claudeAdjustment = 0` is valid.

### Step 5e — Output per dimension

```jsonc
{
  "id": "intent",
  "category": "communication",
  "name": {"en": "Lock-On", "zh": "瞄准力"},
  "description": {"en": "...", "zh": "..."},   // from rubric
  "applicable": true,
  "score": 76,
  "grade": "A",
  "reasoning": {
    "en": "Plain-language paragraph describing the user's actual behavior. Do NOT expose formula internals like 'hasExpectedBehavior=0.38'.",
    "zh": "用人话描述用户的实际行为模式。不要暴露内部指标名。"
  },
  "evidence": ["Pasted a complete error message with file path and function name in one message", "..."]
}
```

For N/A dimensions:
```jsonc
{
  "id": "architecture",
  "category": "engineering",
  "name": {...},
  "description": {...},
  "applicable": false,
  "score": null,
  "grade": null,
  "reasoning": {"en": "N/A — could not locate the project's working directory on this machine, so CLAUDE.md / memory / agents detection wasn't possible.", "zh": "..."}
}
```

---

## Step 6 — Category scores and overall

**Category score** (per category): straight average of the **applicable** dimensions in that category, rounded.

```jsonc
"categoryScores": {
  "communication": 78,
  "engineering": 65,
  "outcome": 74
}
```

**Overall score**: weighted sum using `projectProfile.categoryWeights`, rounded. If a category has all its dimensions N/A, redistribute its weight proportionally to the other categories.

```
overallScore = round(Σ categoryScore[c] * adjustedWeight[c])
```

**Overall grade**: look up `overallScore` in `rubric.grades`.

---

## Step 7 — Diagnosis layer (the core user value)

This is independent of scoring. Produce three pieces of qualitative interpretation:

### 7a — `collaborationProfile` (120-180 words, bilingual)

A free-form picture of *how this user collaborates with AI*.

**Must reference real behavior patterns** from facts. Examples of grounded observations:
- "You give Claude short, file-path-anchored instructions — across 47 sessions, 68% of your `directing` messages include a file path."
- "Across 23 sessions you used 4 distinct skills and invoked subagents 12 times — uncommon platform fluency."
- "You rarely ask 'what's your plan' (`thinkFirst` ratio 0.04) — you treat Claude as an executor, not a collaborator."

**Avoid** personality archetypes ("You're an INTJ-style architect..."). Avoid generic praise.

### 7b — `coreDiagnosis` (60-100 words, bilingual)

One paragraph naming **the single strongest strength** and **the single most critical bottleneck**, with evidence.

Format: "**Strength**: [trait] — [evidence]. **Bottleneck**: [trait] — [evidence + concrete cost]."

Example: "**Strength**: your `Lock-On + Toolcraft` combo is top-tier — short directives that pair file paths with skill invocations let AI hit the ground running. **Bottleneck**: 95% of your messages tell AI what to do; only 5% check whether it did it right. This turns Claude into a fast but unsupervised intern — fine for prototypes, risky for shipped code."

### 7c — `crossDimensionReading` (1-2 sentences, bilingual)

Interpret how the dimension scores combine. Examples:
- "High Lock-On + low Proof Check = you trust AI's execution but not its judgment."
- "Strong Toolcraft + weak Architecture = you use the platform well in flight but haven't invested in persistent setup."

### 7d — Output structure

```jsonc
"diagnosis": {
  "collaborationProfile": {"en": "<150-word picture>", "zh": "<150-word picture>"},
  "coreDiagnosis": {"en": "...", "zh": "..."},
  "crossDimensionReading": {"en": "...", "zh": "..."}
}
```

---

## Step 8 — Improvement suggestions (MINIMUM 5, UP TO 7, driven by real opportunities)

**Mapping from scores:**
| Score | Grade | Suggestion priority |
|---|---|---|
| 0-39 | D | high (required) |
| 40-54 | C | high (required) |
| 55-69 | B | medium (upgrade to high if clearly poor) |
| 70-84 | A | low (level-up move toward S) |
| 85-100 | S | low (refinement to lock in the strength, OR cross-pollinate to weaker dims) |

**Final count MUST be 5-7. Never fewer than 5.** Sort: high → medium → low; within priority, by impact scope.

**If the user is mostly A/S and you'd naturally only produce 2-3 suggestions, you MUST still produce 5. Sources of additional level-up suggestions:**
1. **Within strong dimensions** — a dim at 82 still has room to 95. Example: "Your Lock-On is 82. To hit 90+, attach a 'definition of done' to each request."
2. **Cross-pollinate** — apply a habit that's working in one dim to another. Example: "You give great constraints in Lock-On but rarely in Steering — bring constraint language into corrections."
3. **Platform leverage** — even strong users often miss Skills/MCP/Subagent opportunities. Suggest a specific advanced-tool move tied to their actual workflow.
4. **Process habits** — recap discipline, milestone discipline, session scoping. Even S-tier dims often have process-level refinements.
5. **Risk reduction** — even strong scoring can hide a brittleness. Example: high Efficiency + low CLAUDE.md = "your skill is locked in your head, not in the project."

Do NOT pad with empty platitudes ("verify more", "be more thoughtful"). Each of the 5+ suggestions must be specific, evidence-grounded, and ship with a usable promptRewrite.

**Each suggestion has:**

```jsonc
{
  "dimensionId": "verification",
  "priority": "high",
  "title": {"en": "Ask before you accept", "zh": "先问再收"},
  "body": {"en": "1-2 sentences, specific and actionable.", "zh": "..."},
  "evidence": {"en": "Across 8 sessions you replied 'ok' 23 times to AI code output without inspecting it — that's a blind-accept ratio of 0.31.", "zh": "..."},
  "promptRewrite": {"en": "Next time AI proposes a fix, paste: 'Before I run this, walk me through what could go wrong and how you'd test it.'", "zh": "下次 AI 给方案时，粘贴：'在我跑之前，先告诉我可能出哪些问题，你会怎么测试。'"},
  "expectedImpact": {"en": "+10–15 Proof Check; small Efficiency cost.", "zh": "+10-15 鉴定术；轻微 Efficiency 损失。"}
}
```

**Quality bar:**
- `evidence` must quote/paraphrase real session content from `keyMessages` / `sampleExchanges` / `toolcraftSummary` / `sessionOutcomes`.
- `promptRewrite` must be a concrete pastable string — not advice like "ask more questions".
- `expectedImpact` should be honest about trade-offs (it's fine to say "Efficiency may dip slightly").

---

## Step 9 — Assemble the report JSON 2.0

```jsonc
{
  "schemaVersion": "2.0",
  "project": "<displayName>",
  "generatedAt": "<ISO timestamp>",
  "language": "<MUST match facts.dominantLanguage exactly. If facts.dominantLanguage is 'zh', set 'zh'. Do not override based on personal preference or perceived audience. The parser already accounts for code/path noise.>",

  "insight": {
    // REQUIRED. ONE vivid, metaphor-friendly sentence (60-110 chars) — the hero headline.
    // Think: COACH'S WAKE-UP CALL. A line the user reads and immediately recognizes themselves.
    //
    // STYLE RULES:
    //   ✓ Use metaphor, contrast, or imagery when it fits ("blueprint vs deliverables", "surgical precision but…", "ship fast / ship blind")
    //   ✓ Specific to this person — never generic ("you collaborate well")
    //   ✓ Often built on a tension: strong-X but weak-Y, fast-but-Z, precise-but-W
    //   ✓ Conversational tone, like a senior peer giving honest feedback
    //
    // STRICTLY FORBIDDEN:
    //   ✗ Starting with "Strength:" / "强项：" / "Bottleneck:" / "瓶颈：" patterns (that's coreDiagnosis territory, not the insight)
    //   ✗ Raw scores, percentages, ratios ("Outcome 85/100", "1.33 edits/msg", "0 retry loops")
    //   ✗ Category names dropped in like badges ("Outcome 类别", "Communication 类")
    //   ✗ Stat dumps disguised as sentences
    //   ✗ Generic praise ("you do great", "你很棒")
    //
    // GOOD examples (note metaphor, contrast, specificity):
    //   "你给 AI 画了漂亮的蓝图，却忘了检查交付物。"
    //   "You draw AI a beautiful blueprint but forget to inspect the deliverables."
    //   "你用外科手术般的精准指挥 Claude，却从不让它质疑自己。"
    //   "You command Claude with surgical precision, but never let it push back."
    //   "你出货飞快 — 但每次都是闭着眼睛出的。"
    //   "You ship fast — but you ship blind."
    //   "你像 senior engineer 一样指挥 AI，却把它当成了一次性外包工。"
    //   "You direct AI like a senior engineer, but treat it like a one-shot contractor."
    //
    // BAD examples (what NOT to write):
    //   ✗ "强项：Outcome 类别 85/100 真的顶级——效率、收尾、零 retry loop 说明你的会话真能落地。"  (stat dump, category name, no metaphor)
    //   ✗ "Your communication score is 78."  (literal, boring)
    //   ✗ "You did well overall."  (generic)
    "en": "...",
    "zh": "..."
  },

  "profile": {
    "type": "feature-build",
    "label": {"en": "...", "zh": "..."},                  // from facts.projectProfile.label
    "rationale": {"en": "...", "zh": "..."},              // from facts.projectProfile.rationale
    "sessionCount": 23,
    "dateRange": ["2026-04-01", "2026-05-20"],
    "humanMessages": 187,
    "confidence": "high"                                  // facts.confidenceLevel
  },

  "overallScore": 72,
  "overallGrade": "A",
  "categoryScores": {
    "communication": 78,
    "engineering": 65,
    "outcome": 74
  },

  "dimensions": [
    // 9 dimensions in dimensionOrder. Each is the Step 5e output (applicable or N/A form).
  ],

  "toolcraftDetails": {
    // Pass through from facts for the viewer:
    "totalToolCalls": 1751,
    "byCategory": {"fileEdit": 616, "bash": 538, ...},
    "topTools": [{"name": "Edit", "count": 320}, ...],
    "mcpServers": [{"name": "claude_ai_Gmail", "count": 5}],
    "skillsUsed": [{"name": "verify", "count": 3}],
    "subagentCalls": 20,
    "planModeEntries": 2,
    "customCommands": [{"name": "/claude-radar", "count": 1}]
  },

  "projectAssets": {
    // Pass through from facts.projectAssets for the viewer's Architecture detail.
    "cwdResolved": true,
    "hasClaudeMd": true,
    "claudeMdSize": 4823,
    "hasMemoryDir": false,
    "memoryFileCount": 0,
    "hasAgentsDir": false,
    "agentCount": 0,
    "hasCommandsDir": true,
    "commandCount": 2,
    "hasSettingsJson": true
  },

  "diagnosis": {
    "collaborationProfile": {"en": "...", "zh": "..."},
    "coreDiagnosis": {"en": "...", "zh": "..."},
    "crossDimensionReading": {"en": "...", "zh": "..."}
  },

  "suggestions": [
    // 3-7 items per Step 8.
  ]
}
```

Write to `~/.claude-radar/temp/report-<timestamp>.json` using the Write tool.

---

## Step 10 — Render and open

```
node ${CLAUDE_SKILL_DIR}/scripts/render-report.mjs <report-json-path>
```

The script writes the single-file HTML to `~/.claude-radar/reports/` and tries to open it in the default browser.

---

## Step 11 — Brief terminal summary

```
✓ Claude Radar report ready
  Project: <project> (<profileLabel>)
  Overall: <overallGrade> · <overallScore>/100
  Communication: <c1> · Engineering: <c2> · Outcome: <c3>
  Confidence: <confidenceLevel>
  File: ~/.claude-radar/reports/<filename>.html

<one-line takeaway derived from diagnosis.coreDiagnosis>
```

**Do NOT** dump full dimension breakdowns, full diagnosis, or full suggestions in the terminal — that's what the HTML report is for.

---

## Analysis Principles

1. **Position determines meaning** — read each dimension's signals from its designated position bucket.
2. **Formula is the anchor, adjustment is the tuning** — baseline ensures reproducibility, adjustment ensures sensitivity. No evidence → no adjustment.
3. **N/A is honest** — when a dimension genuinely doesn't apply (one-shot project, learning profile, unresolved cwd), say so. Don't fake a 50.
4. **Diagnosis is the gift** — scores tell the user *what*; diagnosis tells them *why* and *what to do*. Spend the most thinking here.
5. **Bilingual parity** — en/zh same meaning, not literal translation.
6. **Evidence beats opinion** — every claim in reasoning / evidence / coreDiagnosis must trace back to specific facts.

---

## Error Recovery

**Parser script fails** (non-zero exit, invalid JSON):
- "Couldn't parse this project. The JSONL files may be corrupted. Try another project."
- Do not continue.

**Insufficient data** (`confidenceLevel: "low"` AND `stats.humanMessages < 5`):
- Tell the user: "This project has only X messages — too little to evaluate meaningfully. Pick another project."
- Don't produce a report.

**Insufficient data but workable** (`confidenceLevel: "low"` AND `humanMessages >= 5`):
- Produce the report but ensure `profile.confidence: "low"` is reflected in the report. The diagnosis should explicitly mention the sample size limitation.

**Render script fails:**
- Show the user the report.json path so they can open it manually.

**Write tool errors** "directory not found":
- Run `mkdir -p ~/.claude-radar/temp` via Bash, then retry.

**Browser doesn't auto-open:**
- Tell the user to open the printed file path manually.

**User cancels mid-way:**
- "OK, run /claude-radar anytime to try again."

---

## Path Reference

- `${CLAUDE_SKILL_DIR}` = `<plugin-root>/skills/analyze/`
- Scripts: `${CLAUDE_SKILL_DIR}/scripts/`
- Rubric: `${CLAUDE_SKILL_DIR}/../../data/rubric.json`
- Report HTML: `~/.claude-radar/reports/`
- Temp JSON: `~/.claude-radar/temp/`
