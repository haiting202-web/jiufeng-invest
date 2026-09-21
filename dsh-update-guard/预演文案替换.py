# -*- coding: utf-8 -*-
"""
预演「文案覆盖表 + 术语表」在**真实 DSH 字典**上的效果，改词表前后各跑一次。

逻辑与插件层 gen-client.mjs 里 TEXT_OVERRIDES / TERM_MAP 保持一致：
  ① 先做术语替换（对每条 zh 文案做子串替换）
  ② 再做精确覆盖（优先级更高，可用来反悔个别词条）

只读，不改任何文件。

用法：
    python 预演文案替换.py                 # 列出会被改动的文案
    python 预演文案替换.py --all           # 连没改动的也列出来
    python 预演文案替换.py --grep 工作区    # 只看涉及的
"""
import argparse
import os
import re
import sys

APP = r"D:\Program Files\DSH Desktop\resources\app"
ROOT = os.path.join(APP, "node_modules", "@deepseek-ai")
PAT = re.compile(r'"([A-Za-z][\w.]*)"\s*:\s*"((?:[^"\\]|\\.)*)"')
CJK = re.compile(r"[\u4e00-\u9fff]")

# ⚠️ 与 gen-client.mjs 保持同步
TERM_MAP = {
    # 长词在前：先命中「会话工作区」，剩下的「工作区」再单独替换
    "会话工作区": "投研空间",
    "工作区": "投研空间",
}
TEXT_OVERRIDES = {
    "hero.headline": "让投研工作更简单",
    "hero.preview": "内测版",
    "placeholder.hero": "描述你的投研需求, / 调用指令, @ 文件或对话",
    "placeholder.default": "描述你的投研需求, / 调用指令, @ 文件或对话",
    "settings.models::welcomeTitle": "内测声明",
}


def iter_bundles():
    for dp, _dn, fn in os.walk(ROOT):
        if os.sep + "lib" not in dp:
            continue
        pkg = dp.replace(ROOT + os.sep, "").split(os.sep)[0]
        for f in fn:
            if not f.endswith(".js"):
                continue
            p = os.path.join(dp, f)
            try:
                if os.path.getsize(p) > 12 * 1024 * 1024:
                    continue
            except OSError:
                continue
            yield pkg, p


def simulate(pkg, key, value):
    """返回 (新值, 说明)；未改动则说明为 ''"""
    notes = []
    v = value
    for term, repl in TERM_MAP.items():
        if term in v:
            v = v.replace(term, repl)
    if v != value:
        notes.append("术语")
    # 精确覆盖（含 ns:: 限定）
    for spec, new in TEXT_OVERRIDES.items():
        if "::" in spec:
            ns, k = spec.split("::", 1)
            if ns != pkg and not pkg.endswith(ns.replace(".", "-")):
                continue
        else:
            k = spec
        if k == key:
            v = new
            notes.append("覆盖")
    if notes:
        return v, "+".join(notes)
    return value, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="连未改动的也列")
    ap.add_argument("--grep", default="", help="只看值里含这些词的（逗号分隔）")
    args = ap.parse_args()
    kws = [k.strip() for k in args.grep.split(",") if k.strip()]

    seen = set()
    rows = []
    for pkg, path in iter_bundles():
        try:
            s = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in PAT.finditer(s):
            k, v = m.group(1), m.group(2)
            if not CJK.search(v):
                continue
            if (pkg, k, v) in seen:
                continue
            seen.add((pkg, k, v))
            nv, why = simulate(pkg, k, v)
            if why or args.all:
                rows.append((pkg, k, v, nv, why))

    hits = [r for r in rows if r[4]]
    print("扫到中文文案 %d 条；会被改动 %d 条\n" % (len(seen), len(hits)))
    if kws:
        rows = [r for r in rows if any(kw in r[2] for kw in kws)]

    cur = None
    for pkg, k, v, nv, why in sorted(rows, key=lambda r: (not r[4], r[0], r[1])):
        if kws and not why and not args.all:
            continue
        if pkg != cur:
            print("── %s" % pkg)
            cur = pkg
        tag = ("[%s]" % why) if why else "     "
        if why:
            print("  %s %s" % (tag, k))
            print("      原：%s" % v[:78])
            print("      新：%s" % nv[:78])
        else:
            print("  %s %s  %s" % (tag, k, v[:60]))


if __name__ == "__main__":
    sys.exit(main())
