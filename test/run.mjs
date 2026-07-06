#!/usr/bin/env node
// test/run.mjs — Regression tests for Claude Radar's deterministic layer.
//
// Generates synthetic session fixtures (with machine-local absolute paths),
// runs parse-project.mjs and compute-baselines.mjs on them, and asserts the
// behaviors that past bugs shipped without: compaction filtering, sidechain
// exclusion, cwd mode-resolution, slash-command capture, orchestration
// signals, retry/blind-accept calibration, asset detection, baseline
// arithmetic, playbook triggers, and run-to-run determinism.
//
// Usage: node test/run.mjs

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const SCRIPTS = path.join(repoRoot, 'skills', 'analyze', 'scripts');
const TMP = path.join(__dirname, '.tmp');

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; }
  else { failed++; failures.push(`${name}${detail ? ' — ' + detail : ''}`); }
}

function writeJsonl(dir, name, entries) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), entries.map(e => JSON.stringify(e)).join('\n') + '\n');
}

function runParse(projectDir) {
  const out = execFileSync('node', [path.join(SCRIPTS, 'parse-project.mjs'), projectDir], { encoding: 'utf-8' });
  return JSON.parse(out);
}

function runBaselines(factsObj, label) {
  const p = path.join(TMP, `facts-${label}.json`);
  fs.writeFileSync(p, JSON.stringify(factsObj, null, 2));
  const out = execFileSync('node', [path.join(SCRIPTS, 'compute-baselines.mjs'), p], { encoding: 'utf-8' });
  return { packet: JSON.parse(out), raw: out, factsPath: p };
}

const TS = (n) => `2026-07-01T10:0${n % 10}:00.000Z`;
const user = (text, extra = {}) => ({ type: 'user', message: { role: 'user', content: text }, timestamp: TS(1), ...extra });
const asst = (id, blocks, extra = {}) => ({ type: 'assistant', message: { role: 'assistant', id, content: blocks }, timestamp: TS(2), ...extra });
const text = (s) => ({ type: 'text', text: s });
const tool = (name, input = {}) => ({ type: 'tool_use', name, input });

// ═════ fakeproj: a real directory tree for asset detection ═════
const FAKEPROJ = path.join(TMP, 'fakeproj');
const DEEP = path.join(FAKEPROJ, 'src', 'deep');
fs.mkdirSync(DEEP, { recursive: true });
fs.writeFileSync(path.join(FAKEPROJ, 'CLAUDE.md'),
  '# fakeproj\n\n' + 'Project conventions and commands. '.repeat(20) + '\n');
fs.writeFileSync(path.join(FAKEPROJ, 'AGENTS.md'), '# Agents\n');
fs.writeFileSync(path.join(FAKEPROJ, 'CLAUDE.local.md'), '# local\n');
fs.writeFileSync(path.join(FAKEPROJ, '.mcp.json'), '{"mcpServers":{}}\n');
const dotClaude = path.join(FAKEPROJ, '.claude');
fs.mkdirSync(path.join(dotClaude, 'commands'), { recursive: true });
fs.mkdirSync(path.join(dotClaude, 'memory'), { recursive: true });
fs.mkdirSync(path.join(dotClaude, 'agents'), { recursive: true });
fs.mkdirSync(path.join(dotClaude, 'skills', 'deploy'), { recursive: true });
fs.writeFileSync(path.join(dotClaude, 'commands', 'review.md'), '# review\n');
fs.writeFileSync(path.join(dotClaude, 'memory', 'notes.md'), 'note\n');
fs.writeFileSync(path.join(dotClaude, 'agents', 'reviewer.md'), '# reviewer\n');
fs.writeFileSync(path.join(dotClaude, 'skills', 'deploy', 'SKILL.md'), '# deploy\n');
fs.writeFileSync(path.join(dotClaude, 'settings.json'),
  JSON.stringify({ hooks: { PostToolUse: [], PreToolUse: [] } }));
fs.writeFileSync(path.join(dotClaude, 'settings.local.json'),
  JSON.stringify({ hooks: { Stop: [] } }));

// ═════ Case 1: compaction continuation filtered + counted ═════
{
  const dir = path.join(TMP, 'projects', 'compaction');
  writeJsonl(dir, 's1.jsonl', [
    user('帮我修复 src/app.ts 里的 parseDate 函数，期望它支持 ISO 格式并且不要引入新依赖'),
    asst('a1', [text('好的，我来修复'), tool('Edit', { file_path: '/x/src/app.ts' })]),
    user('This session is being continued from a previous conversation that ran out of context. ' + 'Summary of prior work. '.repeat(200)),
    user('好，继续把测试补上'),
    asst('a2', [text('测试已补充完成')])
  ]);
  const f = runParse(dir);
  check('compaction: continuation not counted as human message', f.stats.humanMessages === 2, `got ${f.stats.humanMessages}`);
  check('compaction: compactionCount === 1', f.patterns.compactionCount === 1, `got ${f.patterns.compactionCount}`);
  check('compaction: keyMessages clean', f.keyMessages.every(k => !k.text.includes('session is being continued')));
  check('compaction: avg chars sane', f.stats.avgHumanMsgChars < 200, `got ${f.stats.avgHumanMsgChars}`);
}

// ═════ Case 2: sidechain entries excluded ═════
{
  const dir = path.join(TMP, 'projects', 'sidechain');
  writeJsonl(dir, 's1.jsonl', [
    user('Refactor the auth middleware in src/auth.ts to support token refresh'),
    asst('a1', [text('Working on it'), tool('Agent', { prompt: 'scan' })]),
    user('You are a subagent. Scan the codebase for auth usages and report back.', { isSidechain: true }),
    asst('side1', [text('Subagent reply with findings')], { isSidechain: true }),
    user('Looks good, done'),
    asst('a2', [text('Completed')])
  ]);
  const f = runParse(dir);
  check('sidechain: user entries excluded', f.stats.humanMessages === 2, `got ${f.stats.humanMessages}`);
}

// ═════ Case 3: orchestration signals + tool taxonomy ═════
{
  const dir = path.join(TMP, 'projects', 'workflow');
  writeJsonl(dir, 's1.jsonl', [
    user('Run the full audit across modules and publish the results'),
    asst('m1', [tool('Workflow', { script: 'x' })]),
    // Parallel burst: three entries sharing message id m2
    asst('m2', [tool('Read', { file_path: '/a' })]),
    asst('m2', [tool('Read', { file_path: '/b' })]),
    asst('m2', [tool('Read', { file_path: '/c' })]),
    asst('m3', [tool('Bash', { command: 'npm run build', run_in_background: true })]),
    asst('m4', [
      tool('CronCreate', {}), tool('EnterWorktree', {}), tool('Artifact', { file_path: '/r.html' }),
      tool('mcp__testsrv__do', {}), tool('Skill', { skill: 'myskill' }), tool('ToolSearch', { query: 'x' })
    ]),
    user('好的 收工了'),
    asst('m5', [text('All done, report published.')])
  ]);
  const f = runParse(dir);
  const o = f.toolcraftSummary.orchestration;
  check('workflow: workflowRuns', o.workflowRuns === 1, JSON.stringify(o));
  check('workflow: parallel burst via shared msgId', o.parallelToolBursts >= 1 && o.maxParallelToolUses >= 3, JSON.stringify(o));
  check('workflow: backgroundTasks', o.backgroundTasks === 1);
  check('workflow: cronJobs', o.cronJobs === 1);
  check('workflow: worktreeUses', o.worktreeUses === 1);
  check('workflow: artifactsPublished', o.artifactsPublished === 1);
  check('workflow: mcp server detected', f.toolcraftSummary.mcpServers.some(m => m.name === 'testsrv'));
  check('workflow: skill detected', f.toolcraftSummary.skillsUsed.some(s => s.name === 'myskill'));
  check('workflow: toolSearch categorized', f.toolcraftSummary.byCategory.toolSearch === 1);
  check('workflow: nothing fell into other', (f.toolcraftSummary.byCategory.other || 0) === 0, `other=${f.toolcraftSummary.byCategory.other}`);
}

// ═════ Case 4: slash commands from <command-name> entries ═════
{
  const dir = path.join(TMP, 'projects', 'slash');
  writeJsonl(dir, 's1.jsonl', [
    user('<command-name>/model</command-name><command-message>model</command-message>'),
    user('<command-name>/myreview</command-name><command-message>myreview</command-message>'),
    user('<command-name>/claude-radar</command-name><command-message>claude-radar</command-message>'),
    user('Update the install section of README.md to include the brew instructions'),
    asst('a1', [text('Updated'), tool('Edit', { file_path: '/README.md' })]),
    user('好的 完成了'),
    asst('a2', [text('Done')])
  ]);
  const f = runParse(dir);
  const cmds = f.toolcraftSummary.customCommands.map(c => c.name);
  check('slash: custom command captured', cmds.includes('/myreview'), JSON.stringify(cmds));
  check('slash: plugin skill invocation captured', cmds.includes('/claude-radar'), JSON.stringify(cmds));
  check('slash: builtin /model excluded', !cmds.includes('/model'), JSON.stringify(cmds));
  check('slash: command entries not human messages', f.stats.humanMessages === 2, `got ${f.stats.humanMessages}`);
}

// ═════ Case 5: retry loops — "继续" nudges don't count, real loops do ═════
{
  const dir = path.join(TMP, 'projects', 'retry');
  const longAsk = '这个登录页面的样式还是不对，按钮颜色和设计稿不一致，请再改一下试试看';
  writeJsonl(dir, 's1.jsonl', [
    user('继续'), asst('a1', [text('ok'), tool('Edit', { file_path: '/a.css' })]),
    user('继续'), asst('a2', [text('ok'), tool('Edit', { file_path: '/a.css' })]),
    user('继续'), asst('a3', [text('ok'), tool('Edit', { file_path: '/a.css' })]),
    user(longAsk), asst('a4', [text('改了'), tool('Edit', { file_path: '/a.css' })]),
    user(longAsk), asst('a5', [text('又改了'), tool('Edit', { file_path: '/a.css' })]),
    user(longAsk), asst('a6', [text('再改了'), tool('Edit', { file_path: '/a.css' })])
  ]);
  const f = runParse(dir);
  check('retry: exactly the substantive loop counted', f.patterns.retryLoops === 1, `got ${f.patterns.retryLoops}`);
}

// ═════ Case 6: blind accepts — plan/question confirmations exempt ═════
{
  const dir = path.join(TMP, 'projects', 'blind');
  writeJsonl(dir, 's1.jsonl', [
    user('帮我把 header 组件改成 sticky 的'),
    asst('a1', [text('先确认一个问题'), tool('AskUserQuestion', { questions: [] })]),
    user('好的'),
    asst('a2', [text('改完了'), tool('Edit', { file_path: '/h.tsx' })]),
    user('好的'),
    asst('a3', [text('收工')])
  ]);
  const f = runParse(dir);
  check('blind: AskUserQuestion confirmation exempt, real blind accept counted', f.patterns.blindAccepts === 1, `got ${f.patterns.blindAccepts}`);
}

// ═════ Case 7: clean project — cwd mode, assets, language, profile ═════
{
  const dir = path.join(TMP, 'projects', 'clean');
  const cwdRoot = { cwd: FAKEPROJ };
  const cwdDeep = { cwd: DEEP };
  writeJsonl(dir, 's1.jsonl', [
    { ...user('This is a React + TypeScript app. The date parsing in src/utils/date.ts breaks on ISO strings — must not add new dependencies. Expected: parseDate returns a valid Date for ISO input.'), ...cwdRoot },
    { ...asst('a1', [text('Fixing'), tool('Edit', { file_path: FAKEPROJ + '/src/utils/date.ts' })]), ...cwdRoot },
    { ...user('Looks right because the regression came from timezone handling. Also run the tests to verify.'), ...cwdRoot },
    { ...asst('a2', [text('Tests pass'), tool('Bash', { command: 'npm test' })]), ...cwdRoot },
    { ...user('Great, done, ship it'), ...cwdRoot },
    { ...asst('a3', [text('Shipped')]), ...cwdRoot }
  ]);
  writeJsonl(dir, 's2.jsonl', [
    { ...user('Add a loading spinner to the dashboard page in src/pages/dashboard.tsx, should follow the pattern in src/components/Spinner.tsx'), ...cwdRoot },
    { ...asst('b1', [text('Adding'), tool('Edit', { file_path: FAKEPROJ + '/src/pages/dashboard.tsx' })]), ...cwdDeep },
    { ...user('The spinner is misaligned — wrong, it should be centered because the container uses flexbox'), ...cwdRoot },
    { ...asst('b2', [text('Fixed alignment'), tool('Edit', { file_path: FAKEPROJ + '/src/pages/dashboard.tsx' })]), ...cwdRoot },
    { ...user('works now, all set'), ...cwdRoot },
    { ...asst('b3', [text('Done')]), ...cwdRoot }
  ]);
  writeJsonl(dir, 's3.jsonl', [
    { ...user('Refactor the api client in src/api/client.ts — need retry logic, must keep the public interface stable'), ...cwdRoot },
    { ...asst('c1', [text('Refactoring'), tool('Edit', { file_path: FAKEPROJ + '/src/api/client.ts' })]), ...cwdRoot },
    { ...user('finished, merged'), ...cwdRoot },
    { ...asst('c2', [text('Great')]), ...cwdRoot }
  ]);
  const f = runParse(dir);
  check('clean: cwd resolved to most frequent (root), not deepest', f.resolvedCwd === FAKEPROJ, `got ${f.resolvedCwd}`);
  check('clean: displayName from cwd basename', f.project === 'fakeproj', `got ${f.project}`);
  check('clean: dominantLanguage en', f.dominantLanguage === 'en', `got ${f.dominantLanguage}`);
  check('clean: profile feature-build', f.projectProfile.type === 'feature-build', `got ${f.projectProfile.type}`);
  const a = f.projectAssets;
  check('clean: CLAUDE.md detected + size', a.hasClaudeMd && a.claudeMdSize > 500, JSON.stringify(a));
  check('clean: .mcp.json detected', a.hasMcpJson === true);
  check('clean: AGENTS.md detected', a.hasAgentsMd === true);
  check('clean: CLAUDE.local.md detected', a.hasClaudeLocalMd === true);
  check('clean: skills dir + count', a.hasSkillsDir === true && a.skillDirCount === 1, JSON.stringify(a));
  check('clean: hook events counted across settings files', a.settingsHookCount === 3, `got ${a.settingsHookCount}`);
  check('clean: commands/memory/agents detected', a.hasCommandsDir && a.commandCount === 1 && a.hasMemoryDir && a.memoryFileCount === 1 && a.hasAgentsDir && a.agentCount === 1);
  check('clean: techStack detected', (f.techStackDetected || []).some(t2 => t2.name === 'react'), JSON.stringify(f.techStackDetected));
  check('clean: dimensionEvidence populated', Object.values(f.dimensionEvidence).some(arr => arr.length > 0));

  // End-to-end: facts → compute-baselines
  const { packet, raw } = runBaselines(f, 'clean');
  check('clean: all 9 baselines present', packet.dimensionOrder.every(id => packet.baselines[id] !== undefined));
  check('clean: architecture applicable & rewarded', packet.baselines.architecture.applicable && packet.baselines.architecture.raw >= 90, JSON.stringify(packet.baselines.architecture));
  check('clean: dimensionsMeta shipped', !!packet.dimensionsMeta.intent && !!packet.grades);
  const { raw: raw2 } = runBaselines(f, 'clean2');
  check('clean: deterministic (two runs byte-identical)', raw === raw2);
}

// ═════ Case 8: baseline arithmetic on all-zero synthetic facts ═════
{
  const zeroRatios = {};
  for (const k of ['hasFilePath','hasIdentifier','hasError','hasCodeBlock','hasListStructure','hasExpectedBehavior','hasConstraint','isVague','hasReasoning','requestTest','thinkFirst','proactiveReview','progressive','checkpoint','summary','milestone','hasTechStack','hasCompletion']) zeroRatios[k] = 0;
  const bucket = { messageCount: 0, ratios: zeroRatios };
  const facts = {
    projectSlug: '-test-zero',
    project: 'zero',
    confidenceLevel: 'high',
    projectProfile: { type: 'feature-build', naDimensions: [], categoryWeights: { communication: 0.34, engineering: 0.33, outcome: 0.33 } },
    projectAssets: { cwdResolved: false },
    stats: { validSessions: 5, humanMessages: 30 },
    patterns: { blindAccepts: 0, retryLoops: 0, topicDrifts: 0, demandOverloads: 0, noReplyToQuestion: 0, compactionCount: 0 },
    labelRatios: zeroRatios,
    signalsByPosition: { opening: bucket, directing: bucket, correcting: bucket, confirming: bucket, continuing: bucket },
    toolcraftSummary: { skillsUsed: [], mcpServers: [], subagentCalls: 0, planModeEntries: 0, customCommands: [], byCategory: { todo: 0 }, orchestration: { workflowRuns: 0, backgroundTasks: 0, parallelToolBursts: 0, cronJobs: 0, worktreeUses: 0, artifactsPublished: 0 } },
    outcomeTotals: { toolsPerHumanMsg: 0, editsPerHumanMsg: 0, filesPerHumanMsg: 0, cleanEndRatio: 0, sessionsWithCompletionSignal: 0 },
    firstMessage: { avgLength: 0 },
    techStackDetected: [],
    keyMessages: [], sampleExchanges: [], sessionFlows: [], dimensionEvidence: {}
  };
  const { packet } = runBaselines(facts, 'zero');
  const b = packet.baselines;
  // Hand-derived from rubric baselineTerms:
  // tempo = 50 -5(summary) -4(milestone) -6(progressive) +2(sessions/20) = 37
  const expect = { intent: 23, context: 3, feedback: 18, toolcraft: 60, tempo: 37, efficiency: 50, verification: 31, completion: 1 };
  for (const [dim, want] of Object.entries(expect)) {
    check(`arith: ${dim} baseline === ${want}`, Math.abs(b[dim].raw - want) < 0.6, `got ${b[dim].raw}`);
  }
  check('arith: architecture N/A when cwd unresolved', b.architecture.applicable === false);
}

// ═════ Case 9: playbook triggers fire deterministically ═════
{
  const facts = {
    projectSlug: '-test-triggers',
    project: 'triggers',
    confidenceLevel: 'high',
    projectProfile: { type: 'feature-build', naDimensions: [], categoryWeights: { communication: 0.34, engineering: 0.33, outcome: 0.33 } },
    projectAssets: { cwdResolved: true, hasClaudeMd: false, hasMemoryDir: false, settingsHookCount: 0 },
    stats: { validSessions: 6, humanMessages: 40 },
    patterns: { blindAccepts: 4, retryLoops: 3, topicDrifts: 0, demandOverloads: 0, noReplyToQuestion: 0, compactionCount: 4 },
    labelRatios: { requestTest: 0, summary: 0, proactiveReview: 0, checkpoint: 0, hasCodeBlock: 0 },
    signalsByPosition: { opening: { messageCount: 0, ratios: {} }, directing: { messageCount: 0, ratios: {} }, correcting: { messageCount: 0, ratios: {} }, confirming: { messageCount: 0, ratios: {} }, continuing: { messageCount: 0, ratios: {} } },
    toolcraftSummary: { skillsUsed: [], mcpServers: [], subagentCalls: 0, planModeEntries: 0, customCommands: [], byCategory: { todo: 0, read: 0, bash: 0 }, orchestration: { workflowRuns: 0, backgroundTasks: 0, parallelToolBursts: 0, cronJobs: 0, worktreeUses: 0, artifactsPublished: 0 } },
    outcomeTotals: { toolsPerHumanMsg: 0, editsPerHumanMsg: 0, filesPerHumanMsg: 0, cleanEndRatio: 0, sessionsWithCompletionSignal: 0, fileEditCount: 0, distinctFilesTouched: 0 },
    firstMessage: { avgLength: 300 },
    techStackDetected: [{ name: 'react', count: 3 }],
    keyMessages: [], sampleExchanges: [], sessionFlows: [], dimensionEvidence: {}
  };
  const { packet } = runBaselines(facts, 'triggers');
  const ids = packet.candidateMoves.map(m => m.id);
  for (const want of ['create-claude-md', 'inspect-before-accept', 'scope-sessions', 'break-retry-loops', 'browser-mcp-for-frontend', 'memory-for-context']) {
    check(`triggers: ${want} fires`, ids.includes(want), JSON.stringify(ids));
  }
  check('triggers: enrich-claude-md does NOT fire (no CLAUDE.md)', !ids.includes('enrich-claude-md'));
  check('triggers: moves stripped of trigger field', packet.candidateMoves.every(m => m.trigger === undefined));
}

// ═════ Case 10: render smoke test (report → HTML with new panels) ═════
{
  const report = {
    schemaVersion: '2.1', project: 'fakeproj', projectSlug: '-test-fakeproj',
    generatedAt: '2026-07-06T12:00:00.000Z', language: 'zh',
    insight: { en: 'You ship fast — but you ship blind.', zh: '你出货飞快 — 但每次都闭着眼睛。' },
    profile: { type: 'feature-build', label: { en: 'Feature build', zh: '功能开发' }, rationale: { en: 'x', zh: 'x' }, sessionCount: 3, dateRange: ['2026-07-01', '2026-07-01'], humanMessages: 8, confidence: 'high' },
    overallScore: 72, overallGrade: 'A',
    categoryScores: { communication: 70, engineering: 75, outcome: 70 },
    dimensions: [{ id: 'verification', category: 'outcome', name: { en: 'Proof Check', zh: '鉴定术' }, shortName: { en: 'Proof', zh: '鉴定' }, description: { en: 'd', zh: 'd' }, applicable: true, score: 47, grade: 'C', baseline: 47, adjustment: 0, reasoning: { en: 'r', zh: 'r' }, evidence: ['e1'] }],
    toolcraftDetails: { totalToolCalls: 10, byCategory: {}, topTools: [], mcpServers: [], skillsUsed: [], subagentCalls: 2, planModeEntries: 1, customCommands: [], orchestration: { workflowRuns: 1, parallelToolBursts: 2, backgroundTasks: 1 } },
    projectAssets: { cwdResolved: true, hasClaudeMd: true, claudeMdSize: 700, hasMcpJson: true, hasSkillsDir: true, skillDirCount: 1, settingsHookCount: 3 },
    diagnosis: { collaborationProfile: { en: 'p', zh: 'p' }, coreDiagnosis: { en: '**Strength**: x. **Bottleneck**: y.', zh: '**强项**：x。**瓶颈**：y。' }, crossDimensionReading: { en: 'c', zh: 'c' } },
    suggestions: [{
      dimensionId: 'verification', priority: 'high', actionType: 'setup', playbookId: 'hook-verification-loop',
      title: { en: 'Automate the checking', zh: '让检查自动发生' },
      body: { en: 'b', zh: 'b' }, evidence: { en: 'ev', zh: 'ev' },
      promptRewrite: { en: 'pr', zh: 'pr' },
      assetPath: '.claude/settings.json', assetContent: '{"hooks":{"PostToolUse":[]}}',
      expectedImpact: { en: '+10', zh: '+10' }
    }],
    sinceLastRun: {
      previousDate: '2026-06-20T10:00:00.000Z', overallDelta: 5,
      dimensionDeltas: { verification: 14 },
      adoptedMoves: [{ en: 'CLAUDE.md was created', zh: '已创建 CLAUDE.md' }],
      notes: { en: 'Trending up.', zh: '在变好。' }
    }
  };
  const rp = path.join(TMP, 'report-test.json');
  fs.writeFileSync(rp, JSON.stringify(report));
  const outPath = execFileSync('node', [path.join(SCRIPTS, 'render-report.mjs'), rp, '--no-open'], { encoding: 'utf-8' }).trim();
  const html = fs.readFileSync(outPath, 'utf-8');
  check('render: HTML written', html.length > 10000);
  check('render: sinceLastRun data embedded', html.includes('sinceLastRun'));
  check('render: assetContent embedded', html.includes('PostToolUse'));
  check('render: no raw < in payload (script-safe)', !JSON.stringify(html.match(/<script id="report-data"[^>]*>(.*?)<\/script>/s)?.[1] || '').includes('</script'));
  const histDir = path.join(process.env.HOME || '', '.claude-radar', 'history', '-test-fakeproj');
  check('render: history archived by projectSlug', fs.existsSync(histDir) && fs.readdirSync(histDir).some(f2 => f2.endsWith('.json')));

  // Longitudinal: compute-baselines picks up the archived report as `previous`
  const facts = {
    projectSlug: '-test-fakeproj', project: 'fakeproj', confidenceLevel: 'high',
    projectProfile: { type: 'feature-build', naDimensions: [], categoryWeights: { communication: 0.34, engineering: 0.33, outcome: 0.33 } },
    projectAssets: { cwdResolved: true, hasClaudeMd: true, claudeMdSize: 1200, hasMcpJson: true, settingsHookCount: 3 },
    stats: { validSessions: 6, humanMessages: 40 },
    patterns: { blindAccepts: 0, retryLoops: 0, topicDrifts: 0, demandOverloads: 0, noReplyToQuestion: 0, compactionCount: 0 },
    labelRatios: {}, signalsByPosition: { opening: { messageCount: 0, ratios: {} }, directing: { messageCount: 0, ratios: {} }, correcting: { messageCount: 0, ratios: {} }, confirming: { messageCount: 0, ratios: {} }, continuing: { messageCount: 0, ratios: {} } },
    toolcraftSummary: { skillsUsed: [], mcpServers: [{ name: 'playwright', count: 3 }], subagentCalls: 0, planModeEntries: 2, customCommands: [], byCategory: { todo: 0 }, orchestration: { workflowRuns: 2, backgroundTasks: 0, parallelToolBursts: 0, cronJobs: 0, worktreeUses: 0, artifactsPublished: 0 } },
    outcomeTotals: { toolsPerHumanMsg: 1, editsPerHumanMsg: 0.5, filesPerHumanMsg: 0.2, cleanEndRatio: 0.8, sessionsWithCompletionSignal: 4 },
    firstMessage: { avgLength: 200 }, techStackDetected: [],
    keyMessages: [], sampleExchanges: [], sessionFlows: [], dimensionEvidence: {}
  };
  const { packet } = runBaselines(facts, 'longitudinal');
  check('longitudinal: previous loaded', packet.previous !== null && packet.previous.overallScore === 72, JSON.stringify(packet.previous && packet.previous.overallScore));
  check('longitudinal: adoption signals detected', (packet.previous.adoptionSignals || []).some(s => s.includes('MCP')), JSON.stringify(packet.previous && packet.previous.adoptionSignals));
  // cleanup history so reruns stay deterministic
  fs.rmSync(path.join(process.env.HOME || '', '.claude-radar', 'history', '-test-fakeproj'), { recursive: true, force: true });
  fs.unlinkSync(outPath);
}

// ═════ Summary ═════
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
