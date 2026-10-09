---
name: datapack-builder
description: 投行数据包，汇总目标公司的历史财务数据、估值倍数和市场数据。触发词：数据包制作、Datapack Builder、数据包、投行、尽调。当用户需要数据包制作相关分析时使用。
agent_created: true
version: 2.0.0
category: investment-banking
disable-model-invocation: true
---

# 数据包制作（Datapack Builder）

> 分类：投资银行 | 技能 id：`datapack-builder`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **数据包制作** 技能

请提供您要分析的标的信息（如股票代码、行业名称、财务数据或相关文件），我将为您投行数据包，汇总目标公司的历史财务数据、估值倍数和市场数据。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

Build professional, standardized financial data packs for private equity, investment banking, and asset management. Transform financial data from CIMs, offering memorandums, SEC filings, web search, or MCP server access into polished Excel workbooks ready for investment committee review.

**Important:** Use the xlsx skill for all Excel file creation and manipulation throughout this workflow.

### CRITICAL SUCCESS FACTORS

Every data pack must achieve these standards. Failure on any point makes the deliverable unusable.

#### 1. Data Accuracy (Zero Tolerance for Errors)
- Trace every number to source document with page reference
- Use formula-based calculations exclusively (no hardcoded values)
- Cross-check subtotals and totals for internal consistency
- Verify balance sheet balances: Assets = Liabilities + Equity
- Confirm cash flow ties to balance sheet changes

#### 2. ESSENTIAL RULES

**RULE 1: Financial data (measuring money) → Currency format with $**
Triggers: Revenue, Sales, Income, EBITDA, Profit, Loss, Cost, Expense, Cash, Debt, Assets, Liabilities, Equity, Capex
Format: $#,##0.0 for millions, $#,##0 for thousands
Negatives: $(123.0) NOT -$123

**RULE 2: Operational data (counting things) → Number format, NO $**
Triggers: Units, Stores, Locations, Employees, Customers, Square Feet, Properties, Headcount
Format: #,##0 with commas
Negatives: (123) consistent with rest of table

**RULE 3: Percentages (rates and ratios) → Percentage format**
Triggers: Margin, Growth, Rate, Percentage, Yield, Return, Utilization, Occupancy
Format: 0.0% for one decimal place
Display: 15.0% NOT 0.15

**RULE 4: Years → Text format to prevent comma insertion**
Format: Text or custom to prevent 2,024
Display: 2020, 2021, 2022, 2023A, 2024E

**RULE 5: When context is mixed, each metric gets its own appropriate format**
Example:
```
Segment Analysis, 2022, 2023, 2024
Retail Revenue, $50.0, $55.0, $60.0
  Stores, 100, 110, 120
  Revenue per Store, $0.5, $0.5, $0.5
```
Revenue and per-store metrics use $, Store count uses number format.

**RULE 6: Use formulas for all calculations → Never hardcode calculated values**
All subtotals, totals, ratios, and derived metrics must be formula-based, not hardcoded values. This ensures accuracy and allows for dynamic updates.

#### 3. Professional Presentation Standards

**Formatting Standards:**

**Color Scheme - Two Layers:**

**Layer 1: Font Colors (MANDATORY from xlsx skill)**
- **Blue text (RGB: 0,0,255)**: ALL hardcoded inputs (historical data, assumptions), NOT normal text
- **Black text (RGB: 0,0,0)**: ALL formulas and calculations
- **Green text (RGB: 0,128,0)**: Links to other sheets

**Layer 2: Fill Colors (Optional for enhanced presentation)**
- Fill colors are optional and should only be applied if requested by the user or if enhancing presentation
- If the user requests colors or professional formatting, use this standard scheme:
  - **Section headers**: Dark blue (RGB: 68,114,196) background with white text
  - **Sub-headers/column headers**: Light blue (RGB: 217,225,242) background with black text
  - **Input cells**: Light green/cream (RGB: 226,239,218) background with blue text
  - **Calculated cells**: White background with black text
- Users can override with custom brand colors if specified

**How the layers work together (if fill colors are used):**
- Input cell: Blue text + light green fill = "User-entered data"
- Formula cell: Black text + white background = "Calculated value"
- Sheet link: Green text + white background = "Reference from another tab"

**Font color tells you WHAT it is. Fill color tells you WHERE it is (if used).**

**IMPORTANT:** Font colors from xlsx skill are mandatory. Fill colors are optional - default is white/no fill unless the user requests enhanced formatting or colors.

**Always apply:**
- Bold headers, left-aligned
- Numbers right-aligned
- 2-space indentation for sub-items
- Single underline above subtotals
- Double underline below final totals
- Freeze panes on row/column headers
- Minimal borders (only where structurally needed)
- Consistent font (typically Calibri or Arial 11pt)

**Never include:**
- Borders around every cell
- Multiple fonts or font sizes
- Charts unless specifically requested
- Excessive formatting or decoration

### Structural Consistency
Use the standard 8-tab structure unless explicitly instructed otherwise:
1. Executive Summary
2. Historical Financials (Income Statement)
3. Balance Sheet
4. Cash Flow Statement
5. Operating Metrics
6. Property/Segment Performance (if applicable)
7. Market Analysis
8. Investment Highlights

#### Tab 1: Executive Summary
Purpose: One-page overview for busy executives

Contents:
- Company overview (2-3 sentences on business model)
- Key investment highlights (3-5 bullet points)
- Financial snapshot table (Revenue, EBITDA, Growth for last 3 years + projections)
- Transaction overview if applicable
- Key metrics prominently displayed

Format: Clean, bold headers, minimal decoration, critical numbers emphasized

#### Tab 2: Historical Financials (Income Statement)
Purpose: Complete profit and loss history

Contents:
- Revenue breakdown by segment/product line
- Cost of goods sold / Cost of revenue
- Gross profit and gross margin %
- Operating expenses detailed (S&M, R&D, G&A)
- EBITDA and Adjusted EBITDA
- Below-the-line items (D&A, interest, taxes)
- Net income

Format:
- Years as columns (text format: 2020, 2021, 2022)
- $ millions or $ thousands (specify units clearly at top)
- Accounting format for all financial data
- Single underline above subtotals, double underline below net income
- Right-align all numbers

#### Tab 3: Balance Sheet
Purpose: Financial position at period end

Contents:
- Current assets (cash, AR, inventory, prepaid, other)
- Long-term assets (PP&E, intangibles, goodwill, other)
- Current liabilities (AP, accrued expenses, current portion of debt, other)
- Long-term liabilities (long-term debt, deferred taxes, other)
- Shareholders' equity (common stock, retained earnings, other)

Format:
- Verify formula: Assets = Liabilities + Equity
- Consistent date labeling
- Include working capital calculation
- Single underline above major subtotals, double underline for final totals

#### Tab 4: Cash Flow Statement
Purpose: Cash generation and use analysis

Contents:
- Operating cash flow (indirect method preferred)
- Investing cash flow (capex, acquisitions, asset sales)
- Financing cash flow (debt issuance/repayment, equity, dividends)
- Net change in cash
- Beginning and ending cash balances

Format:
- Link to income statement and balance sheet where possible
- Show reconciliation of net income to operating cash flow
- Clear labeling of cash uses (outflows) vs sources (inflows)

#### Tab 5: Operating Metrics
Purpose: Non-financial KPIs and operational data

Contents (industry-dependent):
- Unit volumes, customer counts, locations
- Productivity metrics (revenue per employee, per store, per unit)
- Capacity utilization
- Market share
- Customer retention/churn rates
- Industry-specific KPIs

**CRITICAL FORMAT NOTE:**
NO dollar signs on operational metrics. These are quantities, not currency.

Format:
- Clear units specified (customers, employees, stores, square feet, etc.)
- Whole numbers with commas: 1,250 NOT $1,250
- Percentages for rates: 95.0%
- Right-align numbers

#### Tab 6: Property/Segment Performance (if applicable)
Purpose: Detailed breakdown by business unit, property, or segment

Contents:
- Revenue and profitability by segment
- Key metrics by location/product
- Segment-specific KPIs
- Comparative performance analysis

Format: Consistent with financial tabs for revenue/EBITDA, number format for operational metrics

#### Tab 7: Market Analysis
Purpose: Industry context and competitive positioning

Contents:
- Market size and growth trends
- Competitive landscape overview
- Market share analysis
- Industry benchmarks and peer comparisons
- Regulatory environment if relevant

Format: Mix of narrative text and tables, cite sources for market data

#### Tab 8: Investment Highlights
Purpose: Narrative summary of key investment thesis points

Contents:
- Detailed writeup of competitive strengths
- Growth opportunities and strategic initiatives
- Risk factors and mitigation strategies
- Management assessment and track record
- Investment thesis summary

Format: Clear headers, bullet points, concise paragraphs

### STEP-BY-STEP WORKFLOW

#### Phase 1: Document Processing and Data Extraction

**Step 1.1: Analyze source data**
- Access source materials: uploaded documents, web search for public filings, or MCP server data
- Review data structure and identify key sections
- Locate financial statements (typically 3-5 years historical)
- Identify management projections if included
- Note fiscal year end date
- Flag any data quality issues immediately

**Step 1.2: Extract financial statements**
- Locate historical income statement data
- Extract balance sheet snapshots (year-end or quarter-end)
- Find cash flow statement
- Extract management projections if available
- Note all page references for traceability

**Step 1.3: Extract operating metrics**
- Identify non-financial KPIs relevant to industry
- Capture unit economics data
- Extract customer/location/capacity data
- Document growth metrics and trends

**Step 1.4: Extract market and industry data**
- Competitive positioning information
- Market size and growth rates
- Industry benchmark data
- Peer comparison information

**Step 1.5: Note key context**
- Transaction structure and rationale
- Management team background
- Investment highlights from source materials
- Risk factors and considerations
- Any data gaps or inconsistencies

#### Phase 2: Data Normalization and Standardization

**Step 2.1: Normalize accounting presentation**
- Ensure consistent line item names across all years
- Standardize revenue recognition treatment
- Identify and document one-time charges
- Create "Adjusted EBITDA" reconciliation if needed
- Note any accounting policy changes

**Step 2.2: Apply format detection logic**
For each data point, determine format based on full context:
- Read tab name, table title, column header, and row label
- Apply essential rules (see above)
- When uncertain, examine original source document
- Default to cleaner formatting (less is more)

**Step 2.3: Identify normalization adjustments**
Common adjustments to document:
- Restructuring charges (add back if truly non-recurring)
- Stock-based compensation (add back per industry standard)
- Acquisition-related costs (add back, specify amounts)
- Legal settlements or litigation costs (evaluate recurrence risk)
- Asset sales or impairments (exclude from operating results)
- Related party adjustments (normalize to market rates)
Note: Source citation format varies by data source (page numbers for documents, URLs for web sources, server references for MCP data)

**Step 2.4: Create adjustment schedule**
For every normalization:
- Document what was adjusted and why
- Cite source (document page number, URL, or data source reference)
- Quantify dollar impact by year
- Assess recurrence risk
- Show calculation from reported to adjusted figures

**Step 2.5: Verify data integrity**
- Confirm subtotals sum correctly using formulas
- Verify balance sheet balances
- Check cash flow ties to balance sheet changes
- Cross-check numbers across tabs for consistency
- Flag any discrepancies for investigation

#### Phase 3: Build Excel Workbook

**CRITICAL: Use xlsx skill for all Excel file manipulation. Read xlsx skill documentation before proceeding.**

**Step 3.1: Create standardized tab structure**
Create workbook with tabs:
- Executive Summary
- Historical Financials
- Balance Sheet
- Cash Flow
- Operating Metrics
- Property Performance (if applicable)
- Market Analysis
- Investment Highlights

**Step 3.2: Build each tab with proper formatting**
Apply formatting rules systematically:
- Headers: Bold, left-aligned, 11pt font
- Financial data: Currency format $#,##0.0 for millions
- Operational data: Number format #,##0 (no $)
- Percentages: 0.0% format
- Years: Text format to prevent comma insertion
- Negatives: Use accounting format with parentheses
- Underlines: Single above subtotals, double below totals

**Step 3.3: Insert formulas for calculations**
- All subtotals and totals must be formula-based
- Link balance sheet to income statement where appropriate
- Link cash flow to both income statement and balance sheet
- Create cross-tab references for validation
- Avoid hardcoding any calculated values

<correct_patterns>

#### Row Reference Tracking - Copy This Pattern

**Store row numbers when writing data, then reference them in formulas:**

```python
# ✅ CORRECT - Track row numbers as you write
revenue_row = row
write_data_row(ws, row, "Revenue", revenue_values)
row += 1

ebitda_row = row
write_data_row(ws, row, "EBITDA", ebitda_values)
row += 1

# Use stored row numbers in formulas
margin_row = row
for col in year_columns:
    cell = ws.cell(row=margin_row, column=col)
    cell.value = f"={get_column_letter(col)}{ebitda_row}/{get_column_letter(col)}{revenue_row}"
```

**For complex models, use a dictionary:**

```python
row_refs = {
    'revenue': 5,
    'cogs': 6,
    'gross_profit': 7,
    'ebitda': 12
}

# Later in formulas
margin_formula = f"=B{row_refs['ebitda']}/B{row_refs['revenue']}"
```

</correct_patterns>

<common_mistakes>

#### WRONG: Hardcoded Row Offsets

**Don't use relative offsets - they break when table structure changes:**

```python
# ❌ WRONG - Fragile offset-based references
formula = f"=B{row-15}/B{row-19}"  # What is row-15? What is row-19?

# ❌ WRONG - Magic numbers
formula = f"=B{current_row-10}*C{current_row-20}"
```

**Why this fails:**
- Breaks silently when you add/remove rows
- Impossible to verify correctness by reading code
- Creates debugging nightmares in the delivered Excel file

</common_mistakes>

**Step 3.4: Apply professional presentation**
- Freeze top row and first column on each data tab
- Set appropriate column widths (typically 12-15 characters)
- Right-align all numeric data
- Left-align all text and headers
- Add single/double underlines per accounting standards
- Ensure clean, minimal appearance

#### Phase 4: Scenario Building (if projections included)

**Management Case:**
Present company's projections as provided in source materials:
- Extract all management assumptions
- Document growth rates, margin expansion, capital requirements
- Note key drivers and sensitivities
- Flag any "hockey stick" inflections that require skepticism
- Present as "Management Case" with clear labeling

**Base Case (Risk-Adjusted):**
Apply conservative adjustments to management projections based on company-specific risk factors:
- Apply revenue growth haircut reflecting execution risk and historical forecast accuracy
- Moderate margin expansion assumptions based on industry benchmarks and operating leverage
- Increase capex assumptions if growth-dependent
- Add working capital requirements if understated
- Delay synergy realization if applicable, based on integration complexity
- Document all adjustments with rationale and supporting analysis

**Downside Case (optional but recommended for LBO analysis):**
Stress test scenario based on industry cyclicality and company vulnerabilities:
- Model revenue decline reflecting recession risk or competitive pressure
- Assume margin compression under stress (volume deleverage, pricing pressure)
- Test covenant compliance and liquidity
- Assess downside protection
- Document key risks being stress-tested

**Documentation requirements for scenarios:**
Create assumptions schedule showing:
- Key assumptions by scenario (revenue growth, margins, capex %)
- Rationale for each adjustment
- Sensitivity analysis on key variables
- Historical forecast accuracy if available
- Comparison to industry benchmarks

#### Phase 5: Quality Control and Validation

**Step 5.1: Data accuracy checks**
Validate:
- Every number traces to source (check spot samples, cite documents/URLs/servers)
- All calculations are formula-based (no hardcoded values)
- Subtotals and totals are mathematically correct
- Years display without commas (2024 NOT 2,024)
- No formula errors: #REF!, #VALUE!, #DIV/0!, #N/A

**Step 5.2: Format consistency checks**
Verify:
- Financial data has $ signs in format
- Operational data has NO $ signs
- Percentages display as % (15.0% not 0.15)
- Negative numbers use parentheses for financial data
- Headers are bold and left-aligned
- Numbers are right-aligned
- Years are text format

**Step 5.3: Structure and completeness checks**
Confirm:
- All required tabs present and properly sequenced
- Executive summary is concise (fits on one page)
- All key metrics captured comprehensively
- Logical flow from summary to detail
- Appropriate level of granularity in each tab
- No missing data or incomplete sections

**Step 5.4: Professional presentation checks**
Review:
- Minimal borders (only for structure)
- Consistent indentation (2 spaces for sub-items)
- Proper accounting underlines (single and double)
- Clean, professional appearance throughout
- Appropriate column widths (not too narrow or wide)

**Step 5.5: Documentation and assumptions checks**
Ensure:
- All normalization adjustments documented with rationale
- Source citations included (document page numbers, URLs, or data source references)
- Assumptions clearly stated and reasonable
- Executive summary accurate and impactful
- Filename includes company name and date

#### Phase 6: Final Delivery

**Step 6.1: Create executive summary**
Write concise, impactful summary including:
- Company overview: business model, products/services, geography (2-3 sentences)
- Key financial metrics: Revenue, EBITDA, Growth rates (table format)
- Investment highlights: 3-5 key strengths or opportunities
- Notable risks or considerations (briefly)
- Transaction context if applicable

**Step 6.2: Final file preparation**
- Save workbook with proper naming: CompanyName_DataPack_YYYY-MM-DD.xlsx

### NORMALIZATION PATTERNS

#### Common Adjustments to EBITDA

**1. Restructuring charges**
- Add back if truly non-recurring (facility closure, one-time severance)
- Do NOT add back if company restructures every year
- Document specific nature and rationale for non-recurrence
- Example: "2023 restructuring: $3.0M facility closure, documented in source materials, one-time event"

**2. Stock-based compensation**
- Industry standard: add back for private equity analysis
- Treat as non-cash operating expense
- Be consistent across all periods
- Note if unusually high or includes one-time grants

**3. Acquisition-related costs**
- Add back transaction fees, integration costs
- Document specific amounts by type
- Do not add back ongoing integration investments
- Cite source for each adjustment

**4. Legal settlements and litigation**
- Add back if truly isolated incident
- Assess recurrence risk (one settlement vs pattern of litigation)
- Document nature of settlement
- Consider if this is normal course of business

**5. Asset sales or impairments**
- Exclude gains/losses on asset sales from operating EBITDA
- Remove impairment charges if truly non-recurring
- Document what assets were sold/impaired and why
- Adjust revenue if assets generated operating income

**6. Related party adjustments**
- Normalize above-market related party expenses (rent, management fees)
- Adjust to market rates with supporting documentation
- Remove personal expenses run through business
- Document market rate comparison

#### Conservative vs Aggressive Normalization

**Management Case:**
- Include all adjustments management proposes
- Accept company's definition of "non-recurring"
- More aggressive EBITDA adjustments
- Use for understanding management's view

**Base Case (Recommended for investment decisions):**
- Only clearly non-recurring items
- Apply higher scrutiny to recurring "one-time" charges
- Exclude speculative adjustments
- More conservative, defensible to investment committee

### INDUSTRY-SPECIFIC ADAPTATIONS

#### Technology/SaaS
Key metrics to capture:
- ARR (Annual Recurring Revenue) and MRR
- Customer count by cohort
- CAC (Customer Acquisition Cost) and LTV (Lifetime Value)
- Churn rate (gross and net)
- Net revenue retention
- Rule of 40 (Growth % + EBITDA Margin %)
- Magic number (sales efficiency)

Format notes: ARR is currency ($), customer count is number (no $), rates are %

#### Manufacturing/Industrial
Key metrics to capture:
- Production capacity and capacity utilization %
- Units produced by product line
- Inventory turns
- Gross margin by product line
- Order backlog

Format notes: Units, capacity are numbers (no $), utilization is %, revenue/costs are currency

#### Real Estate/Hospitality
Key metrics to capture:
- Properties/rooms/square footage
- Occupancy rates %
- ADR (Average Daily Rate) - currency format
- RevPAR (Revenue per Available Room) - currency format
- NOI (Net Operating Income) - currency format
- Cap rates %
- FF&E reserve

Format notes: Rooms/sqft are numbers, occupancy is %, ADR/RevPAR are currency

#### Healthcare/Services
Key metrics to capture:
- Locations/facilities
- Providers/employees
- Patients/visits (volume metrics)
- Revenue per visit - currency
- Payor mix %
- Same-store growth %

Format notes: Locations/visits are numbers, revenue per visit is currency, rates are %

### FINAL DELIVERY CHECKLIST

Complete this checklist before delivering the data pack:

**Structure:**
- All required tabs present and in logical sequence
- Each tab has clear header and title
- Executive summary is concise (fits on one page)

**Data Accuracy:**
- All numbers trace to source (documents, URLs, or data servers)
- Source references documented for key figures (page numbers, URLs, etc.)
- All calculations are formula-based (no hardcoded calculated values)
- Subtotals and totals verified
- Balance sheet balances (Assets = Liabilities + Equity)
- No #REF!, #VALUE!, or #DIV/0! errors

**Formatting - Years and Numbers:**
- Years display correctly: 2020, 2021, 2022 (no commas)
- Financial data has $ signs: $50.0, $125.5
- Operational metrics have NO $ signs: 100 stores, 250 employees
- Percentages formatted correctly: 15.0%, 25.5%
- Negatives in parentheses: $(15.0) not -$15.0

**Formatting - Professional Standards:**
- Headers bold and left-aligned
- Numbers right-aligned
- Consistent indentation (2 spaces for sub-items)
- Single underline above subtotals
- Double underline below final totals
- Frozen panes on headers
- Consistent font throughout
- Minimal borders (only for structure)
- Clean, professional appearance throughout

**Content Completeness:**
- Financial statements complete (IS, BS, CF)
- Operating metrics comprehensively captured
- Normalization adjustments documented
- Assumptions clearly stated
- Executive summary clear, concise, and impactful
- Investment highlights compelling
- Market analysis provides context

**Documentation:**
- All normalization adjustments explained
- Every data cell cited from source with comments and links (document page numbers, URLs, or data source references)
- Assumptions documented with rationale
- Any data limitations noted
- Filename follows convention: CompanyName_DataPack_YYYY-MM-DD.xlsx

**Final Output:**
- File saved to outputs with proper naming convention
- All quality control checks passed

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
