# DSH 启动慢 · 诊断报告

> 2026-09-18 | 结论先行：**启动慢与 Skill/工具收窄无关，卡在 `renderer-startup` 一个阶段（40.1 秒）**。
> 下一步只需跑一次 `诊断启动慢.ps1`，就能确定这 40 秒是「读盘」「等网络」还是「烧 CPU」。

---

## 一、权威数据（DSH 自己记的）

DSH 会在 `%APPDATA%\DSH Desktop\lifecycle-events\startup.jsonl` 里逐阶段打点。
最近一次启动（2026-09-18 17:20，**已包含 B→A→D→C 全部收窄改动**）：

| 阶段 | 耗时 | 说明 |
|---|---:|---|
| electron-ready | 132 ms | |
| shell-environment | 6 ms | |
| runtime-bootstrap | 125 ms | |
| profile-selection | 34 ms | |
| profile-composition | 4,240 ms | 组装 profile、加载 bundle |
| host-boot | 89 ms | |
| **renderer-startup** | **40,067 ms** | ★ 就是这里 |
| health-commit | 89 ms | |
| （其中 renderer.boot 自身） | 1,874 ms | 渲染进程真正 boot 只花 1.9 秒 |
| **总计** | **46,685 ms** | |

**读法**：`renderer-startup` 阶段从 t+4.6 s 一直持续到 t+44.7 s，40 秒里渲染进程还没能执行自己的第一行 JS（`renderer.boot.started` 出现在 t+44.7 s）。
所以问题不在「加载了多少插件」，而在「渲染进程被拉起来之前的这 40 秒」。

---

## 二、三个候选成因

| # | 假设 | 支持证据 | 如何证伪 |
|---|---|---|---|
| **A** | **Defender 逐文件实时扫描**（app 包取消 ASAR → 21,921 个小文件） | 实时保护全开；无排除项；app 包 21,921 文件 / 296 MB；实测「读 300 个不同文件 6.9 s vs 同一文件 300 次 0.019 s」（**370 倍**），说明单文件首次打开被拦截约 23 ms | 加排除项后启动时间显著下降 |
| **B** | 渲染进程空等某个请求（更新检查 / 遥测 / 远端配置超时） | 40 秒 ≈ 常见 HTTP 超时量级；更新入口已被守卫锁死，但可能仍有其他请求 | 诊断脚本的网络采样里出现长时间「握手中」 |
| **C** | 渲染进程加载/编译大量插件前端脚本 | 渲染进程需加载 **65 个插件 client 脚本**，其中 `dsh-client-ui-sidebar-documentpreview` **单个 6.7 MB** | CPU 采样在该阶段持续吃满 |

> 附注：A 的实测数字取自 WorkBuddy 自己的 shell（其进程带 `WORKBUDDY_FS_PROTECTION_ROLE=daemon`），可能被自身的文件防护放大。
> 因此**必须在你自己的环境复核** —— 这正是诊断脚本要做的事。

---

## 三、现在就做的两件事

### 1. 加 Defender 排除项（管理员 PowerShell，最可能立竿见影）

```powershell
# 以管理员身份打开 PowerShell
cd <仓库根>\dsh-update-guard
.\加Defender排除项.ps1 -Action Verify   # 先看现状（只读）
.\加Defender排除项.ps1                  # 加排除
```

排除范围仅 4 个目录 + 1 个进程：`D:\Program Files\DSH Desktop`、`~/.dsh`、`%APPDATA%\DSH Desktop`、`DSH Desktop.exe`。
基座升级不会让排除项失效（路径不变），无需重做。

### 2. 跑一次带监控的启动诊断（普通权限）

```powershell
# 先右键托盘退出 DSH
cd <仓库根>\dsh-update-guard
.\诊断启动慢.ps1
```

它会：启动 DSH 的同时逐秒采样 **读盘量 / 读操作数 / CPU / TCP 连接**，结束后解析启动埋点，输出分阶段耗时表 + 判读结论。

| 诊断结果 | 结论 | 对策 |
|---|---|---|
| 读操作数上万、读盘量大 | A 成立 | 排除项（上面第 1 步） |
| 长时间网络「握手中」 | B 成立 | 定位并关掉那个发起请求的插件/功能 |
| 该阶段 CPU 吃满 | C 成立 | 试禁用 `dsh-client-ui-sidebar-documentpreview`（6.7 MB，占插件脚本总量一半以上），或给 V8 加 code cache |

---

## 四、为什么「收窄」不会让启动变快

收窄改的是**每轮对话的固定前缀 token**（system prompt + skill catalog + 工具数组），
省的是**请求成本**，不是启动成本。

启动耗时由三类事决定：① 加载 app 包文件（21,921 个）；② 组装 profile（159 条插件归并）；③ 拉起渲染进程并让它跑起来。
收窄只轻微影响 ②（少 6 行插件 + 1 个 bundle），对 ①③ 基本无影响 —— 这与观察到的「改了还是慢」完全一致。

**要启动快，只能从 ① / ③ 下手。**

---

## 五、工具清单

| 文件 | 用途 | 权限 |
|---|---|---|
| `诊断启动慢.ps1` | 带监控启动一次，定位 40 秒成因 | 普通 |
| `加Defender排除项.ps1` | 增/删/查 Defender 排除项 | **管理员** |
| `测量启动耗时.ps1` | 分阶段计时（进程→窗口→可响应→空闲）+ IO 计数 | 普通 |
| `探测启动IO成本.mjs` | 量化 app 包 11,325 个模块文件的读取下限 | 普通 |
| `对照测文件读取瓶颈.mjs` | A/B 对照：新文件 vs 同一文件，判断是否逐文件校验 | 普通 |
| `对照测跨目录.mjs` | 跨目录对照，判断是个别目录策略还是全局现象 | 普通 |
| `判定首次打开机制.mjs` | 同一批文件读 3 遍，判断「首次扫描后缓存信任」 | 普通 |

---

## 六、已知坑（写脚本时踩到的）

**PowerShell 5.1 解析中文脚本必须带 UTF-8 BOM。**
无 BOM 的 UTF-8 会被按 ANSI(GBK) 读 → 中文注释变乱码 → 语法错误（报「意外的标记」）。
本目录的 `.ps1` 已统一转为 UTF-8 BOM；用编辑器另存时注意保持。
