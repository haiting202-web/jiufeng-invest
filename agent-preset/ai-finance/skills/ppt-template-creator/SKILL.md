---
name: ppt-template-creator
description: 将用户提供的PPT模板转化为可复用的技能模板，自动提取布局和样式。触发词：投行PPT模板设计、PPT Template Creator、PPT、模板、设计。当用户需要投行PPT模板设计相关分析时使用。
agent_created: true
version: 2.0.0
category: financial-analysis
disable-model-invocation: true
---

# 投行PPT模板设计（PPT Template Creator）

> 分类：财务分析 | 技能 id：`ppt-template-creator`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **投行PPT模板设计** 技能

请提供您要分析的标的信息（如股票代码、行业名称、财务数据或相关文件），我将为您将用户提供的PPT模板转化为可复用的技能模板，自动提取布局和样式。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

**This skill creates SKILLS, not presentations.** Use this when a user wants to turn their PowerPoint template into a reusable skill that can generate presentations later. If the user just wants to create a presentation, use the `pptx` skill instead.

The generated skill includes:
- `assets/template.pptx` - the template file
- `SKILL.md` - complete instructions (no reference to this meta skill needed)

**For general skill-building best practices**, refer to the `skill-creator` skill. This skill focuses on PPT-specific patterns.

### Workflow

1. **User provides template** (.pptx or .potx)
2. **Analyze template** - extract layouts, placeholders, dimensions
3. **Initialize skill** - use the `skill-creator` skill to set up the skill structure
4. **Add template** - copy .pptx to `assets/template.pptx`
5. **Write SKILL.md** - follow template below with PPT-specific details
6. **Create example** - generate sample presentation to validate
7. **Package** - use the `skill-creator` skill to package into a .skill file

### Step 2: Analyze Template

**CRITICAL: Extract precise placeholder positions** - this determines content area boundaries.

```python
from pptx import Presentation

prs = Presentation(template_path)
print(f"Dimensions: {prs.slide_width/914400:.2f}\" x {prs.slide_height/914400:.2f}\"")
print(f"Layouts: {len(prs.slide_layouts)}")

for idx, layout in enumerate(prs.slide_layouts):
    print(f"\n[{idx}] {layout.name}:")
    for ph in layout.placeholders:
        try:
            ph_idx = ph.placeholder_format.idx
            ph_type = ph.placeholder_format.type
            # IMPORTANT: Extract exact positions in inches
            left = ph.left / 914400
            top = ph.top / 914400
            width = ph.width / 914400
            height = ph.height / 914400
            print(f"    idx={ph_idx}, type={ph_type}")
            print(f"        x={left:.2f}\", y={top:.2f}\", w={width:.2f}\", h={height:.2f}\"")
        except:
            pass
```

**Key measurements to document:**
- **Title position**: Where does the title placeholder sit?
- **Subtitle/description**: Where is the subtitle line?
- **Footer placeholders**: Where do footers/sources appear?
- **Content area**: The space BETWEEN subtitle and footer is your content area

#### Finding the True Content Start Position

**CRITICAL:** The content area does NOT always start immediately after the subtitle placeholder. Many templates have a visual border, line, or reserved space between the subtitle and content area.

**Best approach:** Look at Layout 2 or similar "content" layouts that have an OBJECT placeholder - this placeholder's `y` position indicates where content should actually start.

```python
# Find the OBJECT placeholder to determine true content start
for idx, layout in enumerate(prs.slide_layouts):
    for ph in layout.placeholders:
        try:
            if ph.placeholder_format.type == 7:  # OBJECT type
                top = ph.top / 914400
                print(f"Layout [{idx}] {layout.name}: OBJECT starts at y={top:.2f}\"")
                # This y value is where your content should start!
        except:
            pass
```

**Example:** A template might have:
- Subtitle ending at y=1.38"
- But OBJECT placeholder starting at y=1.90"
- The gap (0.52") is reserved for a border/line - **do not place content there**

Use the OBJECT placeholder's `y` position as your content start, not the subtitle's end position.

### Step 5: Write SKILL.md

The generated skill should have this structure:
```
[company]-ppt-template/
├── SKILL.md
└── assets/
    └── template.pptx
```

#### Generated SKILL.md Template

The generated SKILL.md must be **self-contained** with all instructions embedded. Use this template, filling in the bracketed values from your analysis:

````markdown
---
name: [company]-ppt-template
description: [Company] PowerPoint template for creating presentations. Use when creating [Company]-branded pitch decks, board materials, or client presentations.
---

# [Company] PPT Template

Template: `assets/template.pptx` ([WIDTH]" x [HEIGHT]", [N] layouts)

## Creating Presentations

```python
from pptx import Presentation

prs = Presentation("path/to/skill/assets/template.pptx")

# DELETE all existing slides first
while len(prs.slides) > 0:
    rId = prs.slides._sldIdLst[0].rId
    prs.part.drop_rel(rId)
    del prs.slides._sldIdLst[0]

# Add slides from layouts
slide = prs.slides.add_slide(prs.slide_layouts[LAYOUT_IDX])
```

## Key Layouts

| Index | Name | Use For |
|-------|------|---------|
| [0] | [Layout Name] | [Cover/title slide] |
| [N] | [Layout Name] | [Content with bullets] |
| [N] | [Layout Name] | [Two-column layout] |

## Placeholder Mapping

**CRITICAL: Include exact positions (x, y coordinates) for each placeholder.**

### Layout [N]: [Name]
| idx | Type | Position | Use |
|-----|------|----------|-----|
| [idx] | TITLE (1) | y=[Y]" | Slide title |
| [idx] | BODY (2) | y=[Y]" | Subtitle/description |
| [idx] | BODY (2) | y=[Y]" | Footer |
| [idx] | BODY (2) | y=[Y]" | Source/notes |

### Content Area Boundaries

**Document the safe content area for custom shapes/tables/charts:**

```
Content Area (for Layout [N]):
- Left margin: [X]" (content starts here)
- Top: [Y]" (below subtitle placeholder)
- Width: [W]"
- Height: [H]" (ends before footer)

For 4-quadrant layouts:
- Left column: x=[X]", width=[W]"
- Right column: x=[X]", width=[W]"
- Top row: y=[Y]", height=[H]"
- Bottom row: y=[Y]", height=[H]"
```

**Why this matters:** Custom content (textboxes, tables, charts) must stay within these boundaries to avoid overlapping with template placeholders like titles, footers, and source lines.

## Filling Content

**Do NOT add manual bullet characters** - slide master handles formatting.

```python
# Fill title
for shape in slide.shapes:
    if hasattr(shape, 'placeholder_format'):
        if shape.placeholder_format.type == 1:  # TITLE
            shape.text = "Slide Title"

# Fill content with hierarchy (level 0 = header, level 1 = bullet)
for shape in slide.shapes:
    if hasattr(shape, 'placeholder_format'):
        idx = shape.placeholder_format.idx
        if idx == [CONTENT_IDX]:
            tf = shape.text_frame
            for para in tf.paragraphs:
                para.clear()

            content = [
                ("Section Header", 0),
                ("First bullet point", 1),
                ("Second bullet point", 1),
            ]

            tf.paragraphs[0].text = content[0][0]
            tf.paragraphs[0].level = content[0][1]
            for text, level in content[1:]:
                p = tf.add_paragraph()
                p.text = text
                p.level = level
```

## Example: Cover Slide

```python
slide = prs.slides.add_slide(prs.slide_layouts[[COVER_IDX]])
for shape in slide.shapes:
    if hasattr(shape, 'placeholder_format'):
        idx = shape.placeholder_format.idx
        if idx == [TITLE_IDX]:
            shape.text = "Company Name"
        elif idx == [SUBTITLE_IDX]:
            shape.text = "Presentation Title | Date"
```

## Example: Content Slide

```python
slide = prs.slides.add_slide(prs.slide_layouts[[CONTENT_IDX]])
for shape in slide.shapes:
    if hasattr(shape, 'placeholder_format'):
        ph_type = shape.placeholder_format.type
        idx = shape.placeholder_format.idx
        if ph_type == 1:
            shape.text = "Executive Summary"
        elif idx == [BODY_IDX]:
            tf = shape.text_frame
            for para in tf.paragraphs:
                para.clear()
            content = [
                ("Key Findings", 0),
                ("Revenue grew 40% YoY to $50M", 1),
                ("Expanded to 3 new markets", 1),
                ("Recommendation", 0),
                ("Proceed with strategic initiative", 1),
            ]
            tf.paragraphs[0].text = content[0][0]
            tf.paragraphs[0].level = content[0][1]
            for text, level in content[1:]:
                p = tf.add_paragraph()
                p.text = text
                p.level = level
```
````

### Step 6: Create Example Output

Generate a sample presentation to validate the skill works. Save it alongside the skill for reference.

### PPT-Specific Rules for Generated Skills

1. **Template in assets/** - always bundle the .pptx file
2. **Self-contained SKILL.md** - all instructions embedded, no external references
3. **No manual bullets** - use `paragraph.level` for hierarchy
4. **Delete slides first** - always clear existing slides before adding new ones
5. **Document placeholders by idx** - placeholder idx values are template-specific

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
