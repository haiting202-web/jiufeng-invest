# -*- coding: utf-8 -*-
"""
启动反馈补丁.py — 给 DSH Desktop app 包打「双击秒回启动画面」补丁。

背景：DSH 主窗口要等 host-boot（加载全部插件）完成才显示，期间桌面无任何反馈。
本补丁在 app.whenReady() 后立即创建一个无边框启动画面（玖峰品牌 + 加载动画），
主窗口出现时自动关闭（挂在 revealApplication() 上，兜住全部显路）。

改动两个文件（都会被覆盖安装还原 → 由 切换更新守卫.ps1 的 Lock 负责贴回）：
  1. lib/main.js
     - import 行补 BrowserWindow
     - app.setAppUserModelId(...) 后插入启动画面创建代码
  2. lib/electron-runtime-*.js
     - revealApplication() 函数体开头插入关闭启动画面的钩子

用法（在 dsh-update-guard 目录下）：
    python 启动反馈补丁.py            # dry-run：打印将要做的改动，不落盘
    python 启动反馈补丁.py apply      # 备份后落盘 + node --check 自检
    python 启动反馈补丁.py refresh    # ★ 只重写"已注入的" splash 块（改文案/图标走这个）
    python 启动反馈补丁.py verify     # 只读：检查补丁是否在位
    python 启动反馈补丁.py revert     # 从最近一次备份还原（会整文件还原，慎用）

⚠️ 改 splash 内容请用 refresh，不要 revert+apply：
   revert 是整文件还原到注入当时的备份，会把之后打在 main.js 上的其它改动一起冲掉。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

APP_DIR_CANDIDATES = [
    r"D:\Program Files\DSH Desktop\resources\app",
    r"C:\Program Files\DSH Desktop\resources\app",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "DSH Desktop", "resources", "app"),
]

MAIN_JS = "lib/main.js"
MARK = "JIUFENG:SPLASH"

IMPORT_OLD = 'import { app, crashReporter, dialog, safeStorage, screen, shell, utilityProcess } from "electron";'
IMPORT_NEW = 'import { app, BrowserWindow, crashReporter, dialog, safeStorage, screen, shell, utilityProcess } from "electron";'

ANCHOR_MAIN = 'if (process.platform === "win32") app.setAppUserModelId(DESKTOP_APP_ID);'
ANCHOR_REVEAL = "function revealApplication(window, platform = process.platform) {\n\tif (platform === \"darwin\" && app.isHidden()) app.show();"

LOGO_B64_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "splash-logo.b64.txt")

# 启动画面 HTML 模板。
#   __LOGO__ 由 splash_html() 替换成 base64 data URI（真实品牌 logo）。
# 为什么用真实 logo 而不是原来的"渐变方块 + 玖"字母标记：
# 那个方块是早期占位设计，与应用图标（蓝色 swoosh）完全不像，启动瞬间会先闪出一个
# 跟托盘/任务栏都不一致的图形 —— 用户反馈"标识不统一"就包含这一类。
SPLASH_HTML_TMPL = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
body{background:#0f1216;display:flex;flex-direction:column;align-items:center;justify-content:center;
font-family:"Microsoft YaHei UI","Microsoft YaHei",sans-serif;user-select:none;border:1px solid #2a3038}
.logo{height:64px;width:auto;display:block;filter:drop-shadow(0 6px 22px rgba(30,111,255,.30))}
.logo-fallback{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,#1e6fff,#7a3cff);
display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(30,111,255,.35)}
.logo-fallback span{color:#fff;font-size:40px;font-weight:700;line-height:1}
.name{margin-top:16px;color:#e8eaed;font-size:17px;font-weight:600;letter-spacing:1px}
.slogan{margin-top:6px;color:#8a919c;font-size:12px}
.bar{margin-top:22px;width:180px;height:3px;border-radius:2px;background:#242a32;overflow:hidden}
.bar i{display:block;height:100%;width:40%;border-radius:2px;background:linear-gradient(90deg,#1e6fff,#7a3cff);
animation:slide 1.2s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(450%)}}
.tip{margin-top:12px;color:#5c6570;font-size:11px}
</style></head><body>
<img class="logo" src="__LOGO__" alt="">
<div class="name">玖峰投研工作台</div>
<div class="slogan">把散落的金融工具，装进一个桌面端</div>
<div class="bar"><i></i></div>
<div class="tip">正在启动，组件加载通常需要几秒</div>
</body></html>"""


def splash_html():
    """拼出启动画面 HTML；logo 内联串缺失时退回字母标记（保证 apply 不因缺文件失败）。"""
    uri = ""
    try:
        with open(LOGO_B64_FILE, "r", encoding="ascii") as fh:
            b = fh.read().strip()
        if b:
            uri = "data:image/png;base64," + b
    except OSError:
        uri = ""
    if uri:
        return SPLASH_HTML_TMPL.replace("__LOGO__", uri)
    return SPLASH_HTML_TMPL.replace(
        '<img class="logo" src="__LOGO__" alt="">', '<div class="logo-fallback"><span>玖</span></div>'
    ).replace("__LOGO__", "")


def find_app_dir():
    for p in APP_DIR_CANDIDATES:
        if p and os.path.isfile(os.path.join(p, MAIN_JS)):
            return p
    raise SystemExit("找不到 DSH app 目录（main.js）")


def find_runtime_js(app_dir):
    lib = os.path.join(app_dir, "lib")
    for name in os.listdir(lib):
        if name.startswith("electron-runtime-") and name.endswith(".js"):
            return os.path.join("lib", name)
    raise SystemExit("找不到 electron-runtime-*.js")


def read_text(path):
    with open(path, "r", encoding="utf-8", newline="") as fh:
        return fh.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def splash_block():
    """生成注入 main.js 的 splash 代码块。

    skipTaskbar / icon 是 2026-10-09 补上的：
    无边框 splash 如果不加 skipTaskbar，**照样会在任务栏占一个按钮**；而它没设 icon
    时用的是 exe 内嵌的官方图标 —— 冷启动那几十秒里，用户在任务栏看到的就是
    "图标还是旧的 LOGO"。加了 skipTaskbar，启动期间不再出现在任务栏，等主窗口
    出现时才挂上（主窗口用的是自定义 build/app-icon.png）。
    """
    html_lit = json.dumps(splash_html(), ensure_ascii=True)
    lines = [
        "\t/* " + MARK + "-START */",
        "\ttry {",
        "\t\tconst splashWindow = new BrowserWindow({",
        "\t\t\twidth: 420, height: 260, frame: false, resizable: false, movable: true,",
        "\t\t\tminimizable: false, maximizable: false, fullscreenable: false,",
        "\t\t\tcenter: true, show: false, alwaysOnTop: true, skipTaskbar: true,",
        "\t\t\ticon: join(app.getAppPath(), \"build\", \"app-icon.png\"),",
        "\t\t\tbackgroundColor: \"#0f1216\",",
        "\t\t\twebPreferences: { contextIsolation: true, nodeIntegration: false }",
        "\t\t});",
        "\t\tglobalThis.__JIUFENG_SPLASH = splashWindow;",
        "\t\tsplashWindow.on(\"closed\", () => {",
        "\t\t\tif (globalThis.__JIUFENG_SPLASH === splashWindow) globalThis.__JIUFENG_SPLASH = void 0;",
        "\t\t});",
        "\t\tsplashWindow.loadURL(\"data:text/html;charset=utf-8,\" + encodeURIComponent(" + html_lit + "));",
        "\t\tsplashWindow.once(\"ready-to-show\", () => {",
        "\t\t\tif (!splashWindow.isDestroyed()) splashWindow.show();",
        "\t\t});",
        "\t\tsetTimeout(() => {",
        "\t\t\tconst s = globalThis.__JIUFENG_SPLASH;",
        "\t\t\tif (s !== void 0 && !s.isDestroyed()) { try { s.close(); } catch {} }",
        "\t\t}, 120000);",
        "\t} catch {}",
        "\t/* " + MARK + "-END */",
    ]
    return "\n".join(lines)


CLOSE_BLOCK_OLD = "function revealApplication(window, platform = process.platform) {\n\tif (platform === \"darwin\" && app.isHidden()) app.show();"
CLOSE_BLOCK_NEW = (
    "function revealApplication(window, platform = process.platform) {\n"
    "\t/* " + MARK + "-CLOSE-START */\n"
    "\t{\n"
    "\t\tconst splash = globalThis.__JIUFENG_SPLASH;\n"
    "\t\tif (splash !== void 0) {\n"
    "\t\t\tglobalThis.__JIUFENG_SPLASH = void 0;\n"
    "\t\t\ttry { if (!splash.isDestroyed()) splash.close(); } catch {}\n"
    "\t\t}\n"
    "\t}\n"
    "\t/* " + MARK + "-CLOSE-END */\n"
    "\tif (platform === \"darwin\" && app.isHidden()) app.show();"
)


def node_check(path):
    """node --check（.js 会被当 CJS 解析 import 报错，复制成 .mjs 再查）。"""
    node = None
    for cand in [
        r"%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-3\node.exe",
        r"C:\Program Files\nodejs\node.exe",
    ]:
        if os.path.isfile(cand):
            node = cand
            break
    if not node:
        return True, "（node 不可用，跳过语法自检）"
    tmp = os.path.join(tempfile.gettempdir(), "jf-splash-check.mjs")
    shutil.copyfile(path, tmp)
    try:
        r = subprocess.run([node, "--check", tmp], capture_output=True, text=True, timeout=30)
        return r.returncode == 0, (r.stderr or "").strip()[:400]
    finally:
        if os.path.isfile(tmp):
            os.remove(tmp)


def build_changes(app_dir):
    runtime_rel = find_runtime_js(app_dir)
    main_text = read_text(os.path.join(app_dir, MAIN_JS))
    rt_text = read_text(os.path.join(app_dir, runtime_rel))
    changes = []  # (relpath, old, new, desc)

    if MARK + "-START" not in main_text:
        if IMPORT_OLD not in main_text:
            raise SystemExit("main.js：import 锚点不匹配（官方文件结构变了？）")
        changes.append((MAIN_JS, IMPORT_OLD, IMPORT_NEW, "import 补 BrowserWindow"))
        if ANCHOR_MAIN not in main_text:
            raise SystemExit("main.js：setAppUserModelId 锚点不匹配")
        changes.append((MAIN_JS, ANCHOR_MAIN, ANCHOR_MAIN + "\n" + splash_block(), "插入启动画面创建代码"))

    if MARK + "-CLOSE-START" not in rt_text:
        if CLOSE_BLOCK_OLD not in rt_text:
            raise SystemExit("electron-runtime：revealApplication 锚点不匹配")
        changes.append((runtime_rel, CLOSE_BLOCK_OLD, CLOSE_BLOCK_NEW, "revealApplication 插入关画面钩子"))
    return changes, (MAIN_JS, runtime_rel)


def replace_splash_block(app_dir):
    """只替换**已注入的** splash 代码块，不动 electron-runtime、不整体 revert。

    为什么需要单独一个动作：`apply` 是"没有就插入"，已注入时是 0 改动；
    而 `revert` 会从备份**整文件**还原 —— 备份是注入当时的（如 2026-09-29），
    会把之后打在同一个文件上的其它补丁（品牌文案）一起冲掉。
    所以"改 splash 内容"必须用 refresh，不能用 revert+apply。
    """
    p = os.path.join(app_dir, MAIN_JS)
    text = read_text(p)
    mark_a = "\t/* " + MARK + "-START */"
    mark_b = "\t/* " + MARK + "-END */"
    a = text.find(mark_a)
    b = text.find(mark_b)
    if a < 0 or b < 0:
        raise SystemExit("没有找到已注入的 splash 块，请先 apply")
    b += len(mark_b)
    new = text[:a] + splash_block() + text[b:]
    if new == text:
        print("splash 块已是最新，0 改动（幂等）。")
        return 0
    ts = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "splash-refresh-backup-" + ts)
    os.makedirs(backup_dir)
    bak = os.path.join(backup_dir, MAIN_JS.replace("/", "_"))
    shutil.copyfile(p, bak)
    write_text(p, new)
    ok, msg = node_check(p)
    print("  语法自检 %s: %s" % (MAIN_JS, "OK" if ok else "FAIL"))
    if not ok:
        print(msg)
        shutil.copyfile(bak, p)
        raise SystemExit("语法自检未通过，已还原")
    print("splash 块已刷新（%d → %d 字符）。备份：%s" % (len(text), len(new), backup_dir))
    print("生效条件：重启 DSH。")
    return 0


def main():
    argv = sys.argv[1:]
    mode = "dry"
    app_override = None
    i = 0
    while i < len(argv):
        if argv[i] == "--app" and i + 1 < len(argv):
            app_override = argv[i + 1]
            i += 2
        else:
            mode = argv[i]
            i += 1
    if mode not in ("dry", "apply", "verify", "refresh"):
        mode = "dry"
    if app_override and os.path.isfile(os.path.join(app_override, MAIN_JS)):
        app_dir = app_override
    else:
        app_dir = find_app_dir()

    if mode == "refresh":
        sys.exit(replace_splash_block(app_dir))

    changes, touched = build_changes(app_dir)

    if mode in ("dry", "apply"):
        print(f"app 目录: {app_dir}")
        if not changes:
            print("补丁已在位，0 改动（幂等）。")
            return
        for rel, _o, _n, desc in changes:
            print(f"  [{'apply' if mode == 'apply' else 'dry ' }] {rel} :: {desc}")
        if mode == "dry":
            print("（dry-run，未落盘。确认无误后：python 启动反馈补丁.py apply）")
            return
        ts = time.strftime("%Y%m%d-%H%M%S")
        backup_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"splash-backup-{ts}")
        os.makedirs(backup_dir)
        for rel in set(t for t in set(touched)):
            src = os.path.join(app_dir, rel)
            dst = os.path.join(backup_dir, rel.replace("/", "_").replace("\\", "_"))
            shutil.copyfile(src, dst)
        applied = []
        for rel, old, new, _desc in changes:
            p = os.path.join(app_dir, rel)
            text = read_text(p)
            if text.count(old) != 1:
                raise SystemExit(f"{rel}：锚点出现 {text.count(old)} 次（应为 1），中止")
            write_text(p, text.replace(old, new, 1))
            applied.append(rel)
        meta = {"time": ts, "app_dir": app_dir, "applied": applied}
        with open(os.path.join(backup_dir, "meta.json"), "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)
        ok_all = True
        for rel in applied:
            ok, msg = node_check(os.path.join(app_dir, rel))
            print(f"  语法自检 {rel}: {'OK' if ok else 'FAIL'}")
            if not ok:
                print(msg)
                ok_all = False
        if not ok_all:
            print("语法自检未通过，正在从备份还原！")
            for rel in applied:
                b = os.path.join(backup_dir, rel.replace("/", "_").replace("\\", "_"))
                shutil.copyfile(b, os.path.join(app_dir, rel))
            raise SystemExit("已还原，补丁未生效。把上面的报错发给开发者。")
        print(f"已应用 {len(changes)} 处改动。备份：{backup_dir}")
        print("生效条件：重启 DSH。")
        return

    if mode == "verify":
        ok = True
        m = read_text(os.path.join(app_dir, MAIN_JS))
        rt = read_text(os.path.join(app_dir, find_runtime_js(app_dir)))
        checks = [
            ("main.js BrowserWindow 导入", "BrowserWindow, crashReporter" in m),
            ("main.js 启动画面代码", MARK + "-START" in m and MARK + "-END" in m),
            ("runtime 关画面钩子", MARK + "-CLOSE-START" in rt),
        ]
        for name, good in checks:
            print(f"  [{'OK' if good else '缺失'}] {name}")
            ok = ok and good
        if ok:
            cok, cmsg = node_check(os.path.join(app_dir, MAIN_JS))
            print(f"  [{'OK' if cok else 'FAIL'}] 语法自检 main.js")
            if not cok:
                print(cmsg)
                ok = False
        print("verify:", "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)

    if mode == "revert":
        base = os.path.dirname(os.path.abspath(__file__))
        backups = sorted(d for d in os.listdir(base) if d.startswith("splash-backup-"))
        if not backups:
            raise SystemExit("没有备份目录，无法还原")
        backup_dir = os.path.join(base, backups[-1])
        meta = json.load(open(os.path.join(backup_dir, "meta.json"), encoding="utf-8"))
        for rel in meta["applied"]:
            b = os.path.join(backup_dir, rel.replace("/", "_").replace("\\", "_"))
            shutil.copyfile(b, os.path.join(app_dir, rel))
            print(f"  已还原 {rel}")
        print(f"还原完成（备份：{backup_dir}）。重启 DSH 生效。")
        return

    raise SystemExit(f"未知模式：{mode}（可用：dry / apply / verify / revert）")


if __name__ == "__main__":
    main()
