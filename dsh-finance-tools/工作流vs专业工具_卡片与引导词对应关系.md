# AI 投研平台：工作流 vs 专业工具 —— 卡片与提示引导词对应关系

> ⚠️ **本文档部分结论已过时（2026-08-28 复核）**
>
> 本文基于**旧版 `data/skills.ts`（88 技能）**，当时结论是「88 个技能均无 inputSchema，无需迁移」。
> 但 WEB 端 skill 源已迁移到 **`src/skills/index.ts`（71 技能）**，其中 **5 个技能已有 inputSchema 卡片**
> （`dcf-model` / `comps-analysis` / `sector-overview` / `earnings-analysis` / `idea-generation`，均为美股）。
> 因此下文 §3.3、§5 中「SkillCard 表单卡片无需迁移」的结论**不再成立**。
>
> **最新梳理见：`dsh-ai-invest-sidebar\卡片体系全景与DSH迁移清单.md`**

---

> 精确梳理自 `src/` 源码（Sidebar.tsx / App.tsx / data/experts.ts / data/skills.ts / agents/index.ts / lib/expert-orchestrator.ts / components/ExpertLanding.tsx / SkillCard.tsx / TraderConsultation.tsx）。

## 核心结论（一句话）

**「投研工作流」= 会诊性质卡片；「专业工具」= 选项卡 + 对话框引导词。两者是完全不同的交互，不能混。**

---

## 一、三层结构全景

| 层级 | 实体 | 数据源 | UI 形态 | 交互产物 |
|---|---|---|---|---|
| **① 投研工作流** | 7 个专家（Expert） | `data/experts.ts` | **会诊卡片**（ExpertLanding 落地页） | 多专家串行会诊 |
| **② 专业工具** | 88 个技能（Skill） | `data/skills.ts` | **选项卡**（折叠分类列表） | 对话框引导词 |
| **③ Agent 路由** | 13 个 Agent | `agents/index.ts` | 无 UI（后台路由） | 技能→Agent 执行 prompt |

---

## 二、投研工作流 = 会诊性质卡片（7 个专家）

### 2.1 对应关系

Sidebar 顶部「投研工作流」区（`WORKFLOW_LIST`），7 项，点击后**弹出专家会诊卡片**：

| 工作流 id | 显示名（卡片标题） | 图标 | 专家描述 | 会诊人格 |
|---|---|---|---|---|
| `financial-analysis` | 财务监控诊断 | 📊 | DCF/LBO/三表建模，财务健康度诊断 | CFA/CPA 财务分析师 |
| `equity-research` | 股票多空博弈 | 🔬 | 财报拆解、行业格局、晨会纪要 | 买方权益研究分析师 |
| `investment-banking` | 投行业务 | 🏦 | 并购交易、路演材料 | MD 级投行家 |
| `private-equity` | 项目筛选尽调 | 💼 | 项目筛选、单位经济学、投后 | PE 基金合伙人 |
| `wealth-management` | 资产配置规划 | 🏛️ | 资产配置、税务、规划 | 私人银行家/家办顾问 |
| `fund-admin` | 基金对账核查 | 📋 | 总账对账、NAV、KYC | 基金行政专家 |
| `trader` | 游资多专家研判 | 🛸 | 6大游资+2择时框架 | 游资策略研判师 |

### 2.2 卡片交互流程（ExpertLanding.tsx）

```
点击工作流项
  → onSelectExpert → setLandingExpert(expert)
  → 右侧主区渲染「专家会诊落地页卡片」：
      - 专家大图标 + 名称 + 描述
      - 标签云（tags）
      - 输入框：「描述您的需求，{专家名} 将协调专业工具综合研判」
      - 按钮：「开始会诊分析」
  → 提交需求 → handleStartConsultation
  → expert-orchestrator 串行链式会诊：
      主责专家(lead)先研判 → 提取子问题 → 分发补充专家(supplementary)
      → 冲突裁决 → 综合结论
```

**关键**：这是「会诊」——一个主责专家 + 多个补充专家**串行链式**输出（QPS 安全 + 补充专家可引用主责结论）。`trader` 是特例，走 `TraderConsultation` 组件（6大游资 + 2择时框架串行调度）。

---

## 三、专业工具 = 选项卡 + 引导词（7 分类 88 技能）

### 3.1 对应关系

Sidebar「专业工具」区（`skillCategories`），7 个**折叠选项卡**，88 个技能：

| 分类 id | 选项卡名 | 技能数 | 与工作流的关系 |
|---|---|---|---|
| `financial-analysis` | 财务分析 | 21 | 对应「财务监控诊断」专家 |
| `equity-research` | 权益研究 | 24 | 对应「股票多空博弈」专家 |
| `investment-banking` | 投资银行 | 9 | 对应「投行业务」专家 |
| `private-equity` | 私募股权 | 10 | 对应「项目筛选尽调」专家 |
| `wealth-management` | 财富管理 | 9 | 对应「资产配置规划」专家 |
| `fund-admin` | 基金管理 | 9 | 对应「基金对账核查」专家 |
| `operations` | 运营合规 | 6 | （无对应工作流，纯工具） |

### 3.2 交互流程（handleSelectSkill）

```
点分类标题 → toggleCategory → 展开/收起技能列表（选项卡式）
点技能 → handleSelectSkill（88 个技能均无 inputSchema）
  → 注入一条 assistant 引导消息到对话框：
      「已选择 **{技能名}** 技能\n\n{引导语}」
  → 引导语三级：技能专属(15条) → 动态生成(73条) → 分类引导语
  → 用户输入 → handleSendMessage：
      routeAgent(技能, 消息) → getAgentSystemPrompt(agent, 技能prompt)
      → 技能 prompt 作为系统提示词注入模型
```

### 3.3 关键：专业工具**不是卡片**

- **SkillCard.tsx 卡片组件仅在技能有 `inputSchema` 时才渲染**（表单式卡片）。
- 当前 88 个技能**全部没有 inputSchema**，所以专业工具实际交互 = **对话框里大模型回复的一段引导词**，不弹卡片。

---

## 四、两者对比（核心差异表）

| 维度 | 投研工作流 | 专业工具 |
|---|---|---|
| 实体 | 7 专家（Expert，独立人格 systemPrompt） | 88 技能（Skill，prompt） |
| UI 位置 | Sidebar 顶部「投研工作流」 | Sidebar「专业工具」 |
| 展示形态 | **会诊卡片**（落地页） | **选项卡**（折叠列表） |
| 点击后 | 弹落地页卡片 → 输入 → 多专家会诊 | 对话框 assistant 引导词 |
| 性质 | 会诊（lead + supplementary 串行链） | 单技能提示词（发消息时注入） |
| 名称风格 | 动词短语（监控诊断/多空博弈/筛选尽调…） | 名词短语（财务分析/权益研究…） |
| 数量 | 7（含 trader 游资） | 88（7 分类，operations 无对应专家） |

---

## 五、对 DSH 迁移的含义（下一步方向，本次仅分析）

| 原体系 | DSH 应如何对应 |
|---|---|
| 投研工作流（7 专家会诊卡片） | DSH 需「专家会诊」机制：7 个专家人格 + 串行链式编排，触发后多专家输出（**不是** 88 技能那种单一 SKILL.md） |
| 专业工具（88 技能，选项卡+引导词） | DSH 的 88 个 SKILL.md（✅ 已做），引导词机制（✅ 已加） |
| SkillCard 表单卡片（inputSchema） | DSH 无对应物（88 技能均无 inputSchema，无需迁移） |

**当前 DSH 状态**：88 个技能已迁移（专业工具层）；**「投研工作流」的专家会诊层尚未迁移**——这正是"卡片弹出方式不对"的根因：把 88 个工具技能当成了会诊卡片来理解，而真正的会诊卡片是 7 个专家。
