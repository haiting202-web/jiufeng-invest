# AI 投研 WEB 端「卡片体系」全景 + DSH 迁移清单

> 梳理自 WEB 端源码：`src/skills/index.ts`（71 技能）/ `src/types.ts` / `src/components/SkillCard.tsx` /
> `src/components/ChatArea.tsx` / `src/lib/ddxml-protocol.ts` / `src/components/DocumentPreview.tsx`。
> 梳理时间：2026-08-28

---

## 〇、一句话结论

**WEB 端真正的「卡片」只有 5 个技能有，且全部是美股；你举例的「A股行情 + 选项卡选公司」目前 WEB 端并不存在。**
10 个 A 股 `china-*` 技能一个卡片都没有——这是本次迁移必须补的最大缺口。

---

## 一、四层卡片体系全景

| 层级 | 名称 | 触发方式 | 渲染组件 | 覆盖技能数 | DSH 现状 |
|---|---|---|---|---|---|
| **①** | 工作流会诊卡片 | 点顶部 7 个专家 | `ExpertLanding` | 7 个专家 | ✅ 已有（OverlayCard） |
| **②** | **inputSchema 表单卡片** | 点带 `inputSchema` 的技能 | `SkillCard.tsx` | **5 个**（全美股） | ❌ **完全没有** |
| **③** | DDXML 输出文档卡片 | AI 回复含 ` ```ddxml ` 块 | `DocumentPreview.tsx` | 全技能通用 | ❌ 完全没有 |
| **④** | 专用面板（技术面/多空/比较器） | 独立入口 | `TechnicalAnalysisView` 等 | 3 个 | ❌ 完全没有 |

---

## 二、② inputSchema 表单卡片（本次迁移核心）

### 2.1 只有这 5 个技能有卡片

| # | skill id | 名称 | 分类 | 字段数 | 美股/A股 |
|---|---|---|---|---|---|
| 1 | `dcf-model` | DCF估值模型 | financial-analysis | 7 | 🇺🇸 美股 |
| 2 | `comps-analysis` | 美股可比公司分析 | financial-analysis | 4 | 🇺🇸 美股 |
| 3 | `earnings-analysis` | 美股财报分析 | equity-research | 2 | 🇺🇸 美股 |
| 4 | `idea-generation` | 美股选股筛选 | equity-research | 6 | 🇺🇸 美股 |
| 5 | `sector-overview` | 美股行业分析 | equity-research | 5 | 🇺🇸 美股 |

**其余 66 个技能无卡片** → 点技能只在对话框注入一段引导词，不弹卡片。

### 2.2 字段级完整定义（可直接用于重建卡片）

#### ① `dcf-model` DCF估值模型（7 字段）

| key | label | type | 必填 | 选项/说明 |
|---|---|---|---|---|
| `ticker` | 分析对象 | `stock-picker` | ✅ | placeholder: 输入股票代码或公司名称 |
| `years` | 预测期 | `select` | — | 3年 / 5年 / 10年 |
| `wacc` | 折现率 (WACC) | `select` | — | 8% / 10% / 12% / 自定义 |
| `waccCustom` | 自定义 WACC | `number` | — | 单位 %，配合 wacc=自定义 |
| `terminalMethod` | 终值方法 | `select` | — | 永续增长法 / 退出倍数法 |
| `terminalGrowth` | 永续增长率 | `number` | — | 单位 % |
| `exitMultiple` | 退出 EV/EBITDA | `number` | — | 单位 x |

#### ② `comps-analysis` 美股可比公司分析（4 字段）

| key | label | type | 必填 | 选项/说明 |
|---|---|---|---|---|
| `target` | 目标公司 | `stock-picker` | ✅ | — |
| `peers` | 可比公司 | `text` | — | 留空则由 AI 推荐 |
| `focus` | 分析重点 | `select` | — | 估值对比/增长分析/竞争定位/运营效率 |
| `context` | 场景 | `select` | — | 投资决策/并购评估/行业对标/业绩回顾 |

#### ③ `earnings-analysis` 美股财报分析（2 字段）

| key | label | type | 必填 | 选项 |
|---|---|---|---|---|
| `ticker` | 分析对象 | `stock-picker` | ✅ | — |
| `quarter` | 财报期 | `select` | ✅ | 2026Q1 / 2025Q4 / 2025Q3 / 2025Q2 / 2025Q1 |

> ⚠️ 财报期是**硬编码**的 5 个季度，会随时间过期——迁移时应改为动态生成。

#### ④ `idea-generation` 美股选股筛选（6 字段）

| key | label | type | 必填 | 选项 |
|---|---|---|---|---|
| `direction` | 方向 | `select` | ✅ | 做多(Long)/做空(Short)/两者皆可 |
| `marketCap` | 市值 | `select` | ✅ | 大盘(>100亿)/中盘(30-100亿)/小盘(10-30亿)/微盘(<10亿) |
| `sector` | 行业 | `text` | ✅ | 如"新能源"、"半导体"，或"跨行业" |
| `style` | 投资风格 | `select` | ✅ | 价值型/成长型/质量型/特殊情况/事件驱动 |
| `geography` | 地区 | `select` | ✅ | A股/港股/美股/全球 |
| `theme` | 主题 | `text` | — | 如"AI"、"国产替代"、"老龄化" |

#### ⑤ `sector-overview` 美股行业分析（5 字段）

| key | label | type | 必填 | 选项 |
|---|---|---|---|---|
| `sector` | 行业 | `text` | ✅ | — |
| `depth` | 分析深度 | `select` | — | 概览(5-10页)/深度(20-30页) |
| `angle` | 分析角度 | `select` | — | 中立全景/主题驱动 |
| `universe` | 覆盖范围 | `select` | — | 仅上市公司/包含非上市 |
| `purpose` | 用途 | `select` | — | 客户报告/内部研究/路演材料/投资机会 |

### 2.3 字段类型规范（8 种，来自 `src/types.ts`）

| type | 渲染形态 | 特有属性 | 值格式 |
|---|---|---|---|
| `text` | 单行输入框 | `placeholder` | 字符串 |
| `textarea` | 多行文本域（3 行） | `placeholder` | 字符串 |
| `number` | 数字输入 + 单位后缀 | `unit` `min` `max` | 数字 |
| `select` | ≤4 项→横排按钮；>4 项→下拉 | `options[]` | 选中 value |
| `multi-select` | 多选按钮组（打勾） | `options[]` | 字符串数组 |
| `stock-picker` | **搜索框 + 下拉候选 + 已选标签** | `placeholder` | `{name, code}` |
| `toggle` | 开关按钮 | `helpText` | 布尔 |
| `file` | 文件选择（Electron 对话框） | `placeholder` | `{path, name}` |

**通用属性**：`key` `label` `required` `defaultValue` `dependsOn:{key,value}` `helpText`

**三条渲染规则**（迁移必须复刻）：
1. `dependsOn` — 字段按前置字段的值条件显隐
2. `required` 全填才能提交（multi-select 需 `length>0`）
3. **select 选项 >4 个走下拉，≤4 个走横排按钮**

### 2.4 卡片提交 → 提示词的转换规则（`ChatArea.tsx:339`）

```
【技能名】

{label}: {显示值}{unit}
{label}: {显示值}{unit}
...
```

显示值格式化：

| type | 显示值 |
|---|---|
| `select` | 取 option 的 **label**（非 value） |
| `multi-select` | 数组 `join('、')` |
| `stock-picker` | `名称 (代码)`，如 `贵州茅台 (600519)` |
| `file` | 文件名 |
| 其余 | `String(value)` |

---

## 三、③ DDXML 输出文档卡片（`ddxml-protocol.ts` v2.0）

AI 输出 ` ```ddxml ` 代码块 → 解析为富文档。这是**输出侧**卡片，与输入侧 inputSchema 互补。

### 3.1 文档级结构

| 节点 | 用途 |
|---|---|
| `<doc type>` | word / excel / ppt / pdf |
| `<head><title>` | 标题 |
| `<head><theme>` | finance / wine / tech / corp（按行业自动匹配） |
| `<body><metrics>` | 指标卡片组 `name/value/unit/trend` |
| `<body><chartData>` | 图表数据 `name/value` |
| `<body><tableData>` | 表格行（属性即列） |
| `<body><sections>` | 章节（h2 + p + list + callout + table） |
| `<body><slides>` | PPT 页（5 种 layout） |

### 3.2 5 种 slide layout

| layout | 内容 |
|---|---|
| `title` | title + subtitle |
| `content` | title + bullets |
| `metrics` | title + 指标组 |
| `chart` | title + chartData（bar/pie/line/doughnut） |
| `columns` | title + 多栏（col 带 title/body/highlight） |

### 3.3 规范约束

- PPT：最少 10 页，目标 15-20 页；每页标题是**结论陈述句**
- Word：至少 5 个 section，每个含 h2 + 200-400 字正文
- `< > &` 必须转义为 `&lt; &gt; &amp;`
- 输出顺序：先 1-2 句总结，再 ` ```ddxml ` 块

---

## 四、④ 专用面板（依赖重，迁移需单独评估）

| 面板 | 组件 | 依赖 | DSH 迁移难度 |
|---|---|---|---|
| 技术面综合分析 | `TechnicalAnalysisView` | `technical-indicators.ts` 纯计算 + 行情 API | 中（算法可搬，行情要接） |
| 多空辩论 | `BullBearDebate` | LLM 双角色 + 行情 | 中高 |
| 股票比较器 | `StockComparer` | 行情 + 财务 API | 中 |

---

## 五、⚠️ 关键缺口：A股 10 个技能零卡片

### 5.1 美股有卡片 vs A股无卡片（一一对应）

| 美股技能（✅有卡片） | A股对应技能（❌无卡片） | A股 prompt 长度 |
|---|---|---|
| `dcf-model` (7字段) | `china-dcf-model` A股DCF估值模型 | 1187 字符 |
| `comps-analysis` (4字段) | `china-comps-analysis` A股可比公司分析 | 1006 字符 |
| `earnings-analysis` (2字段) | `china-earnings-analysis` A股业绩点评 | 727 字符 |
| `idea-generation` (6字段) | `china-idea-generation` A股选股筛选 | 843 字符 |
| `sector-overview` (5字段) | `china-sector-overview` A股行业深度分析 | 818 字符 |

另有 5 个 A 股技能也无卡片：`china-earnings-preview`(业绩前瞻)、`china-initiating-coverage`(首次覆盖)、
`china-morning-note`(晨会纪要)、`china-thesis-tracker`(逻辑跟踪)、`china-3-statement-model`(三表模型)。

**A股技能 prompt 都已就绪（727~1187 字符），只缺 inputSchema 定义。**

### 5.2 你举例的场景：A股行情卡片

> 「查询A股一个股票的行情，有卡片选项卡，可以在选项卡里面选择对应的公司」

**当前 WEB 端不存在这个卡片。** 最接近的是 `stock-picker` 字段类型（搜股票 + 候选下拉 + 已选标签），
但只挂在 5 个美股技能上。

- WEB 实现：`window.electronAPI.searchStockEx(keyword)` → Electron 主进程 → 东方财富
- DSH 可行方案：`dsh-finance-tools/lib/datasource.js` 的 `searchStockSmart()` 是**纯 fetch 零依赖**：
  - A股/港股：`https://searchapi.eastmoney.com/api/suggest/get?input={kw}&type=14&token={EM_SEARCH_TOKEN}&count=5`
    （`EM_SEARCH_TOKEN` 由环境变量注入，见 `dsh-finance-tools/lib/datasource.js`）
  - 美股：`...&type=4&...`（回落）
  - 返回 `{code, name, market, kind}`

---

## 六、DSH 迁移方案

### 阶段 1：inputSchema 卡片引擎（无争议，直接做）
- 在 `client.js` 实现 8 种字段渲染器 + dependsOn + required 校验
- 提交时按 §2.4 规则拼装提示词
- 数据由 `skills-data.json` 的 `inputSchema` 字段驱动
- 迁移现有 5 个美股技能卡片定义

### 阶段 2：A股卡片补齐（你举例的场景）
- 按美股对应卡片结构，为 10 个 `china-*` 技能设计 inputSchema
- A股专用选项：
  - 报告期按 A股披露节奏（Q1/半年报/Q3/年报，动态生成）
  - 板块选择（主板/创业板/科创板/北交所）
  - 估值锚（中债无风险利率、中国ERP、25% 税率、CNY 计价）
- stock-picker 接东方财富搜索 API

### 阶段 3：DDXML 输出卡片（可选）
- 在 DSH 解析 ` ```ddxml ` 并渲染富文档
- 工作量最大，收益是报告类输出可视化

### 阶段 4：专用面板（视优先级）

---

## 附：数据源文件

| 文件 | 用途 |
|---|---|
| `inputschema-inventory.json` | 5 个技能的 inputSchema 机器可读清单（本目录） |
| `skills-data.json` | DSH 101 技能数据（迁移目标） |
| `extract-inputschema.mjs` | 从 WEB 端提取 inputSchema 的脚本 |
