# Calibration Notes — v1.1.0 (2026-07-06)

Deterministic-layer calibration run for the v1.1 pipeline (parse-project 2.1 → compute-baselines → render). All numbers below are **baseline previews** (script-computed, pre-adjustment) from 9 real local projects spanning the four profiles. Project names anonymized to their display basename.

## Verification checklist

| Check | Result |
|---|---|
| Regression suite (`node test/run.mjs`) | **62/62 pass**, repeatable |
| Determinism (same facts, two runs) | **byte-identical** output |
| Compaction continuations in evidence pool | **0** (previously up to 5/10 keyMessages) |
| cwd resolution | most-frequent cwd wins (root, 5543 occurrences) — not deepest path |
| Slash commands captured | yes, from `<command-name>` records; built-ins excluded |
| Orchestration visibility | Workflow / parallel bursts / background / cron / worktree all counted (`other` bucket: 33 → ≤1) |
| End-to-end render | report built from a real scoring packet renders with action-type badges, installable-asset blocks, history archive |

## Baseline distribution (9 projects)

| project | profile | sessions | msgs | confidence | overall (baseline) |
|---|---|---|---|---|---|
| task_schedule | feature-build | 7 | 111 | high | 64 B |
| ProjectHubComponents | long-running | 17 | 420 | high | 63 B |
| 文案 | feature-build | 4 | 20 | medium | 47 C |
| GEO | feature-build | 2 | 25 | medium | 54 C |
| Lemomo | one-shot | 1 | 10 | low | 54 C |
| Story | one-shot | 1 | 7 | low | 41 C |
| Idea | one-shot | 1 | 4 | low | 49 C |
| music | one-shot | 1 | 4 | low | 42 C |
| maker | one-shot | 1 | 2 | low | 59 B |

Per-dimension spreads across the sample:

| dimension | min | max | N/A count |
|---|---|---|---|
| Lock-On (intent) | 30 | 72 | 0 |
| Scene Setting (context) | 22 | 49 | 0 |
| Steering (feedback) | 19 | 72 | 0 |
| Toolcraft | 58 | 100 | 0 |
| Architecture | 40 | 41 | 6 (unresolved cwd / one-shot) |
| Tempo | 29 | 44 | 5 (one-shot) |
| Efficiency | 67 | 100 | 0 |
| Proof Check (verification) | 13 | 81 | 0 |
| Completion | 33 | 87 | 5 (one-shot) |

## Readings

1. **Discrimination is healthy.** Scores are not clustered in a 60-80 comfort band: verification spans 13–81, feedback 19–72, toolcraft 58–100. The rubric separates real behavioral differences.
2. **Profile fairness works as designed.** One-shot projects get Architecture/Tempo/Completion N/A instead of fake 50s; low-confidence tiny projects shrink toward 50 and (below 5 messages) are refused entirely by the skill.
3. **Candidate-move counts scale with evidence.** Large projects matched 14–17 playbook moves; tiny one-shots matched 0–2. The skill's minimum-5 rule falls back to evidence-grounded hand-rolled moves only in the smallest projects.
4. **Known skews to revisit next calibration round:**
   - `context` (Scene Setting) tops out at 49 in this sample — the opening-ratio pivots (0.3) are strict for conversational zh users. The *ordering* discriminates correctly; consider softening pivots to 0.25 if broader samples confirm the ceiling.
   - `tempo` is the lowest-mean dimension for heavy long-session users (compaction penalty working as intended) — watch that the penalty cap (−12) stays proportionate.
   - `architecture` variance in this sample is zero because none of the sampled projects have persistent assets — the dimension differentiates only after users adopt setup suggestions, which is exactly what the Since-last-check-up panel should surface.

## How to re-run this calibration

```bash
node skills/analyze/scripts/list-projects.mjs                       # pick a diverse sample
node skills/analyze/scripts/parse-project.mjs <proj> --out /tmp/f.json
node skills/analyze/scripts/compute-baselines.mjs /tmp/f.json       # inspect baselines + baselinePreview
node test/run.mjs                                                   # regression gate
```
