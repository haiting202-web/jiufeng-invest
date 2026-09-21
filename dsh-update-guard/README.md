# DSH 受控更新守卫

锁住 DSH Desktop 自带的「检查更新…」入口，让基座版本只能由我们主动、可测试地推进。
**（2026-09-18 起，同一个脚本还负责「投研收窄 C 步」—— 关闭 system prompt 里的 DSH 开发说明段，见第 3.5 节）**

---

## 1. 为什么需要它

DSH Desktop 会自己去 `https://www.dshdesktop.cn/api/desktop/version` 查新版，检测到就提示下载安装包（`/api/downloads/windows`）并调起 NSIS 安装器。整个过程对使用者就是托盘里点一下的事。

问题是——**基座一动，两个自建插件就可能废掉**。已经实测踩到的（2.0.2 → 2.0.10 / Harness `0.1.1-rc.2` → `0.1.5-rc.2`）：

| 破坏点 | 影响 |
|---|---|
| `IWorkspaces.connectWorkspace()` 被整体移除 | 侧边栏"发消息建会话"失效 |
| `IWorkspaces.archiveSession(id)` → `archiveSession({ sessionId })` | 会话归档**静默失败**（外面包了 `.catch(()=>{})`，不报错） |
| `WorkspaceSnapshot.recentWorkspaceId` 被移除 | 打开最近工作区失效 |
| `@deepseek-ai/dsh-client-runtime` 被拆分废弃 | 客户端 inject 解析失败 |
| **2.0.10 取消 ASAR 归档** | `~/.dsh` 下 199 个软链接目标路径**全部失效**（`app.asar.unpacked` 不存在了） |
| 移除 `tool-str-replace-editor` / `tool-subagent-report` | 引用它们的技能报错 |

这类问题不会轰然报错，而是"看起来还好、某些功能悄悄不工作"。所以规矩是：**先调试好，再放更新。**

---

## 2. 一键操作

```powershell
cd <仓库根>\dsh-update-guard

.\切换更新守卫.ps1                 # 校验当前状态（只读，默认动作）
.\切换更新守卫.ps1 -Action Lock     # 锁上 —— 关更新入口 + 关 DSH 开发说明段
.\切换更新守卫.ps1 -Action Unlock   # 临时解锁 —— 仅在调试新基座时
```

3 个动作都是**幂等**的，随便重复跑。`Lock` / `Unlock` 写完会立刻回读校验。
`Verify` 分两段报告：① 受控更新守卫　② system prompt 收窄。

**改动生效需要 DSH 重启一次**（app 层 patch 只在启动时加载，不参与热重载）。脚本会检查进程并提醒你。

---

## 3. 守卫落在哪一层（这里踩过坑）

DSH 的 patch 层序（`dsh/lib/profile-boot-*.js` 的 `composeLive`）：

```
bundlePatches  →  profile cordis.patch.yml  →  home cordis.patch.yml  →  overlays
```

更新插件 `desktop-updates` 是**应用自带的** `cordis.patch.yml` 通过 `loadOverlayPatches()` 注入的（见 `app/lib/profile-pZhrTizp.js`），属于**最后的 overlays 层**——会把前面所有层的同 id 条目压掉。

> 踩坑记录：最早把 `- id: desktop-updates / disabled: true` 写进
> `~/.dsh/profiles/desktop/cordis.patch.yml`（profile 层），**这条路径不生效**，
> 因为它排在 app overlay 之前。该文件里已留注释说明，勿再往那里加。

唯一确定有效的落点，就是跟条目同层的那个文件：

```
D:\Program Files\DSH Desktop\resources\app\cordis.patch.yml
    - id: desktop-updates
      name: dsh-plugin-desktop/updates
      disabled: true   # GUARD:LOCKED ...
```

依据：
- 官方自己在同一个文件里就这么用（`desktop-terminal` 行的 `disabled: !!js process.platform === 'linux'`）
- 官方 `resolveTelemetryPatch()` 也是产出 `{ id, disabled: true }` 来禁用一个 bundle 行
- loader 对 disabled entry 显式跳过：`dsh-app-boot/lib/index.js` 的
  `assertEntriesLoaded` / `assertEntriesActivated` 里都是 `if (fiber === void 0 || entry.disabled) continue;`

**代价**：这个文件在应用安装目录，覆盖安装会被还原 —— 所以每次基座升级后必须重跑 `-Action Lock`。

---

## 3.5 同一文件里的第二件事：system prompt 收窄（2026-09-18 并入）

「投研收窄」方案的 C 步落在**同一个文件、同一层**，所以并进本脚本一起管。

```yaml
- id: web-runtime
  config:
    openBrowser: false
    printUrl: false
    surfaceContext: false   # GUARD:SLIM 关闭 DSH 开发说明段（harness:source + app:web-surface）
    trustedHosts: []
```

源码依据 `dsh-web-app/lib/index.js:182`：

```js
if (config.surfaceContext) {
  ctx.inject(["systemPrompt"], ...addHarnessSourceSection(promptCtx, SOURCE_ROOT)...   // harness:source 段
             ...webSurfacePrompt(localWebUrl(promptCtx))                               // app:web-surface 段
  ctx.inject(["shellEnv"], ...register({ variables: { [DSH_WEB_URL]: ... } }))         // shell 变量
}
```

关掉的三样东西都是写给「开发 DSH 的人」看的（"checkout 在 `D:\Program Files\...`"、"你在通过 Web GUI 交互…client-plugin HMR…`pnpm run dev:web`"），投研场景零收益。实测**省约 339 token/轮**。
代价：shell（pwsh 工具）里不再有 `DSH_WEB_URL` 环境变量 —— 已确认两个自建插件都不读它（grep 0 命中）。

`Set-SlimState` 找不到 `web-runtime.surfaceContext` 会**直接抛错而不是静默改错文件**，官方若改了行结构你会立刻看到明确报错。

> 已做 Unlock → Lock 往返测试：文件字节完全一致（无损）。

---

## 4. 基座升级 SOP

```
┌─ 1. 前置：备份 ─────────────────────────────────────────────┐
│  · 抢在更新器覆盖之前复制 %LOCALAPPDATA%\dsh-plugin-desktop-updater\installer.exe
│  · 快照 ~/.dsh（profiles / settings.yaml / .credentials.yaml / agent-presets）
│  · 记录软链接清单：Get-ChildItem ~\.dsh\profiles\node_modules\@deepseek-ai |
│                     ForEach-Object { $_.Name + "`t" + $_.Target }
│  · 备份两个插件的 package.json / gen-client.mjs / client.js
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 2. 兼容性实测（不要相信 changelog）────────────────────────┐
│  · 拉 npm tarball 或读本地新旧包体，逐个核对：
│    ① 插件 inject 的每个包是否还在
│    ② 插件用到的每个 API 符号是否还在（defineTool / WebError /
│       credentialRef / launchEnvironmentOf …）
│    ③ 逐个核对接口**方法集**（只 diff 符号不够 —— 0.1.5 把
│       connectWorkspace 整个方法删了，符号层面看不出来）
│    ④ UI slot 名称是否还在（sidebar.workspaces / sidebar.brand.mark /
│       sidebar.brand.name / shell.overlay）
│    ⑤ 自定义 provider patch 的 id 与 config 字段是否还在
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 3. 落地适配（用运行时能力探测，不要硬切 API）─────────────┐
│  让同一份插件代码在新旧两代基座都能跑，这样回滚基座时
│  无需回退插件源码。判定依据示例：
│    legacy : ctx.workspaces.connectWorkspace 存在
│    modern : ctx.workspaces.getSnapshot 存在
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 4. 关闭 DSH → 装新基座 ───────────────────────────────────┐
│  必须完全退出（右键托盘 →「退出」），不能只关窗口。
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 5. 首启验证（按顺序）─────────────────────────────────────┐
│  ① 版本号：resources\app\package.json 的 version
│  ② 目录形态：app.asar.unpacked 是否已变成 app（取消 ASAR）
│  ③ **软链接**：启动后 ~/.dsh/profiles/node_modules/@deepseek-ai 下
│     有多少条有效。DSH 会自建，但别假设 —— 2.0.10 实测从 199 → 247
│     （243 有效 + 4 条指向已删包的死链接）
│  ④ 启动日志 %APPDATA%\DSH Desktop\logs\dsh-YYYY-MM-DD.log 无报错
│  ⑤ 桌面 UI：左侧栏投研入口在不在
│  ⑥ 发消息建会话 → 正常（验 modern 分支：sessions.create）
│  ⑦ 会话归档按钮 → 有实际效果（验 modern 分支：archiveSession 对象参）
│     ↑ 这条最容易漏，因为静默失败不报错
│  ⑧ 工具调用：行情/财报检索能用（验 dsh-finance-tools）
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─ 6. 重新上锁 + 归档 ───────────────────────────────────────┐
│  · .\切换更新守卫.ps1 -Action Lock
│  · 从托盘「退出」DSH 再启动，确认托盘菜单里**没有**「检查更新…」
│  · 把本轮的破坏点补进 dsh-plugin-base-upgrade skill 的清单
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 本次升级实测结果（2026-09-16）

**结果：2.0.2 → 2.0.10 升级成功，插件零源码改动（除已做的双世代兼容层）。**

| 检查项 | 结果 |
|---|---|
| 应用版本 | `2.0.10` ✅ |
| Harness 版本 | `0.1.5-rc.2` ✅ |
| 目录形态 | `app.asar.unpacked` → **`app`**（取消 ASAR 已确认） |
| 包数量 | `@deepseek-ai/*` 199 → **243**（新增 48，移除 4） |
| 软链接 | 启动时**自愈重建**，247 条中 243 有效 ✅ |
| 侧边栏插件 10 个 inject 包 | 全部存在，均 `0.1.5-rc.2` ✅ |
| finance-tools 4 个 peer 包 | 全部存在，均 `0.1.5-rc.2` ✅ |
| 4 个 UI slot | 全部保留（`sidebar.workspaces` / `sidebar.brand.mark` / `shell.overlay` 等均在新包中被引用）✅ |
| 旧版被移除的 4 个包 | `dsh-client-runtime` / `dsh-host-apiproxy` / `dsh-tool-subagent-report` / `node-addon-landlock-run`，全库**零引用** ✅ |

**顺带修掉的一个不一致**：`~/.dsh/profiles/desktop/node_modules/dsh-finance-tools/package.json` 是**复制副本**（不是软链），源目录的 peer 放宽没同步过去，已在本次补齐。（`dsh-ai-invest-sidebar` 是软链 → 源目录改动即时生效，无需同步。）

---

## 6. 遗留项

| 项 | 说明 | 建议 |
|---|---|---|
| 4 条死链接 | `~/.dsh/profiles/node_modules/@deepseek-ai/` 下 `dsh-client-runtime`、`dsh-host-apiproxy`、`dsh-tool-subagent-report`、`node-addon-landlock-run` 仍指向已不存在的 `app.asar.unpacked` 路径。零引用、无害，但属于脏数据。 | 关闭 DSH 后删除这 4 个链接即可（DSH 不会重建它们，因为它也不认为它们该存在） |
| 托盘菜单确认 | 守卫效果最终确认需要肉眼看一眼系统托盘右键菜单里不再有「检查更新…」 | 从托盘「退出」重启后看一眼 |
| 网络层兜底 | 目前只挡了入口，没挡域名。真要彻底，可在 hosts 加 `127.0.0.1 www.dshdesktop.cn`（需管理员；会让浏览器也打不开该官网） | 可选，默认不加 |

---

## 7. 关键路径速查

| 用途 | 路径 |
|---|---|
| 守卫脚本 | `dsh-update-guard\切换更新守卫.ps1` |
| 守卫落点（会被覆盖安装还原） | `D:\Program Files\DSH Desktop\resources\app\cordis.patch.yml` |
| 落点文件原始备份 | `dsh-update-guard\app-cordis.patch.yml.original-2.0.10` |
| 守卫状态记录 | `dsh-update-guard\守卫状态.json` |
| 应用版本 | `D:\Program Files\DSH Desktop\resources\app\package.json` |
| Harness 包 | `D:\Program Files\DSH Desktop\resources\app\node_modules\@deepseek-ai\` |
| 软链接 | `~\.dsh\profiles\node_modules\@deepseek-ai\` |
| profile 配置 | `~\.dsh\profiles\desktop\package.json` / `cordis.patch.yml` |
| 桌面应用日志 | `%APPDATA%\DSH Desktop\logs\dsh-YYYY-MM-DD.log` |
| 升级回滚资产 | `<备份目录>\dsh-upgrade-backup-YYYYMMDD\` |
| 本次升级评估报告 | 本次升级的评估报告（见仓库 `docs/`） |

---

## 8. 排查时容易踩的自家坑

- **`ELECTRON_RUN_AS_NODE=1` 会让 `DSH Desktop.exe` 被当成纯 Node 跑**：进程瞬间 exit 0，无窗口、无日志、无进程。用 CLI（`... dsh/lib/bin.js --help`）验证过 DSH 之后，**务必清掉这个环境变量再启动 GUI**，否则会误判成"升级把应用搞坏了"。
  ```powershell
  [System.Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  ```
- **`desktop` profile 不能用 CLI 操作**：`dsh/lib/bin.js:29` 硬编码 `profile "desktop" is managed exclusively by the Electron application`，所以 `--dump-config` / `plugin` 子命令对它都不可用。
- **DNS 缓存不能用来验证更新检查**：`www.dshdesktop.cn` 的 A 记录 TTL 是 **1 秒**，加上 Chromium 自带解析缓存，`Get-DnsClientCache` 查不到痕迹。
