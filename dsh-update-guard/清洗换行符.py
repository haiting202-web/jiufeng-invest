# -*- coding: utf-8 -*-
"""
把 app 包里**被误改成 CRLF** 的文件清洗回原始的 LF。

背景（2026-10-09 踩坑）
----------------------
`品牌文案补丁.py` 早期版本用 `Path.write_text(ns, encoding="utf-8")`（newline 默认 None），
在 Windows 上会把每个 "\\n" 翻译成 os.linesep = "\\r\\n"。DSH 的 app 包 bundle 原始**全是 LF**，
于是一批文件被整份改成 CRLF（client.js 37563 行、electron-runtime 3302 行 …），
与上游基线产生无意义 diff，也可能干扰按字节比对的一致性校验。

本脚本用「**原始备份**」做判据，而不是猜：
  · 对每个目标文件，取**最早**的 `brand-copy-backup-*` 里同名副本作为基线；
  · 基线是 LF（CR==0）而当前是 CRLF → 判定为污染，\r\n → \n 写回（二进制，不做任何文本翻译）；
  · 基线本身就是 CRLF → 不动（尊重上游）。

这样即使某天官方 bundle 改成 CRLF，也不会被本脚本误清洗。

用法
----
    python 清洗换行符.py            # 干跑，只列出需要清洗的文件
    python 清洗换行符.py --write    # 实际写回（先备份到 newline-clean-backup-<ts>/）
"""
import argparse
import importlib.util
import shutil
import sys
from datetime import datetime
from pathlib import Path

GUARD = Path(__file__).resolve().parent

# 复用品牌补丁的 TARGETS / APP，避免两处维护目标名单
_spec = importlib.util.spec_from_file_location("bcp", GUARD / "品牌文案补丁.py")
bcp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bcp)


def cr(b: bytes) -> int:
    return b.count(b"\r")


def baseline_for(rel: str):
    """返回该文件在**最早**品牌备份里的副本路径（即污染前的原始字节）。"""
    key = rel.replace("/", "__")
    for d in sorted(GUARD.glob("brand-copy-backup-*")):
        f = d / key
        if f.is_file():
            return f
    return None


def targets(app: Path):
    out = []
    for pat, _desc in bcp.TARGETS:
        for p in sorted(app.glob(pat)):
            if p.name.endswith(".map"):
                continue
            rel = str(p.relative_to(app)).replace("\\", "/")
            out.append((p, rel))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="实际写回（默认干跑）")
    ap.add_argument("--app", default=str(bcp.APP), help="DSH app 目录")
    args = ap.parse_args()
    app = Path(args.app)
    if not app.is_dir():
        print("★ app 目录不存在: %s" % app)
        return 2

    todo, skipped = [], []
    for p, rel in targets(app):
        cur = p.read_bytes()
        base = baseline_for(rel)
        if base is None:
            skipped.append((rel, "无基线备份，跳过（保守不动）"))
            continue
        bb = base.read_bytes()
        if cr(bb) == 0 and cr(cur) > 0:
            todo.append((p, rel, base, cr(cur)))
        elif cr(bb) > 0 and cr(cur) == 0:
            skipped.append((rel, "基线为 CRLF、当前为 LF —— 跳过（不动）"))

    print("=" * 72)
    print("  app 包换行符清洗" + ("  【落盘】" if args.write else "  【预演，不写盘】"))
    print("=" * 72)
    for rel, why in skipped:
        print("  · %-56s %s" % (rel, why))
    if not todo:
        print("\n没有需要清洗的文件。")
        return 0
    print()
    for p, rel, base, n in todo:
        print("  ★ %-56s CRLF→LF（%d 行，基线 %s）" % (rel, n, base.parent.name))
    if not args.write:
        print("\n预演结束。确认无误后加 --write 落盘。")
        return 0

    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    bdir = GUARD / ("newline-clean-backup-" + ts)
    bdir.mkdir(parents=True, exist_ok=True)
    n = 0
    for p, rel, base, _cnt in todo:
        shutil.copy2(p, bdir / rel.replace("/", "__"))
        b = p.read_bytes()
        p.write_bytes(b.replace(b"\r\n", b"\n"))
        n += 1
    print("\n已清洗 %d 个文件；清洗前副本 → %s" % (n, bdir.name))
    return 0


if __name__ == "__main__":
    sys.exit(main())
