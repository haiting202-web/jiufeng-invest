---
name: 3-statement-model
description: 利润表、资产负债表、现金流量表三表联动财务预测模型。触发词：三表联动模型、3-Statement Model、财务模型、三表、预测。当用户需要三表联动模型相关分析时使用。
agent_created: true
version: 2.0.0
category: financial-analysis
disable-model-invocation: true
---

# 三表联动模型（3-Statement Model）

> 分类：财务分析 | 技能 id：`3-statement-model`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **三表联动模型** 技能

请输入股票代码，我将自动拉取三张财务报表，建立联动财务预测模型。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

Complete and populate integrated financial model templates with proper linkages between Income Statement, Balance Sheet, and Cash Flow Statement.

### ⚠️ CRITICAL PRINCIPLES — Read Before Populating Any Template

**Environment — Office JS vs Python:**
- **If running inside Excel (Office Add-in / Office JS):** Use Office JS directly. Write formulas via `range.formulas = [["=D14*(1+Assumptions!$B$5)"]]` — never `range.values` for derived cells. No separate recalc; Excel computes natively. Use `context.workbook.worksheets.getItem(...)` to navigate tabs.
- **If generating a standalone .xlsx file:** Use Python/openpyxl. Write `ws["D15"] = "=D14*(1+Assumptions!$B$5)"`, then run `recalc.py` before delivery.
- **Office JS merged cell pitfall:** Do NOT call `.merge()` then set `.values` on the merged range — throws `InvalidArgument` because the range still reports its pre-merge dimensions. Instead write value to top-left cell alone, then merge + format the full range: `ws.getRange("A1").values = [["INCOME STATEMENT"]]; const h = ws.getRange("A1:G1"); h.merge(); h.format.fill.color = "#1F4E79";`
- All principles below apply identically in either environment.

**Formulas over hardcodes (non-negotiable):**
- Every projection cell, roll-forward, linkage, and subtotal MUST be an Excel formula — never a pre-computed value
- When using Python/openpyxl: write formula strings (`ws["D15"] = "=D14*(1+Assumptions!$B$5)"`), NOT computed results (`ws["D15"] = 12500`)
- The ONLY cells that should contain hardcoded numbers are: (1) historical actuals, (2) assumption drivers in the Assumptions tab
- If you find yourself computing a value in Python and writing the result to a cell — STOP. Write the formula instead.
- Why: the model must flex when scenarios toggle or assumptions change. Hardcodes break every downstream integrity check silently.

**Verify step-by-step with the user:**
1. **After mapping the template** → show the user which tabs/sections you've identified and confirm before touching any cells
2. **After populating historicals** → show the user the historical block and confirm values/periods match source data
3. **After building IS projections** → run the subtotal checks, show the user the projected IS, confirm before moving to BS
4. **After building BS** → show the user the balance check (Assets = L+E) for every period, confirm before moving to CF
5. **After building CF** → show the user the cash tie-out (CF ending cash = BS cash), confirm before finalizing
6. **Do NOT populate the entire model end-to-end and present it complete** — break at each statement, show the work, catch errors early

### Formatting — Professional Blue/Grey Palette (Default unless template/user specifies otherwise)

**Keep colors minimal.** Use only blues and greys for cell fills. Do NOT introduce greens, yellows, oranges, or multiple accent colors — a clean model uses restraint.

| Element | Fill | Font |
|---|---|---|
| Section headers (IS / BS / CF titles) | Dark blue `#1F4E79` | White bold |
| Column headers (FY2024A, FY2025E, etc.) | Light blue `#D9E1F2` | Black bold |
| Input cells (historicals, assumption drivers) | Light grey `#F2F2F2` or white | Blue `#0000FF` |
| Formula cells | White | Black |
| Cross-tab links | White | Green `#008000` |
| Check rows / key totals | Medium blue `#BDD7EE` | Black bold |

**That's 3 blues + 1 grey + white.** If the template has its own color scheme, follow the template instead.

Font color signals *what* a cell is (input/formula/link). Fill color signals *where* you are (header/data/check).

### Model Structure

#### Identifying Template Tab Organization

Templates vary in their tab naming conventions and organization. Before populating, review all tabs to understand the template's structure. Below are common tab names and their typical contents:

| Common Tab Names | Contents to Look For |
|------------------|----------------------|
| IS, P&L, Income Statement | Income Statement |
| BS, Balance Sheet | Balance Sheet |
| CF, CFS, Cash Flow | Cash Flow Statement |
| WC, Working Capital | Working Capital Schedule |
| DA, D&A, Depreciation, PP&E | Depreciation & Amortization Schedule |
| Debt, Debt Schedule | Debt Schedule |
| NOL, Tax, DTA | Net Operating Loss Schedule |
| Assumptions, Inputs, Drivers | Driver assumptions and inputs |
| Checks, Audit, Validation | Error-checking dashboard |

**Template Review Checklist**
- Identify which tabs exist in the template (not all templates include every schedule)
- Note any template-specific tabs not listed above
- Understand tab dependencies (e.g., which schedules feed into the main statements)
- Locate input cells vs. formula cells on each tab

#### Understanding Template Structure

Before populating a template, familiarize yourself with its existing layout to ensure data is entered in the correct locations and formulas remain intact.

**Identifying Row Structure**
- Locate the model title at top of each tab
- Identify section headers and their visual separation
- Find the units row indicating $ millions, %, x, etc.
- Note column headers distinguishing Actuals vs. Estimates periods
- Confirm period labels (e.g., FY2024A, FY2025E)
- Identify input cells vs. formula cells (typically distinguished by font color)

**Identifying Column Structure**
- Confirm line item labels in leftmost column
- Verify historical years precede projection years
- Note the visual border separating historical from projected periods
- Check for consistent column order across all tabs

**Working with Named Ranges**
Templates often use named ranges for key inputs and outputs. Before entering data:
- Review existing named ranges in the template (Formulas → Name Manager in Excel)
- Common named ranges include: Revenue growth rates, cost percentages, key outputs (Net Income, EBITDA, Total Debt, Cash), scenario selector cell
- Ensure inputs are entered in cells that feed into these named ranges

#### Projection Period
- Templates typically project 5 years forward from last historical year
- Verify historical (A) vs. projected (E) columns are clearly separated
- Confirm columns use fiscal year notation (e.g., FY2024A, FY2025E)

### Margin Analysis

**Note: The following margin analysis should only be performed if prompted by the user or if the template explicitly requires it. If no prompt is given, skip this section.**

Calculate and display profitability margins on the Income Statement (IS) tab to track operational efficiency and enable peer comparison.

#### Core Margins to Include

| Margin | Formula | What It Measures |
|--------|---------|------------------|
| Gross Margin | Gross Profit / Revenue | Pricing power, production efficiency |
| EBITDA Margin | EBITDA / Revenue | Core operating profitability |
| EBIT Margin | EBIT / Revenue | Operating profitability after D&A |
| Net Income Margin | Net Income / Revenue | Bottom-line profitability |

#### Income Statement Layout with Margins

Display margin percentages directly below each profit line item:
- Gross Margin % below Gross Profit
- EBIT Margin % below EBIT
- EBITDA Margin % below EBITDA
- Net Income Margin % below Net Income

### Credit Metrics

**Note: The following Credit analysis should only be performed if prompted by the user or if the template explicitly requires it. If no prompt is given, skip this section.**

Calculate and display credit/leverage metrics on the Balance Sheet (BS) tab to assess financial health, debt capacity, and covenant compliance.

#### Core Credit Metrics to Include

| Metric | Formula | What It Measures |
|--------|---------|------------------|
| Total Debt / EBITDA | Total Debt / LTM EBITDA | Leverage multiple |
| Net Debt / EBITDA | (Total Debt - Cash) / LTM EBITDA | Leverage net of cash |
| Interest Coverage | EBITDA / Interest Expense | Ability to service debt |
| Debt / Total Cap | Total Debt / (Total Debt + Equity) | Capital structure |
| Debt / Equity | Total Debt / Total Equity | Financial leverage |
| Current Ratio | Current Assets / Current Liabilities | Short-term liquidity |
| Quick Ratio | (Current Assets - Inventory) / Current Liabilities | Immediate liquidity |

#### Credit Metric Hierarchy Checks

Validate that Upside shows strongest credit profile:
- Leverage: Upside < Base < Downside (lower is better)
- Coverage: Upside > Base > Downside (higher is better)
- Liquidity: Upside > Base > Downside (higher is better)

#### Covenant Compliance Tracking

If debt covenants are known, add explicit compliance checks comparing actual metrics to covenant thresholds.

### Scenario Analysis (Base / Upside / Downside)

Use a scenario toggle (dropdown) in the Assumptions tab with CHOOSE or INDEX/MATCH formulas.

| Scenario | Description |
|----------|-------------|
| Base Case | Management guidance or consensus estimates |
| Upside Case | Above-guidance growth, margin expansion |
| Downside Case | Below-trend growth, margin compression |

**Key Drivers to Sensitize**: Revenue growth, Gross margin, SG&A %, DSO/DIO/DPO, CapEx %, Interest rate, Tax rate.

**Scenario Audit Checks**: Toggle switches all statements, BS balances in all scenarios, Cash ties out, Hierarchy holds (Upside > Base > Downside for NI, EBITDA, FCF, margins).

### SEC Filings Data Extraction

If the template specifically requires pulling data from SEC filings (10-K, 10-Q), see [references/sec-filings.md](references/sec-filings.md) for detailed extraction guidance. This reference is only needed when populating templates with public company data from regulatory filings.

### Completing Model Templates

This section provides general guidance for completing any 3-statement financial model template while preserving existing formulas and ensuring data integrity.

#### Step 1: Analyze the Template Structure

Before entering any data, thoroughly review the template to understand its architecture:

**Identify Input vs. Formula Cells**
- Look for visual cues (font color, cell shading) that distinguish input cells from formula cells
- Common conventions: Blue font = inputs, Black font = formulas, Green font = links to other sheets
- Use Excel's Trace Precedents/Dependents (Formulas → Trace Precedents) to understand cell relationships
- Check for named ranges that may control key inputs (Formulas → Name Manager)

**Map the Template's Flow**
- Identify which tabs feed into others (e.g., Assumptions → IS → BS → CF)
- Note any supporting schedules and their linkages to main statements
- Document the template's specific line items and structure before populating

#### Step 2: Filling in Data Without Breaking Formulas

**Golden Rules for Data Entry**

| Rule | Description |
|------|-------------|
| Only edit input cells | Never overwrite cells containing formulas unless intentionally replacing the formula |
| Preserve cell references | When copying data, use Paste Values (Ctrl+Shift+V) to avoid overwriting formulas with source formatting |
| Match the template's units | Verify if template uses thousands, millions, or actual values before entering data |
| Respect sign conventions | Follow the template's existing sign convention (e.g., expenses as positive or negative) |
| Check for circular references | If the template uses iterative calculations, ensure Enable Iterative Calculation is turned on |

**Safe Data Entry Process**
1. Identify the exact cells designated for input (usually highlighted or labeled)
2. Enter historical data first, then verify formulas are calculating correctly for those periods
3. Enter assumption drivers that feed forecast calculations
4. Review calculated outputs to confirm formulas are working as intended
5. If a formula cell must be modified, document the original formula before making changes

**Handling Pre-Built Formulas**
- If formulas reference cells you haven't populated yet, expect temporary errors (#REF!, #DIV/0!) until all inputs are complete
- When formulas produce unexpected results, trace precedents to identify missing or incorrect inputs
- Never delete rows/columns without checking for formula dependencies across all tabs

#### Step 3: Validating Formulas

**Formula Integrity Checks**

Before relying on template outputs, validate that formulas are functioning correctly:

| Check Type | Method |
|------------|--------|
| Trace precedents | Select a formula cell → Formulas → Trace Precedents to verify it references correct inputs |
| Trace dependents | Verify key inputs flow to expected output cells |
| Evaluate formula | Use Formulas → Evaluate Formula to step through complex calculations |
| Check for hardcodes | Projection formulas should reference assumptions, not contain hardcoded values |
| Test with known values | Input simple test values to verify formulas produce expected results |
| Cross-tab consistency | Ensure the same formula logic applies across all projection periods |

**Common Formula Issues to Watch For**
- Mixed absolute/relative references causing incorrect results when copied across periods
- Broken links to external files or deleted ranges (#REF! errors)
- Division by zero in early periods before revenue ramps (#DIV/0! errors)
- Circular reference warnings (may be intentional for interest calculations)
- Inconsistent formulas across projection columns (use Ctrl+\ to find differences)

**Validating Cross-Tab Linkages**
- Confirm values that appear on multiple tabs are linked (not duplicated)
- Verify schedule totals tie to corresponding line items on main statements
- Check that period labels align across all tabs

#### Step 4: Quality Checks by Sheet

Perform these validation checks on each sheet after populating the template:

**Income Statement (IS) Quality Checks**
- Revenue figures match source data for historical periods
- All expense line items sum to reported totals
- Subtotals (Gross Profit, EBIT, EBT, Net Income) calculate correctly
- Tax calculation logic is appropriate (handles losses correctly)
- Forecast drivers reference assumptions tab (no hardcodes)
- Period-over-period changes are directionally reasonable

**Balance Sheet (BS) Quality Checks**
- Assets = Liabilities + Equity for every period (primary check)
- Cash balance matches Cash Flow Statement ending cash
- Working capital accounts tie to supporting schedules (if applicable)
- Retained Earnings rolls forward correctly: Prior RE + Net Income - Dividends +/- Adjustments = Ending RE
- Debt balances tie to debt schedule (if applicable)
- All balance sheet items have appropriate signs (assets positive, most liabilities positive)

**Cash Flow Statement (CF) Quality Checks**
- Net Income at top of CFO matches Income Statement Net Income
- Non-cash add-backs (D&A, SBC, etc.) tie to their source schedules/statements
- Working capital changes have correct signs (increase in asset = use of cash = negative)
- CapEx ties to PP&E schedule or fixed asset roll-forward
- Financing activities tie to changes in debt and equity accounts on BS
- Ending Cash matches Balance Sheet Cash
- Beginning Cash equals prior period Ending Cash

**Supporting Schedule Quality Checks**
- Opening balances equal prior period closing balances
- Roll-forward logic is complete (Beginning + Additions - Deductions = Ending)
- Schedule totals tie to main statement line items
- Assumptions used in calculations match Assumptions tab

#### Step 5: Cross-Statement Integrity Checks

After validating individual sheets, confirm the three statements are properly integrated:

| Check | Formula | Expected Result |
|-------|---------|-----------------|
| Balance Sheet Balance | Assets - Liabilities - Equity | = 0 |
| Cash Tie-Out | CF Ending Cash - BS Cash | = 0 |
| Net Income Link | IS Net Income - CF Starting Net Income | = 0 |
| Retained Earnings | Prior RE + NI - Dividends - BS Ending RE | = 0 (adjust for SBC/other items as needed) |

#### Step 6: Final Review

Before considering the model complete:
- Toggle through all scenarios (if applicable) to verify checks pass in each case
- Review all #REF!, #DIV/0!, #VALUE!, and #NAME? errors and resolve or document
- Confirm all input cells have been populated (search for placeholder values)
- Verify units are consistent across all tabs
- Save a clean version before making any additional modifications

### Model Validation and Audit

This section consolidates all validation checks and audit procedures for completed templates.

#### Core Linkages (Must Always Hold)

See [references/formulas.md](references/formulas.md) for all formula details.

| Check | Formula | Expected Result |
|-------|---------|-----------------|
| Balance Sheet Balance | Assets - Liabilities - Equity | = 0 |
| Cash Tie-Out | CF Ending Cash - BS Cash | = 0 |
| Cash Monthly vs Annual | Closing Cash (Monthly) - Closing Cash (Annual) | = 0 |
| Net Income Link | IS Net Income - CF Starting Net Income | = 0 |
| Retained Earnings | Prior RE + NI + SBC - Dividends - BS Ending RE | = 0 |
| Equity Financing | ΔCommon Stock/APIC (BS) - Equity Issuance (CFF) | = 0 |
| Year 0 Equity | Equity Raised (Year 0) - Beginning Equity Capital (Year 1) | = 0 |

#### Sign Convention Reference

| Statement | Item | Sign Convention |
|-----------|------|-----------------|
| CFO | D&A, SBC | Positive (add-back) |
| CFO | ΔAR (increase) | Negative (use of cash) |
| CFO | ΔAP (increase) | Positive (source of cash) |
| CFI | CapEx | Negative |
| CFF | Debt issuance | Positive |
| CFF | Debt repayments | Negative |
| CFF | Dividends | Negative |

#### Circular Reference Handling

Interest expense creates circularity: Interest → Net Income → Cash → Debt Balance → Interest

Enable iterative calculation in Excel: File → Options → Formulas → Enable iterative calculation. Set maximum iterations to 100, maximum change to 0.001. Add a circuit breaker toggle in Assumptions tab.

#### Check Categories

**Section 1: Currency Consistency**
- Currency identified and documented in Assumptions
- All tabs use consistent currency symbol and scale
- Units row matches model currency

**Section 2: Balance Sheet Integrity**
- Assets = Liabilities + Equity (for each period)
- Formula: Assets - Liabilities - Equity (must = 0)

**Section 3: Cash Flow Integrity**
- Cash ties to BS (CF Ending Cash = BS Cash)
- Cash Monthly vs Annual: Closing Cash (Monthly) = Closing Cash (Annual)
- NI ties to IS (CF Net Income = IS Net Income)
- D&A ties to schedule
- SBC ties to IS
- ΔAR, ΔInventory, ΔAP tie to WC schedule
- CapEx ties to DA schedule

**Section 4: Retained Earnings**
- RE roll-forward check: Prior RE + NI + SBC - Dividends = Ending RE
- Show component breakdown for debugging

**Section 5: Working Capital**
- AR, Inventory, AP tie to BS
- DSO, DIO, DPO reasonability checks (flag if outside normal ranges)

**Section 6: Debt Schedule**
- Total Debt ties to BS (Current + LT Debt)
- Interest calculation ties to IS

**Section 6b: Equity Financing**
- Equity issuance proceeds tie to BS Common Stock/APIC increase
- Cash increase from equity = Equity account increase (must balance)
- Equity Raise Tie-Out: ΔCommon Stock/APIC (BS) = Equity Issuance (CFF) (must = 0)
- Year 0 Equity Tie-Out: Equity Raised (Year 0) = Beginning Equity Capital (Year 1)

**Section 6c: NOL Schedule**
- Beginning NOL (Year 1 / Formation) = 0 (new business starts with zero NOL)
- NOL increases only when EBT < 0 (losses must be realized to generate NOL)
- DTA ties to BS (NOL Schedule DTA = BS Deferred Tax Asset)
- NOL utilization ≤ 80% of EBT (post-2017 federal limitation)
- NOL balance is non-negative (cannot utilize more than available)
- NOL generated only when EBT < 0
- Tax expense = 0 when taxable income ≤ 0

**Section 7: Scenario Hierarchy**
- Absolute metrics: Upside > Base > Downside (NI, EBITDA, FCF)
- Margins: Upside > Base > Downside (GM%, EBITDA%, NI%)
- Credit metrics: Upside < Base < Downside for leverage (inverted)

**Section 8: Formula Integrity**
- COGS, S&M, G&A, R&D, SBC driven by % of Revenue (no hardcodes)
- Consistent formulas across projection years
- No #REF!, #DIV/0!, #VALUE! errors

**Section 9: Credit Metric Thresholds**
- Flag metrics as Green/Yellow/Red based on covenant thresholds
- Summary of any red flags

#### Master Check Formula

Aggregate all section statuses into a single master check:
- If all sections pass → "✓ ALL CHECKS PASS"
- If any section fails → "✗ ERRORS DETECTED - REVIEW BELOW"

#### Quick Debug Workflow

When Master Status shows errors:
1. Scroll to find red-highlighted sections
2. Identify which check category has failures
3. Navigate to source tab to investigate
4. Fix the underlying issue
5. Return to Checks tab to verify resolution

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
