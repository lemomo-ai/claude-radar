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
   [parse-project.mjs]           ← Deterministic. Position-aware signals + tool/skill/MCP/CLAUDE.md detection.
         │ facts.json (schemaVersion 2.0)
         ▼
    [Claude in the skill]        ← Reads rubric.json. Two-layer: scoring + diagnosis.
         │ report.json (schemaVersion 2.0)
         ▼
   [render-report.mjs]           ← Pure transform. JSON + template → HTML dashboard.
         │
         ▼
  ~/.claude-radar/reports/<slug>-<ts>.html
```

Three clearly separated stages:

- **Parser** — deterministic. Same input → same facts. Now also detects tool usage by category (Skill, MCP, Subagent, Plan mode, custom commands), CLAUDE.md / memory / agents / settings.json presence, per-session outcomes, and auto-classifies the project profile.
- **Scorer + Diagnoser** — Claude, running inside your Claude Code session. Computes a **formula baseline** from signals, applies **density-based confidence scaling**, applies a **bounded qualitative adjustment** (±15 points max), and then independently produces a **free-form diagnosis layer**.
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

1. **Formula baseline** (deterministic): plug facts values into the formula in `rubric.json`. Result clamped to [0, 100].
2. **Density-based confidence scaling**: see §8.
3. **Claude adjustment** (bounded ±15): must cite evidence from `keyMessages`, `sampleExchanges`, `sessionFlows`, `toolcraftSummary`, etc. No evidence → no adjustment.

```
finalScore = clamp(adjustedBaseline + claudeAdjustment, 0, 100)
```

**The "Silent Expert" pattern** is still recognized — short messages with high precision (`<100 chars` containing file path + identifier + action) get upward adjustments via the adjustment guide.

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
, clamped [0, 100]
```

A user who only uses Edit/Bash/Read scores ~60 (B). A user who chains skill → subagent → custom command with Plan mode and Todo tracking scores 90+ (S). The Claude ±15 adjustment can pull a score down if advanced-tool usage triggered retry loops or sat unused after invocation ("tool theater").

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
, clamped [0, 100]
```

**Applicability rule:** if the project's working directory can't be located on the current machine, this dimension is N/A — filesystem inspection isn't possible without `cwd` access.

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

## Suggestion specification (5-7, with prompt rewrites)

**Minimum 5 suggestions, always.** Even for high-scoring users — instead of corrective suggestions, generate "level-up moves" from these sources: (a) push a strong dim from 82 → 90+, (b) cross-pollinate a working habit to a weaker dim, (c) suggest a Skill/MCP/Subagent move tied to actual workflow, (d) recap/milestone/scoping process habits, (e) risk reduction (e.g. "all your skill is in your head, not in CLAUDE.md").

Each suggestion now includes:

```jsonc
{
  "dimensionId": "verification",
  "priority": "high",
  "title": { "en": "...", "zh": "..." },
  "body": { "en": "...", "zh": "..." },
  "evidence": { "en": "Across 8 sessions...", "zh": "..." },
  "promptRewrite": { "en": "Before you write code, walk me through...", "zh": "..." },
  "expectedImpact": { "en": "+10-15 Proof Check; minimal Efficiency cost.", "zh": "..." }
}
```

**Priority mapping:**

| Score | Priority | Required? |
|---|---|---|
| 0-54 (D/C) | high | yes |
| 55-69 (B) | medium | usually |
| 70-84 (A) | low | only with specific gap |
| 85-100 (S) | — | skip |

**Quality bar:**
- `promptRewrite` must be a concrete pastable string — not advice like "ask more questions"
- `expectedImpact` should be honest about trade-offs ("+12 Proof Check, but might slow you down")
- `evidence` must quote/paraphrase real session content

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
2. **Scoring still has run-to-run variance** (~±3 points typical). The diagnosis layer is descriptive enough that minor score wiggles don't change the actionable takeaway.
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

Everything is in `data/rubric.json`:

- **Change baseline formulas** — edit `dimensions.<dim>.baselineFormula`
- **Change category groupings** — edit `categories.<cat>.dimensionIds`
- **Change profile weights / N/A rules** — edit `profiles.<profile>.categoryWeights` and `naDimensions`
- **Change applicability rules** — edit `dimensions.<dim>.applicabilityRule`
- **Change grade thresholds** — edit `grades[*].range`
- **Change confidence scaling** — edit `scoring.confidenceScaling`
- **Change diagnosis spec** — edit `diagnosis.*`
- **Change suggestion spec** — edit `suggestions.*`

No code changes needed. Claude re-reads `rubric.json` every run.

---

*Claude Radar is open source. The methodology stays transparent so teams can understand the scoring logic and adapt it to their workflow.*
