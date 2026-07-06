# Claude Radar — 独立评审与迭代计划(v1.1 → v2.0)

> **✅ 执行状态(2026-07-06):三个 Sprint 已全部实施并检验。**
> - Sprint 1(数据正确性):全部完成 — compaction/sidechain 过滤、cwd 频次众数、斜杠命令捕获、工具谱系补全 + 编排信号(含共享 message.id 的并行重建)、retry/blindAccept 再校准、displayName 修复、全量语言检测。
> - Sprint 2(评分确定性):全部完成 — rubric.json 结构化 `baselineTerms` + `compute-baselines.mjs` 确定性求值(双跑字节级一致)、Architecture 检测扩展(.mcp.json/AGENTS.md/skills/hooks/CLAUDE.local.md)、Toolcraft 编排加分、Tempo 自主 agent 时代再校准、文档三处矛盾统一、allowed-tools 修正、AskUserQuestion 交互。
> - Sprint 3(建议深度):全部完成 — `data/playbook.json` 38 个招式(六域、结构化触发、双语、资产模板)、`dimensionEvidence` 维度定向证据、SKILL.md 重写(候选招式实例化)、建议 actionType/assetContent + 报告"可安装资产"块、历史归档 + "距上次体检" delta 面板、9 个真实项目校准(见 [CALIBRATION.md](./CALIBRATION.md))。
> - 检验:回归测试 62/62 通过(`node test/run.mjs`);真实项目实测 keyMessages 污染 0/10、avgHumanMsgChars 1427→217、`other` 类 33→≤1、customCommands 可捕获、分数分布 41–64 有区分度。

> 评审日期:2026-07-06。方法:通读全部源码(SKILL.md / rubric.json / 三个脚本 / 模板 / 方法论文档),并在本机 86 个真实项目上实跑解析器做实证验证(主要样本:一个 19 会话、5400+ 消息、重度使用 subagent/Workflow 的真实项目)。
>
> 结论先行:**产品定位和三层架构(deterministic parser → LLM scorer/diagnoser → pure renderer)是对的,方法论文档的坦诚度也是加分项。但当前"建议浅显"不是 prompt 写得不够好,而是三个结构性原因:① 证据管线被系统注入文本污染、覆盖率太低;② 新一代 Claude Code 用法(Workflow 编排、斜杠命令、hooks、.mcp.json)对解析器完全不可见;③ 建议生成没有素材库,每次靠 LLM 现场发明,只能回退到通用模板。** 三个问题都可以工程化解决。

---

## 第一部分:实证发现的正确性 Bug(按严重度排序)

以下问题全部在真实数据上复现,不是理论推测。

### P0-1 · Compaction 续接消息未过滤,污染整条证据链

`parse-project.mjs` 的 `isInjectedUserMessage()`(约 L165)过滤了 `<command-name>`、`Caveat:` 等注入文本,但**漏掉了 compaction 产生的续接消息**(`"This session is being continued from a previous conversation…"`)。

实测后果(ProjectHubComponents 项目):

- 单个 JSONL 文件里有 **7 条**续接消息,每条 15,000–22,000 字符,全部被当成"用户消息";
- `keyMessages` 证据池 **10 条里 5 条**是 compaction 摘要——而 keyMessages 正是 Claude 做 ±15 调整和写诊断时引用的核心证据;
- `avgHumanMsgChars` 被推高到 1427、`firstMessage.avgLength` 到 1153(续接消息常作为会话首条,直接灌进 Scene Setting 的公式);
- 诊断层会"引用"用户根本没写过的文本,建议自然跑偏。

**修复**:`isInjectedUserMessage` 增加:

```js
if (/^This session is being continued/i.test(t)) return true;
if (/^<analysis>|^<summary>/i.test(t)) return true;   // compaction 内部结构
```

同时建议对 `entry.isCompactSummary === true`、`entry.isMeta === true` 的条目直接跳过(不同版本格式做双保险)。**注意:续接消息不应丢弃,应单独计数为 `patterns.compactionCount`——它本身是 Tempo 的有效信号(会话长到需要多次 compaction = 会话切分习惯值得建议)。**

### P0-2 · cwd 解析取"最长路径"而非"最常见路径",Architecture 系统性误判

`parse-project.mjs` L850-857 的注释写 `Pick the most-common candidate`,实现却是 `sort((a, b) => b.length - a.length)` —— **按字符串长度取最深路径**。

实测:该项目 cwd 出现频次为项目根目录 5543 次、深层子目录 `…/data_manager/api` 仅个位数,但解析器选中了后者。CLAUDE.md / `.claude/` 全部在错误目录检测 → Architecture 得分建立在错误事实上。

**修复**:用 `Map` 统计频次取众数;若众数并列,取最短(最接近项目根)。更进一步:对候选路径向上找 `.git` 所在目录作为规范根。

### P0-3 · 斜杠命令检测在设计上就是失效的

用户输入 `/foo` 在 JSONL 中记录为 `<command-name>/foo</command-name>` 条目,**先被 `isInjectedUserMessage` 过滤掉,`REGEX.slashCommand` 永远轮不到执行**。实测:用户明确使用过 `/model`、`/effort` 等命令,`customCommands` 输出为空数组 —— Toolcraft 公式里 `customCommands` 的加分项(最高 +9)在现实中永远拿不到。

**修复**:在过滤*之前*增加一个 command 条目解析分支:

```js
const cmdMatch = text.match(/^<command-name>\/([\w:-]+)<\/command-name>/);
if (cmdMatch) { recordCommand('/' + cmdMatch[1]); continue; }
```

顺带能识别通过斜杠调用的 skill(`/claude-radar` 本身就是这样被调用的),这也是 Skill 使用的证据来源之一。

### P0-4 · 新一代工具全部落入 `other`,恰好是"平台杠杆"最高的部分

`TOOL_CATEGORY`(L84-95)停留在旧工具清单。实测该项目中被丢进 `other`(33 次)的包括:

| 工具 | 意义 | 当前归类 |
|---|---|---|
| `Workflow` | **多 agent 确定性编排** —— 平台最高杠杆 | other ❌ |
| `ToolSearch` | 按需加载 MCP/deferred 工具 | other ❌ |
| `Artifact` | 可分享网页产出 | other ❌ |
| `SendMessage` / `TaskOutput` / `TaskStop` / `Monitor` | 后台任务管理 | other ❌ |
| `CronCreate` / `ScheduleWakeup` | 定时/自主循环 | other ❌ |
| `EnterWorktree` / `ExitWorktree` | worktree 隔离 | other ❌ |
| `LSP` | 语义级代码导航 | other ❌ |
| `SlashCommand`(新版本) | 命令调用 | other ❌ |

README 的核心卖点是 *"Scores how you use the platform"*,但 2026 年平台杠杆的天花板(编排、后台化、定时化)对评分完全不可见。这直接回应了你提的第 2 点(覆盖 workflow / MCP 等场景)。

**修复**:见 Sprint 1 的 M3,不只是补分类表,还要新增编排信号(下详)。

### P1-5 · `retryLoops` 会把"继续 × 3"判成撞墙循环

L736-740 用 jaccard > 0.5 判定连续三条相似消息。两条相同的短消息("继续"/"go on")jaccard = 1。在长程自主任务里连发"继续"是**正常且合理**的推进模式,却会在 feedback / efficiency / completion 三个公式里被罚三次。修复:跳过 < 30 字符的消息,或对"继续类"语义白名单。

### P1-6 · `topicDrifts` 与 `demandOverloads` 误报率过高,且价值观已过时

实测 17 个有效会话产生 **topicDrifts=39、demandOverloads=34**——代入公式后 Tempo 直接被砍约 -26 分。两个问题:

1. **误报**:jaccard < 0.03 在中文长消息之间很常见(bigram 切分下不同子话题词面重叠极低);"≥3 个动作词 + >300 字 = 需求过载"会把**结构化的完整任务简报**打成负面信号。
2. **价值观**:在 Claude 4.5/5 的 long-horizon 自主能力下,"一次性给足上下文 + 批量交代 + 里程碑确认"恰恰是最佳实践。rubric 目前在惩罚 2026 年的正确用法,奖励 2024 年的挤牙膏式交互。

**修复**:demandOverload 仅在"多动作 + 无列表结构 + 无优先级/顺序词"同时成立时计数;topicDrift 的阈值和窗口在标注样本上重新校准(见 M8 校准集)。**rubric 的 tempo 哲学需要一次针对"自主 agent 时代"的重写。**

### P1-7 · `blindAccept` 把必要确认当成盲接受

关键词表里"好的/可以/ok"在 plan mode 批准、`AskUserQuestion` 回复之后是**流程要求的确认**,不是盲接受。verification 公式里 `blindAccepts × 200` 的系数极重,误报代价高。修复:若前一条 assistant 消息包含 `AskUserQuestion` / `ExitPlanMode` 工具调用,该确认不计入 blindAccept。

### P1-8 · 其余数据层问题(简列)

- **displayName 冲突**:slug 取最后一段,中文目录名整段变 "-",本机 86 个项目里出现两个 "radar"、多个 "30"/"mvp"。应从 JSONL 的 `cwd` 字段取真实 basename(首选),slug 只作 fallback。
- **`hasIdentifier` 正则过松**:任何大写开头的英文词都算 identifier("Claude"、"GitHub"),该信号对英文用户接近饱和,失去区分度。
- **subagent 侧链**:实测当前版本 `isSidechain` 用户条目为 0(新版分文件存储),但旧版本内联存储,防御性过滤 `entry.isSidechain === true` 仍应加上,成本一行。
- **语言检测样本过小**:只用 keyMessages + sampleExchanges + firstMessage samples(≈25 条),应改为全量用户消息计数(反正已经遍历)。
- **`endedCleanly` 判定太松**:assistant 收尾且末尾无问号即算干净收尾 → 绝大多数会话都"干净",cleanEndRatio 无区分度。可加条件:最后一条 assistant 前 N 条内有测试/构建类 Bash 调用或用户完成信号。

---

## 第二部分:评分与流程设计问题

### D-1 · 让 LLM 手算 9 条公式是方差主源(最重要的架构级改动)

SKILL.md Step 5b 要求 Claude 把十几个 ratio 代入英文描述的公式**心算** baseline。LLM 算术不可靠,METHODOLOGY 承认的 ±3 分方差主要来自这里——而这本是完全可确定性的部分。

**修复**:新增 `scripts/compute-baselines.mjs`(或并入 parse 输出 `baselines` 块):

1. rubric.json 的 `baselineFormula` 从英文字符串改为**结构化 terms**,例如:

```jsonc
"baselineTerms": {
  "base": 50,
  "terms": [
    {"signal": "directing.ratios.hasExpectedBehavior", "pivot": 0.3, "coeff": 80},
    {"signal": "directing.ratios.isVague", "pivot": 0.15, "coeff": -100},
    {"signal": "patterns.retryLoops", "per": "stats.validSessions", "clampMax": 1, "coeff": -40}
  ],
  "clamp": [0, 100]
}
```

2. 脚本确定性求值 9 个 baseline + confidence scaling,facts.json 直接携带 `baselines: {intent: 63, …}`;
3. Claude 的职责收窄为:±15 证据调整 + 诊断 + 建议 —— 这正是 LLM 擅长的部分。

收益:baseline 方差归零;rubric 依然"改 JSON 即改评分";SKILL.md 削掉一整段易错指令,token 也省了。

### D-2 · 文档与规范互相矛盾(信任成本)

- METHODOLOGY.md 建议优先级表写 `85-100 (S): skip`,rubric.json 和 SKILL.md 写 "MINIMUM 5, never fewer";
- SKILL.md Step 9 的 JSON 注释写 `// 3-7 items per Step 8`,Step 8 标题写 5-7;SKILL frontmatter description 写 "3-7";
- 对开源项目,方法论文档就是产品可信度本身,三处统一为 5-7。

### D-3 · `allowed-tools` frontmatter 格式存疑

`allowed-tools: Bash(node *) Read Write`(SKILL.md L5)——规范格式是逗号分隔、匹配符用冒号:`Bash(node:*), Read, Write`。当前写法很可能整条未生效(等于没有限权)。需要实测验证后修正。

### D-4 · 交互体验

项目确认/选择用纯文本 `[Y/n]` 依赖 Claude 自由解析,应改用 `AskUserQuestion` 工具做结构化选择(选项:检测到的项目 / 最近列表 / 手动输入),更稳、也更符合平台习惯——一个"评估别人 Claude Code 用得好不好"的插件,自己应当是平台最佳实践的展柜。

### D-5 · 隐私承诺与检测扩展的一致性

PRIVACY.md 承诺"只读文件系统元数据、不读内容(CLAUDE.md 大小除外)"。后文 M4 要扩展检测 `.mcp.json`/hooks,注意**只统计 keys 数量、不读值**,并同步更新 PRIVACY.md 的措辞,不要让扩展悄悄违背承诺。

### 其他小项

- 仓库里有 macOS 的 `Icon\r` 垃圾文件(git status 可见),加入 `.gitignore`。
- render-report.mjs 的 XSS 处理只转义了 `</script`,JSON 里若出现 `<!--` 也可能出问题,建议同时转义 `<!--` 与 `<script`(低风险,顺手改)。

---

## 第三部分:建议为什么浅 —— 根因与对策(核心)

你的直觉是对的:建议浅不是 SKILL.md 里"quality bar"写得不够狠,而是**生成建议的原材料和素材库都不足**。狠话写十遍,Claude 拿到的还是 10 条被 compaction 污染、截断到 250 字符的样本,只能写出"先问再收"这种水平。

### 根因清单

| # | 根因 | 现状 |
|---|---|---|
| R1 | 证据池被污染 | keyMessages 一半是 compaction 摘要(P0-1) |
| R2 | 证据覆盖率低、采样有偏 | 每会话 1 条 exchange(截 250 字符)+ 1 条最长消息(截 300);50 会话项目只看 20%,且"最长"偏差极大 |
| R3 | 证据与维度不对齐 | verification 的建议需要"盲接受现场的原文",但采样根本不按维度定向 |
| R4 | 没有建议素材库 | rubric 只有原则和反例,没有可实例化的"招式库",Claude 每次现场发明 |
| R5 | 不结合项目上下文 | 明明检测了 tech stack,建议却从不说"你是 Next.js 项目,配 Playwright MCP 做验证闭环" |
| R6 | 交付物天花板低 | 只能给 prompt;工程力建议的正确交付物是**资产**(CLAUDE.md 片段 / command 文件 / agent 定义 / hook / .mcp.json 条目) |
| R7 | 没有纵向记忆 | reports/ 里躺着历史 report JSON,从不读取,说不出"上次建议 X,这次 Proof Check 54→68" |

### 对策 M5:建议 Playbook(解决 R4/R5/R6,最高杠杆的一项)

新增 `data/playbook.json`:按 **dimension × 触发条件** 组织 30–50 个具体"招式",每条结构:

```jsonc
{
  "id": "setup-claude-md-from-corrections",
  "dimensionId": "architecture",
  "trigger": "projectAssets.hasClaudeMd == false && stats.validSessions >= 5",
  "level": "setup",                        // prompt | habit | setup | orchestration
  "insight": {
    "en": "You've repeated the same conventions to Claude across N sessions — that's what CLAUDE.md is for.",
    "zh": "你在 N 个会话里反复口头交代同样的约定 —— 这正是 CLAUDE.md 的用途。"
  },
  "asset": {
    "type": "file",
    "suggestedPath": "CLAUDE.md",
    "template": "# Project conventions\n\n## Stack\n{{techStack}}\n\n## Rules Claude must follow\n- {{repeatedCorrections}}\n"
  },
  "pastablePrompt": {
    "zh": "读一下我们最近 5 个会话里我纠正过你的地方,把可以固化的约定写进 CLAUDE.md。",
    "en": "Review the corrections I gave you recently and persist the stable conventions into CLAUDE.md."
  },
  "expectedImpact": {"dimension": "architecture", "range": [15, 25]}
}
```

覆盖的招式域(对应你第 2 点的场景清单):

- **编排**:Workflow / 并行 subagent / 后台任务 / worktree 隔离(触发条件:多次串行做本可并行的事、大扫描任务单线程跑)
- **MCP**:按 tech stack 推荐(前端 → Playwright/Chrome MCP 验证闭环;有部署 → 对应平台 MCP;`.mcp.json` 落盘)
- **持久化**:CLAUDE.md 分节模板、memory、custom command 把重复 prompt 固化成 `/命令`
- **验证闭环**:hooks(PostToolUse 跑 lint/test)、"完成定义"话术、让 Claude 自证(要求跑测试并贴结果)
- **节奏**:plan mode 时机、compaction 前主动收尾、会话切分粒度
- **纠偏**:带理由的纠正模板、正例示范("show, don't tell")

SKILL.md Step 8 重写为:**脚本先按 trigger 条件筛出候选招式(确定性)→ Claude 从候选中选 5-7 条、用该项目的真实证据实例化模板(个性化)**。深度由 playbook 保证,针对性由证据保证,且社区可以 PR 新招式——这把"建议质量"从每次推理的运气,变成可积累的开源资产。

### 对策 M1:面向维度的证据采样(解决 R1/R2/R3)

解析器为每个维度定向抽取 top-3 "关键瞬间",带上下文:

```jsonc
"dimensionEvidence": {
  "verification": [
    {"session": "a838…", "kind": "blindAccept",
     "assistantBefore": "已修改 3 个文件并重构了 save 逻辑…(摘要)",
     "userText": "好的 继续",
     "note": "assistant made 3-file change; user accepted without inspection"}
  ],
  "feedback": [ {"kind": "correction", "userText": "不对,save 应该基于 view mode 因为…", …} ],
  "tempo":   [ {"kind": "compaction", "note": "session ran 22k-char compaction twice"} ]
}
```

同时:keyMessages 改分层采样(长/中/短各取),全部先过注入过滤;截断从 250/300 提到 500 字符(evidence 是给 LLM 看的,不进报告,预算允许)。

### 对策 M6:纵向对比(解决 R7)

render 前扫 `~/.claude-radar/reports/` 同项目最近一次 report JSON(文件名已含 slug):

- 报告新增 **"Since last check-up"** 面板:9 维分数 delta、上次建议的采纳检测(可自动判定:上次建议 plan mode → 这次 `planModeEntries > 0`?上次建议 CLAUDE.md → 这次 `hasClaudeMd`?);
- 这让产品从"一次性体检"变成"复诊闭环"——用户回访动机 + 建议被验证有效的证据,双赢。

### 对策 M7:建议可执行化(把"建议"变成"动作")

suggestion schema 增加 `actionType: prompt | asset | habit | setup` 与可选 `assetContent`。报告里 asset 类建议提供"复制给 Claude 的安装指令"(如:"把这段贴给 Claude:帮我在 .claude/commands/ 创建 review.md,内容如下…")。远期可加 `/claude-radar apply <n>` 子命令直接落盘(需用户确认)。**用户得到的不再是"你应该…",而是"贴这段,10 秒装好"。**

---

## 第四部分:迭代计划(三个 Sprint,附验收标准)

### Sprint 1 — 数据正确性(P0 全清)· 预计 1-2 天

| # | 措施 | 文件 | 验收标准 |
|---|---|---|---|
| 1.1 | 过滤 compaction 续接/isMeta/isSidechain,新增 `patterns.compactionCount` | parse-project.mjs | ProjectHub 样本:keyMessages 中 compaction 文本 = 0;avgHumanMsgChars 从 1427 降到真实值 |
| 1.2 | cwd 按频次取众数(并列取最短),失败再走 slug 解码 | parse-project.mjs | ProjectHub 样本:resolvedCwd = 项目根(5543 次那个) |
| 1.3 | command-name 条目解析(过滤前),识别斜杠命令与 skill 调用 | parse-project.mjs | 实测项目 customCommands 非空 |
| 1.4 | TOOL_CATEGORY 补全(Workflow/ToolSearch/Artifact/后台任务/cron/worktree/LSP/SlashCommand);新增 `orchestration` 类别与并行度信号(单条 assistant 消息多 tool_use 计数、`run_in_background` 检测) | parse-project.mjs | ProjectHub 样本:`other` 从 33 降到 <5;Workflow 计数 = 4 |
| 1.5 | retryLoops 跳过 <30 字符消息;blindAccept 豁免 AskUserQuestion/ExitPlanMode 之后的确认 | parse-project.mjs | 构造 fixtures 验证 |
| 1.6 | displayName 从 cwd basename 取;语言检测改全量 | parse/list-projects.mjs | 中文路径项目显示真实目录名,86 项目无重名歧义 |
| 1.7 | 建 `test/fixtures/*.jsonl`(合成:含 compaction、sidechain、workflow、斜杠命令、中文路径等 8 类场景)+ 快照测试脚本 | test/ | `node test/run.mjs` 全绿;此后任何解析器改动跑回归 |

schemaVersion → 2.1。

### Sprint 2 — 评分确定性 + 检测面扩展 · 预计 2-3 天

| # | 措施 | 文件 | 验收标准 |
|---|---|---|---|
| 2.1 | rubric 公式结构化(baselineTerms)+ `compute-baselines.mjs` 确定性求值,facts 携带 `baselines` | rubric.json / 新脚本 | 同一项目跑 5 次,9 个 baseline 完全一致;SKILL.md 删除手算指令 |
| 2.2 | Architecture 检测扩展:`.mcp.json`、`AGENTS.md`、`CLAUDE.local.md`、`.claude/skills/`、settings.json 的 hooks keys 计数(只数不读值) | parse-project.mjs / rubric | fixtures 覆盖;PRIVACY.md 同步更新措辞 |
| 2.3 | Toolcraft 公式加入编排项(workflow/并行/后台/cron 加分);Tempo 公式按"自主 agent 时代"重校准(demandOverload 收紧触发条件,compactionCount 作为新信号) | rubric.json | 在 5 个真实项目上人工审分:重编排用户 Toolcraft ≥ 85;结构化长 brief 不再被 Tempo 惩罚 |
| 2.4 | 文档一致性(5-7 建议三处统一)、allowed-tools 格式修正、AskUserQuestion 交互、.gitignore 加 Icon | SKILL.md / docs / .gitignore | 通读无矛盾 |

### Sprint 3 — 建议深度(核心价值交付)· 预计 3-5 天

| # | 措施 | 文件 | 验收标准 |
|---|---|---|---|
| 3.1 | `data/playbook.json` 初版 30+ 招式(编排/MCP/持久化/验证闭环/节奏/纠偏 六域),含 trigger 条件与资产模板 | 新文件 | 每招式可被 facts 字段确定性触发;README 增加"贡献招式"指引 |
| 3.2 | 面向维度的证据采样 `dimensionEvidence`(每维 top-3 关键瞬间,带前后文) | parse-project.mjs | 实测项目:verification 证据里能看到具体盲接受现场原文 |
| 3.3 | SKILL.md Step 8 重写:脚本筛候选招式 → Claude 选 5-7 + 用 dimensionEvidence 实例化 | SKILL.md | 对同一项目,建议不再出现无证据的通用话术;至少 2 条为 asset 类 |
| 3.4 | suggestion schema 加 `actionType` / `assetContent`;模板渲染"贴给 Claude 安装"块 | SKILL.md / template.html | 报告中 asset 建议一键复制可用 |
| 3.5 | 纵向对比:读上次 report JSON,输出 delta 面板 + 上次建议采纳检测 | render 或新脚本 / template | 同一项目跑两次,第二次报告出现 "Since last check-up" |
| 3.6 | 校准集:选 10 个真实项目(覆盖 4 种 profile + 重编排/轻工具/纯中文/纯英文),人工评一遍,对照工具输出调参 | docs/CALIBRATION.md | 分数呈现区分度(不挤在 60-80);人工判断与工具分级一致率 ≥ 8/10 |

### 排序依据

Sprint 1 必须最先做:**证据管线不干净,后面一切建议质量的努力都是在污染数据上刷漆。** Sprint 2 的确定性评分是一次性还清"方差债"。Sprint 3 才是用户可感知的价值跃迁——但它依赖前两步的干净数据和触发条件字段。

---

## 附:本次评审中确认的"做对了的事"(不要在迭代中丢掉)

1. 三层架构分离(确定性解析 / LLM 判断 / 纯渲染)——正确,M2 只是把边界再推准一格;
2. N/A 诚实原则、profile 公平性、密度置信度——设计思想领先于多数同类工具;
3. METHODOLOGY 的 "Visibility limits / Epistemic status" 章节——坦诚是这个产品最稀缺的护城河;
4. 100% 本地、零依赖、单文件报告——保持,任何迭代不得引入网络调用和 npm 依赖;
5. "不用高级工具不扣分、用砸了才扣分"的 Toolcraft 哲学——正确,M3 扩展时沿用。
