# -*- coding: utf-8 -*-
"""
给 DSH 的 **app 包**打品牌文案补丁（托盘 / 窗口标题 / 首次向导 / 恢复助手）。

这一层是插件层够不到的地方：托盘 tooltip 由主进程 `tray.setToolTip(spec.productName)`
设置，向导与恢复助手是独立窗口的原生 HTML，都跑在主进程侧。只能改 app 包文件。

风险与对策
----------
1. app 包是覆盖安装的目标 → 升级会还原。→ 已并入 `切换更新守卫.ps1 -Action Lock`，
   Lock 时自动重贴（脚本幂等，且带 verify）。
2. 文件名带 hash，会随版本变 → 一律用**模式匹配**（`src-*.js` / `tray-locale-*.js`），
   不硬编码文件名。
3. 改错会崩 → 每条替换都断言**命中次数符合预期**（0 次或 >1 次都报警），
   且默认 **dry-run**，必须显式 `--write` 才落盘；落盘前自动备份。

**绝不碰** `DESKTOP_PRODUCT_NAME` / `app.setName()`：它同时决定 userData 目录，
改了会换目录、丢配置。`productName` 参数是运行时显示用的，单独替换是安全的。

用法
----
    python 品牌文案补丁.py                    # dry-run，列出会改什么
    python 品牌文案补丁.py --write            # 落盘（自动备份）
    python 品牌文案补丁.py verify             # 校验当前是否已是品牌文案
    python 品牌文案补丁.py revert             # 从最近一次备份还原
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

APP = Path(r"D:\Program Files\DSH Desktop\resources\app")
GUARD = Path(__file__).resolve().parent
STATE = GUARD / "品牌文案补丁状态.json"

BRAND = "玖峰投研工作台"
OLD_PRODUCT = "DSH Desktop"
CJK = re.compile(r"[\u4e00-\u9fff]")

# 目标文件：模式 → 说明
TARGETS = [
    ("lib/src-*.js", "桌面运行时 spec（托盘 tooltip / 窗口标题）"),
    ("lib/tray-locale-*.js", "托盘菜单 + 原生对话框文案"),
    ("lib/native-ui/assets/setup-wizard-*.js", "首次设置向导"),
    ("lib/native-ui/assets/recovery-copy-*.js", "恢复助手"),
    ("node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html", "渲染页 HTML（初始窗口标题）"),
]

# 规则 0：HTML 里的静态标题（插件层只能事后替换 document.title，
# 这里改源头，任务栏 / Alt+Tab 从一开始就是品牌名）
HTML_TITLE_OLD = "<title>DeepSeek Harness</title>"

# 规则 1：代码标识符级别的精确替换（value, 期望命中次数）
EXACT = [
    ('productName: DESKTOP_PRODUCT_NAME,',
     'productName: "%s",' % BRAND, 1),
    ('windowTitle: "DeepSeek Harness Desktop",',
     'windowTitle: "%s",' % BRAND, 1),
]

# 规则 2：只在"中文语境"里替换产品名。
#
# 为什么不按字符串字面量替换：这些 bundle 是**单行压缩**的，正则/词法扫描都会因为
# 正则字面量、${} 嵌套而错位（实测 setup-wizard 里几十条中文文案只能识别出 1 条）。
# 改成看上下文 —— 产品名紧邻中文才算文案，于是：
#   ✓ "设置 DSH Desktop"（中文…）   → 替换
#   ✓ "重启 DSH Desktop 后"（…中文）→ 替换
#   ✗ "DSH Desktop Recovery Assistant"（英文段）→ 不动
#   ✗ data-dsh-boot / DESKTOP_RECOVERY_RESTART_PATH（代码标识符）→ 不动
# 注意：不要包含通用标点（… — 等）——英文里也用，会把 "Downloading DSH Desktop ${v}…"
# 这种英文串误判成中文语境。只留中文特有的引号与全角标点。
ZH_CLS = ("[\u4e00-\u9fff\u201c\u201d\u2018\u2019\uff0c\u3002\u3001\uff1a\uff1b"
          "\uff01\uff1f\uff08\uff09\u3010\u3011\u300a\u300b]")
P_BEFORE_DESKTOP = re.compile(r"(%s\s*)%s" % (ZH_CLS, re.escape(OLD_PRODUCT)))
P_AFTER_DESKTOP = re.compile(r"%s(?=\s*(?:\$\{[^}]*\}\s*)?%s)" % (re.escape(OLD_PRODUCT), ZH_CLS))
P_BEFORE_DSH = re.compile(r"(%s\s*)DSH " % ZH_CLS)
P_AFTER_DSH = re.compile(r"DSH (?=\s*(?:\$\{[^}]*\}\s*)?%s)" % ZH_CLS)


def patch_text(s: str, rel: str):
    """返回 (新文本, [(原文, 新文, 说明)])"""
    changes = []

    # ⓪ HTML：静态标题，整串替换即可（不做中文语境那套）
    if rel.endswith(".html"):
        if HTML_TITLE_OLD in s:
            new = "<title>%s</title>" % BRAND
            s = s.replace(HTML_TITLE_OLD, new)
            changes.append((HTML_TITLE_OLD, new, "HTML 标题"))
        return s, changes

    # ① 精确替换（只对 src-*.js）：这类是代码标识符，不走中文语境规则
    if rel.startswith("lib/src-"):
        for old, new, expect in EXACT:
            n = s.count(old)
            if n == 0:
                continue
            if n != expect:
                changes.append((old, new, "★ 命中 %d 次（预期 %d），跳过" % (n, expect)))
                continue
            s = s.replace(old, new)
            changes.append((old, new, "代码标识符"))

    # ② 中文语境替换（长词在前：先处理 "DSH Desktop"，剩下的 "DSH " 再单独处理）
    def run(pat, new, keep_prefix, s):
        def f(m):
            out = (m.group(1) + new) if keep_prefix else new
            before = s[max(0, m.start() - 12):m.start()]
            after = s[m.end():m.end() + 12]
            changes.append((before + m.group(0) + after, before + out + after, "中文文案"))
            return out
        return pat.sub(f, s)

    s = run(P_BEFORE_DESKTOP, BRAND, True, s)
    s = run(P_AFTER_DESKTOP, BRAND, False, s)
    s = run(P_BEFORE_DSH, "玖峰", True, s)
    s = run(P_AFTER_DSH, "玖峰", False, s)
    return s, changes


def collect():
    """扫描所有目标文件，返回 [(path, rel, 原文本, 新文本, changes)]"""
    out = []
    for pat, _desc in TARGETS:
        for p in sorted(APP.glob(pat)):
            if p.name.endswith(".map"):
                continue
            rel = str(p.relative_to(APP)).replace("\\", "/")
            try:
                s = p.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                s = p.read_text(encoding="utf-8", errors="replace")
            ns, ch = patch_text(s, rel)
            out.append((p, rel, s, ns, ch))
    return out


def main():
    global APP
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--write", action="store_true", help="真正落盘（默认只预演）")
    g.add_argument("--check", action="store_true", help="别名：只预演")
    ap.add_argument("--app", default=str(APP), help="DSH app 目录（默认按标准安装路径）")
    ap.add_argument("action", nargs="?", choices=["verify", "revert"], default=None)
    args = ap.parse_args()

    APP = Path(args.app)
    if not APP.is_dir():
        print("★ app 目录不存在: %s" % APP)
        return 2

    if args.action == "verify":
        return cmd_verify()
    if args.action == "revert":
        return cmd_revert()

    rows = collect()
    total = 0
    print("=" * 72)
    print("  app 包品牌文案补丁" + ("  【落盘】" if args.write else "  【预演，不写盘】"))
    print("=" * 72)
    for p, rel, s, ns, ch in rows:
        real = [c for c in ch if not c[2].startswith("★")]
        warn = [c for c in ch if c[2].startswith("★")]
        if not real and not warn:
            continue
        print("\n── %s" % rel)
        for old, new, why in warn:
            print("  %s" % why)
        total += len(real)
        for old, new, why in real:
            o = old if len(old) < 90 else old[:87] + "…"
            n = new if len(new) < 90 else new[:87] + "…"
            print("  [%s] %s" % (why, o))
            if why == "中文文案":
                print("         → %s" % n)
            else:
                print("         → %s" % new)

    print("\n" + "-" * 72)
    print("合计 %d 条改动" % total)
    if not args.write:
        print("预演结束。确认无误后加 --write 落盘（会自动备份）。")
        return 0

    # 只有确实需要写入时才建备份目录 —— 否则守卫每次 Lock 都会留下一个空目录
    todo = [(p, rel, ns, ch) for p, rel, s, ns, ch in rows if s != ns]
    if not todo:
        print("\n已是品牌文案，无需写入（未创建备份目录）。")
        return 0

    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    bdir = GUARD / ("brand-copy-backup-" + ts)
    bdir.mkdir(parents=True, exist_ok=True)
    meta = {"timestamp": ts, "brand": BRAND, "files": {}}
    wrote = 0
    for p, rel, ns, ch in todo:
        shutil.copy2(p, bdir / (rel.replace("/", "__")))
        p.write_text(ns, encoding="utf-8")
        meta["files"][rel] = {"backup": rel.replace("/", "__"), "changes": len([c for c in ch if not c[2].startswith("★")])}
        wrote += 1
    (bdir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n已写入 %d 个文件；备份 → %s" % (wrote, bdir))

    # 兜底：改完立刻验证这些文件仍是合法 JS，避免"文案改了、代码崩了"
    print("\n语法自检（node --check）:")
    node = shutil.which("node")
    if not node:
        print("  ⚠ 找不到 node，跳过自检")
        return 0
    bad = 0
    for p, rel, s, ns, ch in rows:
        if s == ns:
            continue
        if not rel.endswith(".js"):
            print("  · %s（非 JS，跳过语法检查）" % rel)
            continue
        tmp = GUARD / ("_syntax_" + p.name + ".mjs")     # .mjs 让 node 按 ESM 解析
        try:
            shutil.copy2(p, tmp)
            r = subprocess.run([node, "--check", str(tmp)], capture_output=True, text=True, timeout=120)
            if r.returncode == 0:
                print("  ✓ %s" % rel)
            else:
                bad += 1
                print("  ✗ %s\n      %s" % (rel, (r.stderr or "").strip()[:240]))
        except Exception as e:
            print("  ⚠ %s 自检异常: %s" % (rel, e))
        finally:
            tmp.unlink(missing_ok=True)
    if bad:
        print("\n★ 有 %d 个文件语法不过 —— 请立刻 revert 并检查规则。" % bad)
        return 2
    return 0


def cmd_verify():
    rows = collect()
    print("=" * 72)
    print("  app 包品牌文案校验")
    print("=" * 72)
    bad = 0
    for p, rel, s, ns, ch in rows:
        pend = [c for c in ch if not c[2].startswith("★")]
        state = "已是品牌文案" if not pend else "★ 仍有 %d 处未替换" % len(pend)
        if pend:
            bad += 1
        print("  %-52s %s" % (rel, state))
    print()
    if bad:
        print("结论：有 %d 个文件不是品牌文案 —— 覆盖安装过，重跑 --write 即可贴回。" % bad)
    else:
        print("结论：全部已是品牌文案。")
    return 1 if bad else 0


def cmd_revert():
    bks = sorted(GUARD.glob("brand-copy-backup-*"))
    if not bks:
        print("★ 没有备份，无法还原")
        return 1
    bdir = bks[-1]
    meta = json.loads((bdir / "meta.json").read_text(encoding="utf-8"))
    n = 0
    for rel, info in meta["files"].items():
        src = bdir / info["backup"]
        dst = APP / rel
        if src.is_file():
            shutil.copy2(src, dst)
            print("  还原 %s" % rel)
            n += 1
    print("已从 %s 还原 %d 个文件" % (bdir.name, n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
