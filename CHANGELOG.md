# Changelog

## v1.2.0 — 2026-07-10

**Report UI redesigned from the ground up with Claude (Fable 5)** — from a metrics dashboard into an editorial check-up report.

- **New report template** (`viewer/template.html`): warm editorial layout, 9-dimension radar chart in the verdict hero, Key Findings (strength / bottleneck highlight cards + cross-dimension pull quote), "Do These Next" key-action cards with the remaining suggestions in an accordion, dimension scores as grouped expandable rows, toolcraft stats collapsed into an appendix.
- Light & dark themes with manual toggle, refined typography (serif display + sans body), print styles.
- Category and grade palettes validated for color-vision safety and contrast.
- **Report schema 2.2**: structured `highlights` (strength / bottleneck as first-class data) and `isKeyAction` flags on suggestions. Archived 2.1 reports still render via a fallback path.
- Docs: rewritten report walkthrough, new sample screenshots, landing-page refresh.

Scoring pipeline unchanged.

## v1.1.0 — 2026-07-07

- Deterministic scoring: all baseline arithmetic moved into `compute-baselines.mjs` (zero run-to-run variance), Claude limited to a bounded ±15 evidence-cited adjustment.
- Orchestration signals: Workflow runs, parallel tool bursts, background tasks now feed the Engineering category.
- Playbook-driven suggestions (`data/playbook.json`): trigger-matched moves with pastable prompts and installable assets.
- Longitudinal check-ups: reports archived to `~/.claude-radar/history/`, score deltas and adopted suggestions shown on the next run.

## v1.0.0 — 2026-05-26

- Initial release: 9 dimensions across Communication / Engineering / Outcome, project-profile-aware weighting and N/A rules, AI-written diagnosis, bilingual single-file HTML report. 100% local.
