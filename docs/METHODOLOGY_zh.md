[English](./METHODOLOGY.md)

# Claude Radar — 方法论

> Claude Radar 关注的不是代码输出本身，而是你**作为平台**和 AI 协作的质量 —— 你怎么沟通、怎么搭建工程化环境、最终产出如何。
>
> 这份文档既是 Claude 遵循的公开评分规范，也是你报告里每个数字背后的依据。

---

## 设计原则

1. **证据优先** —— 每个分数都能追溯到具体可数的会话信号
2. **隐私不让步** —— 会话数据全本地，无云端、无 API key、无遥测
3. **密度优于体量** —— 小但信号密集的项目不应被打压
4. **N/A 是诚实的表达** —— 维度真不适用时就说 N/A，不强行打 50
5. **画像决定公允性** —— 不同类型的项目用不同的权重
6. **诊断才是给用户的礼物** —— 分数告诉你**是什么**，诊断告诉你**为什么**和**怎么做**
7. **位置改变含义** —— 同一信号在不同位置意义不同
8. **公式保证一致性，Claude 补充语境** —— 可复现基线 + 有限定性微调

---

## 工作原理

```
~/.claude/projects/<slug>/*.jsonl
         │
         ▼
   [parse-project.mjs]           ← 确定性。位置感知信号 + 工具/skill/MCP/CLAUDE.md 检测
         │ facts.json (schemaVersion 2.0)
         ▼
    [Claude in the skill]        ← 读 rubric.json。两层：评分 + 诊断
         │ report.json (schemaVersion 2.0)
         ▼
   [render-report.mjs]           ← 纯转换。JSON + 模板 → HTML dashboard
         │
         ▼
  ~/.claude-radar/reports/<slug>-<ts>.html
```

三阶段清晰分离：

- **Parser** —— 确定性，相同输入相同输出。按类别统计工具调用（Skill / MCP / Subagent / Plan / 自定义命令）、CLAUDE.md / memory / agents / settings.json 检测、每个会话的产出指标、自动判别项目画像。
- **Scorer + Diagnoser** —— 由你 Claude Code 会话里的 Claude 完成。先按公式算基线，再做密度驱动的 confidence 缩放，再做 ±15 微调，最后独立生成自由格式诊断。
- **Renderer** —— 把 JSON 灌进 dashboard 模板，输出单文件 HTML。

无外部 API。无云端处理。无服务器依赖。

---

## 三大类 × 九维度

Claude Radar 把维度按三类组织，每类有 `categoryScore`，按 profile 权重汇总成 overall。

### A. 沟通力 Communication（3 维）
你怎么用文字驱动 AI。

| 维度 | 衡量 | 主位置 |
|---|---|---|
| **瞄准力** Lock-On | 指令清晰度（期望、约束、标识符） | directing |
| **画面感** Scene Setting | 开场背景铺设 | opening |
| **导航力** Steering | 纠偏质量（解释、引用、retry loops） | correcting |

### B. 工程力 Engineering（3 维）
你把 Claude Code 平台用到几成。

| 维度 | 衡量 | 主数据源 |
|---|---|---|
| **工具力** Toolcraft | Skill / MCP / Subagent / 自定义命令 / Plan / Todo 使用 | toolcraftSummary |
| **架构力** Architecture | CLAUDE.md / Memory / Agents / Settings 设置质量 | projectAssets（文件系统） |
| **节奏感** Tempo | 会话级节奏（里程碑、总结、聚焦、单轮范围） | 全局信号 |

### C. 成效 Outcome（3 维）
真东西出来了多少。

| 维度 | 衡量 | 主数据源 |
|---|---|---|
| **效率** Efficiency | 每条消息的产出（编辑、工具、覆盖文件数） | outcomeTotals |
| **鉴定术** Proof Check | 验证习惯（测试、审查、盲接受） | confirming + 全局 |
| **收尾度** Completion | 干净收尾、无放弃 retry、有完成信号 | outcomeTotals + patterns |

---

## 项目画像（公允性引擎）

每个项目都被 `parse-project.mjs` 按会话数、消息数、编辑率、日期跨度自动归类：

| Profile | 判别规则 | 分类权重 | N/A 维度 |
|---|---|---|---|
| `one-shot` 一次性 | ≤ 2 session 且 ≤ 15 msg | 沟通 0.5 / 工程 0.1 / 成效 0.4 | Architecture / Tempo / Completion |
| `feature-build` 功能开发 | 3-20 session，编辑比例正常 | 沟通 0.34 / 工程 0.33 / 成效 0.33 | 无 |
| `long-running` 长期 | ≥ 20 session 或跨 > 7 天 | 沟通 0.3 / 工程 0.4 / 成效 0.3 | 无 |
| `learning` 学习探索 | 编辑率 < 0.1 且消息 > 20 | 沟通 0.7 / 工程 0.3 / 成效 0 | Efficiency / Completion |

**N/A 处理**：维度按 profile 规则或自身的 `applicabilityRule` 标 N/A（比如 Architecture 在 cwd 无法定位时 N/A）。category 平均只统计 applicable 的维度；整个 category 全 N/A 时权重按比例分配给其他类。

**Profile 显示在 overall grade 旁边**。一次性项目的 B 和长期项目的 B 不是一回事 —— 报告会直接说明。

---

## 位置感知信号

Claude Radar 把每条用户消息归到 5 个位置之一再统计信号：

| Position | 定义 |
|---|---|
| `opening` | 每个 session 的前 2 条用户消息 |
| `directing` | 新任务/指令（不是对 AI 输出的反应） |
| `correcting` | AI 输出后，用户表现出纠正意图 |
| `confirming` | AI 输出后，用户给短确认 |
| `continuing` | 其他 |

每个沟通维度只读它对应位置的信号。这让瞄准力 / 画面感 / 导航力真正正交 —— 同一个 `hasFilePath` 不会同时给三个维度加分。

---

## 每个维度两步评分

应用到 9 个维度：

1. **公式基线**（确定性）：把 facts 值代入 `rubric.json` 公式，结果 clamp 到 [0, 100]
2. **密度驱动的 confidence 缩放**：见 §8
3. **Claude 微调**（最多 ±15）：必须引用 `keyMessages` / `sampleExchanges` / `sessionFlows` / `toolcraftSummary` 等中的证据，无证据则不调整

```
finalScore = clamp(adjustedBaseline + claudeAdjustment, 0, 100)
```

**"Silent Expert" 模式**仍然识别 —— `<100 字符`含文件路径 + 标识符 + 动作的精准短指令，通过 adjustment guide 上调。

---

## 密度驱动的 confidence

confidence 同时看 session 数和信号密度：

```
signalDensity = 全部位置 label 计数总和 / 用户消息数
outcomeDensity = 总工具调用 / 用户消息数
```

| Confidence | 条件 | 缩放 |
|---|---|---|
| `low` | < 5 msg，或 (< 20 msg 且密度低) | `50 + (baseline - 50) * 0.75` |
| `medium` | (< 40 msg 且密度低)，或 < 50 msg | `50 + (baseline - 50) * 0.9` |
| `high` | 其他 | 不缩放 |

8 条消息但每条 3 次工具调用、信号位置清晰 → `high` confidence。80 条空话但没工具调用 → `medium` 或 `low`。这是公允性修复的核心：**密度比体量重要**。

---

## 工具力（Toolcraft）评分

回答的问题：项目需要高级工具时，你会不会用？

**理念：不用 Skills/MCP 不扣分。** 基础工具（Edit/Bash/Read）的熟练使用就是基线（60，B 级）。高级工具是加分项。**用了但用不好**才会被扣分 —— 比如调用后停滞、触发 retry 循环。

公式：

```
baseline = 60                                              // 基础用户底线 = B（稳步探索）
  + min(skillsUsed.length, 5) × 5                          // 最多 +25 skill 多样性
  + min(mcpServers.length, 4) × 4                          // 最多 +16 MCP 使用
  + clamp(subagentCalls / sessions, 0, 2) × 6              // 最多 +12 委派
  + (planModeEntries > 0 ? 5 : 0)                          // +5 用过 Plan
  + min(customCommands.length, 3) × 3                      // 最多 +9 自定义命令
  + clamp(todoToolUse / humanMsgs, 0, 0.3) × 20            // 最多 +6 todo 跟踪
, clamp [0, 100]
```

只用 Edit/Bash/Read 大约 60 分（B）。skill→subagent→自定义命令链式用 + Plan + Todo 跟踪可以 90+（S）。Claude 的 ±15 微调可以下调高级工具用得差的情况 —— 调用了但触发 retry、Plan 进了又抛弃，这种"工具表演"会被识别。

---

## 架构力（Architecture）评分

回答的问题：你为这个项目做过可重复 AI 协作的设置吗？

公式：

```
baseline = 40
  + (hasClaudeMd ? 20 : 0)
  + (claudeMdSize > 500 ? 10 : 0)         // 不是 stub
  + (hasMemoryDir ? 8 : 0)
  + min(memoryFileCount, 5) × 2
  + (hasAgentsDir ? 6 : 0)
  + min(agentCount, 4) × 2
  + (hasCommandsDir ? 5 : 0)
  + min(commandCount, 3) × 2
  + (hasSettingsJson ? 5 : 0)
, clamp [0, 100]
```

**适用性规则**：项目工作目录在当前机器上定位不到时本维度标 N/A —— 不读文件系统就没法评。

---

## 效率（Efficiency）评分

效率是对"小项目不公平"的结构性答案。

```
baseline = 50
  + clamp(toolsPerHumanMsg / 3, 0, 1) × 25
  + clamp(editsPerHumanMsg / 1.5, 0, 1) × 20
  + clamp(filesPerHumanMsg / 0.5, 0, 1) × 15
  - clamp(retryLoops / sessions, 0, 1) × 20
, clamp [0, 100]
```

3 条消息 5 次文件编辑 → 效率 90+。50 条消息说话多改动少 → 效率低。**效率奖励的是做出来什么，不是发了多少消息**。

---

## 收尾度（Completion）评分

回答的问题：你的 session 是真收尾，还是烂尾？

```
baseline = 50
  + (cleanEndRatio - 0.5) × 60
  + (sessionsWithCompletionSignal / sessions - 0.3) × 50
  - clamp(retryLoops / sessions, 0, 1) × 15
  + (labelRatios.hasCompletion - 0.05) × 80
, clamp [0, 100]
```

`endedCleanly` 在以下情况算干净收尾：
- 最后一条是用户确认 + 含完成语（"搞定"、"done"、"ship it" 等），或
- 最后一条是 assistant 且不挂着待回答的问题

`hasCompletion` 跨位置检测显式完成语。

---

## 诊断层

独立于评分。产出三块：

### 13.1 — `collaborationProfile`（120-180 字）
自由格式的协作画像。

**要求：**
- 必须引用 facts 中的真实行为（"8 个会话里你用了 4 种 skill，subagent 调用 12 次"）
- 避免人格档案（"你是 INTJ 架构师..."）
- 描述可观察行为，不做人格推断

### 13.2 — `coreDiagnosis`（60-100 字）
一段话，点出**唯一最强项**和**唯一最关键瓶颈**，带证据。

格式：`**强项**：[特征] —— [证据]。**瓶颈**：[特征] —— [证据 + 具体代价]。`

### 13.3 — `crossDimensionReading`（1-2 句）
解读维度得分组合而成的行为模式。

例：
- "高 Lock-On + 低 Proof Check = 你信任 AI 的执行，但不信任它的判断。"
- "强 Toolcraft + 弱 Architecture = 你在飞行中用平台，但没做持久化设置。"

**诊断约束：**
- 每个论断都必须引证据
- 不算命口吻
- 中英语义对等（不是字面直译）

---

## 建议规范（5-7 条，带 prompt 改写）

**至少 5 条，永远不少于 5 条。** 即使高分用户也一样 —— 不是给"纠错"建议，而是从以下来源给 "level-up" 进阶动作：(a) 把强项从 82 推到 90+，(b) 把一个维度成功的习惯迁移到另一个维度，(c) 针对实际 workflow 推荐一个 Skill/MCP/Subagent 动作，(d) recap/milestone/scoping 的流程习惯，(e) 风险减少（比如"你的本事都在脑子里，没写进 CLAUDE.md"）。

每条建议都包含：

```jsonc
{
  "dimensionId": "verification",
  "priority": "high",
  "title": { "en": "...", "zh": "..." },
  "body": { "en": "...", "zh": "..." },
  "evidence": { "en": "Across 8 sessions...", "zh": "8 个会话里..." },
  "promptRewrite": { "en": "Before you write code...", "zh": "在写代码前..." },
  "expectedImpact": { "en": "+10-15 Proof Check...", "zh": "+10-15 鉴定术..." }
}
```

**优先级映射：**

| 分数 | 优先级 | 是否必给 |
|---|---|---|
| 0-54（D/C） | high | 是 |
| 55-69（B） | medium | 通常给 |
| 70-84（A） | low | 仅当有明确缺口 |
| 85-100（S） | — | 跳过 |

**质量门槛：**
- `promptRewrite` 必须是具体可粘贴字符串 —— 不能是"多问问"这种废话
- `expectedImpact` 要诚实地说取舍（"+12 鉴定术，但可能稍微慢一点"）
- `evidence` 必须引用/转述真实会话内容

---

## 可见性限制（依然诚实）

Claude Radar 的盲区，明确列出：

1. **不可见的验证** —— 在 IDE 里看 diff 后才说"ok"的用户，跟盲接受的用户在对话里看起来一样。我们看对话，看不到屏幕。
2. **沉默的专家精度** —— 极短极精准的指令可能不触发关键词。adjustment 层部分补偿。
3. **CLAUDE.md 的隐性上下文** —— 维护良好 CLAUDE.md 的用户给 AI 持久上下文，不用在消息里重复。Claude Radar 检测 CLAUDE.md 存在和大小用于 Architecture，但它给其他维度的隐性加成更难归因。
4. **结对编程模式** —— 快速短交换的用户和长 brief 的用户形态不一样，都不绝对更好。
5. **语言局限** —— 关键词信号只对中英文有效，其他语言会被低估。
6. **cwd 解码有损** —— Claude Code 把 `~/.claude/projects/<slug>` 里的 `/` 和 ` ` 都编码成 `-`。Claude Radar 尝试 (a) 从 jsonl 条目里读 cwd 字段、(b) 后缀匹配、(c) 文件系统遍历。都失败就 Architecture 标 N/A —— 不造假。

---

## 我们不评估什么

- **代码质量** —— linter、测试、reviewer 的事
- **语言/框架能力** —— 不是我们的赛道
- **绝对生产力** —— 我们没法告诉你这周交付了多少
- **bug 修复成功率** —— 我们看对话，看不到 merge
- **安全合规** —— 独立学科

我们衡量**协作行为 + 工程化设置 + 产出密度**，不是最终交付物。

---

## 已知局限

1. **小样本仍意味着大误差** —— 密度 confidence 缓解了过度缩水，但不消除不确定性。报告会在 profile 段明确标注
2. **评分仍有运行间方差**（典型 ±3 分）。诊断层足够具体，分数的小波动不影响可操作建议
3. **画像分类是启发式** —— 4 session 的原型可能被归为 `feature-build`，而用户心里它是 `one-shot`。rationale 字段会解释**为什么**这样归类
4. **架构检测需要文件系统访问** —— 在和项目不同机器上跑分析，Architecture 会 N/A
5. **rubric 有立场** —— 我们认为强 AI 协作 = 目标明确 + 工具熟练 + 重验证 + 干净收尾。不同标准的团队改 `rubric.json` 即可

---

## 自我认知

**我们不声称：**
- 这经过科学验证
- `S` 协作者比 `B` 协作者"更好"
- 低分等于你是差工程师
- 这是唯一正确的评估框架

**我们声称：**
- 9 维 3 类覆盖完整协作生命周期：沟通 → 工程 → 执行 → 验证 → 收尾
- 位置感知 + 项目画像感知的评分体系真正正交且公允
- 公式 + 微调 + 诊断的组合可复现、有证据、可执行
- 诊断层把分数变成你下次会话能直接用的结构化反馈

---

## 如何修改评分

全在 `data/rubric.json`：

- **改基线公式** —— 改 `dimensions.<dim>.baselineFormula`
- **改类别分组** —— 改 `categories.<cat>.dimensionIds`
- **改 profile 权重 / N/A 规则** —— 改 `profiles.<profile>.categoryWeights` 和 `naDimensions`
- **改适用性规则** —— 改 `dimensions.<dim>.applicabilityRule`
- **改等级阈值** —— 改 `grades[*].range`
- **改 confidence 缩放** —— 改 `scoring.confidenceScaling`
- **改诊断规范** —— 改 `diagnosis.*`
- **改建议规范** —— 改 `suggestions.*`

不用改代码，Claude 每次跑都重读 `rubric.json`。

---

*Claude Radar 开源。方法论保持透明，让团队能理解评分逻辑并按需调整。*
