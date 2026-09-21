# -*- coding: utf-8 -*-
"""
扫描 DSH 各 bundle 里的 locale 字典文案，列出「key → 中文值」，
用于制定品牌/术语覆盖表（配合插件层 TEXT_OVERRIDES 使用）。

只读，不改任何文件。

用法：
    python 扫描界面文案.py                     # 列出全部中文文案
    python 扫描界面文案.py --grep 工作区,空间   # 只看含这些关键词的
    python 扫描界面文案.py --ns conversation    # 只看某个命名空间（包名）
    python 扫描界面文案.py --keys              # 只列 key，不列值（词表用）
"""
import argparse
import os
import re
import sys
from collections import defaultdict

APP = r"D:\Program Files\DSH Desktop\resources\app"
ROOT = os.path.join(APP, "node_modules", "@deepseek-ai")

# 匹配 "some.key": "值"   值里允许 \n \" 等转义
PAT = re.compile(r'"([A-Za-z][\w.]*)"\s*:\s*"((?:[^"\\]|\\.)*)"')
CJK = re.compile(r'[\u4e00-\u9fff]')


def iter_bundles():
    """产出 (包名, 文件路径)；只扫 lib/ 下的 js，跳过超大文件（map/资源）。"""
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--grep", default="", help="只显示值里含这些关键词的（逗号分隔）")
    ap.add_argument("--ns", default="", help="只看这个包（命名空间）")
    ap.add_argument("--keys", action="store_true", help="只列 key")
    ap.add_argument("--all", action="store_true", help="含非中文文案")
    args = ap.parse_args()

    kws = [k.strip() for k in args.grep.split(",") if k.strip()]

    # (pkg, key) -> 值集合（同一 key 可能在 zh/en 两处出现，这里靠值是否含中文区分）
    hits = defaultdict(set)
    for pkg, path in iter_bundles():
        if args.ns and args.ns not in pkg:
            continue
        try:
            s = open(path, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in PAT.finditer(s):
            k, v = m.group(1), m.group(2)
            if not args.all and not CJK.search(v):
                continue
            if kws and not any(kw in v for kw in kws):
                continue
            hits[(pkg, k)].add(v)

    print("命中 %d 条\n" % len(hits))
    if args.keys:
        for (pkg, k) in sorted(hits):
            print('%s\t%s' % (pkg, k))
        return

    cur = None
    for (pkg, k) in sorted(hits):
        if pkg != cur:
            print("── %s ──" % pkg)
            cur = pkg
        for v in sorted(hits[(pkg, k)]):
            print("  %-38s %s" % (k, v[:70]))


if __name__ == "__main__":
    sys.exit(main())
