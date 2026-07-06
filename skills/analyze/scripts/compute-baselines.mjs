#!/usr/bin/env node
// compute-baselines.mjs — Deterministic scoring engine for Claude Radar
//
// Evaluates rubric.json baselineTerms against a facts JSON (from parse-project.mjs),
// applies N/A rules and confidence scaling, matches playbook.json triggers into
// candidateMoves, and loads the previous report (if any) for longitudinal deltas.
//
// The output is a single "scoring packet" containing everything the AI layer
// needs: baselines it must NOT recompute, evidence to cite, candidate moves to
// instantiate, and last-run comparison data. Zero LLM arithmetic → zero variance.
//
// Usage: node compute-baselines.mjs <facts-json-path> [--rubric <path>] [--playbook <path>] [--history-dir <path>]
// Output (stdout): scoring packet JSON

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let rubricPath = path.resolve(__dirname, '..', '..', '..', 'data', 'rubric.json');
let playbookPath = path.resolve(__dirname, '..', '..', '..', 'data', 'playbook.json');
let historyDir = path.join(os.homedir(), '.claude-radar', 'history');
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rubric' && args[i + 1]) { rubricPath = args[++i]; }
  else if (args[i] === '--playbook' && args[i + 1]) { playbookPath = args[++i]; }
  else if (args[i] === '--history-dir' && args[i + 1]) { historyDir = args[++i]; }
  else positional.push(args[i]);
}
const factsPath = positional[0];
if (!factsPath) {
  console.error('Usage: compute-baselines.mjs <facts-json-path> [--rubric <path>] [--playbook <path>]');
  process.exit(1);
}

function readJson(p, label) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read ${label} at ${p}: ${e.message}`);
    process.exit(1);
  }
}

const facts = readJson(factsPath, 'facts');
const rubric = readJson(rubricPath, 'rubric');
let playbook = { moves: [] };
try {
  if (fs.existsSync(playbookPath)) playbook = JSON.parse(fs.readFileSync(playbookPath, 'utf-8'));
} catch {}

// ─── Path lookup ─────────────────────────────────────────────────────────────
function getPath(obj, dotted) {
  if (!dotted) return undefined;
  let cur = obj;
  for (const seg of dotted.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

function numeric(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function countOf(v) {
  if (Array.isArray(v)) return v.length;
  return numeric(v);
}

const clampVal = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Term evaluation ─────────────────────────────────────────────────────────
function resolveSignal(term) {
  // fallbackIfZero: when the check path (e.g. a position bucket's messageCount)
  // is 0, read the fallback signal (global ratio) instead.
  if (term.fallbackIfZero) {
    const check = numeric(getPath(facts, term.fallbackIfZero.check));
    if (check === 0) {
      return { value: getPath(facts, term.fallbackIfZero.signal), usedFallback: true };
    }
  }
  return { value: getPath(facts, term.signal), usedFallback: false };
}

function evalTerm(term) {
  let contribution = 0;
  let label = term.signal || term.num || '?';
  let usedFallback = false;

  switch (term.kind) {
    case 'pivot': {
      const r = resolveSignal(term);
      usedFallback = r.usedFallback;
      contribution = (numeric(r.value) - term.pivot) * term.coeff;
      break;
    }
    case 'ratioClamp': {
      const r = resolveSignal(term);
      usedFallback = r.usedFallback;
      contribution = clampVal(numeric(r.value) / term.div, term.clamp[0], term.clamp[1]) * term.coeff;
      break;
    }
    case 'perClamp': {
      const num = numeric(getPath(facts, term.num));
      const den = Math.max(numeric(getPath(facts, term.den)), 1);
      contribution = clampVal(num / den, term.clamp[0], term.clamp[1]) * term.coeff;
      label = `${term.num}/${term.den}`;
      break;
    }
    case 'perPivot': {
      const num = numeric(getPath(facts, term.num));
      const den = Math.max(numeric(getPath(facts, term.den)), 1);
      contribution = (num / den - term.pivot) * term.coeff;
      label = `${term.num}/${term.den}`;
      break;
    }
    case 'flag': {
      const v = getPath(facts, term.signal);
      contribution = v ? term.coeff : 0;
      break;
    }
    case 'threshold': {
      const v = numeric(getPath(facts, term.signal));
      contribution = v > term.gt ? term.coeff : 0;
      break;
    }
    case 'countCap': {
      const v = getPath(facts, term.signal);
      contribution = Math.min(countOf(v), term.cap) * term.coeff;
      break;
    }
    case 'shiftClamp': {
      const r = resolveSignal(term);
      usedFallback = r.usedFallback;
      contribution = clampVal((numeric(r.value) - term.sub) / term.div, term.clamp[0], term.clamp[1]) * term.coeff;
      break;
    }
    default:
      contribution = 0;
  }
  return { label, contribution: +contribution.toFixed(2), usedFallback };
}

// ─── Condition evaluation (applicability + playbook triggers) ────────────────
function evalCondition(cond) {
  if (!cond) return false;
  if (cond.all) return cond.all.every(evalCondition);
  if (cond.any) return cond.any.some(evalCondition);
  if (cond.not) return !evalCondition(cond.not);

  const v = getPath(facts, cond.path);
  switch (cond.op) {
    case 'eq': return v === cond.value;
    case 'neq': return v !== cond.value;
    case 'gt': return numeric(v) > cond.value;
    case 'gte': return numeric(v) >= cond.value;
    case 'lt': return numeric(v) < cond.value;
    case 'lte': return numeric(v) <= cond.value;
    case 'in': return Array.isArray(cond.value) && cond.value.includes(v);
    case 'notIn': return Array.isArray(cond.value) && !cond.value.includes(v);
    case 'truthy': return !!v;
    case 'falsy': return !v;
    case 'lenEq': return countOf(v) === cond.value;
    case 'lenGte': return countOf(v) >= cond.value;
    case 'lenLte': return countOf(v) <= cond.value;
    case 'includesAny': {
      if (!Array.isArray(v) || !Array.isArray(cond.value)) return false;
      const names = v.map(x => (typeof x === 'string' ? x : x && x.name) || '').map(s => s.toLowerCase());
      return cond.value.some(want => names.includes(String(want).toLowerCase()));
    }
    default: return false;
  }
}

// ─── Baselines ───────────────────────────────────────────────────────────────
const CONFIDENCE_FACTOR = { low: 0.75, medium: 0.9, high: 1 };
const confidence = facts.confidenceLevel || 'high';
const scaleFactor = CONFIDENCE_FACTOR[confidence] ?? 1;
const naByProfile = new Set((facts.projectProfile && facts.projectProfile.naDimensions) || []);

const baselines = {};
for (const dimId of rubric.dimensionOrder) {
  const dim = rubric.dimensions[dimId];
  if (!dim) continue;

  let naReason = null;
  if (naByProfile.has(dimId)) {
    naReason = `N/A for ${facts.projectProfile.type} profile`;
  } else if (dim.applicabilityCondition && evalCondition(dim.applicabilityCondition)) {
    naReason = dim.applicabilityRule || 'applicability condition met';
  }

  if (naReason) {
    baselines[dimId] = { applicable: false, naReason, raw: null, scaled: null, breakdown: [] };
    continue;
  }

  const spec = dim.baselineTerms || { base: 50, terms: [], clamp: [0, 100] };
  let total = spec.base;
  const breakdown = [];
  let anyFallback = false;
  for (const term of spec.terms || []) {
    const { label, contribution, usedFallback } = evalTerm(term);
    total += contribution;
    if (usedFallback) anyFallback = true;
    breakdown.push({ term: label, contribution });
  }
  const [lo, hi] = spec.clamp || [0, 100];
  const raw = +clampVal(total, lo, hi).toFixed(1);
  const scaled = Math.round(50 + (raw - 50) * scaleFactor);

  baselines[dimId] = {
    applicable: true,
    raw,
    scaled,
    confidenceScaling: confidence,
    usedGlobalFallback: anyFallback,
    breakdown: breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  };
}

// ─── Baseline-only preview (pre-adjustment) ──────────────────────────────────
const categoryPreview = {};
for (const [catId, cat] of Object.entries(rubric.categories)) {
  const scores = cat.dimensionIds
    .map(id => baselines[id])
    .filter(b => b && b.applicable)
    .map(b => b.scaled);
  categoryPreview[catId] = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
}

let weights = { ...(facts.projectProfile && facts.projectProfile.categoryWeights || {}) };
const deadCats = Object.keys(categoryPreview).filter(c => categoryPreview[c] === null);
if (deadCats.length > 0) {
  const deadWeight = deadCats.reduce((s, c) => s + (weights[c] || 0), 0);
  const liveCats = Object.keys(categoryPreview).filter(c => categoryPreview[c] !== null);
  const liveWeight = liveCats.reduce((s, c) => s + (weights[c] || 0), 0) || 1;
  for (const c of deadCats) weights[c] = 0;
  for (const c of liveCats) weights[c] = (weights[c] || 0) + deadWeight * ((weights[c] || 0) / liveWeight);
}
let overallPreview = 0;
for (const [c, s] of Object.entries(categoryPreview)) {
  if (s !== null) overallPreview += s * (weights[c] || 0);
}
overallPreview = Math.round(overallPreview);
const gradeOf = (score) => {
  for (const g of rubric.grades) {
    if (score >= g.range[0] && score <= g.range[1]) return g.letter;
  }
  return 'D';
};

// ─── Playbook candidate moves ────────────────────────────────────────────────
const candidateMoves = [];
for (const move of playbook.moves || []) {
  try {
    if (!evalCondition(move.trigger)) continue;
  } catch { continue; }
  const dimBaseline = baselines[move.dimensionId];
  candidateMoves.push({
    ...move,
    trigger: undefined,
    dimensionBaseline: dimBaseline && dimBaseline.applicable ? dimBaseline.scaled : null
  });
}
// Weakest dimensions first — those are where suggestions matter most.
candidateMoves.sort((a, b) => (a.dimensionBaseline ?? 100) - (b.dimensionBaseline ?? 100));

// ─── Previous report (longitudinal) ──────────────────────────────────────────
function loadPrevious() {
  const slug = facts.projectSlug;
  if (!slug) return null;
  const dir = path.join(historyDir, slug);
  let files = [];
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  } catch { return null; }
  if (files.length === 0) return null;
  let prev;
  try {
    prev = JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf-8'));
  } catch { return null; }

  const dimensionScores = {};
  for (const d of prev.dimensions || []) {
    if (d && d.id) dimensionScores[d.id] = d.score;
  }

  // Mechanical adoption signals: compare previous report snapshot vs current facts.
  const adoptionSignals = [];
  const pa = prev.projectAssets || {};
  const ca = facts.projectAssets || {};
  const pt = prev.toolcraftDetails || {};
  const ct = facts.toolcraftSummary || {};
  if (!pa.hasClaudeMd && ca.hasClaudeMd) adoptionSignals.push('CLAUDE.md was created since the last report');
  if (pa.hasClaudeMd && ca.hasClaudeMd && (ca.claudeMdSize - (pa.claudeMdSize || 0)) > 300) {
    adoptionSignals.push(`CLAUDE.md grew from ${pa.claudeMdSize || 0} to ${ca.claudeMdSize} bytes`);
  }
  if (!pa.hasMcpJson && ca.hasMcpJson) adoptionSignals.push('.mcp.json was added');
  if (!(pa.settingsHookCount > 0) && ca.settingsHookCount > 0) adoptionSignals.push('hooks were configured in .claude/settings.json');
  if (!((pt.planModeEntries || 0) > 0) && (ct.planModeEntries || 0) > 0) adoptionSignals.push('plan mode is now being used');
  if (((pt.mcpServers || []).length === 0) && (ct.mcpServers || []).length > 0) adoptionSignals.push('MCP servers are now in use');
  if (((pt.customCommands || []).length === 0) && (ct.customCommands || []).length > 0) adoptionSignals.push('custom commands are now in use');
  const prevWf = (pt.orchestration && pt.orchestration.workflowRuns) || 0;
  const curWf = (ct.orchestration && ct.orchestration.workflowRuns) || 0;
  if (prevWf === 0 && curWf > 0) adoptionSignals.push('workflow orchestration is now in use');

  return {
    generatedAt: prev.generatedAt || null,
    overallScore: prev.overallScore ?? null,
    overallGrade: prev.overallGrade || null,
    categoryScores: prev.categoryScores || {},
    dimensionScores,
    suggestions: (prev.suggestions || []).map(s => ({
      title: s.title, dimensionId: s.dimensionId, actionType: s.actionType || null
    })),
    adoptionSignals
  };
}
const previous = loadPrevious();

// ─── Rubric metadata the AI layer needs (names, guides, thresholds) ──────────
const dimensionsMeta = {};
for (const dimId of rubric.dimensionOrder) {
  const d = rubric.dimensions[dimId];
  if (!d) continue;
  dimensionsMeta[dimId] = {
    category: d.category,
    name: d.name,
    shortName: d.shortName,
    description: d.description,
    adjustmentGuide: d.adjustmentGuide,
    scoringPhilosophy: d.scoringPhilosophy
  };
}

// ─── Scoring packet ──────────────────────────────────────────────────────────
const positionRatios = {};
for (const [pos, bucket] of Object.entries(facts.signalsByPosition || {})) {
  positionRatios[pos] = { messageCount: bucket.messageCount, ratios: bucket.ratios };
}

const packet = {
  packetVersion: '2.1',
  project: facts.project,
  projectSlug: facts.projectSlug,
  profile: facts.projectProfile,
  sessionCount: facts.sessionCount,
  dateRange: facts.dateRange,
  confidenceLevel: facts.confidenceLevel,
  confidenceReason: facts.confidenceReason,
  dominantLanguage: facts.dominantLanguage,
  signalDensity: facts.signalDensity,
  outcomeDensity: facts.outcomeDensity,

  stats: facts.stats,
  patterns: facts.patterns,
  labelRatios: facts.labelRatios,
  signalsByPosition: positionRatios,
  toolcraftSummary: facts.toolcraftSummary,
  projectAssets: facts.projectAssets,
  outcomeTotals: facts.outcomeTotals,
  techStackDetected: facts.techStackDetected || [],

  firstMessage: facts.firstMessage,
  keyMessages: facts.keyMessages,
  sampleExchanges: facts.sampleExchanges,
  sessionFlows: facts.sessionFlows,
  dimensionEvidence: facts.dimensionEvidence || {},

  baselines,
  baselinePreview: {
    note: 'Baseline-only (pre-adjustment). Final scores = scaled baseline + bounded Claude adjustment (±15, evidence-cited).',
    categoryScores: categoryPreview,
    overallScore: overallPreview,
    overallGrade: gradeOf(overallPreview)
  },

  dimensionOrder: rubric.dimensionOrder,
  dimensionsMeta,
  grades: rubric.grades,
  adjustmentRange: (rubric.scoring && rubric.scoring.adjustmentRange) || [-15, 15],

  candidateMoves,
  previous
};

process.stdout.write(JSON.stringify(packet, null, 2) + '\n');
