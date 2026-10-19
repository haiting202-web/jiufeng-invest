# -*- coding: utf-8 -*-
"""patch-triggers.py — 给指定技能补充「触发词」自然说法（两份目录同时改）。幂等。"""
import os
import re

ROOTS = [r'%USERPROFILE%\.dsh\.agent-presets\ai-finance\skills',
         r'<仓库根>-github\agent-preset\ai-finance\skills']

EXTRA = {
    # A 股选股筛选：补「A股」这一弱信号 + 常见自然说法
    'china-idea-generation': ['A股', 'A股筛选', 'A股选股', 'A股主题投资', 'A股标的筛选',
                              '筛选', '选股', '主题', '选股筛选'],
    # 并购增厚稀释：补裸词与常见搭配
    'merger-accretion-model': ['增厚', '稀释', '增厚稀释分析', '并购EPS影响', '收购对价'],
}


def patch(path, extras):
    t = open(path, encoding='utf-8').read()
    m = re.search(r'^(description:\s*)(.*?)(触发词：)([^。]+)(。)(.*)$', t, re.M)
    if not m:
        return 'NO-MATCH'
    cur = [x.strip() for x in m.group(4).split('、') if x.strip()]
    add = [x for x in extras if x not in cur]
    if not add:
        return 'ALREADY'
    new = '、'.join(cur + add)
    t = t[:m.start()] + m.group(1) + m.group(2) + m.group(3) + new + m.group(5) + m.group(6) + t[m.end():]
    open(path, 'w', encoding='utf-8', newline='\n').write(t)
    return 'PATCHED +' + str(len(add))


for sid, extras in EXTRA.items():
    for root in ROOTS:
        p = os.path.join(root, sid, 'SKILL.md')
        if os.path.isfile(p):
            print(f'{sid:26s} {os.path.basename(os.path.dirname(root))[:24]:26s} {patch(p, extras)}')
        else:
            print(f'{sid:26s} 缺失 {p}')
