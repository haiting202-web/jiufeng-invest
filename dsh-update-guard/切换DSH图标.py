#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
切换 DSH Desktop 图标 —— 一次换掉三层：桌面/开始菜单快捷方式、任务栏窗口、系统托盘。

    python 切换DSH图标.py verify
    python 切换DSH图标.py apply <源图> [--fit contain|cover] [--tray-inset 0.08]
    python 切换DSH图标.py revert [--backup <备份目录>]

设计要点
--------
1. .lnk 的图标字段**直接按 MS-SHLLINK 规范改二进制**，不用 COM（WScript.Shell）。
   COM 会被安全策略拦截，且改完无法在无人值守环境复核；手改可以立刻回读校验。
   做法：只重建 StringData 段，IDList / LinkInfo / ExtraData 全部原样保留。
2. 图标产物落在 ~/.dsh/icons/（用户目录，**基座覆盖安装不会动它**），
   再把其中 3 个复制进 app 目录。快捷方式指向 ~/.dsh/icons/dsh.ico，
   所以即使 app 目录被还原，桌面图标也不会跟着碎掉。
3. app 目录里原有文件先备份到 dsh-update-guard/icon-backup-<时间戳>/，可单独回滚。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少 Pillow。请先装：pip install pillow")

# ── 落点 ──────────────────────────────────────────────────────────────────────
APP_BUILD = Path(r"D:\Program Files\DSH Desktop\resources\app\build")
ICON_HOME = Path.home() / ".dsh" / "icons"
GUARD_DIR = Path(__file__).resolve().parent
ICON_FOR_LNK = ICON_HOME / "dsh.ico"          # 快捷方式指向它（稳定路径，抗升级）

# app 目录里要替换的文件 → (尺寸, 用途)
APP_TARGETS = {
    "app-icon.png": (1024, "任务栏 + 窗口图标"),
    "tray-icon-blue.png": (16, "系统托盘（Windows 走这支）"),
    "tray-icon-blue@2x.png": (32, "系统托盘 HiDPI"),
}
# 额外产出（只放 ~/.dsh/icons，不进 app 目录）
EXTRA_TARGETS = {
    "app-icon.ico": "快捷方式用多尺寸 ICO（16→256）",
}
ICO_SIZES = [(16, 16), (20, 20), (24, 24), (28, 28), (30, 30), (32, 32),
             (36, 36), (40, 40), (48, 48), (60, 60), (64, 64), (72, 72),
             (80, 80), (96, 96), (128, 128), (256, 256)]


def home() -> Path:
    return Path.home()


_LNK_OVERRIDE: "list[Path] | None" = None

# 快捷方式显示名会随品牌改名而变（见 改快捷方式名.py）。这里按"候选名 + 目标路径"
# 双重识别，避免改名后整个快捷方式图层静默失效。
BRAND_LNK_NAME = "玖峰投研工作台"
LNK_BASENAMES = ["DSH Desktop", BRAND_LNK_NAME]


def _lnk_dirs() -> "list[Path]":
    return [
        home() / "Desktop",
        Path(r"C:\Users\Public\Desktop"),
        home() / "AppData/Roaming/Microsoft/Windows/Start Menu/Programs",
        Path(r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs"),
        home() / "AppData/Roaming/Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar",
    ]


def _looks_like_dsh(lnk: Path) -> bool:
    """按 .lnk 的目标路径判断是不是 DSH（名字改了也认得出来）。"""
    try:
        _flags, uni, _s, fields, _e, _x = split_lnk(lnk.read_bytes())
        for k in ("RELATIVE_PATH", "ICON_LOCATION", "WORKING_DIR", "NAME"):
            if k in fields:
                v = decode(fields[k], uni)
                if "DSH Desktop" in v or "dsh-desktop" in v:
                    return True
    except Exception:
        pass
    return False


def lnk_targets() -> list[Path]:
    """桌面 / 开始菜单 / 任务栏固定 里的 DSH 快捷方式（存在的才算）。"""
    if _LNK_OVERRIDE is not None:                     # 调试用：只看指定文件
        return [p for p in _LNK_OVERRIDE if p.exists()]
    cands: list[Path] = []
    for d in _lnk_dirs():
        if not d.is_dir():
            continue
        for nm in LNK_BASENAMES:
            cands.append(d / (nm + ".lnk"))
        # 兜底：目录里任何指向 DSH 的快捷方式（应对再改名 / 未知语言版本）
        for p in d.glob("*.lnk"):
            if p not in cands and _looks_like_dsh(p):
                cands.append(p)
    seen, out = set(), []
    for p in cands:
        if p.exists() and p not in seen:
            seen.add(p)
            out.append(p)
    return out


# ── MS-SHLLINK：读 / 改 IconLocation ─────────────────────────────────────────
STRINGDATA_BITS = [(0x04, "NAME"), (0x08, "RELATIVE_PATH"), (0x10, "WORKING_DIR"),
                   (0x20, "ARGUMENTS"), (0x40, "ICON_LOCATION")]


def split_lnk(b: bytes):
    """返回 (flags, uni, sd_start, fields{名称: bytes原始}, sd_end, extra)"""
    flags = int.from_bytes(b[20:24], "little")
    uni = bool(flags & 0x80)
    o = 76
    if flags & 0x01:                                  # LinkTargetIDList
        o += 2 + int.from_bytes(b[o:o + 2], "little")
    if flags & 0x02:                                  # LinkInfo
        o += int.from_bytes(b[o:o + 4], "little")
    sd_start, p, fields = o, o, {}
    for bit, name in STRINGDATA_BITS:
        if flags & bit:
            n = int.from_bytes(b[p:p + 2], "little")
            p += 2
            size = n * 2 if uni else n
            fields[name] = b[p:p + size]
            p += size
    return flags, uni, sd_start, fields, p, b[p:]


def decode(raw: bytes, uni: bool) -> str:
    return raw.decode("utf-16-le" if uni else "latin-1", "replace")


def encode(s: str, uni: bool) -> bytes:
    return s.encode("utf-16-le" if uni else "latin-1", "replace")


def read_lnk_icon(lnk: Path) -> str:
    _flags, uni, _sd_start, fields, _sd_end, _extra = split_lnk(Path(lnk).read_bytes())
    if "ICON_LOCATION" not in fields:
        return ""
    return decode(fields["ICON_LOCATION"], uni)


def patch_lnk_icon(lnk: Path, icon_location: str) -> dict:
    """把 ICON_LOCATION 改成 icon_location，其余部分逐字节保留。返回变动摘要。"""
    b = lnk.read_bytes()
    flags, uni, sd_start, fields, _sd_end, extra = split_lnk(b)
    before = decode(fields["ICON_LOCATION"], uni) if "ICON_LOCATION" in fields else "(未设置)"

    out = bytearray()
    out += b[:20]
    out += (flags | 0x40).to_bytes(4, "little")       # 打开 HasIconLocation
    out += b[24:sd_start]                             # 头尾 + IDList + LinkInfo 原样
    for bit, name in STRINGDATA_BITS:
        if name == "ICON_LOCATION":
            raw = encode(icon_location, uni)
            n = len(icon_location)
        elif name in fields:
            raw, n = fields[name], (len(fields[name]) // 2 if uni else len(fields[name]))
        else:
            continue
        out += n.to_bytes(2, "little") + raw
    out += extra                                      # ExtraData 原样
    lnk.write_bytes(bytes(out))

    after = read_lnk_icon(lnk)
    return {"lnk": str(lnk), "before": before, "after": after,
            "ok": after.lower() == icon_location.lower(),
            "sizeBefore": len(b), "sizeAfter": len(out)}


# ── 图像处理 ─────────────────────────────────────────────────────────────────
def square(img: Image.Image, size: int, fit: str, inset: float = 0.0) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    if fit == "cover":                                # 居中裁切填满
        side = min(w, h)
        img = img.crop(((w - side) // 2, (h - side) // 2,
                        (w - side) // 2 + side, (h - side) // 2 + side))
        canvas = img
    else:                                             # contain：等比缩放 + 透明留白
        scale = size / max(w, h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        resized = img.resize((nw, nh), Image.LANCZOS)
        canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    body = canvas.resize((size, size), Image.LANCZOS) if canvas.size != (size, size) else canvas

    if inset > 0:                                     # 内缩（托盘图标避免顶边）
        pad = max(1, round(size * inset))
        inner = size - pad * 2
        shrunk = body.resize((inner, inner), Image.LANCZOS)
        padded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        padded.paste(shrunk, (pad, pad), shrunk)
        body = padded
    return body


def build_icons(src: Path, fit: str, tray_inset: float) -> dict[str, Image.Image]:
    base = Image.open(src)
    out: dict[str, Image.Image] = {}
    out["app-icon.png"] = square(base, 1024, fit)
    for name in ("tray-icon-blue.png", "tray-icon-blue@2x.png"):
        size = APP_TARGETS[name][0]
        out[name] = square(base, size, fit, inset=tray_inset)
    out["_base1024"] = out["app-icon.png"]
    return out


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16] if p.exists() else "-"


# ── 子命令 ───────────────────────────────────────────────────────────────────
def cmd_verify(args) -> int:
    app = args.app_dir
    print("=" * 72)
    print("  DSH 图标现状")
    print("=" * 72)
    print(f"\n① app 目录  {app}")
    for name, (size, use) in APP_TARGETS.items():
        p = app / name
        if p.exists():
            im = Image.open(p)
            print(f"   {name:24} {im.size[0]}x{im.size[1]:<5} {(p.stat().st_size/1024):8.1f} KB  sha={sha(p)}  {use}")
        else:
            print(f"   {name:24} ★缺失  {use}")
    ico = app / "app-icon.ico"
    print(f"   {'app-icon.ico':24} （运行时不读，仅为打包源文件）{'存在' if ico.exists() else '缺失'}")

    print(f"\n② 快捷方式   （指向 {ICON_FOR_LNK}）")
    print(f"   图标文件存在: {ICON_FOR_LNK.exists()}"
          + (f"  ({ICON_FOR_LNK.stat().st_size/1024:.1f} KB)" if ICON_FOR_LNK.exists() else "   ★ 需先 apply"))
    for lnk in lnk_targets():
        flags, uni, *_ = split_lnk(lnk.read_bytes())
        print(f"   {'/'.join(lnk.parts[-2:])}")
        print(f"      HasIconLocation={bool(flags & 0x40)}  →  {read_lnk_icon(lnk) or '(默认，用目标 exe 内嵌图标)'}")

    bks = sorted(GUARD_DIR.glob("icon-backup-*"))
    print(f"\n③ 备份  {len(bks)} 份")
    for d in bks[-3:]:
        print(f"   {d.name}")
    print()
    return 0


def cmd_apply(args) -> int:
    src = Path(args.source).expanduser()
    if not src.exists():
        print(f"源图不存在：{src}")
        return 2
    app = args.app_dir
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    backup = Path(args.backup_dir) if args.backup_dir else GUARD_DIR / f"icon-backup-{ts}"

    icons = build_icons(src, args.fit, args.tray_inset)
    src_im = Image.open(src)
    print("=" * 72)
    print(f"  源图 : {src}  {src_im.size[0]}x{src_im.size[1]}  {src_im.mode}")
    print(f"  缩放 : {args.fit}   托盘内缩: {args.tray_inset:.1%}")
    print("=" * 72)

    # 1) 产出到 ~/.dsh/icons
    ICON_HOME.mkdir(parents=True, exist_ok=True)
    print(f"\n① 生成图标 → {ICON_HOME}")
    plan = dict(APP_TARGETS)
    for name in plan:
        if name in icons:
            icons[name].save(ICON_HOME / name)
    base = icons["_base1024"]
    base.save(ICON_FOR_LNK, format="ICO", sizes=ICO_SIZES)
    ico_app = ICON_HOME / "app-icon.ico"              # 与 dsh.ico 同源，方便日后重新打包 exe
    shutil.copy2(ICON_FOR_LNK, ico_app)
    for n in ["app-icon.png"] + [k for k in plan if k.startswith("tray")]:
        p = ICON_HOME / n
        print(f"   {n:24} {Image.open(p).size[0]:>4}px  {p.stat().st_size/1024:8.1f} KB")
    print(f"   {ICON_FOR_LNK.name:24} 16 帧      {ICON_FOR_LNK.stat().st_size/1024:8.1f} KB  ← 快捷方式指向它")
    print(f"   {ico_app.name:24} 同上        （打包 exe 时用）")

    # 2) 备份 app 目录原文件
    backup.mkdir(parents=True, exist_ok=True)
    meta = {"timestamp": ts, "source": str(src), "fit": args.fit,
            "trayInset": args.tray_inset, "appDir": str(app), "files": {}, "lnks": {}}
    print(f"\n② 备份原文件 → {backup}")
    for name in plan:
        p = app / name
        if p.exists():
            shutil.copy2(p, backup / name)
            meta["files"][name] = {"sha": sha(p), "size": p.stat().st_size}
            print(f"   {name:24} 已备份  sha={sha(p)}")
        else:
            meta["files"][name] = {"sha": None, "size": 0}
            print(f"   {name:24} 原本不存在（回滚时会删除）")

    # 3) 写入 app 目录
    print(f"\n③ 写入 {app}")
    failed = []
    for name in plan:
        try:
            shutil.copy2(ICON_HOME / name, app / name)
            print(f"   {name:24} ✓  {sha(app/name)}")
        except PermissionError:
            failed.append(name)
            print(f"   {name:24} ✗ 权限不足（需管理员）")
    if failed:
        print("\n   ★ 写入 app 目录失败 —— 请用【管理员】身份重跑。")
        print(f"   备份保留在 {backup}（含 meta.json 前的部分），未做任何破坏性改动。")

    # 4) 快捷方式
    print("\n④ 快捷方式图标")
    if not ICON_FOR_LNK.exists():
        print("   ★ dsh.ico 未生成，跳过")
    else:
        for lnk in lnk_targets():
            bak = backup / (lnk.stem + f".{lnk.parent.name}.lnk")
            shutil.copy2(lnk, bak)
            meta["lnks"][str(lnk)] = {"backup": str(bak), "before": read_lnk_icon(lnk)}
            r = patch_lnk_icon(lnk, str(ICON_FOR_LNK))
            print(f"   {lnk.name}  [{lnk.parent.name}]")
            print(f"      {r['before'] or '(未设置)'}  →  {r['after']}")
            print(f"      校验: {'通过' if r['ok'] else '★ 失败'}   {r['sizeBefore']} → {r['sizeAfter']} 字节")

    (backup / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), "utf-8")

    # 5) 刷新图标缓存
    print("\n⑤ 刷新 Windows 图标缓存")
    for cmd in (["ie4uinit.exe", "-show"],):
        try:
            subprocess.run(cmd, capture_output=True, timeout=20)
            print(f"   已执行 {' '.join(cmd)}")
        except Exception as e:
            print(f"   {cmd[0]} 未执行：{e}")

    print(f"\n备份清单: {backup / 'meta.json'}")
    print("托盘/任务栏图标需【重启 DSH】生效；桌面图标若没变，按 F5 刷新桌面。")
    return 0


def cmd_revert(args) -> int:
    bks = sorted(GUARD_DIR.glob("icon-backup-*"))
    if args.backup_dir:
        backup = Path(args.backup_dir)
    elif bks:
        backup = bks[-1]
    else:
        print("找不到任何 icon-backup-* 备份")
        return 2
    if not backup.exists():
        print(f"备份目录不存在：{backup}")
        return 2
    meta_f = backup / "meta.json"
    meta = json.loads(meta_f.read_text("utf-8")) if meta_f.exists() else {}
    app = Path(meta.get("appDir", args.app_dir))

    print(f"从 {backup} 还原\n")
    print("① app 目录")
    for name, info in (meta.get("files") or {}).items():
        dst = app / name
        srcf = backup / name
        if srcf.exists():
            try:
                shutil.copy2(srcf, dst)
                print(f"   {name:24} 已还原  sha={sha(dst)}")
            except PermissionError:
                print(f"   {name:24} ✗ 权限不足（需管理员）")
        else:
            if dst.exists():
                try:
                    dst.unlink()
                    print(f"   {name:24} 已删除（原本就不存在）")
                except PermissionError:
                    print(f"   {name:24} ✗ 权限不足（需管理员）")
    print("\n② 快捷方式")
    for lnk_s, info in (meta.get("lnks") or {}).items():
        bak = Path(info["backup"])
        if bak.exists():
            shutil.copy2(bak, lnk_s)
            print(f"   {lnk_s}")
            print(f"      → {read_lnk_icon(Path(lnk_s)) or '(恢复为未设置)'}")
    try:
        subprocess.run(["ie4uinit.exe", "-show"], capture_output=True, timeout=20)
        print("\n③ 图标缓存已刷新")
    except Exception:
        pass
    print("\n重启 DSH 后生效。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="切换 DSH Desktop 图标（快捷方式 / 任务栏 / 托盘）")
    ap.add_argument("action", choices=["verify", "apply", "revert"])
    ap.add_argument("source", nargs="?", help="apply 时的源图（png/jpg/webp，建议 ≥512 正方形）")
    ap.add_argument("--fit", choices=["contain", "cover"], default="contain",
                    help="contain=等比缩放留白（默认，不裁切）；cover=居中裁切填满")
    ap.add_argument("--tray-inset", type=float, default=0.0,
                    help="托盘图标四周内缩比例，如 0.08 表示 8%%")
    ap.add_argument("--app-dir", default=str(APP_BUILD), help="调试用：改这个目录代替 app build")
    ap.add_argument("--backup-dir", default=None, help="调试用：指定备份目录")
    ap.add_argument("--lnk", action="append", default=None,
                    help="调试用：只处理这些 .lnk（可重复），不碰真实快捷方式")
    args = ap.parse_args()
    args.app_dir = Path(args.app_dir)

    global _LNK_OVERRIDE
    if args.lnk:
        _LNK_OVERRIDE = [Path(p) for p in args.lnk]

    if args.action == "apply" and not args.source:
        ap.error("apply 需要给出源图路径")
    return {"verify": cmd_verify, "apply": cmd_apply, "revert": cmd_revert}[args.action](args)


if __name__ == "__main__":
    sys.exit(main())
