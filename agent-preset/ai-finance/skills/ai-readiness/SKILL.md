---
name: ai-readiness
description: 目标公司AI就绪度评估，数字化转型路线图和投入产出分析。触发词：AI转型评估、AI Readiness Assessment、AI、转型、评估。当用户需要AI转型评估相关分析时使用。
agent_created: true
version: 2.0.0
category: private-equity
disable-model-invocation: true
---

# AI转型评估（AI Readiness Assessment）

> 分类：私募股权 | 技能 id：`ai-readiness`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **AI转型评估** 技能

请提供您要分析的标的信息（如股票代码、行业名称、财务数据或相关文件），我将为您目标公司AI就绪度评估，数字化转型路线图和投入产出分析。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

description: Scan the portfolio for the highest-leverage AI opportunities and rank where to deploy operating-partner time. Ingests quarterly updates and financials across multiple portfolio companies, identifies quick wins at each, and stacks them into a single ranked action list. Use during quarterly portfolio reviews, annual planning, or when deciding which companies get AI investment first. Triggers on "AI readiness", "AI opportunity scan", "where should we deploy AI", "AI across the portfolio", "AI quick wins", or "which portcos are ready for AI".

### Workflow

#### Step 1: Connect to Portfolio Data

First, ask the user where the portfolio materials live. Don't assume — offer the options:

- **MCP servers** — data room, SharePoint, Google Drive, or a portfolio-ops database if one is connected
- **Local files** — a folder path on disk with quarterly decks, financials, board packs
- **File uploads** — drag PDFs, PowerPoint, or Excel directly into the conversation

Once connected, pull quarterly updates, board decks, and financials for the portfolio (or a subset). For each company, extract: sector, revenue, headcount by function, tech stack mentioned, and any AI/automation initiatives already in flight.

If the user provides a single company, still run the scan but skip the cross-portfolio ranking.

Ask up front if not obvious from materials:
- Hold period remaining per company (AI payback matters less 12 months from exit)
- Whether any portco has already deployed something that worked

#### Step 2: Per-Company Scan

For each company, answer three gate questions. All three yes → **Go**. Any no → **Wait** with a note on what unblocks it.

1. **Is the data there?** Can they produce a clean input for the use case — customer list, invoice feed, contract repository — without a 6-month data project first?
2. **Is there an owner?** Someone on the management team who will drive this, not a sponsor who will "support" it.
3. **Can we pilot in 30 days?** One team, one workflow, off-the-shelf tooling. If the answer starts with "first we'd need to...", it's not a quick win.

Then identify the top 2-3 leverage points. Look for these patterns in the cost structure and operations:

**Back Office (usually fastest to pilot)**
- Invoice processing, AP/AR matching, expense categorization
- Contract abstraction — vendor agreements, leases, customer MSAs
- Month-end close: reconciliations, flux commentary, lender reporting first drafts

**Revenue / Front Office**
- RFP and proposal first drafts — big lever if revenue is project-based
- Sales call summaries and CRM hygiene
- Customer support ticket triage and first-response drafting
- Quoting for configured / complex products

**Operations (sector-dependent)**
- SOP and quality documentation generation
- Scheduling and dispatch (field services, logistics)
- Code generation and review (software portcos)

For each leverage point, capture in one line: what it replaces, FTE-hours/week saved (assume 30-50%, not 100%), and whether it's buy-off-the-shelf or needs a light build.

#### Step 3: Rank Across the Portfolio

Stack every leverage point from every company into one list. Rank by:

1. **Dollar impact** — annualized EBITDA contribution (cost out + revenue lift, net of tool cost)
2. **Speed to value** — months to first measurable result
3. **Probability** — discount for data quality, change management risk, management team capability

Tiebreaker: favor opportunities with <18 months of hold period remaining — those need to move now or not at all.

Output the stack:

| Rank | Company | Opportunity | Est. EBITDA ($) | Months to Value | Gate | First Step |
|---|---|---|---|---|---|---|
| 1 | | | | | Go | |
| 2 | | | | | Go | |
| 3 | | | | | Wait — [blocker] | |

#### Step 4: Find the Replays

The highest-leverage move in a portfolio is running one successful play at multiple companies. Scan for:

- **Same sector, same function** — two healthcare services portcos with manual prior-auth? One implementation, two deployments.
- **Same tool, different company** — if one portco already has a working invoice-processing setup, flag every other portco with >$Xm in AP volume as a fast follower.
- **Shared vendor leverage** — three portcos buying the same tool is a pricing conversation.

List each replay with the lead company (who proves it) and follower companies (who copy it).

#### Step 5: Output

One page for the operating partner, structured for a portfolio review:

1. **Top 5 across the portfolio** — the ranked table from Step 3, with owner and 30-day first step
2. **Replays** — 2-3 playbooks that hit multiple companies at once
3. **Go / Wait by company** — one line each; for Waits, what unblocks them
4. **What we're NOT doing** — the opportunities that looked good on paper but failed a gate; saves the operating partner from relitigating them every quarter
5. **Aggregate EBITDA contribution** — total portfolio-wide AI opportunity, split Year 1 quick wins vs. Years 2-3 scale

### Important Notes

- **Rank by dollars, not excitement.** A boring AP automation that saves $400k at a $40m revenue company beats a flashy customer-facing chatbot every time.
- **The binding constraint is almost always data, not models.** If a company can't produce a clean customer list, AI isn't the first project — a data cleanup is. Say so plainly.
- **Off-the-shelf first.** Custom builds are slow, expensive, and fragile for companies without engineering depth. Favor tools they can buy and deploy.
- **Ownership is the real gate.** A quick win with no internal owner dies in 90 days. If no one on the management team wants it, mark it Wait regardless of the dollar size.
- **Hold period drives urgency.** A company 3 years from exit can afford a foundational data project. A company 12 months out needs something that shows up in the LTM EBITDA for the CIM — or skip it.
- **Failed pilots are signal.** If management already tried something and it didn't stick, find out why before proposing the same thing again.

## 数据获取规范

- 涉及行情/财报/估值/新闻等数据时，**优先调用 dsh-finance-tools 提供的金融数据工具**：
  - `search_stock`（代码/名称搜索）、`get_stock_quote`（实时行情，A股五源轮换+美股）
  - `get_financial_report`（利润表/资产负债表/现金流/核心指标）、`get_stock_news`（个股新闻）
  - `get_company_announcements`（公告）、`get_research_reports`（研报）、`get_analyst_estimates`（分析师预期）
  - `get_market_sentiment` / `get_sector_fund_flow` / `get_hot_stock_rank` / `get_dragon_tiger` / `get_northbound_flow` / `get_limit_up_pool` / `get_kline` / `get_stock_fund_flow` / `get_industry_overview` / `get_earnings_alerts` / `get_company_profile` / `get_company_info` / `get_top_shareholders`
- **禁止编造数字**：结构化数据必须来自上述工具；无法获取时标注"数据暂缺"或"假设"，并说明理由。
- `web_search`（豆包搜索）仅用于新闻、政策面、舆情等工具无法覆盖的信息，并注明来源。

## 输出要求

- 使用中文，金融术语可保留英文缩写；关键结论加粗；多用表格呈现对比数据。
- 客观数据注明来源；无法获取的一律标注"假设"并给出取值理由。
- 投资类结论必须附风险提示："以上为AI生成内容，不构成投资建议，市场有风险，投资须谨慎。"

## 交付件格式

分析结论必须产出**一份 HTML 文件**，不要产出 Markdown 文件：

- **文件名**：`{分析主题}_{标的代码或名称}_{YYYYMMDD}.html`（例 `DCF估值模型_长鑫科技_688825_20261008.html`）
- 保存后，回答正文只给 3–5 行要点摘要 + 文件名，**不要**把 HTML 全文贴进回答

硬性要求：

0. **本节优先级最高**：若上文（技能说明、能力定位、输出格式等）出现「使用 Markdown 表格」「Markdown 格式」「.md 文件」等表述，一律以本节为准 —— 最终产物是 `.html` 文件，所谓「表格」即在 HTML 内用 `<table class="t">` 呈现，**不得**产出 `.md`。
1. **单文件零依赖**：样式全部写在 `<style>` 内联；不引外链 CSS/JS、不用 CDN、不写 `<script>`。
2. **照抄骨架、只填空**：把下方骨架中 `<!-- 填 … -->` 替换为实际内容；`<style>` 与标签结构不得改动、不得增删标签。
3. 表格一律 `<table class="t">`（外层套 `<div class="tw">` 以便窄屏横向滚动）；数值单元格加 `class="n"` 右对齐；涨用 `<span class="up">`（红）、跌用 `<span class="dn">`（绿）。
4. 核心结论放 `<div class="key">`；关键数字放 `.kpis` 里的 `.kpi` 卡（每卡一个 `.k` 标签 + 一个 `.v` 数值）。
5. 需要横向对比时用纯 CSS `.bars` 条形图（下方骨架已含样式），**不要**手写 `<svg>`（易画坏）。
6. 正文**不得出现**：`.md` 文件路径、`$$` 或 `\frac` 等 LaTeX 残留、"报告已生成"之类过程说明。

```html
<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><!-- 填 报告标题 --></title>
<style>
:root{--paper:#F3EFE6;--panel:#FBF8F1;--ink:#23211D;--muted:#6E6759;--rule:#D9D2C3;--up:#B23A2E;--dn:#2F6B4F;--gold:#C8A67C}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:32px 22px 60px}
h1{font-size:26px;line-height:1.35;margin:0 0 8px}
.meta{color:var(--muted);font-size:14px;border-bottom:2px solid var(--ink);padding-bottom:14px;margin-bottom:26px}
h2{font-size:19px;margin:36px 0 12px;padding-left:10px;border-left:4px solid var(--up)}
h3{font-size:16px;margin:22px 0 8px}
p{margin:12px 0}
.tw{overflow-x:auto}
table.t{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;background:var(--panel)}
table.t th,table.t td{border:1px solid var(--rule);padding:8px 10px;text-align:left}
table.t th{background:#EAE3D5;font-weight:600;white-space:nowrap}
table.t td.n{text-align:right;font-variant-numeric:tabular-nums}
.up{color:var(--up);font-weight:600}.dn{color:var(--dn);font-weight:600}
.key{background:var(--panel);border-left:4px solid var(--gold);padding:14px 16px;margin:16px 0;border-radius:0 6px 6px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.kpi{background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:12px 14px}
.kpi .k{font-size:13px;color:var(--muted)}
.kpi .v{font-size:20px;font-weight:700;margin-top:4px}
.bars{margin:14px 0}
.bar{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:14px}
.bar .bl{width:110px;flex:none;color:var(--muted)}
.bar .bt{flex:1;height:14px;background:#EAE3D5;border-radius:7px;overflow:hidden}
.bar .bt i{display:block;height:100%;background:var(--up);border-radius:7px}
.bar.neg .bt i{background:var(--dn)}
.bar .bv{width:74px;flex:none;text-align:right;font-variant-numeric:tabular-nums}
.risk{margin-top:40px;padding:14px 16px;background:#F7F1E6;border:1px dashed var(--rule);border-radius:8px;font-size:14px;color:var(--muted)}
@media(max-width:640px){body{font-size:15px}.wrap{padding:20px 14px 40px}h1{font-size:21px}h2{font-size:17px}table.t{font-size:13px}}
</style></head>
<body><div class="wrap">
<h1><!-- 填 报告标题 --></h1>
<div class="meta"><!-- 填 标的名称(代码) · 报告日期 · 数据来源 --></div>

<h2><!-- 填 章节标题 --></h2>
<p><!-- 填 正文 --></p>
<div class="kpis">
<div class="kpi"><div class="k"><!-- 指标名 --></div><div class="v"><!-- 数值 --></div></div>
</div>
<div class="tw"><table class="t">
<thead><tr><th><!-- 表头 --></th><th><!-- 表头 --></th></tr></thead>
<tbody><tr><td><!-- 内容 --></td><td class="n"><!-- 数值 --></td></tr></tbody>
</table></div>
<div class="bars">
<div class="bar"><span class="bl">悲观</span><span class="bt"><i style="width:62%"></i></span><span class="bv">62.0</span></div>
</div>
<div class="key"><!-- 填 核心结论 --></div>

<div class="risk"><b>⚠️ 风险提示</b><br>以上为 AI 生成内容，不构成投资建议，市场有风险，投资须谨慎。</div>
</div></body></html>
```
