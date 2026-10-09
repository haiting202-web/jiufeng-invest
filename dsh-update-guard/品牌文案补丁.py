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


# ★ 换行符铁律：一律 newline=""（不做换行翻译）。
#   踩坑记录（2026-10-09）：原先用 `Path.write_text(ns, encoding="utf-8")`，Python 默认
#   newline=None → 写盘时把每个 "\n" 翻成 os.linesep，Windows 上即 CRLF。结果一份原始为
#   LF 的 app 包 bundle 被整份改成 CRLF（client.js 37563 行、electron-runtime 3302 行…），
#   与上游基线产生无意义 diff，也可能干扰按字节比对的完整性校验。
#   read 侧同理：newline=None 会把 CRLF 归一成 LF，导致「读进来是 LF、写出去变 CRLF」的
#   隐性翻转；显式 newline="" 才能原样读、原样写，保证幂等。
def read_text(p: Path, **kw) -> str:
    with Path(p).open("r", encoding="utf-8", newline="", **kw) as fh:
        return fh.read()


def write_text(p: Path, s: str) -> None:
    with Path(p).open("w", encoding="utf-8", newline="") as fh:
        fh.write(s)

# 目标文件：模式 → 说明
#
# ★ 2026-10-09 扩容：原名单只有 5 个文件，实测 app 包里还有 13 个文件含**用户可见**的
#   品牌串（顶栏产品名、桌面设置面板、通知、更新提示等），漏在外面 → 界面出现两种品牌名。
#   新增依据：全量扫描 `grep -rl "DSH Desktop" resources/app` 后逐个判定"是否用户可见"。
#   刻意**不收**的文件（保持原样，理由见行内注释）：
#     · lib/bin.js / lib/profile-manager-*.js —— 版本/edition 元数据与 CLI 帮助文本
#     · lib/update-checker-*.js / lib/update-download-*.js / lib/pnpm-policy-*.js —— 纯代码注释
#     · lib/desktop-terminal-*.js —— 终端窗口横幅（非主界面，且含 windows/cmd 转义字面量）
TARGETS = [
    ("lib/src-*.js", "桌面运行时 spec（托盘 tooltip / 窗口标题）"),
    ("lib/tray-locale-*.js", "托盘菜单 + 原生对话框文案"),
    ("lib/native-ui/assets/setup-wizard-*.js", "首次设置向导"),
    ("lib/native-ui/assets/recovery-copy-*.js", "恢复助手"),
    ("node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html", "渲染页 HTML（初始窗口标题）"),
    # ↓ 2026-10-09 新增
    ("lib/client.js", "渲染进程主包（桌面设置面板 / 局域网提示等中文文案）"),
    ("lib/native-ui/assets/compatibility-chrome-*.js", "★ 窗口顶栏（产品名 + 版本号所在处）"),
    ("lib/electron-runtime-*.js", "主进程运行时（更新提示 / 重启对话框 / 终端文案）"),
    ("lib/notifications-*.js", "系统通知正文"),
    ("lib/updates.js", "更新可用通知正文"),
    ("lib/native-ui/*.html", "原生窗口页面标题（对话框/恢复/向导/顶栏）"),
    # ↓ 2026-10-09 追加：主进程 bundle（设置面板 / 欢迎页 / 内置开放市场文案）。
    #   main.js 同时被 启动反馈补丁.py 改（注入 splash 块）；两个脚本都走 newline=""，
    #   互不干扰。splash 块内已是「玖峰投研工作台」且无 "DSH Desktop"，不会被本脚本二次命中。
    ("lib/main.js", "主进程入口（设置 / 欢迎 / 内置市场中文文案）"),
]

# 规则 0：HTML 里的静态标题（插件层只能事后替换 document.title，
# 这里改源头，任务栏 / Alt+Tab 从一开始就是品牌名）
#
# 2026-10-09 起改为**通用**处理：扫所有 <title>…</title>，按下面的映射逐条替换。
# 顺序敏感：先长串（DSH Desktop Recovery / Set up DSH Desktop），再兜底 DSH Desktop。
HTML_TITLE_MAP = [
    ("DSH Desktop Recovery", "%s 恢复助手" % BRAND),
    ("Set up DSH Desktop", "设置 %s" % BRAND),
    ("DeepSeek Harness", BRAND),
    ("DSH Desktop", BRAND),
]

# 规则 0b：无中文邻接的**界面字面量**（规则 ② 靠"中文邻接"判定，抓不到这些）。
# 依据：这些是渲染层写死的 UI 文本，前后都是代码分隔符，但用户直接看得见。
# 期望命中次数写死 —— 官方改了结构会立刻报警，而不是静默漏改。
EXACT_UI = [
    # 窗口顶栏左上角的产品名（className 是 CSS 选择器，千万别动；只换 children 的字面量）
    ("children:`DSH Desktop`}", "children:`%s`}" % BRAND, 1, "顶栏产品名"),
    ("children:[`DSH Desktop `,", "children:[`%s `," % BRAND, 1, "顶栏标题栏文本"),
]

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
# 护栏：官方有「DSH Desktop Beta」这个**版本名**（独立 edition，有自己的 productName/appId）。
# 若不加负向断言，"？DSH Desktop Beta 将继续保留。" 会被改成 "？玖峰投研工作台 Beta …"
# —— 半改的版本名比不改更糟。规则 ② 一律跳过紧邻 "Beta" 的命中。
P_BEFORE_DESKTOP = re.compile(r"(%s\s*)%s(?!\s*Beta)" % (ZH_CLS, re.escape(OLD_PRODUCT)))
P_AFTER_DESKTOP = re.compile(r"%s(?!\s*Beta)(?=\s*(?:\$\{[^}]*\}\s*)?%s)"
                            % (re.escape(OLD_PRODUCT), ZH_CLS))
P_BEFORE_DSH = re.compile(r"(%s\s*)DSH (?!Desktop)" % ZH_CLS)
P_AFTER_DSH = re.compile(r"DSH (?!Desktop)(?=\s*(?:\$\{[^}]*\}\s*)?%s)" % ZH_CLS)
# 短词 "DSH " 必须排除后面跟 "Desktop" 的情况，否则 "？DSH Desktop Beta 将继续保留。"
# 会被切成 "？玖峰Desktop Beta 将继续保留。"（实测踩到，见下 SAFETY 兜底）。
SAFETY_GLUED = re.compile(r"玖峰[A-Za-z]")


def patch_text(s: str, rel: str):
    """返回 (新文本, [(原文, 新文, 说明)])"""
    changes = []

    # ⓪ HTML：静态标题，整串替换即可（不做中文语境那套）
    if rel.endswith(".html"):
        def _t(m):
            inner = new = m.group(1)
            for old, rep in HTML_TITLE_MAP:
                if old in new:
                    new = new.replace(old, rep)
            if new != inner:
                changes.append(("<title>%s</title>" % inner, "<title>%s</title>" % new, "HTML 标题"))
            return "<title>%s</title>" % new
        s = re.sub(r"<title>(.*?)</title>", _t, s, flags=re.S)
        return s, changes

    # ⓪b 界面字面量（无中文邻接，规则 ② 抓不到；如窗口顶栏产品名）
    for old, new, expect, desc in EXACT_UI:
        n = s.count(old)
        if n == 0:
            continue
        if n != expect:
            changes.append((old, new, "★ %s 命中 %d 次（预期 %d），跳过" % (desc, n, expect)))
            continue
        s = s.replace(old, new)
        changes.append((old, new, desc))

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
    #
    # 关于空格：替换后保留「汉字 + 空格 + 品牌名」的原样式（如 "重启 玖峰投研工作台"）。
    # 这是**既有已发布**的风格 —— 托盘/向导里已有 49 处这种写法。此处刻意不改成
    # 「贴合」写法，否则新老文件会出现两种排版风格，反而更不统一。
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

    # SAFETY 兜底：替换后不允许出现「玖峰 + ASCII 字母」粘连 —— 那是短词规则误伤
    # "DSH Desktop …" 的典型症状（如 "玖峰Desktop Beta"）。宁可报警也不要静默产出夹生文案。
    for m in list(SAFETY_GLUED.finditer(s))[:5]:
        changes.append(("", "", "★ 检出「玖峰+英文」粘连：…%s…" % s[max(0, m.start() - 16):m.end() + 16]))
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
        write_text(p, ns)
        meta["files"][rel] = {"backup": rel.replace("/", "__"), "changes": len([c for c in ch if not c[2].startswith("★")])}
        wrote += 1
    with (bdir / "meta.json").open("w", encoding="utf-8", newline="") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, indent=2))
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
