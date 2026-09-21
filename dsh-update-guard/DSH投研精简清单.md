# DSH 投研精简清单（可删除项 + 量化收益）

> 实测 2026-09-17 · 基座 DSH Desktop 2.0.10 / Harness 0.1.5-rc.2
> 目标：**只保留 AI 投研所需**，去掉无关功能与模块
> 配套：`DSH精简方案.md`（启动耗时诊断）、`DSH-Skill分级方案.md`（skill 分级工具）

**数据来源（可核查）**：
- **工具 token / system prompt 分段**：`~/.dsh/sessions/--D-project-local_article--/session-*/_decoded.jsonl` 里 `request/header` 事件记录的**真实请求负载**（该事件含完整 `tools` 数组 + `system` 全文），逐条按 ASCII 4 字符/token、CJK 1 字符/token 估算。
- **插件组合**：按层序归并 `dsh-base` / `dsh-web-app` / profile / app-overlays 四层 patch（159 条 → 132 条硬开启）。
- **层序与开关语义**：`app/lib/profile-pZhrTizp.js`（`disabled===true` 判定）、`dsh/lib/profile-boot-Dk-7KqJc.js`（`composeLive`）、`dsh-web-app/lib/index.js:182`（`surfaceContext`）。
- **skill 依赖**：扫 89 个 `SKILL.md` 全文对工具名的引用（结果：全部 0 命中）。
- ⚠️ 会话日志取自 8/26（升级前），但注入源（`addHarnessSourceSection` / `webSurfacePrompt` / 各 `tool-*` 包）已在**当前 2.0.10 源码中逐一交叉验证存在**。工具数量的细微变动以你新建会话后的实测为准（第六节有验证方法）。

---

## 一、结论先行

**每轮固定注入 ≈ 15,128 tokens，其中 ≈ 9,330 可以去掉（省 62%）。**

| 组成 | 现状 | 可省 | 省后 | 落点（改哪个文件） |
|---|---|---|---|---|
| **工具 catalog**（25 个工具） | 6,734 | **3,973** | 2,761 | `~/.dsh/.agent-presets/ai-finance/agent.cordis.yml` |
| **skill catalog**（89 个技能） | 6,564 | **4,367** | 2,197 | 89 个 `SKILL.md` 的 frontmatter |
| **system prompt**（19 段） | 1,830 | **990** | 840 | 预设 + app patch（见 D 类） |
| **合计** | **15,128** | **9,330** | **5,798** | 省 **62%** |

> 另有 **10 个 host 插件**可关（B 类），收益是**内存 / 界面干净 / 可能的启动改善**，不直接省 token。

**为什么这件事值得做**：这 15K tokens 是**每一轮**都要重发的前缀。按一天 100 轮算，省 9,330 tok/轮 ≈ 每天少烧 93 万 tokens —— 你的百炼免费额度（每模型 100 万）从"三天见底"变成"能用十天"。

---

## 二、为什么工具会吃掉 6,734 tokens

⚠️ **这是最反直觉的一点**：你的 ai-finance 预设是**从"标准编码 Agent"复制出来的**。预设文件第一行注释自己写着：

> *The `standard` agent preset: the full coding agent, mounted once per process.*

persona 改成了"AI 金融投研助手"，但**全套编码工具一个没删**。而每个工具的**名称 + 描述 + 完整 JSON Schema** 都会随每一轮请求发出去：

| 工具 | tokens | 说明 |
|---|---|---|
| `pwsh` | **1,111** | Windows shell（描述超长，投研必需） |
| `workflow` | **1,002** | 用 JS 脚本扇出多个 subagent 编排 |
| `subagent_fork` | 362 | 继承上下文的子代理 |
| `subagent` | 354 | 子代理委派 |
| `todo_write` | 337 | 编码待办清单 |
| `ask_user_question` | 331 | 向用户提问 |
| `list_agents` | 325 | 列出子代理 |
| `update_goal` | 283 | 更新长期目标 |
| `edit` | 266 | 精确编辑文件（投研写报告要用） |
| `glob` | 229 | 按路径找文件 |
| `job_output` | 207 | 取后台任务输出 |
| `ralph` | 204 | 全新 agent 反复迭代（极端专业化） |
| `write` | 192 | 写文件 |
| `grep` | 189 | 搜文件内容 |
| `send_message` | 187 | 给子代理发消息 |
| `interrupt_agent` | 175 | 中断子代理 |
| `create_goal` | 172 | 创建长期目标 |
| `read_image` | 145 | 读图片（看 K 线图有用） |
| `exit_plan_mode` | 137 | 退出计划模式 |
| `job_kill` | 112 | 终止后台任务 |
| `read` | 107 | 读文件 |
| `web_search` | 99 | 联网搜索 |
| `skill` | 92 | 加载技能 |
| `get_goal` | 77 | 查目标 |
| `job_list` | 39 | 列后台任务 |

**依赖验证（关键）**：我把 89 个投研 skill 的正文全部扫了一遍，检查它们是否调用这些工具：

| 工具 | 被多少个投研 skill 提及 |
|---|---|
| `subagent` / `subagent_fork` / `workflow` / `ralph` | **0** |
| `todo_write` / `exit_plan_mode` / `job_output` / `send_message` / `list_agents` | **0** |

→ **砍掉它们不会破坏任何一个投研 skill。**

---

## 三、可删除清单

### A 类｜工具行（收益最大 · 只改 1 个文件）

在 `~/.dsh/.agent-presets/ai-finance/agent.cordis.yml` 里给对应行加 `disabled: true`。

#### 🔴 P0 — 建议直接关（1,206 tok，零风险）

| 工具 | tok | 为什么无关 |
|---|---|---|
| `workflow` | 1,002 | 让模型写 JS 脚本编排多 agent。官方描述都写"**仅当用户明确要求工作流或大型多 agent 编排时使用**" |
| `ralph` | 204 | 对不可变目标跑全新 agent 循环。官方描述"**仅当直接用户明确要求 Ralph 式迭代时使用**" |

收益：**1,206 tok** + system prompt 里对应指引段 190 tok = **1,396 tok/轮**

#### 🟡 P1 — 建议关（2,072 tok，编码/多代理专用）

| 工具 | tok | 说明 |
|---|---|---|
| `subagent_fork` | 362 | 子代理委派（继承上下文） |
| `subagent` | 354 | 子代理委派（全新上下文） |
| `list_agents` | 325 | 列出子代理 |
| `send_message` | 187 | 给运行中的子代理发消息 |
| `interrupt_agent` | 175 | 中断子代理 |
| `update_goal` | 283 | 长期目标 |
| `create_goal` | 172 | 长期目标 |
| `get_goal` | 77 | 长期目标 |
| `exit_plan_mode` | 137 | 计划模式（编码用） |

⚠️ **一个例外**：如果你希望投研任务能"**多空双方各开一个独立子代理辩论**"（上下文隔离比单会话更强），则保留 `subagent` + `subagent_fork`（省 716 tok）。你的现存辩论 skill 不依赖它们，但这是**能力升级选项**。
收益：**2,072 tok** + system prompt 指引段（subagent×2 + goal）= 548 tok = **2,620 tok/轮**

#### 🟢 P2 — 看用法（695 tok，长任务跟踪）

| 工具 | tok | 保留的理由 |
|---|---|---|
| `todo_write` | 337 | 多步骤尽调（如 20 个维度）时跟踪进度 |
| `job_output` | 207 | 后台任务输出（批量跑 50 支股票巡检时有用） |
| `job_kill` | 112 | 终止后台任务 |
| `job_list` | 39 | 列后台任务 |

→ **建议保留**，除非你从不跑批量任务。这三件套 + system prompt 指引段 96 tok = 454 tok。

---

### B 类｜host 插件（10 项 · 改 profile patch · 省内存/界面）

落点：`~/.dsh/profiles/desktop/cordis.patch.yml`（**能压 base/web-app 层**，见第四节层序）

| 插件 id | 作用 | 投研是否需要 | 建议 |
|---|---|---|---|
| `session-telemetry-otel` | OpenTelemetry 遥测导出 | ❌ | 关（或用 `DSH_TELEMETRY_DISABLED=1` 这个官方开关） |
| `message-feedback` | 消息点赞/点踩记录 | ❌ | 关 |
| `ui-message-feedback` | 点赞点踩 UI | ❌ | 关 |
| `command-feedback` | `/feedback` 命令 + 反馈弹窗 | ❌ | 关 |
| `open-in-app` | 主机侧"用外部应用打开" | ❌ | 关（投研不写代码） |
| `ui-open-in-app` | 上述按钮的 UI | ❌ | 关 |
| `code-runtime` | 代码执行 seam（PTC 模式用） | ❌ | 关（你是标准模式） |
| `ui-trajectory` | Trajectory 轨迹视图（token/耗时调试） | ⚠️ | 可选（调试自身时有用） |
| `session-log-download` | `/export` 导出会话 | ⚠️ | 可选（导出投研结论可能有用） |
| `ui-deliverables` | 轮末"产出文件"行 | ✅ | **保留**（投研产出报告，这个提示很有用） |

合计可关 7 项（3 项可选）。

---

### C 类｜bundle（1 项 · 改 package.json）

落点：`~/.dsh/profiles/desktop/package.json` 的 `dsh.profile.bundles` 数组

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dshmarket",              ← 删掉这一行
  "dsh-finance-tools",      ← 投研核心，留
  "dsh-ai-invest-sidebar"   ← 投研核心，留
]
```

| bundle | 说明 | 建议 |
|---|---|---|
| `dshmarket` | 插件市场（带 UI + 维护 `.dsh-market/` 热挂载子树 + 每次启动 bundle reconcile + settings.yaml 里 60KB 已过期目录缓存） | ❌ 关（**你自己插件都自建了**） |

⚠️ `dsh-finance-tools`（21 个金融数据工具）和 `dsh-ai-invest-sidebar` 是**投研命脉，绝不能删**。

---

### D 类｜system prompt 段（990 tok · 两处落点）

system prompt 共 19 段 ≈ 1,830 tok，其中**与投研无关的段落**：

| 段 | 内容 | tok | 怎么去掉 |
|---|---|---|---|
| 2 | "DSH 实现 checkout 在 D:\Program Files\..." 路径说明 | 89 | ↓ 同一个开关 |
| 3 | **"你正在通过 DSH Web GUI 交互…client-plugin HMR…`pnpm run dev:web`…"** | 250 | ↓ 同一个开关 |
| 15 | workflow 工具用法指引 | 81 | 关工具（A 类） |
| 16 | ralph 工具用法指引 | 109 | 关工具（A 类） |
| 17 | subagent 工具用法指引 | 90 | 关工具（A 类） |
| 18 | subagent_fork 工具用法指引 | 91 | 关工具（A 类） |
| 14 | goal 工具用法指引 | 184 | 关工具（A 类） |
| 12 | 后台任务指引 | 96 | 关工具（A 类） |

**段 2+3（339 tok）有一个官方开关**：

```yaml
# D:\Program Files\DSH Desktop\resources\app\cordis.patch.yml
- id: web-runtime
  name: '@deepseek-ai/dsh-web-app'
  config:
    openBrowser: false
    printUrl: false
    surfaceContext: false     # ← 从 true 改成 false
    trustedHosts: []
```

源码确认（`dsh-web-app/lib/index.js` 第 182 行）：
```js
if (config.surfaceContext) {
    addHarnessSourceSection(...)   // 注入段 2
    ...webSurfacePrompt(...)       // 注入段 3
}
```

⚠️ **代价**：shell 里不再有 `DSH_WEB_URL` 环境变量（指向当前 GUI 的 URL）。对投研**几乎无影响**。

⚠️ **注意落点**：这个配置写在 **app 自带 patch（overlays 层，最后应用）**里，**profile 层改不动它**（和"更新守卫"是同一个坑）。所以必须改 app 目录那个文件，**每次基座升级后要重跑**（可并入 `切换更新守卫.ps1` 一起管理）。

---

### E 类｜skill 分级（4,367 tok · 已就绪）

已有完整工具与清单，见 `DSH-Skill分级方案.md`：

```bash
node 管理skill分级.mjs --status          # 只读看账
node 管理skill分级.mjs --apply "skill-分级清单.json" --write   # 落盘（自动备份）
```

默认清单：常驻 28 个（投研核心）+ 按需 61 个 → 6,564 → 2,197 tok。

---

## 四、实施路径（4 个落点 + 层序）

**层序（源码 `composeLive` 实证）**：

```js
[
  ...bundlePatches,                        // ① base + web-app + dshmarket + 自建插件
  ...loadOptionalPatches(profile.patchPath),  // ② profile 层  ← 能压①
  ...loadOptionalPatches(homePatchPath()),    // ③ home 层
  ...composed.overlays                     // ④ app 自带 patch  ← 压①②③，谁都压不住
]
```

| # | 改什么 | 文件 | 能压谁 | 生效时机 |
|---|---|---|---|---|
| A | 关工具行 | `~/.dsh/.agent-presets/ai-finance/agent.cordis.yml` | preset 层 | **新建会话** |
| B | 关 host 插件 | `~/.dsh/profiles/desktop/cordis.patch.yml` | 压 ①（bundle） | 热加载（`patchReload: live`） |
| C | 关 bundle | `~/.dsh/profiles/desktop/package.json` | bundles 列表 | 需重启 |
| D | 关 prompt 段 | `D:\Program Files\DSH Desktop\resources\app\cordis.patch.yml` | overlays 层 | 需重启 + **升级后重做** |
| E | skill 分级 | 89 个 `SKILL.md` | — | 新建会话 |

**建议顺序**：E（已有工具）→ A（收益最大）→ B → C → D（涉及 app 目录，最后做）

---

## 五、红线：这些不能碰

| 类别 | 为什么 |
|---|---|
| `llm` / `llm-pi-ai` / `settings` / `credentials` / `agent-default-model` | 模型路由与配置，关了整个应用废 |
| `session*` / `storage*` / `workspace` | 会话与存储，关掉丢数据 |
| `tools` / `system-prompt` / `agent` / `agent-loop` | Agent 运行时核心 |
| `permission` / `approval` / `sandbox*` / `fs-observation-policy` | 安全与权限栈 |
| `tool-fs` / `tool-pwsh` / `tool-web` / `tool-skill` / `skill-filesystem` | 投研命脉（读写报告 / 跑脚本 / 联网 / 技能） |
| `compaction-*` / `tool-result-pruner` / `token-meter` | 长对话压缩，关掉会爆上下文 |
| `client-ui-*` 基础（layout/renderer/chat/conversation/sidebar） | 界面骨架 |
| `dsh-finance-tools` / `dsh-ai-invest-sidebar` | **你的投研插件** |
| `desktop-shell` / `desktop-profiles` / `desktop-pnpm` | 桌面端运行必需 |
| 应用自带的 4 个 Agent 预设 | 属部署方所有，**升级会还原**（删了白删） |

---

## 六、验证与回滚

**验证**（每步之后）：
1. `node 管理skill分级.mjs --status` —— skill 账
2. 新建会话，问模型"列出你能用的全部工具" —— 工具账
3. 看会话日志 `~/.dsh/sessions/<ws>/<session>/_decoded.jsonl` 里 `request/header.tools` 条数

**回滚**：
- A：删掉 `disabled: true` 那一行（或恢复备份）
- B/C：`cp cordis.patch.yml.bak-<ts> cordis.patch.yml`
- D：`dsh-update-guard\切换更新守卫.ps1 -Unlock`（含 surfaceContext 还原）
- E：`node 管理skill分级.mjs --rollback`

**统一备份**：动手前先把 A~D 四个文件复制到 `dsh-update-guard\backup-投研精简-<日期>\`。

---

## 七、诚实的预期管理

| 目标 | 这次精简能帮上吗 |
|---|---|
| **每轮更快 / 更省额度** | ✅ **有效**，省 62% 固定前缀 |
| **模型更专注投研**（不被编码工具带跑） | ✅ 有效（工具从 25 个降到 12 个） |
| **界面更干净** | ✅ 关掉反馈/轨迹/外部打开等 |
| **冷启动更快** | ⚠️ **收益有限**。关 host 插件能省内存，但启动瓶颈大概率是 **Windows Defender 实时扫描**（把 `D:\Program Files\DSH Desktop` 和 `~/.dsh` 加入排除项，通常比砍插件有效得多） |
