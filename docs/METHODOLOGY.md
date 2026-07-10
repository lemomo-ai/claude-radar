[中文版](./METHODOLOGY_zh.md)

# Claude Radar — Methodology

> Claude Radar is not focused on code output. It focuses on how you build high-quality collaboration with AI as a *platform* — your communication, your engineering setup, and your actual outcomes.
>
> This document is the public scoring specification Claude follows and the rationale behind every number in your report.

---

## Design principles

1. **Evidence first.** Every score traces back to concrete, countable session signals.
2. **Privacy is non-negotiable.** Session data stays local. No cloud, no API key, no telemetry.
3. **Density over volume.** A small but signal-dense project shouldn't be penalized.
4. **N/A is honest.** When a dimension genuinely doesn't apply, say so — don't fake a 50.
5. **Profile-aware fairness.** Different project types deserve different scoring weights.
6. **Diagnosis is the gift.** Scores tell you *what*; diagnosis tells you *why* and *what to do*. The diagnosis layer is the most valuable output.
7. **Position changes meaning.** The same signal in different positions means different things.
8. **Formulas ensure consistency, Claude adds context.** Reproducible baseline + bounded qualitative adjustment.

---

## How it works

```
~/.claude/projects/<slug>/*.jsonl
         │
         ▼
   [parse-project.mjs]           ← Deterministic. Filters injected content (compaction summaries,
         │                          subagent side-chains). Position-aware signals + tool/skill/MCP/
         │                          orchestration/CLAUDE.md detection + dimension-targeted evidence.
         │ facts.json (schemaVersion 2.1)
         ▼
   [compute-baselines.mjs]       ← Deterministic. Evaluates rubric.json baselineTerms, applies N/A
         │                          rules + confidence scaling, matches playbook.json triggers,
         │                          loads the previous report for comparison.
         │ scoring packet
         ▼
    [Claude in the skill]        ← Bounded ±15 evidence-cited adjustment + diagnosis + suggestion
         │                          instantiation. Claude never does baseline arithmetic.
         │ report.json (schemaVersion 2.2)
         ▼
   [render-report.mjs]           ← Pure transform. JSON + template → HTML dashboard.
         │                          Archives report JSON to ~/.claude-radar/history/<slug>/.
         ▼
  ~/.claude-radar/reports/<slug>-<ts>.html
```

Four clearly separated stages:

- **Parser** — deterministic. Same input → same facts. Filters machine-injected content (compaction continuations, subagent side-chains, command echoes) so evidence reflects what *you* actually wrote. Detects tool usage by category — including the orchestration layer (Workflow runs, parallel tool bursts, background tasks, cron, worktrees) — plus slash commands, CLAUDE.md / .mcp.json / hooks / skills / memory / agents presence, per-session outcomes, tech stack, and dimension-targeted evidence moments. Auto-classifies the project profile.
- **Baseline engine** — deterministic. All formula arithmetic happens in script, not in the LLM. Same facts → byte-identical baselines, every run. Also evaluates the suggestion playbook's trigger conditions and loads your previous report for the "since last check-up" comparison.
- **Adjuster + Diagnoser** — Claude, running inside your Claude Code session. Applies a **bounded qualitative adjustment** (±15 points max, evidence-cited or zero), produces the **free-form diagnosis layer**, and personalizes trigger-matched playbook moves into suggestions.
- **Renderer** — produces a single HTML dashboard with data, styles, and JS all inlined.

No external API calls. No cloud processing. No server.

---

## Three categories, nine dimensions

Claude Radar groups dimensions into three categories, each evaluated as a `categoryScore` and weighted into the overall by profile.

### A. Communication (3 dims)
How clearly you direct AI through text.

| Dim | Measures | Primary position |
|---|---|---|
| **Lock-On** 瞄准力 | Instruction clarity (expected behavior, constraints, identifiers) | directing |
| **Scene Setting** 画面感 | Background framing in opening messages | opening |
| **Steering** 导航力 | Correction quality (reasoning, references, retry loops) | correcting |

### B. Engineering (3 dims)
How well you leverage Claude Code as a platform.

| Dim | Measures | Primary source |
|---|---|---|
| **Toolcraft** 工具力 | Skill / MCP / Subagent / custom commands / Plan / Todo usage | toolcraftSummary |
| **Architecture** 架构力 | CLAUDE.md / Memory / Agents / Settings setup quality | projectAssets (filesystem) |
| **Tempo** 节奏感 | Session-level pacing (milestones, summaries, focus, scope) | global signals |

### C. Outcome (3 dims)
What actually gets shipped.

| Dim | Measures | Primary source |
|---|---|---|
| **Efficiency** 效率 | Work per message (edits, tools, distinct files) | outcomeTotals |
| **Proof Check** 鉴定术 | Verification habits (tests, reviews, blind-accept) | confirming + global |
| **Completion** 收尾度 | Clean session closure, no abandoned retries, completion signals | outcomeTotals + patterns |

---

## Project profile (the fairness engine)

Every project is auto-classified by `parse-project.mjs` based on session count, message count, edit ratio, and date span:

| Profile | Detection | Category weights | N/A dimensions |
|---|---|---|---|
| `one-shot` | ≤ 2 sessions AND ≤ 15 msgs | comm 0.5 / eng 0.1 / out 0.4 | Architecture, Tempo, Completion |
| `feature-build` | 3-20 sessions, balanced edit ratio | comm 0.34 / eng 0.33 / out 0.33 | none |
| `long-running` | ≥ 20 sessions OR > 7-day span | comm 0.3 / eng 0.4 / out 0.3 | none |
| `learning` | High Q&A : edit ratio (< 0.1 edits/msg) with > 20 msgs | comm 0.7 / eng 0.3 / out 0 | Efficiency, Completion |

**N/A handling:** if a dimension is N/A by profile rule or by its own `applicabilityRule` (e.g. Architecture is N/A when the project's working directory can't be located), it shows N/A in the report. The category score averages only applicable dimensions. If a whole category is N/A, its weight redistributes proportionally to the others.

**Profile is shown next to the overall grade.** A "B" on a one-shot project is not the same as a "B" on a long-running one — and the report makes that explicit.

---

## Position-aware signals

Claude Radar classifies every user message into one of 5 positions before counting signals:

| Position | Definition |
|---|---|
| `opening` | First 2 user messages per session |
| `directing` | New task or instruction (not reacting to AI output) |
| `correcting` | After AI produced output + user shows correction intent |
| `confirming` | After AI produced output + user gives short acknowledgment |
| `continuing` | Everything else |

Each Communication dimension reads signals **only from its designated position**. This makes Lock-On / Scene Setting / Steering genuinely orthogonal — the same `hasFilePath` token cannot inflate all three.

---

## Two-step scoring per dimension

Applied to all 9 dimensions:

1. **Formula baseline** (deterministic, computed by `compute-baselines.mjs`): the structured `baselineTerms` in `rubric.json` are evaluated in script. Result clamped to [0, 100]. The LLM never does this arithmetic — baseline variance is exactly zero.
2. **Density-based confidence scaling** (also in script): see §8.
3. **Claude adjustment** (bounded ±15): must cite evidence from `dimensionEvidence`, `keyMessages`, `sampleExchanges`, `sessionFlows`, `toolcraftSummary`, etc. No evidence → no adjustment.

```
finalScore = clamp(scaledBaseline + claudeAdjustment, 0, 100)
```

**The "Silent Expert" pattern** is still recognized — short messages with high precision (`<100 chars` containing file path + identifier + action) get upward adjustments via the adjustment guide.

**Dimension-targeted evidence.** The parser extracts up to a handful of concrete "moments" per dimension — the actual text of a vague directive, a blind accept together with what the assistant had just done, a bare correction, a compaction event, an unclean session ending. Adjustments and suggestions cite these real moments instead of abstract ratios.

---

## Density-based confidence

Confidence considers both session count *and* signal density:

```
signalDensity = sum(label counts across all positions) / humanMessages
outcomeDensity = totalToolCalls / humanMessages
```

| Confidence | Condition | Scaling |
|---|---|---|
| `low` | < 5 msgs, OR (< 20 msgs AND low density) | scores shrink: `50 + (baseline - 50) * 0.75` |
| `medium` | < 40 msgs with low density, OR < 50 msgs | scores shrink: `50 + (baseline - 50) * 0.9` |
| `high` | otherwise | no scaling |

A user with 8 messages but 3 tool calls per message and clear position-specific signals gets `high` confidence. A user with 80 messages of vague chitchat and no tool use gets `medium` or `low`. This is the fairness fix: density matters more than volume.

---

## Toolcraft scoring

Toolcraft answers: *when the project would benefit from advanced tools, do you reach for them?*

**Philosophy: not using Skills/MCP is NOT a penalty.** Basic competence with Edit/Bash/Read is the baseline (60, B grade). Advanced tools add bonuses on top. Using advanced tools poorly — invoking them and then stalling, or triggering retry loops — is what gets adjusted downward.

Formula:

```
baseline = 60                                              // basic-user floor = B (Finding Groove)
  + min(skillsUsed.length, 5) × 5                          // up to +25 for skill diversity
  + min(mcpServers.length, 4) × 4                          // up to +16 for MCP usage
  + clamp(subagentCalls / sessions, 0, 2) × 6              // up to +12 for delegation
  + (planModeEntries > 0 ? 5 : 0)                          // +5 for any Plan use
  + min(customCommands.length, 3) × 3                      // up to +9 for custom commands
  + clamp(todoToolUse / humanMsgs, 0, 0.3) × 20            // up to +6 for todo tracking
  + min(workflowRuns, 2) × 5                               // up to +10 for Workflow orchestration
  + (backgroundTasks > 0 ? 4 : 0)                          // +4 for backgrounding long tasks
  + clamp(parallelToolBursts / sessions, 0, 1) × 6         // up to +6 for parallel fan-out
  + (cronJobs > 0 ? 3 : 0)                                 // +3 for scheduled automation
  + (worktreeUses > 0 ? 3 : 0)                             // +3 for worktree isolation
, clamped [0, 100]
```

**The orchestration layer is first-class.** Workflow runs, parallel tool bursts (reconstructed from entries sharing one message id), background tasks (`run_in_background`), cron/scheduled jobs, and worktree isolation are all detected — the highest-leverage platform usage no longer falls into an invisible `other` bucket. Slash commands are captured from `<command-name>` records (built-in commands like `/model` are excluded; plugin skills and custom commands count).

A user who only uses Edit/Bash/Read scores ~60 (B). A user who chains skill → subagent → workflow with Plan mode scores 90+ (S). The Claude ±15 adjustment can pull a score down if advanced-tool usage triggered retry loops or sat unused after invocation ("tool theater").

---

## Architecture scoring

Architecture answers: *have you invested in repeatable AI collaboration setup for this project?*

Formula:

```
baseline = 40
  + (hasClaudeMd ? 20 : 0)
  + (claudeMdSize > 500 ? 10 : 0)         // not just a stub
  + (hasMemoryDir ? 8 : 0)
  + min(memoryFileCount, 5) × 2
  + (hasAgentsDir ? 6 : 0)
  + min(agentCount, 4) × 2
  + (hasCommandsDir ? 5 : 0)
  + min(commandCount, 3) × 2
  + (hasSettingsJson ? 5 : 0)
  + (hasMcpJson ? 8 : 0)                  // project-level MCP config
  + (hasAgentsMd ? 5 : 0)                 // AGENTS.md cross-tool convention
  + (hasSkillsDir ? 5 : 0)                // project skills
  + min(skillDirCount, 3) × 2
  + min(settingsHookCount, 3) × 2         // hook EVENTS configured (count only, values never read)
  + (hasClaudeLocalMd ? 3 : 0)
, clamped [0, 100]
```

**Applicability rule:** if the project's working directory can't be located on the current machine, this dimension is N/A — filesystem inspection isn't possible without `cwd` access. The working directory is resolved as the **most frequent** `cwd` recorded across the project's sessions (ties break toward the shortest path), so sessions launched from deep subdirectories can't hijack asset detection.

---

## Efficiency scoring

Efficiency is the answer to "small projects get unfairly low scores".

```
baseline = 50
  + clamp(toolsPerHumanMsg / 3, 0, 1) × 25
  + clamp(editsPerHumanMsg / 1.5, 0, 1) × 20
  + clamp(filesPerHumanMsg / 0.5, 0, 1) × 15
  - clamp(retryLoops / sessions, 0, 1) × 20
, clamped [0, 100]
```

A 3-message bug fix with 5 file edits scores 90+ on Efficiency. A 50-message project with lots of talking and few changes scores low. This is the structural fairness fix — Efficiency rewards what gets done, not how many messages you sent.

---

## Completion scoring

Completion answers: *do your sessions actually close, or do they trail off?*

```
baseline = 50
  + (cleanEndRatio - 0.5) × 60
  + (sessionsWithCompletionSignal / sessions - 0.3) × 50
  - clamp(retryLoops / sessions, 0, 1) × 15
  + (labelRatios.hasCompletion - 0.05) × 80
, clamped [0, 100]
```

`endedCleanly` is detected when the last meaningful message is either:
- A user acknowledgment with completion language ("done", "搞定", "ship it", etc.), OR
- An assistant final message with no pending question

`hasCompletion` checks for explicit closure language across all positions.

---

## Calibrated for the autonomous-agent era

Several detectors were re-calibrated so the rubric rewards 2026-era best practice instead of 2024-era drip-feeding:

- **Structured batching is good.** A complete multi-task brief with numbering/priorities/sequencing is NOT a "demand overload" — only unstructured cramming (3+ actions, >300 chars, no list/sequencing) counts against Tempo.
- **"继续 / continue" nudges are not retry loops.** Only 3+ near-identical *substantive* messages (≥30 chars) count as hitting a wall.
- **Plan approvals aren't blind accepts.** A short "yes/好的" answering `AskUserQuestion` or approving a plan is required confirmation flow and is exempt from the blind-accept counter.
- **Compactions are a Tempo signal.** Sessions that repeatedly outgrow the context window (`compactionCount / sessions`) indicate scope-per-session worth improving — a mild Tempo penalty and a targeted suggestion, not a hidden distortion of the evidence pool (continuation summaries are filtered from analysis and counted separately).

---

## Diagnosis layer

Independent of scoring. Produces three pieces:

### 13.1 — `collaborationProfile` (120-180 words)
A free-form picture of *how this user collaborates with AI*.

**Requirements:**
- Must reference real behavior from facts ("Across 23 sessions you used 4 distinct skills and invoked subagents 12 times")
- Must avoid personality archetypes ("You're an INTJ-style architect...")
- Must be observable behavior, not personality inference

### 13.2 — `coreDiagnosis` (60-100 words)
One paragraph naming the *single strongest strength* and the *single most critical bottleneck*, with evidence.

Format pattern: `**Strength**: [trait] — [evidence]. **Bottleneck**: [trait] — [evidence + concrete cost].`

### 13.3 — `crossDimensionReading` (1-2 sentences)
Interprets how dimension scores combine into a behavior pattern.

Examples:
- "High Lock-On + low Proof Check = you trust AI's execution but not its judgment."
- "Strong Toolcraft + weak Architecture = you use the platform in flight but haven't invested in persistent setup."

**Diagnosis constraints:**
- Every claim must cite evidence from facts
- No fortune-teller tone
- Bilingual parity (en/zh same meaning, not literal translation)

---

## Suggestion specification (5-7, playbook-driven, with installable assets)

**Suggestions come from a playbook, not from improvisation.** `data/playbook.json` holds 30+ concrete "moves" across six domains — orchestration, MCP, persistence, verification loops, tempo, steering. Each move carries a structured **trigger condition** evaluated deterministically against your facts (e.g. *"no CLAUDE.md AND ≥5 sessions"*, *"≥10 subagent calls AND 0 workflow runs"*). Only triggered moves become candidates; Claude then selects 5-7 and **personalizes them with your real session evidence**. Depth comes from the playbook; specificity comes from your data. The playbook is open source — teams can add their own moves.

**Minimum 5 suggestions, always** — even for high-scoring users, who get level-up moves: (a) push a strong dim from 82 → 90+, (b) cross-pollinate a working habit to a weaker dim, (c) a Skill/MCP/Subagent/Workflow move tied to actual workflow, (d) process habits, (e) risk reduction.

Each suggestion includes:

```jsonc
{
  "dimensionId": "verification",
  "priority": "high",
  "actionType": "setup",              // prompt | habit | setup | orchestration
  "playbookId": "hook-verification-loop",
  "title": { "en": "...", "zh": "..." },
  "body": { "en": "...", "zh": "..." },
  "evidence": { "en": "In session 151b7904 you accepted a 3-file refactor with 'ok' — one of 6 such moments.", "zh": "..." },
  "promptRewrite": { "en": "Before you write code, walk me through...", "zh": "..." },
  "assetPath": ".claude/settings.json",              // setup moves only
  "assetContent": "{ \"hooks\": { ... } }",           // setup moves only — ready to install
  "expectedImpact": { "en": "+10-15 Proof Check; minimal Efficiency cost.", "zh": "..." }
}
```

**`setup` suggestions ship the asset itself** — a ready-to-install CLAUDE.md section, hook config, `.mcp.json` entry, command file, or agent definition. The report renders it with a copy button and a one-line install instruction, so "advice" becomes a 10-second action.

**Priority mapping:**

| Score | Priority |
|---|---|
| 0-54 (D/C) | high (required) |
| 55-69 (B) | medium (upgrade to high if clearly poor) |
| 70-84 (A) | low (level-up move toward S) |
| 85-100 (S) | low (refinement, or cross-pollinate to weaker dims) |

**Quality bar:**
- `promptRewrite` must be a concrete pastable string — not advice like "ask more questions"
- `expectedImpact` should be honest about trade-offs ("+12 Proof Check, but might slow you down")
- `evidence` must quote/paraphrase real session content (the parser's `dimensionEvidence` exists for exactly this)

---

## Since last check-up (longitudinal)

Every rendered report is archived locally (`~/.claude-radar/history/<project>/`, last 10). On the next run, the baseline engine loads the previous report and the report shows:

- **Score deltas** — overall and per dimension.
- **Adopted moves** — mechanically detected where possible: CLAUDE.md created or grown, `.mcp.json` added, hooks configured, plan mode / MCP / workflows / custom commands newly in use.
- **A short trajectory note.**

This turns a one-shot check-up into a feedback loop: you can see whether last month's suggestions actually moved your scores.

---

## Visibility limits (still honest)

Claude Radar's blind spots, stated explicitly:

1. **Invisible verification** — users who review AI diffs in their IDE before saying "ok" look like users who blindly accept. We see the conversation, not the screen.
2. **Silent expertise** — short, surgically precise messages may not trigger keyword counters. The adjustment layer compensates partially.
3. **Context from CLAUDE.md** — users with rich CLAUDE.md files give AI persistent context without repeating it. Claude Radar detects CLAUDE.md existence and size, which feeds Architecture, but the implicit context bonus to other dimensions is harder to attribute.
4. **Pair programming mode** — rapid short-exchange users will look different from detailed-brief users.
5. **Language limitations** — keyword signals work for English and Chinese. Other languages will under-score on verbal dimensions.
6. **Lossy cwd decoding** — Claude Code stores `~/.claude/projects/<slug>` with `/` and ` ` both encoded as `-`. Claude Radar tries (a) cwd embedded in jsonl entries, (b) suffix matching, (c) filesystem walk. If all fail, Architecture is marked N/A — not faked.

---

## What we don't measure

- **Code quality** — that's what linters, tests, and reviewers are for
- **Language / framework competence** — not our lane
- **Absolute productivity** — we can't tell you if you shipped more this week
- **Bug fix success rate** — we see the conversation, not the merge
- **Security posture** — separate discipline

We measure **collaboration behavior + engineering setup + outcome density**, not the final shipped artifact.

---

## Known limitations

1. **Small samples still mean wide error bars.** Density-based confidence mitigates over-shrinkage but doesn't eliminate uncertainty. Reports flag this in the profile section.
2. **Baselines have zero run-to-run variance** — they're computed in script. The only remaining variance is the bounded ±15 qualitative adjustment, and it must cite evidence or stay at zero. The diagnosis layer is descriptive enough that minor adjustment wiggles don't change the actionable takeaway.
3. **Profile classification is heuristic.** A 4-session prototype might be classified as `feature-build` when the user thinks of it as `one-shot`. The rationale string explains *why* — and users can re-run after more sessions.
4. **Architecture detection requires filesystem access.** If you run the analysis on a different machine than where the project lives, Architecture is N/A.
5. **The rubric is opinionated.** We define strong AI collaboration as goal-directed + tool-fluent + verification-heavy + closure-oriented. Teams with different preferences can tune `rubric.json`.

---

## Epistemic status

**What we do not claim:**
- That this is scientifically validated
- That an `S` collaborator is "better" than a `B` one
- That a low grade means you're a bad developer
- That this is the only valid framework

**What we do claim:**
- 9 dimensions across 3 categories cover the full lifecycle: communicate → engineer → execute → verify → close
- Position-aware + project-profile-aware scoring is genuinely orthogonal and fair
- Formula + adjustment + diagnosis combination is reproducible, evidence-grounded, and actionable
- The diagnosis layer turns scores into structured feedback you can apply in your next session

---

## How to change the scoring

Scoring lives in `data/rubric.json`, suggestions in `data/playbook.json`:

- **Change baseline formulas** — edit `dimensions.<dim>.baselineTerms` (structured, machine-evaluated; the `baselineFormula` string is human-readable documentation)
- **Change category groupings** — edit `categories.<cat>.dimensionIds`
- **Change profile weights / N/A rules** — edit `profiles.<profile>.categoryWeights` and `naDimensions`
- **Change applicability rules** — edit `dimensions.<dim>.applicabilityCondition`
- **Change grade thresholds** — edit `grades[*].range`
- **Change confidence scaling** — edit `scoring.confidenceScaling`
- **Change diagnosis spec** — edit `diagnosis.*`
- **Add or tune suggestions** — edit `data/playbook.json`: each move is a trigger condition + bilingual copy + optional installable asset template. Community contributions welcome.

No code changes needed. The scripts re-read both files every run. Run `node test/run.mjs` after editing to catch regressions.

---

*Claude Radar is open source. The methodology stays transparent so teams can understand the scoring logic and adapt it to their workflow.*
