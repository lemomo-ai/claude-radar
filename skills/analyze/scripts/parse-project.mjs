#!/usr/bin/env node
// parse-project.mjs — Facts extraction for Claude Radar
// Adds: tool/skill/MCP/subagent/plan/custom-command stats, CLAUDE.md detection,
// per-session outcomes, project profile auto-detection, density-based confidence.
// Usage: node parse-project.mjs <project-path>
// Output (stdout): facts JSON (schemaVersion 2.0)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ═════════════════════════════════════════════════════════════════════════════
// Constants
// ═════════════════════════════════════════════════════════════════════════════

const TECH_STACK = ["react","vue","angular","svelte","solid","next.js","nuxt","remix","astro","node","express","fastify","koa","nest","hono","bun","deno","typescript","javascript","python","go","rust","java","swift","kotlin","dart","tailwind","css","sass","styled-components","emotion","postgres","mysql","mongodb","redis","sqlite","supabase","firebase","prisma","docker","kubernetes","aws","gcp","azure","vercel","netlify","cloudflare","webpack","vite","rollup","esbuild","turbopack","swc","jest","vitest","mocha","pytest","cypress","playwright","graphql","rest","grpc","websocket","trpc","git","github","gitlab","bitbucket","electron","tauri","react native","flutter","expo","openai","anthropic","claude","gpt","llm","langchain","nextjs","nuxtjs","nestjs","expressjs","fastapi","django","flask","spring","spring boot","springboot","quarkus","micronaut","rails","ruby on rails","sinatra","laravel","symfony","php","asp.net","dotnet",".net","blazor","maui","preact","inferno","lit","stencil","qwik","alpine.js","htmx","jquery","backbone","ember","mithril","marko","gatsby","eleventy","hugo","jekyll","pelican","hexo","sveltekit","solidstart","fresh","analog","three.js","d3","chart.js","recharts","nivo","visx","echarts","pixi.js","phaser","babylon.js","aframe","r3f","socket.io","ws","sse","server-sent events","redux","zustand","jotai","recoil","mobx","valtio","xstate","pinia","vuex","react-query","tanstack query","swr","apollo","urql","relay","axios","fetch","ky","got","superagent","undici","zod","yup","joi","ajv","io-ts","typebox","valibot","formik","react-hook-form","final-form","material-ui","mui","chakra","mantine","ant design","antd","shadcn","radix","headless ui","daisyui","flowbite","bootstrap","bulma","foundation","semantic ui","tailwindcss","windicss","unocss","twind","postcss","less","stylus","css modules","css-in-js","vanilla-extract","linaria","framer motion","react spring","gsap","anime.js","lottie","storybook","chromatic","ladle","drizzle","kysely","knex","sequelize","typeorm","mikro-orm","objection.js","mongoose","mongosh","dynamodb","cassandra","couchdb","neo4j","arangodb","elasticsearch","opensearch","meilisearch","typesense","algolia","rabbitmq","kafka","nats","pulsar","zeromq","memcached","valkey","keydb","dragonfly","s3","r2","minio","cloudfront","cdn","akamai","lambda","cloud functions","edge functions","workers","durable objects","ec2","ecs","eks","fargate","app runner","terraform","pulumi","cdk","cloudformation","ansible","chef","puppet","nginx","apache","caddy","traefik","envoy","haproxy","prometheus","grafana","datadog","new relic","sentry","logstash","kibana","splunk","pagerduty","opsgenie","github actions","gitlab ci","jenkins","circleci","travis ci","argo cd","flux","spinnaker","tekton","helm","kustomize","k3s","k8s","minikube","kind","rancher","istio","linkerd","consul","vault","pnpm","yarn","npm","npx","corepack","turborepo","nx","lerna","moon","rush","eslint","prettier","biome","oxlint","stylelint","commitlint","husky","lint-staged","lefthook","babel","tsc","tsup","unbuild","microbundle","testing-library","msw","nock","supertest","pact","selenium","puppeteer","webdriverio","detox","appium","maestro","storyshot","percy","backstop","c","c++","c#","scala","elixir","erlang","haskell","ocaml","clojure","lua","perl","r","julia","zig","nim","crystal","v","solidity","vyper","move","cairo","wasm","webassembly","emscripten","wasi","wasmer","wasmtime","tensorflow","pytorch","keras","scikit-learn","sklearn","pandas","numpy","scipy","matplotlib","seaborn","plotly","jupyter","colab","kaggle","huggingface","transformers","mlflow","wandb","dvc","airflow","dagster","prefect","luigi","spark","flink","beam","dbt","snowflake","bigquery","redshift","databricks","celery","dramatiq","rq","bull","bullmq","bee-queue","agenda","passport","auth0","clerk","nextauth","lucia","supertokens","keycloak","stripe","paypal","braintree","square","plaid","paddle","lemon squeezy","twilio","sendgrid","postmark","mailgun","resend","ses","sanity","contentful","strapi","directus","payload","ghost","shopify","woocommerce","medusa","saleor","capacitor","cordova","ionic","nativescript","swift ui","swiftui","uikit","jetpack compose","compose","unity","unreal","godot","bevy","figma","sketch","adobe xd","zeplin","invision","chromadb","pinecone","weaviate","qdrant","faiss","milvus","llamaindex","autogen","crewai","semantic kernel","dspy","ollama","vllm","groq","replicate","together ai","anyscale","vercel ai","ai sdk","openrouter","upstash","neon","planetscale","turso","cockroachdb","tidb","vitess","convex","fauna","xata","edgedb","dagger","earthly","bazel","gradle","maven","cargo","pip","poetry","uv","rye","pdm","hatch","conda","mamba","pixi","proto","protobuf","thrift","avro","msgpack","oauth","jwt","saml","oidc","webauthn","passkey","i18next","formatjs","lingui","rosetta","rxjs","observable","signal","effect","webrtc","webgl","canvas","svg","web audio","web workers","service worker","pwa","manifest","workbox","react router","wouter","tanstack router","vue router","hono rpc","ts-rest"];

const KEYWORDS = {
  vague: {
    zh: ['帮我', '改一下', '看看', '帮忙', '随便', '稍微', '调整下', '弄一下', '搞一下'],
    en: ['help me', 'can you', 'just fix', 'make it work', 'a bit', 'kinda', 'sorta', 'whatever']
  },
  expectedBehavior: {
    zh: ['希望', '期望', '应该', '需要', '想要', '目标是'],
    en: ['should', 'expect', 'want', 'need', 'would like', 'make sure', 'ensure', 'goal is']
  },
  constraint: {
    zh: ['必须', '不要', '避免', '不能', '只能', '除了', '一定', '千万', '禁止'],
    en: ["must", "don't", 'avoid', 'cannot', 'only', 'except', 'required', 'never', 'forbid']
  },
  reasoning: {
    zh: ['因为', '所以', '由于', '原因是', '为了', '这样'],
    en: ['because', 'since', 'so that', 'in order to', 'the reason', 'due to']
  },
  testRequest: {
    zh: ['测试', '跑一下', '验证', '检查一下', '试一下', '验收'],
    en: ['test', 'verify', 'run it', 'check if', 'make sure it works', 'validate']
  },
  thinkFirst: {
    zh: ['先说一下', '先解释', '先想想', '先讨论', '思路', '方案', '先给我讲'],
    en: ['explain first', 'think through', 'approach', 'walk me through', 'before coding', 'your plan']
  },
  proactiveReview: {
    zh: ['让我看看', '有没有问题', '检查一下', '确认一下', '可行吗', '有什么坑', '为什么不', '你确定', '缺点', '风险'],
    en: ['show me', 'any issues', 'double check', 'verify', 'why not', 'are you sure', 'pitfall', 'downside', 'risk', 'tradeoff']
  },
  progressive: {
    zh: ['一步一步', '逐步', '分步', '先做', '先弄', '分阶段'],
    en: ['step by step', 'one at a time', 'first do', 'then do', 'gradually', 'incrementally']
  },
  checkpoint: {
    zh: ['等确认', '然后再', '阶段', '确认后', '先停'],
    en: ['before proceeding', "once that's done", 'phase', 'checkpoint', 'wait for confirm']
  },
  summary: {
    zh: ['总结', '回顾', '梳理', '概括', '小结'],
    en: ['summary', 'recap', 'summarize', 'review so far', 'to sum up']
  },
  milestone: {
    zh: ['里程碑', '进度', '完成了', '下一步', '阶段性'],
    en: ['milestone', 'progress', 'done with', 'next step', 'wrap up']
  },
  blindAccept: {
    zh: ['好的', '可以', '不错', '继续', '行', '嗯', 'ok', '好'],
    en: ['ok', 'okay', 'good', 'thanks', 'great', 'proceed', 'continue', 'lgtm', 'sounds good', 'nice']
  },
  correction: {
    zh: ['不对', '不是', '错了', '改成', '换成', '应该是', '不要这样', '有问题', '但是这个'],
    en: ['wrong', 'incorrect', 'instead', 'rather', "that's not", 'actually', 'should be', 'not what', 'change to', 'no,']
  },
  // explicit completion / closure signals
  completion: {
    zh: ['搞定', '完成了', '收工', '解决了', '可以了', '没问题了', '搞好了', '成了', '通过了', '上线了'],
    en: ['done', 'finished', 'ship it', 'wrap up', 'all set', "we're good", 'works now', 'all green', 'shipped', 'merged']
  }
};

const MERGED_KEYWORDS = {};
for (const [key, val] of Object.entries(KEYWORDS)) {
  MERGED_KEYWORDS[key] = [...(val.zh || []), ...(val.en || [])].map(k => k.toLowerCase());
}

// Tool categorization
const TOOL_CATEGORY = {
  Edit: 'fileEdit', Write: 'fileEdit', NotebookEdit: 'fileEdit',
  Bash: 'bash',
  Read: 'read',
  Grep: 'search', Glob: 'search',
  WebFetch: 'web', WebSearch: 'web',
  TodoWrite: 'todo', TaskCreate: 'todo', TaskUpdate: 'todo', TaskList: 'todo', TaskGet: 'todo',
  Skill: 'skill',
  Agent: 'subagent', Task: 'subagent',
  ExitPlanMode: 'planMode', EnterPlanMode: 'planMode',
  AskUserQuestion: 'ask'
};

function categorizeTool(name) {
  if (!name) return 'other';
  if (TOOL_CATEGORY[name]) return TOOL_CATEGORY[name];
  if (name.startsWith('mcp__')) return 'mcp';
  return 'other';
}

function extractMcpServer(name) {
  if (!name.startsWith('mcp__')) return null;
  const rest = name.slice(5);
  const idx = rest.indexOf('__');
  return idx > 0 ? rest.slice(0, idx) : rest;
}

const REGEX = {
  filePath: /(?:\.{0,2}\/[\w.@-]+)+\.\w+|\/(?:[\w.@-]+\/)*[\w.@-]+\.\w+|[\w.@-]+\/[\w.@-]+(?:\/[\w.@-]+)*\.\w+|[A-Z]:\\[\w.@\\-]+\.\w+/,
  identifier: /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b|\b[A-Z][a-zA-Z0-9]+\b|\b[a-z]+(?:_[a-z]+)+\b/,
  error: /\b(?:Error|Exception|TypeError|SyntaxError|ReferenceError|ENOENT|EACCES|EPERM|panic|fatal|stack trace|traceback|报错|错误|崩溃|失败)\b/i,
  codeBlock: /```[\s\S]*?```/,
  listStructure: /^\s*(?:\d+[.)]\s|-\s|\*\s)/m,
  paragraph: /\n\n/,
  slashCommand: /(?:^|\s)\/([a-zA-Z][\w-]+)/
};

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function matchesAny(text, keywordKey) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return MERGED_KEYWORDS[keywordKey].some(kw => lower.includes(kw));
}

function matchesWordBoundary(lower, kw) {
  let idx = 0;
  while ((idx = lower.indexOf(kw, idx)) !== -1) {
    const before = idx === 0 ? ' ' : lower[idx - 1];
    const after = idx + kw.length >= lower.length ? ' ' : lower[idx + kw.length];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    idx += 1;
  }
  return false;
}

function matchesAnyTechStack(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return TECH_STACK.some(kw => matchesWordBoundary(lower, kw));
}

function jaccard(a, b) {
  const tokenize = (t) => {
    const tokens = new Set();
    const lower = t.toLowerCase();
    lower.replace(/[^\w一-鿿]+/g, ' ').split(/\s+/).filter(w => w.length > 1).forEach(w => tokens.add(w));
    const chinese = lower.replace(/[^一-鿿]/g, '');
    for (let i = 0; i < chinese.length - 1; i++) tokens.add(chinese.slice(i, i + 2));
    return tokens;
  };
  const A = tokenize(a), B = tokenize(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function isInjectedUserMessage(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length === 0) return true;
  if (/^<(task-notification|ide_opened_file|local-command|system-reminder|system-|command-name|command-message|command-args|command-stdout|user-prompt-submit-hook|channel|tool_use_error|tool_result)/i.test(t)) return true;
  if (t === 'Continue from where you left off.') return true;
  if (/^\[Request interrupted by user/i.test(t)) return true;
  if (/^Caveat: The messages below/i.test(t)) return true;
  return false;
}

function isInjectedAssistantMessage(text) {
  if (!text) return true;
  const t = text.trim();
  if (t.length === 0) return true;
  if (t === 'No response requested.') return true;
  return false;
}

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join(' ');
  }
  return '';
}

function extractRole(entry) {
  if (entry.type === 'user') return 'user';
  if (entry.type === 'assistant') return 'assistant';
  if (entry.message?.role === 'user') return 'user';
  if (entry.message?.role === 'assistant') return 'assistant';
  return null;
}

function hasAssistantToolUse(content) {
  return Array.isArray(content) && content.some(b => b && b.type === 'tool_use');
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter(b => b && b.type === 'tool_use')
    .map(b => ({ name: b.name, input: b.input || {} }));
}

// ═════════════════════════════════════════════════════════════════════════════
// Label computation
// ═════════════════════════════════════════════════════════════════════════════

const LABEL_KEYS = [
  'hasFilePath', 'hasIdentifier', 'hasError', 'hasCodeBlock', 'hasListStructure',
  'hasExpectedBehavior', 'hasConstraint', 'isVague', 'hasReasoning',
  'requestTest', 'thinkFirst', 'proactiveReview',
  'progressive', 'checkpoint', 'summary', 'milestone', 'hasTechStack',
  'hasCompletion'
];

function computeLabels(text) {
  const labels = {};
  if (REGEX.filePath.test(text)) labels.hasFilePath = true;
  if (REGEX.identifier.test(text)) labels.hasIdentifier = true;
  if (REGEX.error.test(text)) labels.hasError = true;
  if (REGEX.codeBlock.test(text)) labels.hasCodeBlock = true;
  if (REGEX.listStructure.test(text)) labels.hasListStructure = true;
  if (matchesAny(text, 'expectedBehavior')) labels.hasExpectedBehavior = true;
  if (matchesAny(text, 'constraint')) labels.hasConstraint = true;
  if (matchesAny(text, 'vague')) labels.isVague = true;
  if (matchesAny(text, 'reasoning')) labels.hasReasoning = true;
  if (matchesAny(text, 'testRequest')) labels.requestTest = true;
  if (matchesAny(text, 'thinkFirst')) labels.thinkFirst = true;
  if (matchesAny(text, 'proactiveReview')) labels.proactiveReview = true;
  if (matchesAny(text, 'progressive')) labels.progressive = true;
  if (matchesAny(text, 'checkpoint')) labels.checkpoint = true;
  if (matchesAny(text, 'summary')) labels.summary = true;
  if (matchesAny(text, 'milestone')) labels.milestone = true;
  if (matchesAny(text, 'completion')) labels.hasCompletion = true;
  if (matchesAnyTechStack(text)) labels.hasTechStack = true;
  return labels;
}

// ═════════════════════════════════════════════════════════════════════════════
// Position classification
// ═════════════════════════════════════════════════════════════════════════════

const POSITIONS = ['opening', 'directing', 'correcting', 'confirming', 'continuing'];

function classifyPosition(messages, index, sessionUserIndex) {
  if (sessionUserIndex < 2) return 'opening';
  let prevAssistant = null;
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { prevAssistant = messages[i]; break; }
  }
  if (!prevAssistant) return 'directing';
  const prevHadOutput = hasAssistantToolUse(prevAssistant.content) || /```/.test(prevAssistant.text || '');
  if (!prevHadOutput) return 'directing';
  const text = messages[index].text;
  if (matchesAny(text, 'correction')) return 'correcting';
  if (text.length < 80) return 'confirming';
  return 'directing';
}

function countDemandActions(text) {
  const actionsZh = ['实现', '添加', '创建', '修改', '更新', '删除', '移除', '写', '修复', '改成'];
  const actionsEn = ['implement', 'add', 'create', 'modify', 'change', 'update', 'delete', 'remove', 'write', 'build', 'fix', 'refactor'];
  const lower = text.toLowerCase();
  const actionCount = [...actionsZh, ...actionsEn].filter(w => matchesWordBoundary(lower, w.toLowerCase())).length;
  const listItems = (text.match(/^\s*(?:\d+[.)]\s|-\s|\*\s)/gm) || []).length;
  return Math.max(actionCount, listItems);
}

// ═════════════════════════════════════════════════════════════════════════════
// Project asset detection (CLAUDE.md / memory / subagents config)
// ═════════════════════════════════════════════════════════════════════════════

function detectProjectAssets(cwdPath) {
  const result = {
    cwdResolved: false,
    cwdPath: cwdPath || null,
    hasClaudeMd: false,
    claudeMdSize: 0,
    hasMemoryDir: false,
    memoryFileCount: 0,
    hasAgentsDir: false,
    agentCount: 0,
    hasCommandsDir: false,
    commandCount: 0,
    hasSettingsJson: false
  };
  if (!cwdPath) return result;
  try {
    if (!fs.existsSync(cwdPath) || !fs.statSync(cwdPath).isDirectory()) return result;
  } catch { return result; }
  result.cwdResolved = true;

  const claudeMd = path.join(cwdPath, 'CLAUDE.md');
  try {
    if (fs.existsSync(claudeMd)) {
      result.hasClaudeMd = true;
      result.claudeMdSize = fs.statSync(claudeMd).size;
    }
  } catch {}

  const memoryDir = path.join(cwdPath, '.claude', 'memory');
  try {
    if (fs.existsSync(memoryDir) && fs.statSync(memoryDir).isDirectory()) {
      result.hasMemoryDir = true;
      result.memoryFileCount = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md')).length;
    }
  } catch {}

  const agentsDir = path.join(cwdPath, '.claude', 'agents');
  try {
    if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
      result.hasAgentsDir = true;
      result.agentCount = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).length;
    }
  } catch {}

  const commandsDir = path.join(cwdPath, '.claude', 'commands');
  try {
    if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
      result.hasCommandsDir = true;
      result.commandCount = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md')).length;
    }
  } catch {}

  try {
    if (fs.existsSync(path.join(cwdPath, '.claude', 'settings.json'))) {
      result.hasSettingsJson = true;
    }
  } catch {}

  return result;
}

// Decode slug like "-Users-leifdiao-Projects-foo" → "/Users/leifdiao/Projects/foo".
// Lossy: cannot distinguish space vs dash in directory names. Best-effort + filesystem check.
function decodeProjectSlug(slug) {
  if (!slug || typeof slug !== 'string') return null;
  if (!slug.startsWith('-')) return null;
  const naive = slug.replace(/-/g, '/');
  try {
    if (fs.existsSync(naive) && fs.statSync(naive).isDirectory()) return naive;
  } catch {}
  // Try replacing single dashes with spaces in path segments (fallback)
  // Walk progressively: check at each level if a directory matches
  const segments = naive.split('/').filter(Boolean);
  let resolved = '/';
  for (const seg of segments) {
    let next = path.join(resolved, seg);
    if (fs.existsSync(next)) { resolved = next; continue; }
    // Try variants: replace dashes with spaces
    let found = false;
    try {
      const siblings = fs.readdirSync(resolved);
      // exact match with dashes → spaces
      const candidate = sibling => sibling.replace(/ /g, '-') === seg;
      const match = siblings.find(s => candidate(s));
      if (match) { resolved = path.join(resolved, match); found = true; }
    } catch {}
    if (!found) return null;
  }
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  } catch {}
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Profile detection
// ═════════════════════════════════════════════════════════════════════════════

function detectProfile(stats, dateRange, totals) {
  const sessions = stats.validSessions || 0;
  const msgs = stats.humanMessages || 0;
  const edits = totals.fileEditCount || 0;
  const editRatio = edits / Math.max(msgs, 1);
  let daySpan = 0;
  if (dateRange[0] && dateRange[1]) {
    daySpan = (new Date(dateRange[1]) - new Date(dateRange[0])) / 86400000;
  }

  if (sessions <= 2 && msgs <= 15) {
    return {
      type: 'one-shot',
      label: { en: 'One-shot task', zh: '一次性任务' },
      rationale: {
        en: `${sessions} session${sessions === 1 ? '' : 's'}, ${msgs} message${msgs === 1 ? '' : 's'} — too small for full-spectrum evaluation`,
        zh: `${sessions} 个会话、${msgs} 条消息 — 体量太小不做全维评估`
      },
      naDimensions: ['architecture', 'tempo', 'completion'],
      categoryWeights: { communication: 0.5, engineering: 0.1, outcome: 0.4 }
    };
  }
  if (sessions >= 20 || daySpan > 7) {
    return {
      type: 'long-running',
      label: { en: 'Long-running project', zh: '长期项目' },
      rationale: {
        en: `${sessions} sessions across ${Math.round(daySpan)} days — engineering setup matters more`,
        zh: `跨 ${Math.round(daySpan)} 天的 ${sessions} 个会话 — 工程化设置更重要`
      },
      naDimensions: [],
      categoryWeights: { communication: 0.3, engineering: 0.4, outcome: 0.3 }
    };
  }
  if (editRatio < 0.1 && msgs > 20) {
    return {
      type: 'learning',
      label: { en: 'Learning / exploration', zh: '学习探索' },
      rationale: {
        en: `Q&A-heavy: ${(editRatio * 100).toFixed(1)}% of messages led to edits`,
        zh: `问答为主：仅 ${(editRatio * 100).toFixed(1)}% 的消息触发修改`
      },
      naDimensions: ['efficiency', 'completion'],
      categoryWeights: { communication: 0.7, engineering: 0.3, outcome: 0 }
    };
  }
  return {
    type: 'feature-build',
    label: { en: 'Feature build', zh: '功能开发' },
    rationale: {
      en: `${sessions} sessions with balanced edit/discussion ratio`,
      zh: `${sessions} 个会话，编辑与讨论比例正常`
    },
    naDimensions: [],
    categoryWeights: { communication: 0.34, engineering: 0.33, outcome: 0.33 }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════════

const projectPath = process.argv[2];
if (!projectPath) {
  console.error('Usage: parse-project.mjs <project-path>');
  process.exit(1);
}
if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
  console.error(`Project path not found or not a directory: ${projectPath}`);
  process.exit(1);
}

const sessionFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.jsonl')).sort();
const projectSlug = path.basename(projectPath);

// ─── Accumulators ────────────────────────────────────────────────────────────

const stats = {
  totalMessages: 0,
  humanMessages: 0,
  assistantMessages: 0,
  avgHumanMsgChars: 0,
  avgAssistantMsgChars: 0,
  sessionsTooShort: 0,
  validSessions: 0,
  codeBlockCount: 0,
  listStructureCount: 0,
  shortMessageCount: 0,
  longMessageCount: 0
};

const toolUsage = {
  total: 0,
  byCategory: { fileEdit: 0, bash: 0, read: 0, search: 0, web: 0, todo: 0, skill: 0, subagent: 0, planMode: 0, mcp: 0, ask: 0, other: 0 },
  byName: {},
  mcpServers: {},
  skillsUsed: {},
  customCommandsInvoked: {}
};

let totalHumanChars = 0;
let totalAssistantChars = 0;
const dateSet = new Set();
const distinctFilesTouched = new Set();
const cwdCandidates = new Set();

const patterns = {
  blindAccepts: 0,
  retryLoops: 0,
  topicDrifts: 0,
  demandOverloads: 0,
  longUnstructured: 0,
  noReplyToQuestion: 0
};

const labelCounts = {};
for (const k of LABEL_KEYS) labelCounts[k] = 0;

function makePositionBucket() {
  const bucket = { messageCount: 0 };
  for (const k of LABEL_KEYS) bucket[k] = 0;
  return bucket;
}
const signalsByPosition = {};
for (const pos of POSITIONS) signalsByPosition[pos] = makePositionBucket();

const firstMessageAgg = {
  lengths: [],
  sessionsWithTechStack: 0,
  sessionsWithFilePath: 0,
  sessionsWithGoal: 0,
  sessionsWithContext: 0,
  samples: []
};

const keyMessages = [];
const sampleExchanges = [];
const MAX_SAMPLES = 10;
const sessionRecords = [];
const sessionOutcomes = [];

// ─── Process each session ────────────────────────────────────────────────────

for (const fileName of sessionFiles) {
  const fullPath = path.join(projectPath, fileName);

  try {
    const fileStat = fs.statSync(fullPath);
    if (fileStat.size > 50 * 1024 * 1024) continue;
  } catch { continue; }

  let raw;
  try { raw = fs.readFileSync(fullPath, 'utf-8'); } catch { continue; }

  const lines = raw.split('\n').filter(l => l.trim());
  const rawEntries = [];
  for (const line of lines) {
    try { rawEntries.push(JSON.parse(line)); } catch {}
  }

  // cwd may be embedded as a top-level field on entries
  for (const entry of rawEntries) {
    if (entry && typeof entry.cwd === 'string') cwdCandidates.add(entry.cwd);
  }

  const messages = [];
  for (const entry of rawEntries) {
    const role = extractRole(entry);
    if (!role) continue;
    const msgContent = entry.message?.content;
    const text = extractText(msgContent);

    if (role === 'user') {
      if (isInjectedUserMessage(text)) continue;
      messages.push({ role, text, content: msgContent, timestamp: entry.timestamp });
    } else {
      const hasToolUse = hasAssistantToolUse(msgContent);
      if (!text && !hasToolUse) continue;
      if (isInjectedAssistantMessage(text) && !hasToolUse) continue;
      messages.push({ role, text, content: msgContent, timestamp: entry.timestamp });
    }
  }

  if (messages.length < 3) {
    stats.sessionsTooShort++;
    continue;
  }
  stats.validSessions++;

  const sessionHumanMsgs = messages.filter(m => m.role === 'user').length;
  const sessionRec = {
    file: fileName.replace(/\.jsonl$/, ''),
    humanMsgs: sessionHumanMsgs,
    totalMsgs: messages.length,
    startTime: messages[0]?.timestamp || null,
    endTime: messages[messages.length - 1]?.timestamp || null,
    compact: []
  };

  const sessionOutcome = {
    file: sessionRec.file,
    humanMsgs: sessionHumanMsgs,
    fileEdits: 0,
    bashCalls: 0,
    reads: 0,
    toolUses: 0,
    distinctFiles: new Set(),
    skillsInvoked: [],
    mcpInvoked: [],
    subagentCalls: 0,
    planModeUses: 0,
    customCommandsUsed: [],
    endedCleanly: false,
    hasCompletionSignal: false
  };

  const firstUserIdx = messages.findIndex(m => m.role === 'user');
  if (firstUserIdx >= 0) {
    const first = messages[firstUserIdx];
    firstMessageAgg.lengths.push(first.text.length);
    const labels = computeLabels(first.text);
    if (labels.hasTechStack) firstMessageAgg.sessionsWithTechStack++;
    if (labels.hasFilePath) firstMessageAgg.sessionsWithFilePath++;
    if (labels.hasExpectedBehavior || first.text.length > 100) firstMessageAgg.sessionsWithGoal++;
    if (labels.hasReasoning || first.text.length > 150) firstMessageAgg.sessionsWithContext++;
    if (firstMessageAgg.samples.length < 5 && first.text.length > 30) {
      firstMessageAgg.samples.push(first.text.slice(0, 200));
    }
    // Detect slash-command invocation in opening
    const slashMatch = first.text.match(REGEX.slashCommand);
    if (slashMatch) {
      const cmd = '/' + slashMatch[1];
      sessionOutcome.customCommandsUsed.push(cmd);
      toolUsage.customCommandsInvoked[cmd] = (toolUsage.customCommandsInvoked[cmd] || 0) + 1;
    }
  }

  let sessionUserIndex = 0;

  for (let mi = 0; mi < messages.length; mi++) {
    const m = messages[mi];
    stats.totalMessages++;

    if (m.timestamp && typeof m.timestamp === 'string') {
      dateSet.add(m.timestamp.slice(0, 10));
    }

    if (sessionRec.compact.length < 20) {
      const toolUses = m.role === 'assistant' ? extractToolUses(m.content) : [];
      sessionRec.compact.push({
        role: m.role,
        length: m.text.length,
        textShort: m.text.slice(0, 140),
        tools: toolUses.map(t => t.name)
      });
    }

    if (m.role === 'user') {
      stats.humanMessages++;
      totalHumanChars += m.text.length;

      if (m.text.length < 60) stats.shortMessageCount++;
      if (m.text.length > 200) stats.longMessageCount++;

      if (REGEX.codeBlock.test(m.text)) stats.codeBlockCount++;
      if (REGEX.listStructure.test(m.text)) stats.listStructureCount++;

      const position = classifyPosition(messages, mi, sessionUserIndex);
      sessionUserIndex++;

      const labels = computeLabels(m.text);
      for (const lbl of Object.keys(labels)) {
        if (labelCounts[lbl] !== undefined) labelCounts[lbl]++;
      }
      if (labels.hasCompletion) sessionOutcome.hasCompletionSignal = true;

      const bucket = signalsByPosition[position];
      bucket.messageCount++;
      for (const lbl of Object.keys(labels)) {
        if (bucket[lbl] !== undefined) bucket[lbl]++;
      }

      if (m.text.length > 300 && countDemandActions(m.text) >= 3) patterns.demandOverloads++;
      if (m.text.length > 500 && !REGEX.paragraph.test(m.text) && !REGEX.listStructure.test(m.text) && !REGEX.codeBlock.test(m.text)) {
        patterns.longUnstructured++;
      }

    } else if (m.role === 'assistant') {
      const toolUses = extractToolUses(m.content);
      sessionOutcome.toolUses += toolUses.length;
      toolUsage.total += toolUses.length;

      for (const t of toolUses) {
        const cat = categorizeTool(t.name);
        toolUsage.byCategory[cat] = (toolUsage.byCategory[cat] || 0) + 1;
        toolUsage.byName[t.name] = (toolUsage.byName[t.name] || 0) + 1;

        if (cat === 'fileEdit') {
          sessionOutcome.fileEdits++;
          const filePath = t.input && (t.input.file_path || t.input.notebook_path);
          if (filePath) {
            sessionOutcome.distinctFiles.add(filePath);
            distinctFilesTouched.add(filePath);
          }
        } else if (cat === 'bash') {
          sessionOutcome.bashCalls++;
        } else if (cat === 'read') {
          sessionOutcome.reads++;
        } else if (cat === 'skill') {
          const skillName = t.input && t.input.skill;
          if (skillName) {
            toolUsage.skillsUsed[skillName] = (toolUsage.skillsUsed[skillName] || 0) + 1;
            sessionOutcome.skillsInvoked.push(skillName);
          }
        } else if (cat === 'mcp') {
          const server = extractMcpServer(t.name);
          if (server) {
            toolUsage.mcpServers[server] = (toolUsage.mcpServers[server] || 0) + 1;
            sessionOutcome.mcpInvoked.push(server);
          }
        } else if (cat === 'subagent') {
          sessionOutcome.subagentCalls++;
        } else if (cat === 'planMode') {
          sessionOutcome.planModeUses++;
        }
      }

      if (m.text && !isInjectedAssistantMessage(m.text)) {
        stats.assistantMessages++;
        totalAssistantChars += m.text.length;
      }
    }
  }

  // Ended cleanly: last meaningful message is a user ack OR has completion signal
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === 'user') {
    if (sessionOutcome.hasCompletionSignal || matchesAny(lastMsg.text, 'blindAccept') || matchesAny(lastMsg.text, 'completion')) {
      sessionOutcome.endedCleanly = true;
    }
  } else {
    // Last is assistant — check if assistant ended with no pending question
    if (!/[?？]\s*$/.test((lastMsg.text || '').trim())) {
      sessionOutcome.endedCleanly = true;
    }
  }

  sessionOutcome.distinctFilesCount = sessionOutcome.distinctFiles.size;
  delete sessionOutcome.distinctFiles;
  sessionOutcomes.push(sessionOutcome);

  // Sequential patterns
  const userMsgs = messages.filter(m => m.role === 'user');

  for (let i = 2; i < userMsgs.length; i++) {
    const s1 = jaccard(userMsgs[i - 2].text, userMsgs[i - 1].text);
    const s2 = jaccard(userMsgs[i - 1].text, userMsgs[i].text);
    if (s1 > 0.5 && s2 > 0.5) patterns.retryLoops++;
  }

  let consecutiveBreaks = 0;
  for (let i = 1; i < userMsgs.length; i++) {
    if (userMsgs[i].text.length < 30 || userMsgs[i - 1].text.length < 30) { consecutiveBreaks = 0; continue; }
    const s = jaccard(userMsgs[i - 1].text, userMsgs[i].text);
    const bothHavePath = REGEX.filePath.test(userMsgs[i - 1].text) && REGEX.filePath.test(userMsgs[i].text);
    if (s < 0.03 && !bothHavePath) {
      consecutiveBreaks++;
      if (consecutiveBreaks >= 2) { patterns.topicDrifts++; consecutiveBreaks = 0; }
    } else { consecutiveBreaks = 0; }
  }

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role !== 'user') continue;
    const u = messages[i];
    if (u.text.length >= 80) continue;
    if (!matchesAny(u.text, 'blindAccept')) continue;
    const prev = messages[i - 1];
    if (prev.role !== 'assistant') continue;
    const prevHasCode = prev.text && /```/.test(prev.text);
    const prevHasTool = hasAssistantToolUse(prev.content);
    if (!prevHasCode && !prevHasTool) continue;
    const hasSubstance = /因为|但是|不过|问题|修改|错|不对|because|but|however|change|issue|wrong|fix/i.test(u.text);
    if (hasSubstance) continue;
    let hadRecentDirective = false;
    let userCount = 0;
    for (let j = i - 1; j >= 0 && userCount < 3; j--) {
      if (messages[j].role !== 'user') continue;
      userCount++;
      if (messages[j].text.length > 50 && (REGEX.filePath.test(messages[j].text) || REGEX.identifier.test(messages[j].text))) {
        hadRecentDirective = true; break;
      }
    }
    if (hadRecentDirective) continue;
    patterns.blindAccepts++;
  }

  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role !== 'assistant') continue;
    const asst = messages[i].text || '';
    if (!asst.includes('?') && !asst.includes('？')) continue;
    const next = messages[i + 1];
    if (next.role !== 'user') continue;
    if (next.text.length < 30 && matchesAny(next.text, 'blindAccept')) patterns.noReplyToQuestion++;
  }

  if (sampleExchanges.length < MAX_SAMPLES) {
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role !== 'user' || messages[i + 1].role !== 'assistant') continue;
      const h = (messages[i].text || '').trim();
      const a = (messages[i + 1].text || '').trim();
      if (h && a) {
        sampleExchanges.push({
          session: fileName.replace(/\.jsonl$/, ''),
          human: h.slice(0, 250),
          assistant: a.slice(0, 250)
        });
        break;
      }
    }
  }

  if (keyMessages.length < MAX_SAMPLES && userMsgs.length > 0) {
    const longest = userMsgs.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    if (longest && longest.text.length > 0) {
      keyMessages.push({
        session: fileName.replace(/\.jsonl$/, ''),
        text: longest.text.slice(0, 300),
        length: longest.text.length,
        labels: Object.keys(computeLabels(longest.text))
      });
    }
  }

  sessionRecords.push(sessionRec);
}

// ═════════════════════════════════════════════════════════════════════════════
// Post-processing
// ═════════════════════════════════════════════════════════════════════════════

stats.avgHumanMsgChars = stats.humanMessages ? Math.round(totalHumanChars / stats.humanMessages) : 0;
stats.avgAssistantMsgChars = stats.assistantMessages ? Math.round(totalAssistantChars / stats.assistantMessages) : 0;

const dates = Array.from(dateSet).sort();
const dateRange = dates.length ? [dates[0], dates[dates.length - 1]] : [null, null];

const labelRatios = {};
for (const key of Object.keys(labelCounts)) {
  labelRatios[key] = stats.humanMessages ? +(labelCounts[key] / stats.humanMessages).toFixed(3) : 0;
}

const signalsByPositionWithRatios = {};
for (const pos of POSITIONS) {
  const bucket = signalsByPosition[pos];
  const ratios = {};
  for (const k of LABEL_KEYS) {
    ratios[k] = bucket.messageCount ? +(bucket[k] / bucket.messageCount).toFixed(3) : 0;
  }
  signalsByPositionWithRatios[pos] = {
    messageCount: bucket.messageCount,
    counts: {},
    ratios
  };
  for (const k of LABEL_KEYS) signalsByPositionWithRatios[pos].counts[k] = bucket[k];
}

// ─── cwd resolution & project assets ─────────────────────────────────────
let resolvedCwd = null;
if (cwdCandidates.size > 0) {
  // Pick the most-common candidate that exists on disk
  const sorted = [...cwdCandidates].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) { resolvedCwd = c; break; }
    } catch {}
  }
}
if (!resolvedCwd) resolvedCwd = decodeProjectSlug(projectSlug);

const projectAssets = detectProjectAssets(resolvedCwd);

// ─── Outcome totals ──────────────────────────────────────────────────────
const outcomeTotals = {
  fileEditCount: toolUsage.byCategory.fileEdit || 0,
  bashCount: toolUsage.byCategory.bash || 0,
  readCount: toolUsage.byCategory.read || 0,
  distinctFilesTouched: distinctFilesTouched.size,
  sessionsEndedCleanly: sessionOutcomes.filter(s => s.endedCleanly).length,
  sessionsWithCompletionSignal: sessionOutcomes.filter(s => s.hasCompletionSignal).length,
  totalSessions: sessionOutcomes.length,
  cleanEndRatio: sessionOutcomes.length ? +(sessionOutcomes.filter(s => s.endedCleanly).length / sessionOutcomes.length).toFixed(3) : 0,
  // Density metrics
  editsPerHumanMsg: stats.humanMessages ? +(toolUsage.byCategory.fileEdit / stats.humanMessages).toFixed(3) : 0,
  toolsPerHumanMsg: stats.humanMessages ? +(toolUsage.total / stats.humanMessages).toFixed(3) : 0,
  filesPerHumanMsg: stats.humanMessages ? +(distinctFilesTouched.size / stats.humanMessages).toFixed(3) : 0
};

// ─── Profile detection ───────────────────────────────────────────────────
const projectProfile = detectProfile(stats, dateRange, outcomeTotals);

// ─── Density-based confidence ────────────────────────────────────────────
// Useful-signal density = (sum of non-zero label ratios per msg-equivalent) / message count
// High density → useful even with few messages.
const usefulLabelCount = LABEL_KEYS.reduce((sum, k) => sum + (labelCounts[k] || 0), 0);
const signalDensity = stats.humanMessages ? +(usefulLabelCount / stats.humanMessages).toFixed(3) : 0;
const outcomeDensity = outcomeTotals.toolsPerHumanMsg;

let confidenceLevel = 'high';
let confidenceReason = '';
const hm = stats.humanMessages;
if (hm < 5) {
  confidenceLevel = 'low';
  confidenceReason = 'fewer than 5 user messages';
} else if (hm < 20 && (signalDensity < 1.5 || outcomeDensity < 0.5)) {
  confidenceLevel = 'low';
  confidenceReason = 'small sample with low signal density';
} else if (hm < 40 && signalDensity < 1) {
  confidenceLevel = 'medium';
  confidenceReason = 'moderate sample with low signal density';
} else if (hm < 50) {
  confidenceLevel = 'medium';
  confidenceReason = 'moderate sample size';
}

// ─── Toolcraft summary (for AI consumption + UI) ─────────────────────────
const toolcraftSummary = {
  totalToolCalls: toolUsage.total,
  byCategory: toolUsage.byCategory,
  topTools: Object.entries(toolUsage.byName)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count })),
  mcpServers: Object.entries(toolUsage.mcpServers)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count })),
  skillsUsed: Object.entries(toolUsage.skillsUsed)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count })),
  subagentCalls: toolUsage.byCategory.subagent || 0,
  planModeEntries: toolUsage.byCategory.planMode || 0,
  customCommands: Object.entries(toolUsage.customCommandsInvoked)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))
};

// ─── Conversation flows (top 5 richest sessions) ─────────────────────────
const flowSessions = [...sessionRecords]
  .sort((a, b) => b.humanMsgs - a.humanMsgs)
  .slice(0, 5);

function buildFlow(rec) {
  let out = `Session ${rec.file.slice(0, 10)} (${rec.humanMsgs} human msgs, ${rec.totalMsgs} total):\n`;
  for (const m of rec.compact) {
    const icon = m.role === 'user' ? '👤' : '🤖';
    const tools = m.tools && m.tools.length ? m.tools.join(',') : '';
    const textClean = m.textShort.replace(/\s+/g, ' ').trim();
    if (!textClean && tools) out += `  ${icon} [tool: ${tools}]\n`;
    else if (tools) out += `  ${icon} [${m.length}c + ${tools}]: ${textClean}\n`;
    else out += `  ${icon} [${m.length}c]: ${textClean}\n`;
  }
  if (rec.totalMsgs > rec.compact.length) out += `  ...(+${rec.totalMsgs - rec.compact.length} more)\n`;
  return out;
}

const sessionFlows = flowSessions.map(buildFlow);

// ─── First message aggregation ────────────────────────────────────────────
const firstMessage = {
  totalSessions: firstMessageAgg.lengths.length,
  avgLength: firstMessageAgg.lengths.length
    ? Math.round(firstMessageAgg.lengths.reduce((a, b) => a + b, 0) / firstMessageAgg.lengths.length)
    : 0,
  sessionsWithTechStack: firstMessageAgg.sessionsWithTechStack,
  sessionsWithFilePath: firstMessageAgg.sessionsWithFilePath,
  sessionsWithGoal: firstMessageAgg.sessionsWithGoal,
  sessionsWithContext: firstMessageAgg.sessionsWithContext,
  samples: firstMessageAgg.samples
};

// ─── Display name ─────────────────────────────────────────────────────────
const slugParts = projectSlug.split('-').filter(Boolean);
const displayName = slugParts[slugParts.length - 1] || projectSlug;

// ─── Language detection ───────────────────────────────────────────────────
// Strip code blocks, inline code, and file paths before counting — those
// inflate English char counts even for Chinese-dominant users.
// Use BOTH char-ratio and per-message-presence: many Chinese users mix
// English file paths but think in Chinese.
let zhChars = 0, enChars = 0;
let zhMsgs = 0, totalMsgs = 0;
function tallyLang(text) {
  if (!text) return;
  const cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[\/\\][\w.@\-/\\]+\.\w+/g, '');
  const zh = (cleaned.match(/[一-鿿]/g) || []).length;
  const en = (cleaned.match(/[a-zA-Z]/g) || []).length;
  zhChars += zh;
  enChars += en;
  totalMsgs++;
  if (zh > 0) zhMsgs++;
}
for (const km of keyMessages) tallyLang(km.text);
for (const se of sampleExchanges) tallyLang(se.human);
for (const s of firstMessageAgg.samples) tallyLang(s);

const charZhRatio = zhChars / Math.max(zhChars + enChars, 1);
const msgZhRatio = zhMsgs / Math.max(totalMsgs, 1);
// zh-dominant if 15% of cleaned letter-content is Chinese, OR 30% of sampled messages contain any Chinese
const dominantLanguage = (charZhRatio > 0.15 || msgZhRatio > 0.3) ? 'zh' : 'en';

// ═════════════════════════════════════════════════════════════════════════════
// Output
// ═════════════════════════════════════════════════════════════════════════════

const result = {
  schemaVersion: '2.0',
  project: displayName,
  projectSlug,
  projectPath,
  resolvedCwd,
  sessionCount: stats.validSessions,
  confidenceLevel,
  confidenceReason,
  signalDensity,
  outcomeDensity,
  dominantLanguage,
  dateRange,
  projectProfile,
  projectAssets,
  stats,
  patterns,
  toolcraftSummary,
  outcomeTotals,
  sessionOutcomes,
  labelCounts,
  labelRatios,
  signalsByPosition: signalsByPositionWithRatios,
  firstMessage,
  sessionFlows,
  keyMessages,
  sampleExchanges
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
