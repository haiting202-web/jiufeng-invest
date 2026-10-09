---
name: pitch-deck
description: 投资路演演示文稿，用于融资或项目展示。触发词：路演材料、Pitch Deck、路演、融资、演示。当用户需要路演材料相关分析时使用。
agent_created: true
version: 2.0.0
category: investment-banking
disable-model-invocation: true
---

# 路演材料（Pitch Deck）

> 分类：投资银行 | 技能 id：`pitch-deck`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **路演材料** 技能

请输入目标公司代码和路演主题，我将为您准备估值工作簿和路演材料。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

### Reference Files

**Read all reference files at task start before beginning any work.** These contain critical patterns and anti-patterns that will affect your approach. Do not wait until you encounter issues.

| File | Purpose |
|------|---------|
| [`formatting-standards.md`](reference/formatting-standards.md) | Text, bullets, tables, charts, alignment |
| [`slide-templates.md`](reference/slide-templates.md) | Content mapping guidance for common slide types |
| [`xml-reference.md`](reference/xml-reference.md) | PowerPoint XML patterns for tables, shapes, arrows |
| [`calculation-standards.md`](reference/calculation-standards.md) | Financial formulas for verification (CAGR, consensus) |

---

### Workflow Decision Tree

**What type of task is this?**

```
┌─ Populating empty template with source data?
│  └─→ Follow "Template Population Workflow" below
│
├─ Editing existing populated slides?
│  └─→ Extract current content, modify, revalidate
│
└─ Fixing formatting issues on existing slides?
   └─→ See "Common Failures" table, apply targeted fixes
```

---

### ⚠️ Critical Rendering Limitation

**LibreOffice is used for validation but DOES NOT render PowerPoint files accurately.** It will mangle fonts, gradients, shape positions, text wrapping, and some table formatting.

**What this means:** A slide that passes visual validation in LibreOffice may still have issues in Microsoft PowerPoint. The validation loop catches structural issues (missing content, broken tables, placeholder formatting retained) but **cannot** catch font substitution, subtle alignment shifts, or gradient problems.

**Required action:** Always include this statement when delivering output:
> "This file was validated using LibreOffice. Please review in Microsoft PowerPoint before distribution, as rendering differences may exist."

---

### Template Population Workflow

Copy and track progress:

```
Pitch Deck Progress:
- [ ] Phase 1: Extract and validate source data
- [ ] Phase 2: Map content to template sections
- [ ] Phase 3: Populate slides with proper formatting
- [ ] Phase 4: Validate → Fix → Repeat until clean
- [ ] Phase 5: Final verification
```

#### Phase 1: Data Extraction
1. **Create backup** of original template before any modifications — copy to `[filename]_backup.pptx`. Direct XML editing or unexpected errors can corrupt files.
2. Identify all source materials (Excel, CSV, PDF reports, Word documents, databases, web sources)
3. Extract relevant data points from each source
4. Validate all numbers against original sources
5. Standardize units and currency (convert all figures to the primary unit/currency used in the template)
6. Note any calculations that need verification → see [`calculation-standards.md`](reference/calculation-standards.md) for formulas

#### Phase 2: Content Mapping
1. **Open and visually review the template** — understand its structure, style, and existing content before modifying
2. Analyze template structure — identify all placeholder areas and content boxes
3. Map source data to corresponding template sections → see [`slide-templates.md`](reference/slide-templates.md) for mapping guidance
4. Identify placeholder guidance boxes (colored instruction boxes from task creator)
5. Note any data gaps or mismatches → see [`slide-templates.md`](reference/slide-templates.md#handling-data-template-mismatches) for resolution

#### Phase 3: Template Population
1. **Remove or reformat placeholder boxes** — colored instruction boxes show WHAT to create, not HOW to format. Delete them and create properly formatted content in their place. See [Critical Anti-Patterns](#critical-anti-patterns-never-do-these).
2. Populate each section with mapped content (focus on content first)
3. **Then apply formatting** to match template style → see [`formatting-standards.md`](reference/formatting-standards.md)
4. Create tables as actual table objects (NEVER use pipe/tab-separated text) → see [`xml-reference.md`](reference/xml-reference.md#table-implementation)
5. Create arrows/shapes as PowerPoint objects → see [`xml-reference.md`](reference/xml-reference.md#arrow-shapes)
6. Insert company logo if provided in task files; if not available, flag to user: "[LOGO NOT PROVIDED - please supply company logo]"

#### Phase 4: Validate → Fix → Repeat

**This is a feedback loop. Repeat until all checks pass OR escalation is triggered.**

```bash
# Convert to images for visual validation
soffice --headless --convert-to pdf presentation.pptx
pdftoppm -jpeg -r 150 presentation.pdf slide
```

**Validation checklist (check each slide image):**
- [ ] Text readable against background?
- [ ] Tables are actual objects (columns aligned, NOT pipe/tab-separated text)?
- [ ] Charts/tables fill designated areas?
- [ ] Bullet formatting consistent within sections?
- [ ] Font sizes match across same-level boxes?
- [ ] No content beyond slide boundaries?
- [ ] **No placeholder formatting retained** (no large colored boxes with data dumped in)?
- [ ] **No text-based "tables"** (no `|` or tab separators creating fake columns)?
- [ ] **Cross-slide consistency**: Same metrics/figures identical across all slides where they appear?

**Fix cycle protocol:**

| Cycle | Action |
|-------|--------|
| 1 | Fix all identified issues, re-validate |
| 2 | Fix remaining issues, re-validate |
| 3 | If issues persist, document remaining problems and escalate to user |

**After 3 cycles, if issues remain:**
1. List each unresolved issue with slide number and description
2. Explain what was attempted
3. Deliver the file with explicit disclaimer: "The following issues could not be resolved automatically: [list]. Manual review required."

**Do not** continue cycling indefinitely. Some issues (font rendering, complex shape alignment) may require manual intervention in PowerPoint.

#### Phase 5: Final Verification

Run through the [Final Quality Checklist](#final-quality-checklist) before delivering.

---

### Quick Reference Tables

#### Bullet Symbols

| Context | Symbol | Usage |
|---------|--------|-------|
| Included/Positive | ✓ | Items within scope, features present |
| Excluded/Negative | × | Items outside scope, features absent |
| Neutral list | • | General enumeration, commentary |
| Numbered sequence | 1. 2. 3. | Process steps, rankings |
| Sub-bullets | – | Secondary points under main bullets |

#### Slide Hierarchy Levels (Typical)

These are typical ranges—adjust based on template specifications:

| Level | Examples | Typical Size | Style |
|-------|----------|--------------|-------|
| Title | Slide title | 40-48pt | Bold |
| Subtitle | Market definition, slide descriptor | 18-22pt | Bold |
| Section Header | "Key Projections", "Commentary" | 14-16pt | Regular |
| Block Label | "Segments Included", "Definition" sidebar | 12-14pt | Regular |
| Block Content | Bullet points, body text | 11-14pt | Regular |
| Table Header | Column headers | 10-12pt | Bold |
| Table Body | Cell content | 9-11pt | Regular |
| Footnotes | Sources, notes | 8-9pt | Italic |

#### Font Consistency Matching

Boxes at the **same hierarchy level** MUST use identical font sizes:

| Same Level | Must Match With |
|------------|-----------------|
| "Segments Included" | "Segments Excluded" |
| "Definition" | "Scope Rationale" |
| Left column bullets | Right column bullets |
| All block labels | Each other |
| All section headers | Each other |

#### Rounding for Presentation

These are **typical conventions** — adjust based on the magnitude of values and template style:

| Value Type | Typical Rounding | Example |
|------------|------------------|---------|
| Large market sizes ($10bn+) | Nearest $1bn | 18.5 → $19bn |
| Smaller market sizes (<$10bn) | Nearest $0.5bn or $0.1bn | 2.3 → $2.5bn |
| Size ranges | Match precision of sources | 14.9-22.1 → $15-22bn |
| CAGR | Whole % or 0.5% | 16.4% → 16% or 16.5% |
| Market share | Nearest 5% or match source | 21.4% → 20% |
| Multiples | 1 decimal | 9.69 → 9.7x |

**Principle:** Rounding should not materially change the figure. For smaller values, use finer precision.

#### Text Density Rules

- Max 6-7 bullets per content box
- Max 2 lines per bullet point
- Parenthetical examples: same line or indented below
- No orphan words (single word on new line)

#### Alignment Principles

**Vertically stacked boxes** must have identical:
- Left margin position, bullet indentation, text start position, box width

**Horizontally adjacent boxes** must have identical:
- Top position, height (where possible), internal padding

#### Multi-Slide Consistency

When the same data appears on multiple slides:
- Use identical figures, formatting, and terminology
- If a metric is updated on one slide, update all occurrences
- Cross-reference during validation to catch mismatches

---

### MUST Requirements

These requirements are non-negotiable regardless of template:

| Requirement | Details |
|-------------|---------|
| **Text Readability** | All text MUST have sufficient contrast with background. Examples: white/light text on dark blue, dark green, black backgrounds; black/dark text on white, light gray, light yellow backgrounds. |
| **Actual Table Objects** | Tabular data MUST be table objects, not tab-separated text. See [`xml-reference.md`](reference/xml-reference.md#table-implementation). |
| **Proper Chart/Table Sizing** | Pasted visuals MUST fill designated area. See [`formatting-standards.md`](reference/formatting-standards.md#chart-and-image-handling). |
| **Consistent Formatting** | Bullets within section MUST match (symbol, size, indent). Same-level boxes MUST use same font size. |
| **Content Boundaries** | All content MUST stay within slide edges. Footnote box width: ~32.5cm for 16:9, ~24cm for 4:3. |
| **No Placeholder Formatting** | Remove colored instruction boxes. Main body: dark text on light background per template. |

---

### Critical Anti-Patterns: NEVER DO THESE

These failures occur when placeholder formatting is mistaken for output formatting. Recognizing these patterns is essential.

#### Anti-Pattern 1: Populating Data INTO Placeholder Boxes

**What happens:** Template has colored instruction boxes (yellow, orange, etc.) with guidance text. Model replaces the guidance text with actual data BUT KEEPS THE COLORED BOX.

**Why it's wrong:** The colored box IS the placeholder. It tells you what content goes there. The output should have different formatting — typically dark text on white/light background, or properly styled shapes.

**Recognition test:** If your populated slide has large colored rectangles filled with data text, you have copied the placeholder format instead of replacing it.

**Critical distinction — two types of "placeholders":**

| Type | How to identify | What to do |
|------|-----------------|------------|
| **Instruction boxes** | Bright colors (yellow, orange), contains guidance text like "Insert X here", white/light text on colored background | DELETE the entire shape, then create new content with production formatting |
| **Layout placeholders** | Part of slide master/layout, neutral colors matching template theme, "Click to add text" | KEEP the shape, REPLACE the text content only |

If uncertain: check if the shape exists on an empty slide from the same template. Layout placeholders persist; instruction boxes are regular shapes.

#### Anti-Pattern 2: Text-Based "Tables"

**What happens:** Model creates table-like content using separator characters (`|`, tabs, spaces) instead of actual table objects.

**Why it's wrong:** This is NOT a table. Columns will never align properly, it cannot be formatted consistently, and it looks unprofessional.

**Recognition test:** If you're typing `|` characters or relying on spaces/tabs to create columns, you're creating text, not a table.

**MUST verify:** After creating any table, verify it is an actual table object. See [`xml-reference.md`](reference/xml-reference.md#critical-verify-tables-are-actual-table-objects) for verification methods.

#### Anti-Pattern 3: Inheriting Placeholder Contrast

**What happens:** Placeholder uses light text on colored background (e.g., white on yellow). Model populates data but keeps this color scheme, resulting in hard-to-read output.

**Why it's wrong:** Placeholder colors are deliberately distinct to signal "replace me." Production slides typically use dark text on light backgrounds for body content.

**Recognition test:** If your populated content has light/white text on bright colored backgrounds in body areas (not headers), you've inherited placeholder formatting.

**Correct approach:** Apply production formatting — typically dark text (#000000 or #333333) on white or light backgrounds for body content. Headers and accent areas may use brand colors.

#### Summary: Placeholder vs. Production

| Element | Placeholder (Input) | Production (Output) |
|---------|---------------------|---------------------|
| Instruction boxes | Colored background, guidance text | Removed or reformatted |
| Data areas | "[Insert data here]" text | Actual data with clean formatting |
| Tables | Description of what table should contain | Actual table object with rows/columns |
| Body text | Light text on colored background | Dark text on light background |

**The placeholder tells you WHAT to create, not HOW to format it.**

---

### Common Failures

For detailed explanations of the most critical failures, see [Critical Anti-Patterns](#critical-anti-patterns-never-do-these) above.

| Failure | Solution | Reference |
|---------|----------|-----------|
| Unstructured text dumps | Break into bullets (✓, ×, •) | [`formatting-standards.md`](reference/formatting-standards.md#bullet-point-structure) |
| Pipe/tab-separated "tables" | Create actual table objects — text with separators is NOT a table | [`xml-reference.md`](reference/xml-reference.md#table-implementation) |
| Poor text/background contrast | Audit every text element | — |
| Tiny pasted charts | Resize to fill area, paste chart only | [`formatting-standards.md`](reference/formatting-standards.md#proper-sizing-workflow) |
| Source data pasted with charts | Select only chart object before copy | — |
| Data dumped into placeholder boxes | Delete colored instruction boxes, create new properly formatted content | [Anti-Patterns](#critical-anti-patterns-never-do-these) |
| Inconsistent bullets | Define style once, apply to all | [`formatting-standards.md`](reference/formatting-standards.md#bullet-consistency) |
| Inconsistent fonts across boxes | Standardize same-level boxes | [`formatting-standards.md`](reference/formatting-standards.md#font-consistency) |
| Content overflow | Set explicit box widths (footnotes: 32.5cm for 16:9, 24cm for 4:3) | — |
| Missing logo | Use logo from task files; if not provided, flag to user | — |
| Remaining `[brackets]` | Search and replace all placeholders | — |
| Text arrows (→, ⟹) | Use PowerPoint shape objects | [`xml-reference.md`](reference/xml-reference.md#arrow-shapes) |

---

### Error Handling

**If PDF/image conversion fails:**
1. Check LibreOffice is installed: `which soffice`
2. Try alternative: `libreoffice --headless --convert-to pdf presentation.pptx`
3. If still failing, open in PowerPoint/LibreOffice manually and export

**If source data has inconsistencies or conflicts:**
1. **Priority order**: Use data explicitly provided in the task files first
2. If using data from other sources (web search, external documents), flag this to the user
3. Document any discrepancies explicitly
4. Add footnote explaining data source choice

**If calculations don't match source projections:**
1. Show your calculation methodology
2. Note the discrepancy and possible causes (different base year, methodology)
3. Present both values if material difference
4. Flag to user for resolution

---

### Table Structure Guidelines

When creating tables (MUST be actual table objects):

**Column Alignment:**
- Text columns: Left-aligned (header and content)
- Numeric columns: Right-aligned or center-aligned (header matches content)

**Header Row:**
- Bold text
- Shaded background (template's brand color)
- White or contrasting text

**Consensus/Total Row:**
- Bold text
- Separator line above
- Distinct background shading

**Width:** Fill designated section width completely.

For XML implementation, see [`xml-reference.md`](reference/xml-reference.md#table-implementation).

---

### Footnote Format

**Format:**
```
Sources: [Source 1] (Year), [Source 2] (Year).
Notes: (1) [First note]; (2) [Second note].
```

**Example:**
```
Sources: Grand View Research (2024), Mordor Intelligence (2024), Markets and Markets (2023).
Notes: (1) Excludes hardware revenue; (2) Includes both B2B and B2C segments.
```

All superscript numbers (¹, ², ³) in slide body MUST have corresponding Notes entries.

---

### Logo Placement

- Use logo file provided in task materials
- If no logo provided, flag to user: "[LOGO NOT PROVIDED - please supply company logo]"
- Position: typically top-right, consistent size across slides, must not overlap content

---

### Data Requirements by Slide Type

For detailed data requirements, formatting principles, and example column headers for each slide type, see [`slide-templates.md`](reference/slide-templates.md#common-slide-types-and-data-requirements).

Common slide types covered: Market Definition, Market Sizing/TAM, Competitive Landscape, Financial Summary, Transaction Comparables.

---

### Final Quality Checklist

Before delivering the populated template, verify:

#### Data Accuracy
- [ ] All figures match original source documents
- [ ] Calculated values verified against formulas (see [`calculation-standards.md`](reference/calculation-standards.md))
- [ ] Years and time periods are correct
- [ ] Company/competitor names spelled correctly
- [ ] Same figures are identical across all slides where they appear

#### Content Mapping
- [ ] Every template section populated with appropriate data
- [ ] No `[bracket]` placeholder text remaining
- [ ] All source citations included in footnotes
- [ ] Footnote numbers (¹²³) have corresponding Notes entries

#### Formatting
- [ ] Text readable against all backgrounds (sufficient contrast)
- [ ] Tables are actual table objects (NOT pipe/tab-separated text)
- [ ] Charts/tables fill designated areas (no thumbnails)
- [ ] Bullet formatting consistent within each section
- [ ] Font sizes match across same-level boxes
- [ ] No content extends beyond slide boundaries
- [ ] No placeholder boxes retained with data dumped inside
- [ ] No colored instruction boxes in final output

#### Template Compliance
- [ ] Placeholder instruction boxes reformatted or removed
- [ ] Formatting matches template style (colors, fonts)
- [ ] Logo present and correctly positioned
- [ ] Production formatting applied (dark text on light background for main content)

#### Final Step
- [ ] Recommend user validate in Microsoft PowerPoint before distribution (LibreOffice may render differently)

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
