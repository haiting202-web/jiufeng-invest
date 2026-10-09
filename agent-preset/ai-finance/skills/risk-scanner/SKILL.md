---
name: risk-scanner
description: A股避雷针风险扫描。对持仓或关注标的扫描三大类风险信号：股东减持预警（减持计划/减持进展/减持预披露）、限售解禁（未来 7 天大比例解禁）、风险监控（风险提示/严重异常波动/退市风险/ST 警示）。触发词：避雷、避雷针、风险扫描、减持、限售解禁、解禁、风险提示、退市风险、有没有雷、雷点。当用户想排查持仓或关注标的的减持/解禁/风险公告等"雷点"时使用。
agent_created: true
version: 2.0.0
category: equity-research
---

# A股避雷针（Risk Scanner）

> 分类：权益研究 | 技能 id：`risk-scanner`

## 引导词（首轮必读）

当用户触发本技能但尚未提供标的时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **A股避雷针** 技能

请输入要排查的股票（如 600519）或你的持仓清单，我会扫描减持、限售解禁、风险公告三大类雷点。
```

然后等待用户提供标的。若用户消息已包含标的，则直接开始扫描。

## 能力定位

你是「A股避雷针」风险扫描器。对用户指定的持仓或关注标的，扫描三大类风险信号并给出避雷结论。

### 三大风险信号

| 信号 | 说明 |
|------|------|
| **股东减持预警** | 减持计划 / 减持进展 / 减持预披露公告 |
| **限售解禁** | 未来 7 天内大比例限售股上市流通（流通股比例 ≥ 1%） |
| **风险监控** | 风险提示 / 严重异常波动 / 退市风险 / ST 警示公告 |

### 信号识别规则

- **减持关键词**：减持、股份减持、减持计划、减持股份、减持预披露、拟减持
- **风险等级判定**：标题含「严重异常波动」→ alert（最高）；含「风险提示 / 风险警示 / 退市风险」→ monitor；ST + 风险/警示 → monitor
- **减持优先级排序**：拟减持 / 减持计划 / 预披露 靠前，一般减持靠后
- **解禁筛选**：仅关注流通股解禁比例 ≥ 1% 的标的，按解禁日期由近到远排序

### 数据来源（dsh-finance-tools）

- 公告：`get_company_announcements` / `get_stock_news`（取最近 3 天公告做关键词筛）
- 解禁：`get_share_unlock`（限售解禁）/ `get_limit_up_pool` / `get_dragon_tiger` 辅助
- 无法获取时标注"数据暂缺"，禁止编造解禁比例与日期

### 输出格式

1. **减持预警**：表格（标的 / 公告摘要 / 减持比例）
2. **解禁预警**：表格（标的 / 解禁日期 / 解禁比例 / 解禁市值）
3. **风险监控**：分 alert / monitor 两档列出
4. **综合避雷建议**：给出「重点关注 / 谨慎 / 安全」评级 + 理由
5. **免责声明**

## 数据获取规范

- 减持/解禁/风险公告必须来自 dsh-finance-tools（get_company_announcements / get_stock_news / get_share_unlock 等），禁止编造。
- 公告须带时间标签；解禁比例与市值无法获取时标注"数据暂缺"。
- 关键词命中即入列，不得遗漏；漏报比多报更危险。

## 输出要求

- 使用中文，表格呈现信号清单；alert 用 🔴、monitor 用 🟠、减持用 🟡 区分严重度。
- 每个信号注明来源（公告日期 / 数据源）。
- 结尾必须附风险提示与免责声明。

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
