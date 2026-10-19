# -*- coding: utf-8 -*-
"""test-skills-matching.py — 技能触发词匹配自测（模拟 agent 的技能选择）。

原理：agent 的 tool-skill 只把 name + description 常驻上下文，靠 description 里的
「触发词」判断该不该加载某个技能。本测试用真实提问跑一遍打分，验证：
  1. 该命中的技能排在前列
  2. 13 个新补技能都能被自己的典型提问命中
  3. 触发词之间没有严重歧义（不会答非所问）

打分：命中触发词按 词长² 累加（越长越具体），命中技能名额外加权。
"""
import os
import re
import sys

SKILLS = r'%USERPROFILE%\.dsh\.agent-presets\ai-finance\skills'

CASES = [
    ('帮我做一下贵州茅台 600519 的 A股DCF估值', 'china-dcf-model'),
    ('600519 的A股可比公司分析，对标同行估值', 'china-comps-analysis'),
    ('三花智控 2026中报业绩点评', 'china-earnings-analysis'),
    ('筛选一些A股半导体主题的标的', 'china-idea-generation'),
    ('给宁德时代写一份A股首次覆盖报告', 'china-initiating-coverage'),
    ('今天的A股晨会纪要，隔夜外盘怎么样', 'china-morning-note'),
    ('A股新能源汽车行业深度分析', 'china-sector-overview'),
    ('跟踪我的持仓逻辑，核心假设有没有变化', 'china-thesis-tracker'),
    ('这笔并购对EPS是增厚还是稀释', 'merger-accretion-model'),
    ('给我一份公司一页纸摘要', 'tear-sheet'),
    ('苹果 AAPL 的美股DCF估值模型', 'us-dcf-model'),
    ('用三表联动模型做A股财务预测', 'china-3-statement-model'),
    ('昆仑万维 300418 的A股业绩前瞻', 'china-earnings-preview'),
    ('帮我做贵州茅台的多空辩论', 'bull-bear-debate'),
    ('600519 技术面分析，MACD 金叉了吗', 'technical-analysis'),
    ('DCF估值模型，WACC 给多少合适', 'dcf-model'),
    ('美股财报分析，拆解 beat miss', 'earnings-analysis'),
    ('LBO 杠杆收购模型，算一下 IRR', 'lbo-model'),
    ('KYC 合规规则检查', 'kyc-rules'),
    ('投资银行并购项目的一页纸 teaser', 'teaser'),
    # —— 批次2 游资多专家研判 ——
    ('帮我看这只票的游资情绪周期', 'trader-consultation'),
    ('用缠论分析当前走势', 'trader-consultation'),
    ('这只票的总龙头还能不能追', 'trader-consultation'),
    ('600519 的游资多专家研判，该不该减仓', 'trader-consultation'),
    ('用利弗莫尔关键点看当前最小阻力线', 'trader-consultation'),
    # —— 批次3 会诊/Agent/投资大师 ——
    ('帮我做一次专家会诊，这家公司值不值得投', 'expert-consultation'),
    ('要一个端到端的投研工作流，从建模到报告', 'agent-workflows'),
    ('用巴菲特的价值投资视角分析茅台', 'investor-personas'),
    # —— 批次4 避雷针/数据自检 ——
    ('帮我排查这只票有没有减持和解禁的雷', 'risk-scanner'),
    ('检查一下这只票的数据质量，有没有异常', 'data-review'),
]


def load():
    out = []
    for n in sorted(os.listdir(SKILLS)):
        p = os.path.join(SKILLS, n, 'SKILL.md')
        if not os.path.isfile(p):
            continue
        t = open(p, encoding='utf-8').read()
        m = re.search(r'^description:\s*(.*)$', t, re.M)
        desc = m.group(1) if m else ''
        tw = re.search(r'触发词：([^。]+)。', desc)
        triggers = [x.strip() for x in tw.group(1).split('、') if x.strip()] if tw else []
        out.append((n, desc, triggers))
    return out


def score(q, triggers, sid):
    s = 0
    for tr in triggers:
        if tr and tr in q:
            s += len(tr) ** 2
    if sid in q:
        s += 100
    return s


def main():
    skills = load()
    print(f'载入技能 {len(skills)} 个')
    n_tw = sum(1 for _, _, t in skills if t)
    print(f'其中有触发词的 {n_tw} 个（缺：{[s for s, _, t in skills if not t]}）')
    print()
    print(f"{'提问':44s} {'期望':26s} {'命中':26s} {'得分':>6s}  判定")
    print('-' * 118)
    fails = []
    for q, expect in CASES:
        ranked = sorted(((score(q, t, s), s) for s, _, t in skills), key=lambda x: -x[0])
        top = ranked[0]
        hit = top[1] == expect
        if not hit:
            fails.append((q, expect, top[1], top[0]))
        flag = 'OK' if hit else ('MISS' if top[0] > 0 else 'NONE')
        print(f'{q[:42]:44s} {expect:26s} {top[1]:26s} {top[0]:>6,}  {flag}')
    print('-' * 118)
    print(f'通过 {len(CASES) - len(fails)} / {len(CASES)}')
    if fails:
        print()
        print('未命中的用例（含前 3 候选）：')
        for q, expect, got, sc in fails:
            print(f'  「{q}」 期望 {expect} 实得 {got}（{sc}）')
            ranked = sorted(((score(q, t, s), s) for s, _, t in skills), key=lambda x: -x[0])[:3]
            for sc2, s2 in ranked:
                print(f'      {s2:28s} {sc2:,}')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
