# AI 投研平台技能体系盘点（88 技能 / 7 分类）

> 来源：`src/data/skills.ts`（95 个 id = 88 技能 + 7 分类定义）。UI 结构：**分类 = 可折叠选项卡，技能 = 提示词**（点击技能把其 prompt 作为系统提示词注入对话）。

## 一、分类选项卡（7 个）

| 分类 id | 选项卡名称（UI 显示） | 分类定义名（skills.ts） | 图标 | 技能数 | 是否一致 |
|---|---|---|---|---|---|
| `financial-analysis` | 财务分析 | 财务分析 | 📊 | 21 | ✅ |
| `investment-banking` | 投资银行 | 投资银行 | 🏦 | 9 | ✅ |
| `private-equity` | 私募股权 | 私募股权 | 💼 | 10 | ✅ |
| `wealth-management` | 财富管理 | 财富管理 | 💰 | 9 | ✅ |
| `equity-research` | 权益研究 | 股票研究 | 📈 | 24 | ⚠️ UI显示「权益研究」 |
| `fund-admin` | 基金管理 | 基金管理 | 🏢 | 9 | ✅ |
| `operations` | 运营合规 | 运营合规 | 📋 | 6 | ✅ |

**选项卡分类名称的选择**：UI 选项卡名取自 `Sidebar.tsx` 的 `SKILL_CATEGORY_LABELS`（权益研究/财务分析/投资银行/私募股权/财富管理/基金管理/运营合规）；`src/data/skills.ts` 的 `skillCategories` 定义中 equity-research 写作「股票研究」，两处不一致，UI 实际显示「权益研究」。

## 二、技能清单（88 个，均以提示词形态存在）

### 📊 财务分析（21）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `dcf-model` | DCF估值模型 | DCF Model | 估值、DCF、现金流、WACC | 提示词 |
| `audit-xls` | Excel审计检查 | Audit Spreadsheet | 审计、Excel、公式、数据 | 提示词 |
| `xlsx-author` | Excel报告制作 | Excel Author | Excel、生成、报告 | 提示词 |
| `clean-data-xls` | Excel数据整理 | Data Cleaning | 数据、清洗、Excel | 提示词 |
| `pptx-author` | PPT报告制作 | PPT Author | PPT、演示、报告 | 提示词 |
| `3-statement-model` | 三表联动模型 | 3-Statement Model | 财务模型、三表、预测 | 提示词 |
| `comps-analysis` | 可比公司分析 | Comps Analysis | 估值、可比公司、PE、PB | 提示词 |
| `common-size` | 同比分析 | Common Size Analysis | 同比、标准化、结构、趋势 | 提示词 |
| `scenario-analysis` | 情景分析 | Scenario Analysis | 情景、预测、模拟、乐观 | 提示词 |
| `ppt-template-creator` | 投行PPT模板设计 | PPT Template Creator | PPT、模板、设计 | 提示词 |
| `ib-check-deck` | 投行材料审核 | IB Deck Checker | 投行、审核、QC | 提示词 |
| `sensitivity-analysis` | 敏感性分析 | Sensitivity Analysis | 敏感性、假设、测试、驱动 | 提示词 |
| `dupont-analysis` | 杜邦分析 | DuPont Analysis | 杜邦、ROE、分解、驱动 | 提示词 |
| `lbo-model` | 杠杆收购模型 | LBO Model | LBO、杠杆收购、PE | 提示词 |
| `benchmarking` | 标杆对比 | Benchmarking | 标杆、对标、最优、改进 | 提示词 |
| `waterfall-chart` | 瀑布图分析 | Waterfall Chart | 瀑布图、驱动、变动、可视化 | 提示词 |
| `cash-flow-analysis` | 现金流分析 | Cash Flow Analysis | 现金流、自由现金流、质量、分析 | 提示词 |
| `competitive-analysis` | 竞争情况分析 | Competitive Analysis | 竞争、市场、定位 | 提示词 |
| `ratio-analysis` | 财务比率分析 | Ratio Analysis | 比率、财务、分析、指标 | 提示词 |
| `deck-refresh` | 路演材料更新 | Deck Refresh | 路演、更新、PPT | 提示词 |
| `skill-creator` | 金融技能整理 | Skill Creator | 技能、创建、标准化 | 提示词 |

### 🏦 投资银行（9）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `process-letter` | 交易流程说明 | Process Letter | 流程、信函、竞拍 | 提示词 |
| `cim-builder` | 信息备忘录制作 | CIM Builder | CIM、并购、交易 | 提示词 |
| `strip-profile` | 分部业务分析 | Strip Profile | 分部、业务、分析 | 提示词 |
| `merger-model` | 并购模型 | Merger Model | 并购、M&A、模型 | 提示词 |
| `datapack-builder` | 数据包制作 | Datapack Builder | 数据包、投行、尽调 | 提示词 |
| `buyer-list` | 潜在买家名单 | Buyer List | 买家、M&A、交易 | 提示词 |
| `pitch-deck` | 路演材料 | Pitch Deck | 路演、融资、演示 | 提示词 |
| `teaser` | 项目简介 | Teaser | Teaser、摘要、交易 | 提示词 |
| `deal-tracker` | 项目跟踪 | Deal Tracker | 项目、跟踪、管理 | 提示词 |

### 💼 私募股权（10）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `ai-readiness` | AI转型评估 | AI Readiness Assessment | AI、转型、评估 | 提示词 |
| `value-creation-plan` | 价值提升方案 | Value Creation Plan | 价值、提升、退出 | 提示词 |
| `unit-economics` | 单位经济分析 | Unit Economics | 单位、经济、CAC、LTV | 提示词 |
| `dd-checklist` | 尽职调查清单 | DD Checklist | 尽调、清单、风险 | 提示词 |
| `dd-meeting-prep` | 尽调会议准备 | DD Meeting Prep | 尽调、会议、准备 | 提示词 |
| `portfolio-monitoring` | 投后项目监控 | Portfolio Monitoring | 投后、监控、KPI | 提示词 |
| `ic-memo` | 投资委员会纪要 | IC Memo | 投委会、决策、投资 | 提示词 |
| `returns-analysis` | 投资收益分析 | Returns Analysis | 收益、IRR、回报 | 提示词 |
| `deal-screening` | 项目初步筛选 | Deal Screening | 筛选、投资、机会 | 提示词 |
| `deal-sourcing` | 项目来源拓展 | Deal Sourcing | 寻源、渠道、拓展 | 提示词 |

### 💰 财富管理（9）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `client-review` | 客户资产回顾 | Client Review | 客户、回顾、评估 | 提示词 |
| `client-report` | 客户资产报告 | Client Report | 客户、持仓、报告 | 提示词 |
| `investment-proposal` | 投资建议方案 | Investment Proposal | 投资、建议、方案 | 提示词 |
| `portfolio-rebalance` | 投资组合再平衡 | Portfolio Rebalance | 组合、再平衡、配置 | 提示词 |
| `income-strategy` | 收入策略 | Income Strategy | 收入、现金流、策略、分红 | 提示词 |
| `financial-plan` | 理财规划方案 | Financial Plan | 规划、退休、教育 | 提示词 |
| `goal-planning` | 目标规划 | Goal Planning | 目标、规划、路径、财务自由 | 提示词 |
| `tax-loss-harvesting` | 税损收割 | Tax-Loss Harvesting | 税务、收割、优化 | 提示词 |
| `risk-profiling` | 风险画像 | Risk Profiling | 风险、画像、评估、承受能力 | 提示词 |

### 📈 股票研究（24）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `esg-score` | ESG评分 | ESG Score | ESG、可持续、治理、环保 | 提示词 |
| `event-study` | 事件研究 | Event Study | 事件、影响、量化、异常收益 | 提示词 |
| `valuation-heatmap` | 估值热力图 | Valuation Heatmap | 估值、热力图、对比、行业 | 提示词 |
| `supply-chain` | 供应链分析 | Supply Chain Analysis | 供应链、上下游、风险、韧性 | 提示词 |
| `short-interest` | 做空分析 | Short Interest | 做空、融券、空头、卖空 | 提示词 |
| `insider-trading` | 内部人交易 | Insider Trading | 增持、减持、内部人、大股东 | 提示词 |
| `peer-comparison` | 同业对比 | Peer Comparison | 同业、对比、横向、竞争 | 提示词 |
| `stock-comparison` | 多股票比较器 | Stock Comparer | 对比、财务指标、选股 | 提示词 |
| `technical-analysis` | 技术面分析 | Technical Analysis | K线、MACD、RSI、布林带 | 提示词 |
| `idea-generation` | 投资机会挖掘 | Idea Generation | 投资、筛选、主题 | 提示词 |
| `thesis-tracker` | 投资逻辑跟踪 | Thesis Tracker | 投资、逻辑、跟踪 | 提示词 |
| `morning-note` | 晨会纪要 | Morning Note | 晨会、纪要、早报 | 提示词 |
| `sector-rotation` | 板块轮动 | Sector Rotation | 板块、轮动、信号、行业 | 提示词 |
| `dividend-analysis` | 股息分析 | Dividend Analysis | 股息、分红、收益率、派息率 | 提示词 |
| `sector-overview` | 行业概况 | Sector Overview | 行业、概览、分析 | 提示词 |
| `model-update` | 财务模型更新 | Model Update | 模型、更新、预测 | 提示词 |
| `forensic-accounting` | 财务舞弊识别 | Forensic Accounting | 舞弊、异常、预警、财务 | 提示词 |
| `earnings-analysis` | 财报分析 | Earnings Analysis | 财报、季度、分析 | 提示词 |
| `earnings-preview` | 财报前瞻 | Earnings Preview | 财报、前瞻、预期 | 提示词 |
| `earnings-review` | 财报回顾 | Earnings Review | 财报、回顾、分析 | 提示词 |
| `earnings-calendar` | 财报日历 | Earnings Calendar | 财报、日历、日期、预告 | 提示词 |
| `quality-score` | 质量评分 | Quality Score | 质量、评分、ROE、现金流 | 提示词 |
| `catalyst-calendar` | 重要事件日历 | Catalyst Calendar | 日历、事件、催化剂 | 提示词 |
| `initiating-coverage` | 首次覆盖 | Initiating Coverage | 首次、覆盖、研究报告 | 提示词 |

### 🏢 基金管理（9）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `performance-attribution` | 业绩归因 | Performance Attribution | 归因、业绩、Brinson、超额收益 | 提示词 |
| `nav-tieout` | 净值核对 | NAV Tieout | NAV、核对、基金 | 提示词 |
| `variance-commentary` | 差异情况说明 | Variance Commentary | 差异、说明、分析 | 提示词 |
| `break-trace` | 差异追踪 | Break Trace | 差异、追踪、根因 | 提示词 |
| `accrual-schedule` | 应计项目明细 | Accrual Schedule | 应计、月末、基金 | 提示词 |
| `gl-recon` | 总账核对 | GL Reconciliation | 对账、总账、差异 | 提示词 |
| `investor-reporting` | 投资人报告 | Investor Reporting | 投资人、LP、报告、季度 | 提示词 |
| `roll-forward` | 期间结转分析 | Roll Forward | 结转、滚动、权益 | 提示词 |
| `fee-calculation` | 费用计算 | Fee Calculation | 费用、报酬、水位线、计提 | 提示词 |

### 📋 运营合规（6）

| 技能 id | 中文名 | 英文名 | 触发关键词 | 形态 |
|---|---|---|---|---|
| `kyc-rules` | KYC合规规则 | KYC Rules | KYC、规则、合规 | 提示词 |
| `kyc-doc-parse` | KYC文档解析 | KYC Doc Parse | KYC、文档、解析 | 提示词 |
| `sanctions-screening` | 制裁筛查 | Sanctions Screening | 制裁、筛查、黑名单、OFAC | 提示词 |
| `aml-check` | 反洗钱检查 | AML Check | 反洗钱、交易、监控、可疑 | 提示词 |
| `compliance-check` | 合规检查 | Compliance Check | 合规、检查、监管、验证 | 提示词 |
| `risk-assessment` | 风险评估 | Risk Assessment | 风险、评估、压力测试、VaR | 提示词 |

**合计：88 个技能**，全部为「提示词」形态；分类为「选项卡」形态。

## 三、DSH 迁移映射

| AI 投研平台 | DSH 系统 |
|---|---|
| 7 个分类选项卡（Sidebar 可折叠分组） | DSH skill 目录分组（ai-finance/skills/<category>/ 或统一平铺） |
| 88 个技能提示词（点击注入 system prompt） | 88 个 SKILL.md（frontmatter description 供模型按需触发） |
| 技能 prompt 字段 | SKILL.md 正文指令 |
| skill-recommender 关键词推荐 | SKILL.md description 里的触发词 |

## 四、点击交互行为分析（精确）

### 4.1 点击「分类名称」→ 出现什么？

**出现「选项卡式折叠列表」，不是提示词。**

| 环节 | 行为 |
|---|---|
| Sidebar「专业工具」区 | 7 个分类标题默认全部**折叠**，每行显示：`▸ 分类名 + 右侧技能数` |
| 点击分类标题 | `toggleCategory(cat)` 展开/收起（`▾`）该分类下的**技能按钮列表** |
| 展开后 | 只显示每个技能的**中文名**（无图标、无描述、无提示词），选中项高亮蓝色 |
| 再点分类标题 | 收起 |

> 分类名取自 `Sidebar.tsx` 的 `SKILL_CATEGORY_LABELS`（唯一显示源），技能数实时统计。

### 4.2 点击「技能」→ 出现什么？

**88 个技能均无 inputSchema → 触发「引导消息」注入对话流**（`App.tsx handleSelectSkill`）：

```
已选择 **{技能中文名}** 技能
{引导语}
```

- 该消息以 **assistant 气泡** 出现在对话流，气泡上方带技能 id 小字标签
- 引导语三级查找：**技能专属引导语**（仅 15 个高频技能有，如 dcf-model/earnings-analysis/morning-note）→ **分类引导语**（7 类各有 1 条，如财务分析="请输入股票代码或公司名称…"）→ 兜底「请描述您想要分析的公司或项目。」
- 点击技能**不会立即调用模型**，只是发一条引导消息等用户输入

### 4.3 技能提示词（prompt）何时真正生效？

**发送消息时**（`handleSendMessage`）：
1. 选中技能 + 用户消息 → `routeAgent(effectiveSkill, content)` 按技能智能路由到对应 Agent（专家）
2. `getAgentSystemPrompt(matchedAgent, effectiveSkill.prompt || '')` → **技能 prompt 作为系统提示词拼进 Agent 系统提示词**，随消息发给模型

即：**引导词（guide）= 选中后显示的交互文案；系统提示词（prompt）= 发消息时才注入模型**，两者是分离的。

### 4.4 另外三条技能入口

| 入口 | 行为 |
|---|---|
| ChatArea 顶部「快捷技能」 | 8 个高频技能（dcf-model/comps-analysis/sector-overview/earnings-analysis/idea-generation/lbo-model/merger-model/dd-checklist），按 `skill-usage` 使用次数排序；点击 = 直接发送用户消息 `帮我做{技能名}` |
| 搜索技能 | Sidebar 搜索框，按 name/description 匹配，点击同样走 `handleSelectSkill`（发引导消息） |
| skill-recommender 自动推荐 | 输入框关键词匹配 `KEYWORD_SKILL_MAP`（财报→earnings-analysis、行业/板块/AI/半导体→sector-overview 等，带权重与 A股/美股 market 变体），自动推荐技能与置信度 |

### 4.5 对 DSH 迁移的修正说明

| AI 投研平台 | DSH 对应 | 说明 |
|---|---|---|
| 分类选项卡 | SKILL.md `category` 字段 | DSH 无折叠 UI，分类仅作元数据 |
| 引导词（guide，交互文案） | 无对应物 | DSH 无"点击技能"交互，未迁移 |
| 系统提示词（prompt） | SKILL.md 正文指令 | ✅ 已迁移 |
| 快捷技能 / 关键词推荐 | SKILL.md description 触发词 | ✅ 已迁移（description 里含触发词） |
