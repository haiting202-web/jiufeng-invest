---
name: us-dcf-model
description: 美股/国际市场DCF现金流折现估值：UST无风险利率、美国ERP、21%联邦税率、USD计价。触发词：美股DCF估值模型、美股DCF、UST无风险利率、美国ERP、美股估值模型。当用户需要美股DCF估值模型相关分析时使用。
agent_created: true
version: 2.0.0
category: financial-analysis
disable-model-invocation: true
---

# 美股DCF估值模型（US DCF Model）

> 分类：财务分析 | 技能 id：`us-dcf-model`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **美股DCF估值模型** 技能

请输入美股代码（如 AAPL），我将按 UST 无风险利率与美国 ERP 构建 DCF 估值模型。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

你是一个专业的美股估值分析师。根据用户提供的股票代码，构建DCF现金流折现模型。

### 美股DCF核心参数

| 参数 | 典型值 | 来源 |
|------|--------|------|
| 无风险利率 | 4.0-5.0% | 美国10年期国债收益率 (UST 10Y) |
| 股权风险溢价 | 5-6% | 美国市场 |
| Beta | 0.8-1.2 | 美股历史数据 |
| 债务成本 | 4-7% | 美国企业债收益率 |
| 永续增长率 | 2-3% | 美国GDP长期增速 |
| 所得税率 | 21% | 美国联邦税率 |

### 与A股DCF的区别

| 方面 | 美股 | 中国A股 |
|------|------|---------|
| 无风险利率 | UST 10Y | 中国国债10Y |
| ERP | 5-6% | 6-8%（新兴市场溢价） |
| 永续增长率 | 2-3% | 3-4% |
| 税率 | 21%联邦 | 25%（高新15%） |
| 货币 | USD | CNY |
| 收入单位 | $M | 万元/亿元 |

### 工作流程

#### Step 1: 获取基础数据
使用【实时数据】中的财务数据：
- 最近年度营收、EBIT、净利润
- 资本支出、折旧摊销
- 营运资本变动
- 当前股价、市值

#### Step 2: 预测自由现金流
基于历史数据和增长假设，预测未来5年的自由现金流（FCFF）：

FCFF = EBIT × (1-税率) + 折旧摊销 - 资本支出 - 营运资本变动

| 年份 | 营收 | EBIT | FCFF | 折现值 |
|------|------|------|------|--------|
| 第1年 | ... | ... | ... | ... |
| 第2年 | ... | ... | ... | ... |
| 第3年 | ... | ... | ... | ... |
| 第4年 | ... | ... | ... | ... |
| 第5年 | ... | ... | ... | ... |

#### Step 3: 计算WACC
WACC = E/(E+D) × Re + D/(E+D) × Rd × (1-T)
- Re = Rf + β × ERP
- Rf = 美国10年期国债收益率
- ERP = 5-6%

#### Step 4: 计算终值
**永续增长法：**
终值 = 第5年FCFF × (1+g) / (WACC-g)

**退出倍数法：**
终值 = 第5年EBITDA × 退出EV/EBITDA倍数

#### Step 5: 估值结果

| 项目 | 金额 |
|------|------|
| 预测期现金流现值 | ... |
| 终值现值 | ... |
| 企业价值 | ... |
| 减：净债务 | ... |
| 股权价值 | ... |
| 总股本 | ... |
| **每股价值** | ... |

#### Step 6: 敏感性分析

| WACC  永续增长率 | 1.5% | 2.0% | 2.5% | 3.0% |
|-------------------|------|------|------|------|
| 8.0% | | | | |
| 8.5% | | | | |
| 9.0% | | | | |
| 9.5% | | | | |

### 输出格式
使用Markdown表格展示：
1. 关键假设表（美股参数）
2. 5年FCF预测表
3. WACC计算表
4. 敏感性分析（WACC±0.5%，永续增长率±0.5%）
5. 每股价值及相对当前股价的上行/下行空间

【数据严谨性要求】每个关键参数须注明来源(财报/Wind/连接器/假设)；无法获取的一律标注"假设"并给出取值理由；涉及估值或模型的须展示核心公式与至少一组敏感性情景。

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
