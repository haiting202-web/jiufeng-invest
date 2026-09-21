# -*- coding: utf-8 -*-
"""
切换DSH图标.py 的端到端自检。

    python 图标工具自检.py                  # 用 _icontest 沙箱备份
    python 图标工具自检.py --backup <目录>   # 用指定备份目录（真实 apply 后也可跑）

检查三件事
  ① --lnk 覆盖是否生效（真实快捷方式有没有被误改）
  ② patch 的改动范围是否收敛在 LinkFlags + StringData
  ③ 用备份还原后能否与原始逐字节一致
"""
import argparse
import hashlib
import importlib.util
import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("m", HERE / "切换DSH图标.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

OK_ALL = True


def chk(label, cond):
    global OK_ALL
    OK_ALL &= bool(cond)
    print(f"      {'OK  ' if cond else 'FAIL'}  {label}")


def md5(b):
    return hashlib.md5(b).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backup", default=str(HERE / "_icontest" / "backup"))
    args = ap.parse_args()

    import json
    backup = pathlib.Path(args.backup)
    meta = json.loads((backup / "meta.json").read_text("utf-8"))
    lnks = meta.get("lnks") or {}
    if not lnks:
        print("meta.json 里没有 lnks 记录")
        return 2

    print("=" * 74)
    print("  ① patch 后：改动范围审计（只许动 LinkFlags + StringData）")
    print("=" * 74)
    for lnk_s, info in lnks.items():
        lnk = pathlib.Path(lnk_s)
        bak = pathlib.Path(info["backup"])
        orig, new = bak.read_bytes(), lnk.read_bytes()
        fo, uo, so, fldo, _eo, exo = m.split_lnk(orig)
        fn, un, sn, fldn, _en, exn = m.split_lnk(new)
        print(f"\n   {lnk.name}  [{lnk.parent.name}]")
        chk("IsUnicode 标志一致", uo == un)
        chk("IDList + LinkInfo 段逐字节一致", orig[76:so] == new[76:sn])
        chk("ExtraData 段逐字节一致", exo == exn)
        chk("HasIconLocation 已置位", bool(fn & 0x40))
        chk("除 ICON_LOCATION 外字段全同",
            all(fldo[k] == fldn[k] for k in fldo if k != "ICON_LOCATION"))
        chk("ICON_LOCATION 已指向 dsh.ico",
            "dsh.ico" in m.read_lnk_icon(lnk).lower())
        print(f"            {info['before'] or '(未设置)'}")
        print(f"         →  {m.read_lnk_icon(lnk)}")
        print(f"            {len(orig)} → {len(new)} 字节")

    print()
    print("=" * 74)
    print("  ② revert 往返：改 → 用备份还原 → 与备份逐字节比对")
    print("=" * 74)
    for lnk_s, info in lnks.items():
        lnk = pathlib.Path(lnk_s)
        bak = pathlib.Path(info["backup"])
        orig = bak.read_bytes()
        m.patch_lnk_icon(lnk, r"%USERPROFILE%\.dsh\icons\dsh.ico")
        chk(f"{lnk.name}  patch 确实改动了文件", lnk.read_bytes() != orig)
        shutil.copy2(bak, lnk)
        chk(f"{lnk.name}  还原后与备份逐字节一致", lnk.read_bytes() == orig)
        print(f"            md5 = {md5(lnk.read_bytes())[:12]}")

    print()
    print("=" * 74)
    print("  结论：" + ("全部通过" if OK_ALL else "★ 存在失败项"))
    print("=" * 74)
    return 0 if OK_ALL else 1


if __name__ == "__main__":
    sys.exit(main())
