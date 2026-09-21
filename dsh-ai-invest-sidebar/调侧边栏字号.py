#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
调 dsh-ai-invest-sidebar 侧边栏的字号（改 gen-client.mjs 里的 CSS 模板）。

    python 调侧边栏字号.py --check     # 只看当前值，不改
    python 调侧边栏字号.py             # 应用 SCALE 缩放
    python 调侧边栏字号.py --scale 1.15

为什么用脚本改而不是手改
----------------------
目标文本在 gen-client.mjs 的模板字符串里，长行多、转义多，手抄极易出错。
这里每条替换都**断言原串只出现一次**，出现 0 次或多次就整体中止、不写盘。

改完必须跑生成器，否则 client.js 不变（在插件根目录执行）：
    node gen-client.mjs
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

GEN = Path(__file__).resolve().parent / "gen-client.mjs"

# 侧边栏元素 → (当前值, 目标值, 单位)
# 目标值按「对齐 WorkBuddy 列表字号 16px」定，用截图墨迹率 1.2 反推校准过。
FONT_MAP = {
    "root(基础)": 13.0,
    "group-label(分组标题)": 14.0,   # 原来想写 11px，但 font:inherit 在它后面，实际继承 root=13 → 这里显式生效
    "expert .nm(专家名)": 16.0,
    "cat .nm(分类名)": 16.0,
    "cat .cnt(计数)": 12.5,
    "cat .arrow(箭头)": 11.0,
    "skill .nm(子技能)": 15.0,
    "badge(卡片角标)": 11.0,
    "sess .ttl(会话标题)": 16.0,
    "sess .tm(时间)": 12.5,
    "sess-del(删除键)": 13.0,
    "empty(空态)": 14.0,
    "brand-name(AI 投研)": 16.0,
    "brand-mark(📈)": 22.0,
}
ICON_MAP = {"expert/cat .ico": (17.0, 21.0), "skill .ico": (15.0, 18.0)}


def rules(scale: float) -> list[tuple[str, str, str]]:
    """返回 [(说明, old, new)]；字号按 scale 缩放后取整到 0.5。"""

    def f(v: float) -> str:
        return f"{round(v * scale * 2) / 2:g}px"

    return [
        # ── 基础字号 + 集中式变量 ──────────────────────────────────────────
        ("root 基础字号 + 引入 --inv-fs 变量",
         "overflow:hidden;font-size:13px;box-sizing:border-box}",
         "overflow:hidden;font-size:" + f(16) + ";"
         "--inv-fs:" + f(16) + ";--inv-fs-sm:" + f(15) + ";"
         "--inv-fs-label:" + f(14) + ";--inv-fs-meta:" + f(12.5) + ";"
         "box-sizing:border-box}"),

        # ── 分组标题：把 font-size 挪到 font:inherit 之后，否则不生效 ──────
        ("分组标题字号（原被 font:inherit 覆盖，这里修好并调大）",
         "padding:4px 8px;font-size:11px;font-weight:600;letter-spacing:.04em;"
         "text-transform:uppercase;opacity:.55;cursor:pointer;border:none;background:none;"
         "width:100%;text-align:left;font:inherit;color:inherit;box-sizing:border-box}",
         "padding:5px 8px;font-weight:600;letter-spacing:.04em;"
         "text-transform:uppercase;opacity:.55;cursor:pointer;border:none;background:none;"
         "width:100%;text-align:left;font:inherit;color:inherit;"
         "font-size:var(--inv-fs-label);box-sizing:border-box}"),

        # ── 专家 ───────────────────────────────────────────────────────────
        ("专家图标", ".dsh-invest-expert .ico{font-size:14px;width:18px;",
         ".dsh-invest-expert .ico{font-size:" + f(17) + ";width:" + f(21) + ";"),
        ("专家名", ".dsh-invest-expert .nm{font-size:12.5px;",
         ".dsh-invest-expert .nm{font-size:var(--inv-fs);"),

        # ── 分类 ───────────────────────────────────────────────────────────
        ("分类图标", ".dsh-invest-cat .ico{font-size:14px;width:18px;",
         ".dsh-invest-cat .ico{font-size:" + f(17) + ";width:" + f(21) + ";"),
        ("分类名", ".dsh-invest-cat .nm{font-size:12.5px;",
         ".dsh-invest-cat .nm{font-size:var(--inv-fs);"),
        ("分类计数", ".dsh-invest-cat .cnt{font-size:10px;",
         ".dsh-invest-cat .cnt{font-size:var(--inv-fs-meta);"),
        ("分类箭头", ".dsh-invest-cat .arrow{font-size:9px;",
         ".dsh-invest-cat .arrow{font-size:" + f(11) + ";"),

        # ── 子技能 ─────────────────────────────────────────────────────────
        ("子技能左缩进（跟随图标变宽 16→18 / 左内边距 28→30）",
         "gap:8px;width:100%;padding:4px 10px 4px 28px;border-radius:6px;",
         "gap:8px;width:100%;padding:5px 10px 5px 30px;border-radius:6px;"),
        ("子技能图标", ".dsh-invest-skill .ico{font-size:13px;width:16px;",
         ".dsh-invest-skill .ico{font-size:" + f(15) + ";width:" + f(18) + ";"),
        ("子技能名", ".dsh-invest-skill .nm{font-size:12px;",
         ".dsh-invest-skill .nm{font-size:var(--inv-fs-sm);"),
        ("卡片角标", ".dsh-invest-badge{font-size:9px;",
         ".dsh-invest-badge{font-size:" + f(11) + ";"),

        # ── 历史会话 ───────────────────────────────────────────────────────
        ("会话标题", ".dsh-invest-sess .ttl{font-size:12.5px;",
         ".dsh-invest-sess .ttl{font-size:var(--inv-fs);"),
        ("会话时间", ".dsh-invest-sess .tm{font-size:10px;",
         ".dsh-invest-sess .tm{font-size:var(--inv-fs-meta);"),
        ("会话删除按钮（尺寸跟随字号 20→22）",
         "transform:translateY(-50%);width:20px;height:20px;border-radius:4px;border:none;"
         "background:transparent;cursor:pointer;font-size:11px;",
         "transform:translateY(-50%);width:22px;height:22px;border-radius:4px;border:none;"
         "background:transparent;cursor:pointer;font-size:" + f(13) + ";"),
        ("空态文案", ".dsh-invest-empty{font-size:11px;",
         ".dsh-invest-empty{font-size:var(--inv-fs-label);"),

        # ── 品牌区（sidebar.brand.name / .mark slot）──────────────────────
        ("品牌名 AI 投研", '{ fontWeight: 600, fontSize: 13 } }, "AI 投研"',
         '{ fontWeight: 600, fontSize: ' + f(16).removesuffix("px") + ' } }, "AI 投研"'),
        ("品牌图标 📈", '{ style: { fontSize: 20 } }, "📈"',
         '{ style: { fontSize: ' + f(22).removesuffix("px") + ' } }, "📈"'),
    ]


def current_values(src: str) -> dict[str, str]:
    """把当前 CSS 里各元素的 font-size 抓出来，供 --check 展示。"""
    pats = {
        "root(基础)": r"\.dsh-invest-root\{[^}]*?font-size:([\d.]+)px",
        "group-label(分组标题)": r"\.dsh-invest-group-label\{([^}]*)\}",
        "expert .nm(专家名)": r"\.dsh-invest-expert \.nm\{font-size:([\d.]+)px",
        "cat .nm(分类名)": r"\.dsh-invest-cat \.nm\{font-size:([\d.]+)px",
        "cat .cnt(计数)": r"\.dsh-invest-cat \.cnt\{font-size:([\d.]+)px",
        "skill .nm(子技能)": r"\.dsh-invest-skill \.nm\{font-size:([\d.]+)px",
        "sess .ttl(会话标题)": r"\.dsh-invest-sess \.ttl\{font-size:([\d.]+)px",
        "sess .tm(时间)": r"\.dsh-invest-sess \.tm\{font-size:([\d.]+)px",
        "brand-name(AI 投研)": r"fontWeight: 600, fontSize: ([\d.]+)",
    }
    out = {}
    for k, p in pats.items():
        m = re.search(p, src)
        if not m:
            out[k] = "未找到"
            continue
        if k.startswith("group-label"):
            body = m.group(1)
            fm = re.findall(r"font-size:([\d.]+)px", body)
            inherits = "font:inherit" in body
            out[k] = f"{fm[0] if fm else '—'}(被 font:inherit 覆盖→继承)" if inherits else (fm[0] if fm else "—")
        else:
            out[k] = m.group(1)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="调整 AI 投研侧边栏字号")
    ap.add_argument("--scale", type=float, default=1.0, help="在目标值基础上再缩放，如 1.1")
    ap.add_argument("--check", action="store_true", help="只报告当前值")
    ap.add_argument("--dry-run", action="store_true", help="只显示将要做的替换")
    args = ap.parse_args()

    src = GEN.read_text(encoding="utf-8")

    if args.check:
        print("=" * 70)
        print("  侧边栏当前字号")
        print("=" * 70)
        for k, v in current_values(src).items():
            print(f"  {k:26} {v}")
        print()
        return 0

    applied, problems = [], []
    for desc, old, new in rules(args.scale):
        n = src.count(old)
        if n != 1:
            problems.append(f"{desc}：原串出现 {n} 次（期望 1）")
            continue
        src = src.replace(old, new)
        applied.append((desc, old, new))

    print("=" * 70)
    print(f"  调侧边栏字号   scale={args.scale}")
    print("=" * 70)
    for desc, _old, new in applied:
        m = re.findall(r"font-size:([\d.]+)px", new)
        tag = ("  → " + ", ".join(m + ["px"])) if m else ""
        print(f"  [OK] {desc}{tag}")
    if problems:
        print()
        for p in problems:
            print(f"  [失败] {p}")
        print("\n  ★ 有替换未命中，未写盘。请核对 gen-client.mjs 是否被改动过。")
        return 2

    if args.dry_run:
        print("\n  （--dry-run，未写盘）")
        return 0

    GEN.write_text(src, encoding="utf-8")
    print(f"\n  已写入 {GEN}")
    print("  下一步：node " + str(GEN).replace("\\", "/"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
