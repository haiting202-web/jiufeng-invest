# -*- coding: utf-8 -*-
"""verify-skills-md.py — SKILL.md 重建后的回测检查。

检查项：
  1. 文件数与目录一致性（本地预设 / GitHub 仓库预设）
  2. 内容保留率（源 prompt vs 能力定位）
  3. frontmatter 合法性（必需字段、category 取值、name==目录名）
  4. id 唯一性
  5. 段落完整性（引导词 / 能力定位 / 数据获取规范 / 输出要求）
  6. Markdown 结构（H1 唯一、代码围栏闭合、标题层级无跳级）—— 均跳过代码围栏内容
  7. 体积与预算

已知例外：bull-bear-debate（本地自建、另一血缘，无 category 与通用样板段落）
退出码：0 全通过；1 有失败项。
"""
import importlib.util
import os
import re
import sys
from collections import Counter

spec = importlib.util.spec_from_file_location(
    'b', r'dsh-ai-invest-sidebar\build-skills-md.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

REQUIRED_FM = ['name', 'description', 'agent_created', 'version', 'category']
REQUIRED_SEC = ['## 引导词', '## 能力定位', '## 数据获取规范', '## 输出要求']
VALID_CAT = set(b.CAT_ZH)
EXEMPT_FM = {'bull-bear-debate'}      # 自建技能，暂不套通用字段
EXEMPT_SEC = {'bull-bear-debate'}     # 自建技能，自带结构

fails, warns = [], []


def check(cond, msg, hard=True):
    if not cond:
        (fails if hard else warns).append(msg)


def split_toplevel(text):
    """按顶层 '## ' 切分，代码围栏内的 '## ' 不算章节边界。返回 (前置, {标题: 正文})。"""
    pre, out, cur, in_fence = [], {}, None, False
    for ln in text.split('\n'):
        if ln.lstrip().startswith('```'):
            in_fence = not in_fence
            (out[cur] if cur else pre).append(ln)
            continue
        if not in_fence and re.match(r'^## ', ln):
            cur = ln.strip()
            out[cur] = []
            continue
        (out[cur] if cur else pre).append(ln)
    return '\n'.join(pre), {k: '\n'.join(v) for k, v in out.items()}


def cap_bytes(text):
    _, secs = split_toplevel(text)
    hit = next((k for k in secs if k.startswith('## 能力定位')), None)
    return len(secs[hit].strip().encode()) if hit else 0


def load_dir(root):
    if not os.path.isdir(root):
        return None
    out = {}
    for name in sorted(os.listdir(root)):
        p = os.path.join(root, name, 'SKILL.md')
        if os.path.isfile(p):
            out[name] = open(p, encoding='utf-8').read()
    return out


def main():
    print('=' * 74)
    print('SKILL.md 重建 —— 回测检查')
    print('=' * 74)

    dirs = {}
    for t in b.TARGETS:
        label = '本地预设' if 'Users' in t else 'GitHub 仓库'
        d = load_dir(t)
        dirs[label] = d
        print(f'[目录] {label:12s} {len(d) if d else "不存在":>4} 个技能  {t}')

    primary = dirs.get('本地预设') or dirs.get('GitHub 仓库')
    check(primary is not None, '主目录不存在')
    if not primary:
        print('\n'.join(fails)); sys.exit(1)

    expect = 108  # 107(skills-data.json) + bull-bear-debate；新增 trader/expert/agent/investor/risk/data-review 共 6 个
    print(f'[数量] 技能总数 {len(primary)}（期望 {expect}）')
    check(len(primary) == expect, f'技能数 {len(primary)} != {expect}')

    if dirs.get('本地预设') and dirs.get('GitHub 仓库'):
        a, c = dirs['本地预设'], dirs['GitHub 仓库']
        only_a, only_c = set(a) - set(c), set(c) - set(a)
        check(not only_a and not only_c, f'两份目录技能名不同: 本地独有{only_a} 仓库独有{only_c}')
        diff = [k for k in set(a) & set(c) if a[k] != c[k]]
        check(not diff, f'两份目录内容不一致 {len(diff)} 个: {diff[:5]}')
        print(f'[一致] 两份目录完全一致: {len(set(a) & set(c))} 个（差异 {len(diff)} 个）')

    print()
    print('-' * 74)
    print('1) 内容保留率')
    web = b.parse_prompts(b.WEB_TS, '"')
    src_tot = sum(len(v.encode()) for v in web.values())
    cap_tot, matched, per = 0, 0, []
    for sid, pr in web.items():
        t = primary.get(sid)
        if not t:
            continue
        cb = cap_bytes(t)
        cap_tot += cb; matched += 1
        per.append((sid, len(pr.encode()), cb))
    rate = cap_tot / src_tot * 100 if src_tot else 0
    print(f'   源 prompt 合计 {src_tot:,} B / 对照 {matched} 个 / 能力定位合计 {cap_tot:,} B')
    print(f'   → 保留率 {rate:.1f}%')
    check(rate >= 95, f'保留率 {rate:.1f}% < 95%')
    low = [p for p in per if p[2] / p[1] < 0.9]
    if low:
        for sid, a, c in sorted(low, key=lambda x: x[2] / x[1])[:8]:
            warns.append(f'{sid}: 保留率 {c / a * 100:.1f}% ({a:,} -> {c:,})')
        check(not low, f'{len(low)} 个技能保留率 <90%', hard=False)

    print()
    print('2) frontmatter / 段落 / 结构')
    names, cats, versions = Counter(), Counter(), Counter()
    for sid, t in primary.items():
        m = re.match(r'^---\n([\s\S]*?)\n---\n', t)
        check(bool(m), f'{sid}: 缺 frontmatter')
        if not m:
            continue
        fm = m.group(1)
        keys = [l.split(':')[0].strip() for l in fm.split('\n') if ':' in l]
        if sid not in EXEMPT_FM:
            for k in REQUIRED_FM:
                check(k in keys, f'{sid}: frontmatter 缺字段 {k}')
        nm = re.search(r'^name:\s*(\S+)', fm, re.M)
        check(nm and nm.group(1) == sid, f'{sid}: name 与目录名不符 ({nm.group(1) if nm else "无"})')
        names[nm.group(1) if nm else '?'] += 1
        ct = re.search(r'^category:\s*(\S+)', fm, re.M)
        if sid not in EXEMPT_FM:
            check(ct and ct.group(1) in VALID_CAT, f'{sid}: category 非法 {ct.group(1) if ct else "无"}')
        cats[ct.group(1) if ct else '(缺)'] += 1
        vr = re.search(r'^version:\s*(\S+)', fm, re.M)
        versions[vr.group(1) if vr else '(缺)'] += 1

        body = t[m.end():]
        pre, secs = split_toplevel(body)
        if sid not in EXEMPT_SEC:
            for sec in REQUIRED_SEC:
                check(any(k.startswith(sec) for k in secs), f'{sid}: 缺段落 {sec}', hard=False)
        # 结构（跳过围栏）
        tops = [l for l in pre.split('\n') if re.match(r'^# ', l)]
        check(len(tops) == 1, f'{sid}: H1 数量 {len(tops)} != 1', hard=False)
        fence_lines = [l for l in body.split('\n') if l.lstrip().startswith('```')]
        check(len(fence_lines) % 2 == 0, f'{sid}: 代码围栏未闭合 ({len(fence_lines)} 个 ``` )')
        lvls = [len(x) for x in re.findall(r'^(#{2,6}) ', pre + '\n' + '\n'.join(secs.keys()), re.M)]
        jump = [i for i in range(1, len(lvls)) if lvls[i] - lvls[i - 1] > 1]
        check(not jump, f'{sid}: 标题层级跳级 {len(jump)} 处', hard=False)

    dup = [k for k, v in names.items() if v > 1]
    check(not dup, f'id 重复: {dup}')
    print(f'   id 唯一性   : {"通过" if not dup else "失败 " + str(dup)}')
    print(f'   category    : {dict(cats)}')
    print(f'   version     : {dict(versions)}')

    print()
    print('3) 体积与预算')
    total = sum(len(t.encode()) for t in primary.values())
    desc = 0
    for t in primary.values():
        m = re.search(r'^description:\s*(.*)$', t, re.M)
        desc += len(m.group(1).encode()) if m else 0
    print(f'   全文总量    {total:,} B (~{total // 3:,} tokens)')
    print(f'   常驻描述    {desc:,} B (~{desc // 3:,} tokens)  占全文 {desc / total * 100:.1f}%')
    print(f'   单技能均值  {total // len(primary):,} B')

    print()
    print('=' * 74)
    if fails:
        print(f'[FAIL] {len(fails)} 项：')
        for f in fails[:25]:
            print('   -', f)
    if warns:
        print(f'[WARN] {len(warns)} 项：')
        for w in warns[:15]:
            print('   -', w)
    if not fails:
        print('== 硬性检查全部通过 ==')
    print('=' * 74)
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
