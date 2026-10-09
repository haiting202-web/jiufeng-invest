---
name: strip-profile
description: 公司分部业务深度分析，各业务板块财务拆解和估值。触发词：分部业务分析、Strip Profile、分部、业务、分析。当用户需要分部业务分析相关分析时使用。
agent_created: true
version: 2.0.0
category: investment-banking
disable-model-invocation: true
---

# 分部业务分析（Strip Profile）

> 分类：投资银行 | 技能 id：`strip-profile`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **分部业务分析** 技能

请提供您要分析的标的信息（如股票代码、行业名称、财务数据或相关文件），我将为您公司分部业务深度分析，各业务板块财务拆解和估值。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

### Workflow

#### 1. Clarify Requirements
- **Ask the user**: Single-slide or multi-slide (3-4 slides)?
- **Ask the user**: Any specific focus areas or topics to emphasize?
- **Only after user confirms**, proceed to research

#### 2. Research & Planning
**Data Sources:**
- **Primary**: Company filings (BamSEC, SEC EDGAR - "Item 1. Business", MD&A), investor presentations, corporate website
- **Market data**: Bloomberg, FactSet, CapIQ (price, shares, market cap, net debt, EV, ownership)
- **Estimates**: FactSet/CapIQ consensus for NTM revenue, EBITDA, EPS
- **News**: Press releases from last 90 days, M&A activity, guidance changes

**Required Metrics:**
- **Financials**: Revenue, EBITDA, margins (%), EPS, FCF for ±3 years
- **Valuation**: Market Cap, EV, EV/Revenue, EV/EBITDA, P/E multiples
- **Growth**: YoY growth rates (%)
- **Ownership**: Top 5 shareholders with % ownership
- **Segments**: Product mix and/or geographic mix (% breakdown)

**Normalization:**
- Convert all amounts to consistent currency
- Scale consistently ($mm or $bn throughout, not mixed)

**Before Building:**
- Print outline to chat with 4-5 bullet points per item (actual numbers, no placeholders)
- Print style choices: fonts, colors (hex codes), chart types for each data set
- Get user alignment: "Does this outline and visual strategy align with your vision?"

#### 3. Slide-by-Slide Creation
**CRITICAL: You MUST create ONE slide at a time and get user approval before proceeding to the next slide.**

**For EACH slide:**
1. Create ONLY this one slide with PptxGenJS
2. **MANDATORY: Convert to image for review** - You MUST convert slides to images so you can visually verify them:
   ```bash
   soffice --headless --convert-to pdf presentation.pptx
   pdftoppm -jpeg -r 150 -f 1 -l 1 presentation.pdf slide
   ```
3. **MANDATORY VISUAL REVIEW**: You MUST carefully examine the rendered slide image before proceeding:
   - **Text overlap check**: Scan every text element - do any labels, bullets, or titles collide with each other?
   - **Text cutoff check**: Is any text truncated at boundaries? Are all words fully visible?
   - **Chart boundary check**: Do charts stay within their containers? Are ALL axis labels fully visible?
   - **Quadrant integrity**: Does content in one quadrant bleed into adjacent quadrants?
4. **If ANY overlap or cutoff is detected**: Fix immediately using these strategies in order:
   - **First**: Reduce font size (go down 1-2pt)
   - **Second**: Shorten text (abbreviate, remove less critical info)
   - **Third**: Adjust element positions or container sizes
   - **Re-render and verify again** - do not proceed until all text fits cleanly
5. Show slide image to user with download link
6. **STOP and wait for explicit user approval** before creating the next slide. Do NOT proceed until user confirms.

**YOU MUST CHECK FOR THESE SPECIFIC ISSUES ON EVERY PAGE:**
- Table rows colliding with text below them
- Chart x-axis labels cut off at bottom
- Long bullet points wrapping into adjacent content
- Quadrant content bleeding into adjacent quadrants
- Title text overlapping with content below
- Legend text overlapping with chart elements
- Footer/source text colliding with main content

---

### Slide Format Requirements

#### Information Density is Critical

**The #1 goal is MAXIMUM information density.** A busy executive should understand the entire company story in 30 seconds. Fill every quadrant to capacity.

**Per quadrant targets:**
- **Company Overview**: 6-8 bullets minimum (HQ, founded, employees, CEO/CFO, market cap, ticker, industry, key stat)
- **Business & Positioning**: 6-8 bullets (revenue drivers, products, market share %, competitive moat, customer count, geographic mix)
- **Key Financials**: Table with 8-10 rows OR chart + 4-5 key metrics (Revenue, EBITDA, margins, EPS, FCF, growth rates, valuation multiples)
- **Fourth quadrant**: 5-7 bullets (ownership %, recent M&A, developments, catalysts)

**Information packing techniques:**
- Combine related facts: "HQ: Austin, TX; Founded: 2003; 140K employees"
- Always include numbers: "$50B revenue" not "large revenue"
- Add context: "EBITDA margin: 25% (vs. 18% industry avg)"
- Include YoY changes: "Revenue: $125M (+28% YoY)"
- Use percentages: "Enterprise: 62% of revenue"

**If a quadrant looks sparse, add more:**
- Segment breakdowns with %
- Geographic revenue splits
- Customer concentration (top 10 = X%)
- Recent contract wins with $ values
- Guidance vs. consensus
- Insider ownership %

**Line spacing - use single textbox per section:**
```python
def add_section(slide, x, y, w, header_text, bullets, header_size=10, bullet_size=8):
    """Header + bullets in single textbox with natural spacing"""
    tb = slide.shapes.add_textbox(x, y, w, Inches(len(bullets) * 0.18 + 0.3))
    tf = tb.text_frame
    tf.word_wrap = True

    # Header paragraph
    p = tf.paragraphs[0]
    p.text = header_text
    p.font.bold = True
    p.font.size = Pt(header_size)
    p.font.color.rgb = RGBColor(0, 51, 102)
    p.space_after = Pt(6)  # Small gap after header

    # Bullet paragraphs
    for bullet in bullets:
        p = tf.add_paragraph()
        p.text = bullet
        p.font.size = Pt(bullet_size)
        p.space_after = Pt(3)
    return tb
```

**Key spacing principles:**
- Put header + bullets in SAME textbox (no separate header textbox)
- Use `space_after = Pt(6)` after header, `Pt(3)` between bullets
- Don't hardcode gaps - let paragraph spacing handle it naturally
- If content overflows, reduce font by 1pt rather than removing content

---

- **3-4 dense slides** - use quadrants, columns, tables, charts
- **Bullets for ALL body text** - NEVER paragraphs. **Use ONE textbox per section with all bullets inside** - do NOT create separate textboxes for each bullet point. Use PptxGenJS bullet formatting:
  ```javascript
  // CORRECT: Single textbox with bullet list - each array item becomes a bullet
  // Position in top-left quadrant (Company Overview) - after header with accent bar
  slide.addText(
    [
      { text: 'Headquarters: Austin, Texas; Founded 2003', options: { bullet: { indent: 10 }, breakLine: true } },
      { text: 'Employees: 140,000+ globally across 6 continents', options: { bullet: { indent: 10 }, breakLine: true } },
      { text: 'CEO: Elon Musk; CFO: Vaibhav Taneja', options: { bullet: { indent: 10 }, breakLine: true } },
      { text: 'Market Cap: $850B (#6 globally by market cap)', options: { bullet: { indent: 10 }, breakLine: true } },
      { text: 'Segments: Automotive (85%), Energy (10%), Services (5%)', options: { bullet: { indent: 10 } } }
    ],
    { x: 0.45, y: 0.95, w: 4.5, h: 2.6, fontSize: 11, fontFace: 'Arial', valign: 'top', paraSpaceAfter: 6 }
  );

  // WRONG: Multiple separate textboxes for each bullet - causes alignment issues
  // slide.addText('Headquarters: Austin', { x: 0.5, y: 1.0, bullet: true });
  ```

  **Bullet formatting tips:**
  - `bullet: { indent: 10 }` - controls bullet indentation (smaller = tighter)
  - `paraSpaceAfter: 6` - space after each paragraph in points
  - Pack multiple related facts into each bullet (e.g., "HQ: Austin; Founded: 2003")
  - Include specific numbers and percentages for information density
- **Title case** for titles (not ALL CAPS), left-aligned
- **Consistent fonts** everywhere including tables
- **Company's brand colors** - YOU MUST research actual brand colors via web search before creating slides. Do not guess or assume colors.
- **Follow brand guidelines if provided**

#### Visual Reference
See `examples/Nike_Strip_Profile_Example.pptx` for layout inspiration. Adapt colors to each company's brand.

---

### First Page Layout

Must pass "30-second comprehension test" for a busy executive.

#### Slide Setup (CRITICAL)
**Use 4:3 aspect ratio** (standard IB pitch book format):
```javascript
const pptx = new pptxgen();
pptx.layout = 'LAYOUT_4x3';  // 10" wide × 7.5" tall - MUST USE THIS
```

#### Slide Coordinate System
PptxGenJS uses inches. 4:3 slide = **10" wide × 7.5" tall**.
- **x**: horizontal position from left edge (0 = left, 10 = right)
- **y**: vertical position from top edge (0 = top, 7.5 = bottom)
- **Content must stay within bounds** - leave 0.3" margin on all sides

#### First Page Positioning (in inches)
```
┌─────────────────────────────────────────────────────────────────┐
│ y=0.2  Title: Company Name (Ticker)                             │
├────────────────────────────┬────────────────────────────────────┤
│ y=0.6  Company Overview    │ y=0.6  Business & Positioning      │
│ x=0.3, w=4.7               │ x=5.0, w=4.7                       │
│ h=3.0                      │ h=3.0                              │
├────────────────────────────┼────────────────────────────────────┤
│ y=3.7  Key Financials      │ y=3.7  Stock/Recent Developments   │
│ x=0.3, w=4.7               │ x=5.0, w=4.7                       │
│ h=3.5                      │ h=3.5                              │
└────────────────────────────┴────────────────────────────────────┘
                                                            y=7.5
```

#### Title Section (y=0.2)
**Company Name (Ticker)** - Example: `Tesla, Inc. (TSLA)`
```javascript
slide.addText('Tesla, Inc. (TSLA)', { x: 0.3, y: 0.2, w: 9.4, h: 0.35, fontSize: 18, bold: true });
```

#### 4-Quadrant Layout (y=0.6 to y=7.2)

| Quadrant | Position | Content |
|----------|----------|---------|
| **1** | x=0.3, y=0.6, w=4.7, h=3.0 | **Company Overview**: HQ, founded, key stats, business summary (4-5 bullets) |
| **2** | x=5.0, y=0.6, w=4.7, h=3.0 | **Business & Positioning**: revenue drivers, products/services, competitive position, growth drivers (4-5 bullets) |
| **3** | x=0.3, y=3.7, w=4.7, h=3.5 | **Key Financials**: Revenue, EBITDA, margins, EPS, FCF + Valuation (Mkt Cap, EV, multiples) — **table OR chart, not both** |
| **4** | x=5.0, y=3.7, w=4.7, h=3.5 | **For public companies**: 1Y stock price chart + top shareholders. **For private**: Recent developments or Ownership/M&A history |

#### Font Sizes - USE THESE EXACT VALUES
| Element | Size | Notes |
|---------|------|-------|
| Slide title | 24pt | Bold, company brand color |
| Quadrant headers | 14pt | Bold, with accent bar |
| Body/bullet text | 11pt | Regular weight |
| Table text | 10pt | Use 9pt for dense tables |
| Chart labels | 9pt | Keep labels short |
| Source/footer | 8pt | Bottom of slide |

**CRITICAL: If text overflows, REDUCE font size by 1pt and re-render.**

#### Visual Accents (REQUIRED)
Each quadrant header MUST have a colored accent bar to the left:
```javascript
// Add accent bar for quadrant header
slide.addShape(pptx.shapes.RECTANGLE, {
  x: 0.3, y: 0.6, w: 0.08, h: 0.25,
  fill: { color: 'E31937' }  // Use company brand color
});
slide.addText('Company Overview', {
  x: 0.45, y: 0.6, w: 4.5, h: 0.3, fontSize: 14, bold: true, fontFace: 'Arial'
});
```

**Visual elements to include:**
- Accent bars next to all section headers (brand color)
- Thin horizontal divider line between top and bottom quadrants
- Company logo in top-right corner if available
- Subtle gridlines in tables (light gray #CCCCCC)

#### First Page Formatting
- **Font: Arial** (or as specified by user/brand guidelines)
- **Quadrant titles**: Title Case (not ALL CAPS), e.g., "Company Overview" not "COMPANY OVERVIEW"
- **Bullets**: Bold key terms at start, e.g., "**Market Position:** Leading global manufacturer..."
- White background only — no boxes, fills, or shading
- Section headers: bold text, follow brand guidelines for styling
- All quadrants equally sized and aligned

---

### Subsequent Pages: Free-Form Layouts

- Two-column (40/60 or 50/50), full-slide charts, or sidebar layouts
- Each page elaborates on first page content
- Maintain consistent typography and color scheme
- Suggested flow: Products/Market → Financial Analysis → Leadership

---

### Charts (Multi-Slide Profiles)

**For multi-slide profiles**: Include 2-3 actual PptxGenJS charts. Never use placeholder divs or static images.

**For single-slide profiles**: Use tables for financials (more space-efficient). Only add a chart if it replaces the table, not in addition to it.

| Data Type | Chart Type |
|-----------|------------|
| Revenue trends | Line or column (multi-year) |
| Geographic breakdown | Horizontal bar |
| Product mix | Pie with percentages |
| Financial comparison | Column |
| Stock price (1Y daily) | Line |

#### Chart Code Examples

**Horizontal Bar (fits in bottom-right quadrant for 4:3 slide):**
```javascript
slide.addChart(pptx.charts.BAR, [{
  name: 'FY2024 Revenue by Region',
  labels: ['North America', 'EMEA', 'China', 'APLA'],
  values: [21.4, 13.6, 7.6, 6.7]
}], {
  x: 5.0, y: 4.1, w: 4.5, h: 3.0,  // Fits in bottom-right quadrant (4:3)
  barDir: 'bar', chartColors: ['FF6B35'], showValue: true,
  dataLabelFontSize: 10, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
  dataLabelFormatCode: '$#,##0.0B',
  title: 'Revenue by Geography', titleFontSize: 12, titleBold: true
});
```

**Pie Chart (fits in bottom-right quadrant for 4:3 slide):**
```javascript
slide.addChart(pptx.charts.PIE, [{
  name: 'Product Mix',
  labels: ['Footwear', 'Apparel', 'Equipment'],
  values: [68, 29, 3]
}], {
  x: 5.0, y: 4.1, w: 4.5, h: 3.0,  // Fits in bottom-right quadrant (4:3)
  showPercent: true, showLegend: true, legendPos: 'r',
  dataLabelFontSize: 10, legendFontSize: 10,
  chartColors: ['FF6B35', '2C2C2C', '4A4A4A'],
  title: 'Revenue Mix FY24', titleFontSize: 12, titleBold: true
});
```

**Line Chart (full width for subsequent slides):**
```javascript
slide.addChart(pptx.charts.LINE, [{
  name: 'Revenue ($B)',
  labels: ['FY21', 'FY22', 'FY23', 'FY24', 'FY25E'],
  values: [44.5, 46.7, 48.5, 51.4, 54.2]
}], {
  x: 0.3, y: 1.2, w: 9.4, h: 5.5,  // Full width for 4:3 slide
  chartColors: ['FF6B35'], showValue: true, lineSmooth: true,
  dataLabelFontSize: 11, catAxisLabelFontSize: 11, valAxisLabelFontSize: 11,
  title: 'Revenue Trend & Forecast', titleFontSize: 14, titleBold: true
});
```

---

### Financial Data Formatting

**Always use native PptxGenJS tables or charts - NEVER plain text prose or HTML tables.**

Use `slide.addTable()` for financial data (fits in bottom-left quadrant for 4:3 slide):
```javascript
// Add header with accent bar first
slide.addShape(pptx.shapes.RECTANGLE, {
  x: 0.3, y: 3.7, w: 0.08, h: 0.25, fill: { color: 'E31937' }
});
slide.addText('Key Financials & Valuation', {
  x: 0.45, y: 3.7, w: 4.5, h: 0.3, fontSize: 14, bold: true, fontFace: 'Arial'
});

// Financial data table
slide.addTable([
  [{ text: 'Metric', options: { bold: true, fill: '003366', color: 'FFFFFF' } },
   { text: 'FY24', options: { bold: true, fill: '003366', color: 'FFFFFF' } },
   { text: 'FY25E', options: { bold: true, fill: '003366', color: 'FFFFFF' } }],
  ['Revenue', '$51.4B', '$54.2B'],
  ['YoY Growth', '+6.0%', '+5.5%'],
  ['EBITDA', '$8.9B', '$9.5B'],
  ['EBITDA Margin', '17.3%', '17.5%'],
  ['EPS', '$3.42', '$3.75'],
  ['Market Cap', '$185B', '—'],
  ['EV/EBITDA', '12.5x', '11.7x']
], {
  x: 0.45, y: 4.1, w: 4.3, h: 3.0,  // Below header in bottom-left quadrant
  fontFace: 'Arial', fontSize: 10,
  border: { pt: 0.5, color: 'CCCCCC' },
  valign: 'middle',
  colW: [1.8, 1.25, 1.25]  // Column widths
});
```

❌ **Incorrect:** Plain text like `Note: FY2024 revenue growth +1.0%, Net Income $5.1B...`
❌ **Incorrect:** HTML tables that don't convert properly to PowerPoint

For projections, use Bear/Base/Bull case scenarios in structured tables.

---

### Quality Checklist

#### First Page
- [ ] Title section with company name, ticker, industry
- [ ] Exactly 4 equal quadrants below title
- [ ] All bullets, no paragraphs, 1 line max each
- [ ] Financials in table or chart (not both)

#### All Slides
- [ ] No text overflow or cutoff
- [ ] Consistent fonts and colors throughout
- [ ] Charts render correctly
- [ ] No placeholder text - all actual data
- [ ] Consistent scaling ($mm or $bn, not mixed)
- [ ] Sources cited
- [ ] Investment banking quality (GS/MS/JPM standard)

**Note:** Reference the **PPTX skill** for PowerPoint file creation.

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
