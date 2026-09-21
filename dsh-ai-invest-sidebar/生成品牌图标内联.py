# -*- coding: utf-8 -*-
"""
把 logo 转成可内联进插件的 base64 data URI，供侧边栏品牌标记使用。

为什么要内联：侧边栏插件跑在 DSH 的 renderer 里，加载外部图片要走网络或被 CSP 拦，
而 app 包目录升级会被还原。base64 内联进 client.js 最稳，升级不丢。

关键处理：**透明像素的 RGB 要先刷成前景色再缩放**。否则缩小时透明区的白色会
渗进边缘，在深色主题下形成白边（PIL 的 resize 对 RGBA 是 RGB/alpha 分别插值的）。

用法：
    python 生成品牌图标内联.py <透明图.png>                     # 默认高 64px
    python 生成品牌图标内联.py <透明图.png> --height 96
    python 生成品牌图标内联.py <透明图.png> --preview 预览.png   # 顺带出对照预览
    python 生成品牌图标内联.py --inspect                        # 只看现有产物
"""
import argparse
import base64
import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少 Pillow。请先装：pip install pillow")

HERE = Path(__file__).resolve().parent
SIDEBAR = HERE
DEFAULT_SRC = Path.home() / ".dsh" / "icons" / "logo-transparent.png"
DEFAULT_OUT = SIDEBAR / "brand-mark.b64.txt"


def prep(src: Path, height: int) -> Image.Image:
    """裁掉透明边 → 透明区刷前景色 → 等比缩放到指定高度。"""
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()                      # getbbox 对 RGBA 会参考 alpha
    if bbox:
        im = im.crop(bbox)

    w, h = im.size
    px = im.load()

    # 前景平均色（alpha 足够高的像素），用来填透明区的 RGB，避免缩放时渗白边
    r = g = b = n = 0
    for y in range(0, h, max(1, h // 120)):
        for x in range(0, w, max(1, w // 120)):
            pr, pg, pb, pa = px[x, y]
            if pa > 200:
                r += pr; g += pg; b += pb; n += 1
    if n:
        avg = (r // n, g // n, b // n)
        for y in range(h):
            for x in range(w):
                pr, pg, pb, pa = px[x, y]
                if pa < 255:
                    px[x, y] = (avg[0], avg[1], avg[2], pa)

    nh = height
    nw = max(1, round(w * height / h))
    return im.resize((nw, nh), Image.LANCZOS)


def preview(icon: Image.Image, out: Path, note: str) -> None:
    """浅底 / 深底两栏，内含真实 20px 显示尺寸，用来判断实际观感。"""
    W, H, PAD = 640, 300, 20
    cv = Image.new("RGB", (W, H), (250, 250, 252))
    from PIL import ImageDraw, ImageFont
    d = ImageDraw.Draw(cv)

    def font(sz):
        for p in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]:
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                continue
        return ImageFont.load_default()

    d.text((PAD, 10), note, fill=(25, 25, 30), font=font(14))
    half = (W - PAD * 3) // 2
    for i, (label, bg, fg) in enumerate([
            ("浅色底（侧边栏默认）", (251, 251, 253), (60, 60, 67)),
            ("深色底（深色主题）", (28, 28, 30), (235, 235, 245))]):
        x0 = PAD + i * (half + PAD)
        y0 = 44
        d.rounded_rectangle([x0, y0, x0 + half, y0 + 220], radius=10, fill=bg)
        d.text((x0 + 12, y0 + 8), label, fill=fg, font=font(12))
        # 实际尺寸模拟：图标 + 品牌名
        cx = x0 + 24
        cy = y0 + 80
        ic = icon.resize((max(1, round(icon.width * 21 / icon.height)), 21), Image.LANCZOS)
        cv.paste(ic, (cx, cy), ic)
        d.text((cx + ic.width + 8, cy + 2), "玖峰投研工作台", fill=fg, font=font(15))
        # 放大样（查细节）
        big = icon.resize((96, round(icon.height * 96 / icon.width)), Image.LANCZOS)
        cv.paste(big, (x0 + 24, y0 + 112), big)
    cv.save(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", default=str(DEFAULT_SRC))
    ap.add_argument("--height", type=int, default=64, help="内联图高度（像素，默认 64，够 2x/3x 屏）")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--preview", default=None)
    ap.add_argument("--inspect", action="store_true", help="只看现有产物")
    args = ap.parse_args()

    out = Path(args.out)
    if args.inspect:
        if not out.is_file():
            print("★ 尚无产物: %s" % out)
            return 1
        b = out.read_text(encoding="utf-8").strip()
        raw = base64.b64decode(b)
        im = Image.open(io.BytesIO(raw))
        print("产物: %s" % out)
        print("  base64 长度 %d 字符（约 %.1f KB）" % (len(b), len(b) / 1024))
        print("  解码后   %dx%d  %s  %.1f KB" % (im.width, im.height, im.mode, len(raw) / 1024))
        return 0

    src = Path(args.source)
    if not src.is_file():
        print("★ 源图不存在: %s" % src)
        return 1

    icon = prep(src, args.height)
    buf = io.BytesIO()
    icon.save(buf, format="PNG", optimize=True)
    raw = buf.getvalue()
    b64 = base64.b64encode(raw).decode("ascii")
    out.write_text(b64, encoding="utf-8")

    print("源图   : %s" % src)
    print("裁切后 : %dx%d → 缩放 %dx%d" % (Image.open(src).size[0], Image.open(src).size[1],
                                           icon.width, icon.height))
    print("PNG    : %.2f KB" % (len(raw) / 1024))
    print("base64 : %d 字符（约 %.2f KB，写进 client.js）" % (len(b64), len(b64) / 1024))
    print("产物   : %s" % out)

    if args.preview:
        preview(icon, Path(args.preview), "品牌标记内联图预览（%s）" % src.name)
        print("预览   : %s" % args.preview)
    return 0


if __name__ == "__main__":
    sys.exit(main())
