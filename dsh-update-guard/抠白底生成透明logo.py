#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「白底 + 彩色图形」的位图变成透明背景的正方形 PNG，供 切换DSH图标.py 使用。

    python 抠白底生成透明logo.py <源图> --inspect
    python 抠白底生成透明logo.py <源图> --preview 预览.png
    python 抠白底生成透明logo.py <源图> --out logo-transparent.png

为什么不能直接拿白底图做图标
--------------------------
Windows 任务栏在深色模式下是深灰，托盘背景随时可变。白底方块贴上去非常突兀。
所以要把「纯白背景」转成 alpha=0。

算法
----
白底图上，边缘抗锯齿像素满足 C = a·F + (1-a)·W（W=白=255）。判据取 min(R,G,B)：
    min ≥ hi        →  a = 0      （纯背景）
    min ≤ lo        →  a = 1      （饱和前景，颜色原样）
    lo < min < hi   →  线性过渡
过渡像素再反解 F（unpremultiply），否则边缘会被白底"冲淡"发灰、缩放后出白晕。
对「白底占比高、过渡带窄」的图（白底 logo、聊天截图）效果最好；inspect 会先告诉你
这张图适不适合，以及过渡带占多少。

缩放时为什么不能直接 resize RGBA
-------------------------------
透明区的 RGB 是 0,0,0。LANCZOS 会把边缘像素和这些黑色混起来，图标边缘出现一圈暗边
（在深色底上尤其明显）。标准解法是预乘后再缩放，但 Pillow 没有逐通道除法
（ImageChops.divide 在新版本已移除）。这里改用等价做法：**把全透明像素的 RGB 刷成
前景平均色**，于是插值只在"蓝色↔蓝色"之间发生，边缘不再发暗。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("缺少 Pillow。请先装：pip install pillow")

DEFAULT_HOME = Path.home() / ".dsh" / "icons"
_FONT_CACHE: dict[int, object] = {}


def font(size: int):
    """PIL 自带位图字体不含汉字，会渲染成方块。优先用系统中文字体。"""
    if size in _FONT_CACHE:
        return _FONT_CACHE[size]
    for p in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\msyhl.ttc",
              r"C:\Windows\Fonts\simhei.ttf", r"C:\Windows\Fonts\simsun.ttc"):
        if Path(p).exists():
            try:
                f = ImageFont.truetype(p, size)
                _FONT_CACHE[size] = f
                return f
            except Exception:
                continue
    f = ImageFont.load_default()
    _FONT_CACHE[size] = f
    return f


# ── 抠底 ─────────────────────────────────────────────────────────────────────
def keyout_white(src: Path, lo: int, hi: int) -> tuple[Image.Image, dict]:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    span = max(1, hi - lo)
    stat = {"total": w * h, "bg": 0, "fg": 0, "edge": 0}

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            m = r if r < g else g
            if b < m:
                m = b
            if m >= hi:                                # 纯背景
                stat["bg"] += 1
                continue
            if m <= lo:                                # 饱和前景，颜色原样保留
                op[x, y] = (r, g, b, 255)
                stat["fg"] += 1
                continue
            a = (hi - m) / span                        # 0..1 覆盖率
            inv = (1.0 - a) * 255.0                    # 白底贡献

            def un(c: float) -> int:
                v = (c - inv) / a
                return 0 if v < 0 else (255 if v > 255 else int(round(v)))

            op[x, y] = (un(r), un(g), un(b), int(round(a * 255)))
            stat["edge"] += 1
    return out, stat


def fill_transparent(im: Image.Image) -> Image.Image:
    """把全透明像素的 RGB 刷成前景平均色，避免缩放时和黑色插值出暗边。"""
    px = im.load()
    w, h = im.size
    sr = sg = sb = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a >= 8:
                sr += r
                sg += g
                sb += b
                n += 1
    if not n:
        return im
    avg = (sr // n, sg // n, sb // n)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                px[x, y] = (avg[0], avg[1], avg[2], 0)
    return im


def resize_rgba(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    """调用前请确保已过 fill_transparent，否则边缘会发暗。"""
    return im.resize(size, Image.LANCZOS)


# ── 裁切 + 居中正方形 ────────────────────────────────────────────────────────
def square_fit(im: Image.Image, size: int, pad: float, do_trim: bool) -> tuple[Image.Image, dict]:
    info = {"inkBefore": im.size}
    if do_trim:
        box = im.getchannel("A").getbbox()             # 只看 alpha，稳
        if box:
            info["inkBox"] = box
            im = im.crop(box)
    info["inkAfter"] = im.size
    if size <= 0:                                      # 不正方形化，原样返回
        return im, info
    avail = size * (1.0 - 2.0 * pad)
    scale = avail / max(im.size)
    nw = max(1, round(im.width * scale))
    nh = max(1, round(im.height * scale))
    body = resize_rgba(im, (nw, nh))
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(body, ((size - nw) // 2, (size - nh) // 2), body)
    info["placed"] = (nw, nh, (size - nw) // 2, (size - nh) // 2)
    return canvas, info


# ── 预览图：浅色 / 深色两种底色、四种实际尺寸 ────────────────────────────────
def build_preview(icon: Image.Image, out: Path, title: str, subtitle: str) -> None:
    W, H, PAD = 940, 400, 24
    half = (W - PAD * 3) // 2                          # 434
    cv = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(cv)
    d.text((PAD, 16), title, fill=(20, 20, 25), font=font(17))
    d.text((PAD, 40), subtitle, fill=(130, 130, 140), font=font(13))

    frames = [("浅色底（浅色主题资源管理器 / 设置页）", (245, 245, 247), (60, 60, 67)),
              ("深色底（深色任务栏 / 深色托盘）", (30, 30, 32), (235, 235, 245))]
    strip = [64, 32, 24, 16]                           # 底部一排：真实使用尺寸

    for i, (label, bg, fg) in enumerate(frames):
        x0 = PAD + i * (half + PAD)
        y0 = 76
        d.rounded_rectangle([x0, y0, x0 + half, y0 + 296], radius=10, fill=bg)
        d.text((x0 + 14, y0 + 10), label, fill=fg, font=font(13))

        big = resize_rgba(icon, (128, 128))            # 右上角放 128px 大样查细节
        cv.paste(big, (x0 + half - 146, y0 + 40), big)
        d.text((x0 + half - 108, y0 + 176), "128px", fill=fg, font=font(12))

        cx = x0 + 70                                   # 左下一排小尺寸
        for s in strip:
            ic = resize_rgba(icon, (s, s))
            cv.paste(ic, (cx - s // 2, y0 + 150 - s // 2), ic)
            d.text((cx - 14, y0 + 262), f"{s}px", fill=fg, font=font(12))
            cx += 88
    cv.save(out)


# ── CLI ─────────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="白底图 → 透明背景正方形 PNG")
    ap.add_argument("source", help="源图（png/jpg/webp）")
    ap.add_argument("--out", default=None, help=f"输出 PNG（默认 {DEFAULT_HOME / 'logo-transparent.png'}）")
    ap.add_argument("--lo", type=int, default=198, help="min(R,G,B) ≤ lo 视为饱和前景（默认 198）")
    ap.add_argument("--hi", type=int, default=242, help="min(R,G,B) ≥ hi 视为纯背景（默认 242）")
    ap.add_argument("--size", type=int, default=1024, help="输出正方形边长，0=不正方形化（默认 1024）")
    ap.add_argument("--pad", type=float, default=0.05, help="四周留白比例（默认 0.05）")
    ap.add_argument("--no-trim", action="store_true", help="不裁切重新居中，保留原构图")
    ap.add_argument("--inspect", action="store_true", help="只分析不输出")
    ap.add_argument("--preview", default=None, help="额外输出一张浅/深底色对比预览图")
    args = ap.parse_args()

    src = Path(args.source).expanduser()
    if not src.exists():
        print(f"源图不存在：{src}")
        return 2

    sw, sh = Image.open(src).size
    icon, stat = keyout_white(src, args.lo, args.hi)
    tot = stat["total"]
    print("=" * 72)
    print(f"  源图 {src.name}   {sw}x{sh}")
    print("=" * 72)
    print(f"  背景(→透明) {stat['bg']:7d}  {stat['bg']/tot:6.2%}")
    print(f"  前景(原样)  {stat['fg']:7d}  {stat['fg']/tot:6.2%}")
    print(f"  过渡(羽化)  {stat['edge']:7d}  {stat['edge']/tot:6.2%}"
          f"   {'✓ 干净' if stat['edge']/tot < 0.03 else '★ 偏多，检查阈值'}")

    if args.inspect:
        box = icon.getchannel("A").getbbox()
        print(f"\n  前景包围盒 {box}   墨迹 {box[2]-box[0]}x{box[3]-box[1]}")
        print(f"  四边留白  左{box[0]} 上{box[1]} 右{sw-box[2]} 下{sh-box[3]}")
        print(f"  前景中心   ({(box[0]+box[2])/2:.1f}, {(box[1]+box[3])/2:.1f})"
              f"   画布中心 ({sw/2:.1f}, {sh/2:.1f})")
        return 0

    icon = fill_transparent(icon)
    icon, info = square_fit(icon, args.size, args.pad, not args.no_trim)
    out = Path(args.out).expanduser() if args.out else DEFAULT_HOME / "logo-transparent.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    icon.save(out)
    pw, ph = info.get("placed", ("-", "-", "-", "-"))[0], info.get("placed", ("-", "-"))[1]
    print(f"\n  裁切 {info.get('inkBox')} → {info['inkAfter']}    画布内实际图形 {pw}x{ph}")
    print(f"  输出 {out}   {icon.size[0]}x{icon.size[1]}   {out.stat().st_size/1024:.1f} KB")

    if args.preview:
        pv = Path(args.preview).expanduser()
        pv.parent.mkdir(parents=True, exist_ok=True)
        build_preview(icon, pv, f"{src.name} → 透明底",
                      f"lo={args.lo} hi={args.hi} pad={args.pad} size={args.size}"
                      f"   |   同一张图在两种底色下的实际渲染")
        print(f"  预览 {pv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
