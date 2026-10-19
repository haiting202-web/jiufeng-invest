# -*- coding: utf-8 -*-
"""build-skills-md.py — 从单一真源生成 DSH 预设的 SKILL.md。

单一真源：dsh-ai-invest-sidebar\\skills-data.json（101 技能）
优先 prompt：src/skills/index.ts（WEB 真源，71 技能；比 JSON 略长，优先采用）

策略（外科式）：
  - 已存在的 SKILL.md：保留 frontmatter 与「引导词」等段落，只把「能力定位」换回完整源内容
  - 缺失的技能：按现有格式从零生成（元数据见 NEW_META）

输出：本地预设 + GitHub 仓库预设（两份都写，保持一致）

用法：
  python build-skills-md.py --dry-run     # 只报告，不写文件
  python build-skills-md.py               # 实际写入（先自动备份）
"""
import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime

BASE = r'dsh-ai-invest-sidebar'
JSON_PATH = os.path.join(BASE, 'skills-data.json')
# ★ WEB 真源：同上，不写死本机路径。环境变量 AI_BUTLER_WEB_TS 可覆盖。
WEB_TS = os.environ.get('AI_BUTLER_WEB_TS') or os.path.normpath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 '..', 'client-software', 'ai-butler-desktop', 'src', 'skills', 'index.ts'))

TARGETS = [
    r'%USERPROFILE%\.dsh\.agent-presets\ai-finance\skills',
    r'<仓库根>-github\agent-preset\ai-finance\skills',
]

CAT_ZH = {
    'financial-analysis': '财务分析',
    'equity-research': '权益研究',
    'investment-banking': '投资银行',
    'private-equity': '私募股权',
    'wealth-management': '财富管理',
    'fund-admin': '基金管理',
    'operations': '运营合规',
    'consultation': '智能研判',
}

# 新建技能时的「引导词」段落模板
GUIDE_TMPL = """## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **{name}** 技能

{greet}
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。"""

# 源 prompt 含「建模/定量」性质、需附数据严谨性要求的技能
RIGOR_IDS = {    'china-3-statement-model', 'china-comps-analysis', 'china-dcf-model', 'us-dcf-model',
    'merger-accretion-model', 'china-earnings-analysis', 'china-earnings-preview',
    'china-initiating-coverage', 'china-thesis-tracker', 'china-idea-generation',
    'dcf-model', 'comps-analysis', '3-statement-model', 'lbo-model', 'merger-model',
}

# 13 个此前缺失的技能：英文名 / 触发词 / 引导句
NEW_META = {
    'china-3-statement-model': (
        'A-Share 3-Statement Model',
        ['A股三表联动模型', 'A股三表', '三表联动', 'A股财务模型', '利润表', '资产负债表', '现金流量表', 'A股财务预测'],
        '请输入股票代码（如 600519），我将自动拉取三张财务报表，建立适配中国会计准则的联动预测模型。',
    ),
    'china-comps-analysis': (
        'A-Share Comparable Company Analysis',
        ['A股可比公司分析', 'A股可比公司', 'A股相对估值', 'A股估值对标', 'PE/PB/PS', 'EV/EBITDA', 'PEG'],
        '请输入目标公司代码（如 600519），我将自动拉取可比公司数据，为您构建 PE/PB/PS/EV-EBITDA 相对估值对标。',
    ),
    'china-dcf-model': (
        'A-Share DCF Model',
        ['A股DCF估值模型', 'A股DCF', 'A股估值模型', '中债无风险利率', '中国ERP', 'A股现金流折现'],
        '请输入股票代码（如 600519），我将自动拉取财报数据，按中债无风险利率与中国 ERP 构建 A 股 DCF 估值模型。',
    ),
    'china-earnings-analysis': (
        'A-Share Earnings Review',
        ['A股业绩点评', 'A股财报分析', '业绩点评', '财报拆解', 'A股季报', 'A股年报'],
        '请提供股票代码与财报期（如 600519 / 2026中报），我将拆解财报、分析驱动因素并评估估值影响。',
    ),
    'china-earnings-preview': (
        'A-Share Earnings Preview',
        ['A股业绩前瞻', '业绩前瞻', '业绩预告', 'A股业绩预告', '业绩预期'],
        '请输入股票代码与即将披露的报告期，我将对比一致预期、做情景分析并给出布局建议。',
    ),
    'china-idea-generation': (
        'A-Share Idea Generation',
        ['A股选股筛选', 'A股选股', '选股筛选', '量化筛选', '主题投资', '动量信号', '估值异动'],
        '请描述您的选股条件（行业、主题、市值、风格等），我将做系统性筛选并给出候选标的。',
    ),
    'china-initiating-coverage': (
        'A-Share Initiating Coverage',
        ['A股首次覆盖报告', '首次覆盖', 'A股深度报告', '卖方首次覆盖', 'A股投资建议'],
        '请输入股票代码，我将按中金/中信/华泰格式撰写首次覆盖研究报告。',
    ),
    'china-morning-note': (
        'A-Share Morning Note',
        ['A股晨会纪要', '晨会纪要', '每日策略', '隔夜外盘', '市场回顾'],
        '请说明要覆盖的日期与重点关注方向，我将生成隔夜外盘、市场回顾与今日策略的晨会纪要。',
    ),
    'china-sector-overview': (
        'A-Share Sector Deep Dive',
        ['A股行业深度分析', 'A股行业分析', '行业深度', '板块分析', '行业研究报告'],
        '请提供行业/板块名称，我将从市场规模、竞争格局、政策环境、估值与投资主题角度做深度分析。',
    ),
    'china-thesis-tracker': (
        'A-Share Thesis Tracker',
        ['A股投资逻辑跟踪', '投资逻辑跟踪', '逻辑跟踪', '持仓逻辑', '核心假设', '催化剂'],
        '请提供标的与持仓逻辑要点，我将跟踪核心假设、催化剂与风险因素并评估逻辑有效性。',
    ),
    'merger-accretion-model': (
        'Merger & Accretion-Dilution Model',
        ['并购增厚稀释模型', '增厚稀释', 'EPS增厚', 'EPS稀释', '并购模型', '协同效应'],
        '请提供收购方与标的的基本信息，我将测算交易对 EPS 的增厚/稀释并给出交易结构建议。',
    ),
    'tear-sheet': (
        'Tear Sheet',
        ['公司一页纸', '一页纸摘要', 'tear sheet', '公司速览', '关键指标摘要'],
        '请输入股票代码，我将生成包含关键指标与投资论点的一页纸摘要。',
    ),
    'us-dcf-model': (
        'US DCF Model',
        ['美股DCF估值模型', '美股DCF', 'UST无风险利率', '美国ERP', '美股估值模型'],
        '请输入美股代码（如 AAPL），我将按 UST 无风险利率与美国 ERP 构建 DCF 估值模型。',
    ),
}


JS_ESC = {'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', 'v': '\v',
          '0': '\0', '\\': '\\', '"': '"', "'": "'", '`': '`', '/': '/'}


def js_unescape(s):
    """把 JS 字符串字面量里的转义序列还原成真实字符（\\n -> 换行等）。"""
    out, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c == '\\' and i + 1 < n:
            e = s[i + 1]
            if e in JS_ESC:
                out.append(JS_ESC[e]); i += 2; continue
            if e == 'u' and i + 6 <= n:
                try:
                    out.append(chr(int(s[i + 2:i + 6], 16))); i += 6; continue
                except ValueError:
                    pass
            out.append(e); i += 2; continue
        out.append(c); i += 1
    return ''.join(out)


def parse_prompts(path, id_quote='"'):
    """解析 TS 源里的 { id, prompt } 对；返回的 prompt 已完成反转义。

    注意：id 用引号风格与 prompt 的字符串定界符**相互独立**（id 常用 "，prompt 可能是 ` 或 "），
    故此处不能复用 id_quote 作为 prompt 的定界符。
    """
    text = open(path, encoding='utf-8').read()
    recs = {}
    for p in text.split('\n  {\n    id: ')[1:]:
        m = re.match(id_quote + r'([^' + id_quote + r']+)' + id_quote, p)
        if not m:
            continue
        i = p.find('prompt:')
        if i < 0:
            continue
        q = p[i + 7:].lstrip()
        if q[:1] not in ('"', '`'):
            continue
        end = q[0]
        j, buf = 1, []
        while j < len(q):
            c = q[j]
            if c == '\\':
                buf.append(q[j:j + 2]); j += 2; continue
            if c == end:
                break
            buf.append(c); j += 1
        recs[m.group(1)] = js_unescape(''.join(buf))
    return recs


def demote_headings(md):
    """去掉开头的 H1，并把其余标题整体降一级（跳过代码块）。"""
    lines = md.split('\n')
    out, in_fence = [], False
    for idx, ln in enumerate(lines):
        if ln.strip().startswith('```'):
            in_fence = not in_fence
            out.append(ln); continue
        if in_fence:
            out.append(ln); continue
        if idx <= 2 and re.match(r'^#\s+\S', ln):
            continue  # 丢掉与文件标题重复的 H1
        m = re.match(r'^(#{2,5})\s+(\S.*)$', ln)
        out.append('#' + m.group(1) + ' ' + m.group(2) if m else ln)
    while out and not out[0].strip():
        out.pop(0)
    return '\n'.join(out).rstrip()


def split_sections(text):
    """把 SKILL.md 拆成 (frontmatter+前置, 前置正文, {章节标题: 正文})。

    ★ 必须跳过代码围栏：技能 prompt 常在围栏内写示例，其中的 '## ' 不是章节边界，
      否则会被切成伪章节、内容被挪到文件末尾（该 bug 曾影响 ib-check-deck 等 3 个技能）。
    """
    m = re.match(r'^---\n[\s\S]*?\n---\n', text)
    head = m.group(0) if m else ''
    rest = text[m.end():] if m else text
    pre, secs, cur, in_fence = [], {}, None, False
    for ln in rest.split('\n'):
        if ln.lstrip().startswith('```'):
            in_fence = not in_fence
            (secs[cur] if cur else pre).append(ln)
            continue
        if not in_fence and re.match(r'^## ', ln):
            cur = ln.strip()
            secs.setdefault(cur, [])
            continue
        (secs[cur] if cur else pre).append(ln)
    return head, '\n'.join(pre), {k: '\n'.join(v) for k, v in secs.items()}


def replace_section(sec_text, body):
    first = sec_text.split('\n', 1)[0]
    return first + '\n\n' + body.strip() + '\n'


def sec_body(s):
    """取章节正文（去掉首行标题）。"""
    return s.split('\n', 1)[1].strip() if '\n' in s else ''


def render(heading, body):
    return heading + '\n\n' + body.strip() + '\n'


def build():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='只报告不写文件')
    ap.add_argument('--only-delivery', action='store_true',
                    help='只注入「## 交付件格式」共享章节，不改能力定位/数据获取规范/输出要求（零风险）')
    args = ap.parse_args()

    data = json.load(open(JSON_PATH, encoding='utf-8'))
    skills = {x['id']: x for x in data['skills']}
    web = parse_prompts(WEB_TS, '"')

    # 通用段落与引导词模板从现有文件取，保证同构；split_sections 现在返回「章节正文」，不含标题行
    ref_path = os.path.join(TARGETS[0], 'dcf-model', 'SKILL.md')
    _, _, ref_secs = split_sections(open(ref_path, encoding='utf-8').read())
    STD = ref_secs.get('## 数据获取规范', '').strip()
    OUT = ref_secs.get('## 输出要求', '').strip()
    # 「## 交付件格式」是后加的共享章节 —— ★ 单一真源是 delivery-spec.md（与 gen-client.mjs
    # 注入侧边栏用的同一份文件）。回退才从 dcf-model/SKILL.md 取，避免两处文案分叉。
    _dk = next((k for k in ref_secs if k.startswith('## 交付件格式')), None)
    _spec = os.path.join(BASE, 'delivery-spec.md')
    if os.path.exists(_spec):
        _, _, sp = split_sections(open(_spec, encoding='utf-8').read())
        sk = next((k for k in sp if k.startswith('## 交付件格式')), None)
        DELIV = sp.get(sk, '').strip() if sk else ''
    else:
        DELIV = ref_secs.get(_dk, '').strip() if _dk else ''

    stamp = datetime.now().strftime('%Y%m%d%H%M%S')
    stats = {'updated': 0, 'created': 0, 'unchanged': 0, 'bytes_added': 0}
    report = []

    for tid in TARGETS:
        if not args.dry_run and os.path.isdir(tid):
            bak = tid.rstrip('\\/') + f'.bak-content-restore-{stamp}'
            if not os.path.exists(bak):
                shutil.copytree(tid, bak)
                print(f'[备份] {bak}')

    for sid, meta in skills.items():
        only = args.only_delivery
        prompt = web.get(sid) or meta.get('prompt', '')
        if not only and not prompt:
            report.append((sid, 'SKIP-无prompt', 0, 0))
            continue
        body = demote_headings(prompt) if prompt else ''

        for tid in TARGETS:
            path = os.path.join(tid, sid, 'SKILL.md')
            if os.path.exists(path):
                raw = open(path, encoding='utf-8').read()
                head, pre, secs = split_sections(raw)
                key = next((k for k in secs if k.startswith('## 能力定位')), None)
                if key is None:
                    report.append((sid, 'SKIP-无能力定位段', 0, 0))
                    continue
                old_len = len(secs[key].encode())
                # ★ 防截断护栏：全文 prompt 只存在于 src/skills/index.ts；本地自建技能
                #   （trader-consultation / risk-scanner / data-review）取不到 → 退回
                #   skills-data.json 的短版，直接替换会把完整能力定位砍掉九成（历史事故）。
                #   明显变短一律不替换，只补共享章节。
                trunc = (not only) and old_len > 0 and len(body.encode()) < old_len * 0.95
                if only or trunc:
                    shared = [('## 交付件格式', DELIV)]
                else:
                    secs[key] = body.strip()
                    shared = [('## 数据获取规范', STD), ('## 输出要求', OUT),
                              ('## 交付件格式', DELIV)]
                # 样板段落统一为规范文本，消除「本地预设 vs GitHub 仓库」的历史文案分歧
                # ★ 不存在则追加：后加的共享章节（交付件格式）要能补给存量技能
                for nm, canon in shared:
                    if not canon:
                        continue
                    hit = next((k for k in secs if k.startswith(nm)), None)
                    if hit:
                        secs[hit] = canon
                    else:
                        secs[nm] = canon
                order = ['## 引导词（首轮必读）', '## 能力定位', '## 数据获取规范',
                         '## 输出要求', '## 交付件格式']
                out = head + pre.rstrip() + '\n'
                for name in order:
                    hit = next((k for k in secs if k.startswith(name)), None)
                    if hit:
                        out += '\n' + render(hit, secs[hit])
                for k, v in secs.items():
                    if not any(k.startswith(n) for n in order):
                        out += '\n' + render(k, v)
                if not args.dry_run:
                    open(path, 'w', encoding='utf-8', newline='\n').write(out)
                new_len = len(secs[key].encode())
                if tid == TARGETS[0]:
                    stats['updated'] += 1
                    stats['bytes_added'] += new_len - old_len
                    report.append((sid, 'SKIP-防截断' if trunc else 'UPDATE', old_len, new_len))
            else:
                en, triggers, greet = NEW_META.get(sid, (sid, [meta['name']], '请提供必要输入后我将开始分析。'))
                desc = meta['description'].rstrip('。')
                tw = '、'.join(triggers)
                fm = (
                    '---\n'
                    f'name: {sid}\n'
                    f'description: {desc}。触发词：{tw}。当用户需要{meta["name"]}相关分析时使用。\n'
                    'agent_created: true\n'
                    'version: 2.0.0\n'
                    f'category: {meta["category"]}\n'
                    'disable-model-invocation: true\n'
                    '---\n\n'
                )
                title = f'# {meta["name"]}（{en}）\n\n> 分类：{CAT_ZH.get(meta["category"], meta["category"])} | 技能 id：`{sid}`\n\n'
                guide = GUIDE_TMPL.format(name=meta['name'], greet=greet)
                cap_body = body
                if sid in RIGOR_IDS:
                    cap_body += ('\n\n【数据严谨性要求】每个关键参数须注明来源(财报/Wind/连接器/假设)；'
                                 '无法获取的一律标注"假设"并给出取值理由；涉及估值或模型的须展示核心公式与至少一组敏感性情景。')
                content = (fm + title + guide.rstrip() + '\n\n'
                           + render('## 能力定位', cap_body)
                           + '\n' + render('## 数据获取规范', STD)
                           + '\n' + render('## 输出要求', OUT)
                           + ('\n' + render('## 交付件格式', DELIV) if DELIV else ''))
                if not args.dry_run:
                    os.makedirs(os.path.dirname(path), exist_ok=True)
                    open(path, 'w', encoding='utf-8', newline='\n').write(content)
                if tid == TARGETS[0]:
                    stats['created'] += 1
                    stats['bytes_added'] += len(body.encode())
                    report.append((sid, 'CREATE', 0, len(body.encode())))

    print()
    print('=' * 78)
    print(f"{'技能 id':34s} {'动作':8s} {'原能力定位':>10s} {'新能力定位':>10s}")
    print('-' * 78)
    for sid, act, a, b in report:
        print(f'{sid:34s} {act:8s} {a:>10,} {b:>10,}')
    print('=' * 78)
    print(f"更新 {stats['updated']} / 新建 {stats['created']} / 跳过 {stats['unchanged']}")
    print(f"能力定位净增 {stats['bytes_added']:,} 字节（~{stats['bytes_added'] // 3:,} tokens）")
    print(f"目标目录 {len(TARGETS)} 个：本地预设 + GitHub 仓库预设")
    if args.dry_run:
        print('[dry-run] 未写入任何文件')


if __name__ == '__main__':
    build()
