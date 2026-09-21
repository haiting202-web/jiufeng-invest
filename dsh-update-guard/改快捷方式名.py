# -*- coding: utf-8 -*-
"""
把 DSH 的桌面 / 开始菜单快捷方式显示名改成自定义品牌名。

- 只重命名 .lnk 文件（Windows 的显示名就是文件名），**不改 .lnk 内部内容**，
  所以图标、目标路径、工作目录全部保持原样。
- 原名 `DSH Desktop` 是安装程序写死的：覆盖安装会重新生成一个，与改名后的
  并存。`verify` 会指出这种"重复"，`apply` 会顺手清掉新冒出来的原名文件
  （先备份）。升级后重跑一次即可，已并入 `切换更新守卫.ps1 -Action Lock`。

用法：
    python 改快捷方式名.py verify           # 只读，看现在是什么状态
    python 改快捷方式名.py apply            # 改名（自动备份）
    python 改快捷方式名.py apply --to "别的名字"
    python 改快捷方式名.py revert           # 还原成 DSH Desktop
"""
import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

HOME = Path.home()
TARGET_DIRS = [
    HOME / "Desktop",
    HOME / "AppData/Roaming/Microsoft/Windows/Start Menu/Programs",
]
DEFAULT_FROM = "DSH Desktop"
DEFAULT_TO = "玖峰投研工作台"
STATE = Path(__file__).resolve().parent / "改名状态.json"
BACKUP_ROOT = Path(__file__).resolve().parent


def abbrev(p: Path) -> str:
    s = str(p)
    h = str(HOME)
    return "~" + s[len(h):] if s.startswith(h) else s


def find(from_name: str, to_name: str):
    """返回 [(目录, 文件路径, 当前是原名还是新名)]"""
    out = []
    for d in TARGET_DIRS:
        if not d.is_dir():
            continue
        for nm in (from_name, to_name):
            f = d / (nm + ".lnk")
            if f.is_file():
                out.append((d, f, "old" if nm == from_name else "new"))
    return out


def load_state():
    if STATE.is_file():
        try:
            return json.loads(STATE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_state(s):
    STATE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")


def do_verify(args, quiet=False):
    rows = find(args.frm, args.to)
    ok = True
    if not rows:
        if not quiet:
            print("★ 没找到任何快捷方式（桌面 / 开始菜单都没有 %s.lnk）" % args.frm)
        return False
    for d, f, kind in rows:
        mark = "OK" if kind == "new" else "待改"
        if kind == "old":
            ok = False
        if not quiet:
            print("  [%s] %s" % (mark, abbrev(f)))
    # 同目录下两个都存在 = 覆盖安装留下的重复
    dups = 0
    for d in TARGET_DIRS:
        if (d / (args.frm + ".lnk")).is_file() and (d / (args.to + ".lnk")).is_file():
            dups += 1
    if dups and not quiet:
        print("  注意：有 %d 个目录同时存在原名和品牌名（覆盖安装的残留），apply 会清理原名那份" % dups)
    return ok


def do_apply(args):
    rows = find(args.frm, args.to)
    if not rows:
        print("★ 没找到快捷方式，什么都没做")
        return 1
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    bdir = BACKUP_ROOT / ("lnk-name-backup-" + ts)
    bdir.mkdir(parents=True, exist_ok=True)

    st = load_state()
    st.setdefault("backups", [])
    changed, cleaned = [], []
    for d, f, kind in rows:
        # 备份名带上目录标签，还原时才能回到原位（目录名可能重名，用完整路径的尾巴区分）
        label = d.name.replace(" ", "_") or "root"
        if d.name == "Programs":
            label = "StartMenu"
        elif d.name == "Desktop":
            label = "Desktop"
        shutil.copy2(f, bdir / ("%s__%s" % (label, f.name)))
        if kind == "old":
            newp = d / (args.to + ".lnk")
            if newp.exists():
                # 品牌名已存在 → 只删原名这份（已备份）
                f.unlink()
                cleaned.append(f)
            else:
                f.rename(newp)
                changed.append(newp)
        # kind == "new"：已经是目标名，备份即可，不重复动作

    st["backups"].append({"ts": ts, "dir": str(bdir), "from": args.frm, "to": args.to})
    st["current"] = args.to
    save_state(st)

    print("备份目录: %s" % abbrev(bdir))
    for f in changed:
        print("  改名 → %s" % abbrev(f))
    for f in cleaned:
        print("  清理残留 → %s" % abbrev(f))
    if not changed and not cleaned:
        print("  已经都是品牌名，无需改动")
    return 0


def do_revert(args):
    st = load_state()
    if not st.get("backups"):
        print("★ 没有改名记录，无法还原")
        return 1
    last = st["backups"][-1]
    bdir = Path(last["dir"])
    frm, to = last["from"], last["to"]
    if not bdir.is_dir():
        print("★ 备份目录不存在: %s" % bdir)
        return 1

    dirs = {"Desktop": TARGET_DIRS[0], "StartMenu": TARGET_DIRS[1]}
    n = 0
    for bk in sorted(bdir.glob("*.lnk")):
        if "__" not in bk.name:
            continue
        label, orig_name = bk.name.split("__", 1)
        d = dirs.get(label)
        if d is None:
            continue
        # 先把品牌名那份清掉，再把备份贴回原位，保证目录里不残留两份
        if orig_name == frm + ".lnk":
            cur = d / (to + ".lnk")
            if cur.is_file():
                cur.unlink()
        shutil.copy2(bk, d / orig_name)
        print("  还原 → %s" % abbrev(d / orig_name))
        n += 1

    st["current"] = frm
    save_state(st)
    if not n:
        print("  备份里没有可还原的文件")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["verify", "apply", "revert"], nargs="?", default="verify")
    ap.add_argument("--from", dest="frm", default=DEFAULT_FROM, help="原显示名")
    ap.add_argument("--to", default=DEFAULT_TO, help="目标显示名")
    args = ap.parse_args()

    if args.action == "verify":
        ok = do_verify(args)
        print("\n结论: " + ("快捷方式显示名已是「%s」" % args.to if ok else "尚未改名"))
        return 0 if ok else 2
    if args.action == "apply":
        return do_apply(args)
    return do_revert(args)


if __name__ == "__main__":
    sys.exit(main())
