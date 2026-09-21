# -*- coding: utf-8 -*-
"""
生成历史对话预览.py — 生成一个可点击的静态原型，预览「历史对话文本框 + 折叠展开」的观感。

要点：CSS 不是手抄的，而是从 client/client.js 里正则抽出真实的 .dsh-invest-* 规则，
      所以预览里的观感与真机一致（改完样式重跑本脚本即可同步）。
用法： python 生成历史对话预览.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLIENT = ROOT / "client" / "client.js"
OUT = ROOT / "历史对话预览.html"
PREVIEW_N = 10          # 与 client.js 里的 HISTORY_PREVIEW 保持一致
TOTAL = 12              # 预览用的会话总数

if not CLIENT.exists():
    sys.exit("找不到 client/client.js，先跑 node gen-client.mjs")

src = CLIENT.read_text(encoding="utf-8")

# ── 抽取真实 CSS 规则（.dsh-invest-* 与暗色主题变体）────────────────────────
rules, seen = [], set()
for m in re.finditer(r'((?:body\[data-ds-dark-theme\]\s+)?\.dsh-invest-[\w-]+(?:[^{}]*?))\{([^{}]*)\}', src):
    sel = m.group(1).strip()
    body = m.group(2).strip()
    # 过滤掉弹窗卡片相关（预览用不到，且会引入大量无关规则）
    if any(k in sel for k in ('.dsh-invest-card', '.dsh-invest-input', '.dsh-invest-ta',
                              '.dsh-invest-sel', '.dsh-invest-sp', '.dsh-invest-opt',
                              '.dsh-invest-toggle', '.dsh-invest-file', '.dsh-invest-summary',
                              '.dsh-invest-req', '.dsh-invest-unit', '.dsh-invest-numwrap',
                              '.dsh-invest-tag', '.dsh-invest-tip', '.dsh-invest-fhelp')):
        continue
    key = (sel, body)
    if key in seen:
        continue
    seen.add(key)
    rules.append(f"{sel}{{{body}}}")

if not rules:
    sys.exit("没抽到任何 .dsh-invest-* 规则，client.js 结构可能变了")

# 校验关键规则确实抽到了
must = [".dsh-invest-box{", ".dsh-invest-more{", ".dsh-invest-sess{", ".dsh-invest-gcount{"]
for k in must:
    if not any(r.startswith(k) for r in rules):
        sys.exit(f"缺少关键规则 {k}，中止（避免生成一份误导性的预览）")

SESS = [
    ("按 B→A→D→C 顺序收窄 token 占用的完整记录", "1 天前", False),
    ("帮我分析一下贵州茅台的最新财报和估值", "1 天前", False),
    ("宁德时代 2026 H1 财报拆解：储能业务的毛利率拐点", "2 天前", False),
    ("宇树科技 IPO 招股书要点与发行估值区间判断", "2 天前", False),
    ("多空辩论：光伏板块还有没有第二波", "3 天前", True),
    ("央行连续 21 个月增持黄金意味着什么", "3 天前", False),
    ("东数西算四大枢纽的算力上架率对比", "4 天前", False),
    ("液冷板块的订单节奏与交付确认口径", "5 天前", False),
    ("招行 2026 中报：息差与不良生成率的边际变化", "5 天前", False),
    ("中国平安新业务价值增长的质量拆解", "6 天前", False),
    ("碧桂园创投退出的路径与时间表", "7 天前", False),
    ("游资多专家研判：连板高度与情绪周期位置", "8 天前", False),
]
assert len(SESS) == TOTAL, "预览条目数需与 TOTAL 一致"

rows = "\n".join(
    f'      <div class="dsh-invest-sess{" active" if act else ""}" data-idx="{i}"'
    f'{"" if i < PREVIEW_N else " data-extra=\'1\'"} style="position:relative">\n'
    f'        <span class="ttl">{t}</span>\n'
    f'        <span class="tm">{tm}</span>\n'
    f'        <button class="dsh-invest-sess-del">✕</button>\n'
    f'      </div>'
    for i, (t, tm, act) in enumerate(SESS)
)

css_block = "\n".join(rules)

HTML = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>AI 投研 · 历史对话文本框（折叠/展开）预览</title>
<style>
  :root {{ color-scheme: light; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; padding:28px; background:#f5f5f7; color:#1d1d1f; font:14px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif; }}
  h1 {{ font-size:19px; margin:0 0 6px; }}
  .sub {{ font-size:13px; color:#6e6e73; margin-bottom:22px; }}
  .stage {{ display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap; }}
  .pane {{ width:372px; background:#fff; border-radius:14px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,.07),0 10px 30px rgba(0,0,0,.05); }}
  .pane h2 {{ font-size:13px; margin:0 0 4px; }}
  .pane .note {{ font-size:12px; color:#8a8a8e; margin-bottom:10px; min-height:34px; }}
  /* 模拟侧边栏：固定宽度 + 固定高度，复现真机的约束条件 */
  /* 高度够大，才能在同一屏里看出「折叠 300px」与「展开 520px」的差别 */
  .sidebar {{ width:300px; height:760px; border-radius:10px; border:1px solid rgba(0,0,0,.07); background:#fbfbfd; overflow:hidden; }}
  .dsh-invest-root {{ font-size:16px; }}
  .fake-upstream {{ padding:6px 8px; display:flex; flex-direction:column; gap:8px; }}
  .fake-brand {{ display:flex; align-items:center; gap:9px; padding:8px 10px; font-weight:600; font-size:16px; }}
  .fake-row {{ display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:6px; font-size:16px; color:#3a3a3c; }}
  .fake-row .ico {{ width:21px; text-align:center; }}
  .fake-row .cnt {{ margin-left:auto; font-size:12.5px; opacity:.5; }}
  .callout {{ margin-top:14px; font-size:12.5px; color:#6e6e73; line-height:1.75; }}
  .callout b {{ color:#1d1d1f; }}
  code {{ background:rgba(0,0,0,.06); padding:1px 5px; border-radius:4px; font-size:12px; }}
{css_block}
</style>
</head>
<body>
<h1>历史对话：文本框 + 折叠展开</h1>
<div class="sub">CSS 直接从 <code>client/client.js</code> 抽取，与真机一致。右栏可点击「展开全部」试一下。</div>

<div class="stage">
  <div class="pane">
    <h2>折叠态（默认）</h2>
    <div class="note">共 {TOTAL} 条 &gt; 阈值 {PREVIEW_N} → 只渲染前 {PREVIEW_N} 条，底部出现「展开全部」。</div>
    <div class="sidebar">
      <div class="dsh-invest-root">
        <div class="dsh-invest-scroll">
          <div class="fake-brand"><span>📈</span><span>AI 投研</span></div>
          <div class="dsh-invest-group-label">投研工作流</div>
          <div class="fake-row"><span class="ico">📊</span><span>财务监控诊断</span></div>
          <div class="fake-row"><span class="ico">⚔️</span><span>股票多空博弈</span></div>
          <div class="dsh-invest-divider"></div>
          <div class="dsh-invest-group-label">专业工具</div>
          <div class="fake-row"><span class="ico">📈</span><span>财务分析</span><span class="cnt">24</span></div>
          <div class="fake-row"><span class="ico">🏦</span><span>投资银行</span><span class="cnt">10</span></div>
          <div class="dsh-invest-divider"></div>
          <div class="dsh-invest-group-label">历史对话<span class="dsh-invest-gcount">({TOTAL})</span></div>
          <div class="dsh-invest-hist">
            <div class="dsh-invest-box">
{rows}
            </div>
            <button class="dsh-invest-more">展开全部 ({TOTAL})</button>
          </div>
        </div>
      </div>
    </div>
    <div class="callout">
      <b>文本框</b>：淡边框 + 淡底 + 圆角；高度上限 300px，超出部分在框内滚动——历史再多也不会让侧边栏无限变长。<br>
      <b>折叠</b>：超过 {PREVIEW_N} 条只渲染前 {PREVIEW_N} 条，标题旁显示总数 <code>历史对话({TOTAL})</code>，与 WorkBuddy 的「任务 (29)」一致。
    </div>
  </div>

  <div class="pane">
    <h2>展开态 / 点击试试</h2>
    <div class="note">点「展开全部」→ 容器长高到 <code>min(62vh, 560px)</code> 并渲染全部，按钮变「收起」。</div>
    <div class="sidebar">
      <div class="dsh-invest-root">
        <div class="dsh-invest-scroll">
          <div class="fake-brand"><span>📈</span><span>AI 投研</span></div>
          <div class="dsh-invest-group-label">投研工作流</div>
          <div class="fake-row"><span class="ico">📊</span><span>财务监控诊断</span></div>
          <div class="fake-row"><span class="ico">⚔️</span><span>股票多空博弈</span></div>
          <div class="dsh-invest-divider"></div>
          <div class="dsh-invest-group-label">专业工具</div>
          <div class="fake-row"><span class="ico">📈</span><span>财务分析</span><span class="cnt">24</span></div>
          <div class="fake-row"><span class="ico">🏦</span><span>投资银行</span><span class="cnt">10</span></div>
          <div class="dsh-invest-divider"></div>
          <div class="dsh-invest-group-label">历史对话<span class="dsh-invest-gcount">({TOTAL})</span></div>
          <div class="dsh-invest-hist">
            <div class="dsh-invest-box" id="box">
{rows}
            </div>
            <button class="dsh-invest-more" id="more">展开全部 ({TOTAL})</button>
          </div>
        </div>
      </div>
    </div>
    <div class="callout">
      <b>展开</b>：容器长高到 <code>min(56vh, 520px)</code>，渲染全部 {TOTAL} 条；侧边栏剩余空间不够时会把整条侧边栏撑长，滚动侧边栏即可继续看（与 WorkBuddy「查看更多」行为一致）。<br>
      <b>滚动条</b>：9px 细条，轨道透明、滑块半透明灰，悬停加深。点击条目打开会话、悬停 ✕ 归档，行为未变。
    </div>
  </div>
</div>

<script>
  // 复现 client.js 的行为：折叠时前 10 条可见，展开后全部可见 + 容器长高
  var box = document.getElementById('box');
  var more = document.getElementById('more');
  var N = {PREVIEW_N}, TOTAL = {TOTAL};
  var open = /[?&]open=1/.test(location.search);   // 截图用：?open=1 直接呈现展开态
  function paint() {{
    var extras = box.querySelectorAll('[data-extra]');
    for (var i = 0; i < extras.length; i++) extras[i].style.display = open ? '' : 'none';
    box.classList.toggle('open', open);
    more.textContent = open ? '收起' : '展开全部 (' + TOTAL + ')';
  }}
  more.addEventListener('click', function () {{ open = !open; paint(); }});
  paint();
</script>
</body>
</html>
"""

OUT.write_text(HTML, encoding="utf-8")
print(f"已生成：{OUT}")
print(f"  抽取真实 CSS 规则 {len(rules)} 条")
print(f"  预览数据 {TOTAL} 条，折叠阈值 {PREVIEW_N}")
missing = [k for k in must if not any(r.startswith(k) for r in rules)]
print("  关键规则校验：" + ("全部命中 ✓" if not missing else f"缺少 {missing} ✗"))
