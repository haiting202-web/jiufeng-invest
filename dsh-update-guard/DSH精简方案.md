# DSH 精简方案（启动提速）

> 目标：在**不损失 AI 投研能力**的前提下精简 DSH，缩短启动时间。
> 日期：2026-09-17 ｜ 基线：DSH Desktop 2.0.10 / Harness 0.1.5-rc.2

---

## 〇、结论先行

| 你的设想 | 结论 | 原因 |
|---|---|---|
| 删掉 Agent 预设里的内置模式 | ❌ **删了没用，也不该删** | 它们不在你的配置区，且是静态文件、不预加载 —— 对启动耗时贡献≈0，升级还会还原 |
| 精简到只留 AI 投研 | ⚠️ **可做，但可精简对象只有 3 个 bundle**，且其中 2 个正是投研核心 | 真正能动的只有 `dshmarket` |
| 89 个 skill 拖慢启动 | ❌ **不是启动瓶颈**（实测 18.3 ms） | 但它是「每轮慢」的税：≈5,717 tokens/轮 |

**最重要的一句**：在没测出启动分段耗时之前，砍插件是**盲砍**。本方案第 1 步就是量化。

---

## 一、先分清「哪种慢」

你说的"启动慢"要拆成两件事，成因和方案完全不同：

| 类型 | 定义 | 主要成因 | 可优化性 |
|---|---|---|---|
| **A. 冷启动慢** | 双击图标 → 界面可用 | Electron 启动、渲染进程加载前端 bundle、host 组合装配、插件模块加载、Windows Defender 扫描 | 部分可控 |
| **B. 每轮慢** | 发消息 → 首字出现 | 系统提示 + skill catalog 注入体量、模型推理速度、上下文长度 | 可控 |

用第 1 步的测量把 A/B 分离。**如果是 A 且时间花在 Electron 自身，那精简插件收效有限** —— 这点必须诚实。

---

## 二、第 1 步：量化（零风险，必做）

### 方法 1：粗测三分段（2 分钟）

```powershell
# 完全退出 DSH 后执行
$t0 = Get-Date
Start-Process "D:\Program Files\DSH Desktop\DSH Desktop.exe"
# 眼睛盯着：a) 窗口出现  b) 界面骨架渲染完  c) 可以点输入框
# 各记一个秒数，然后回填下表
```

| 时间点 | 秒表读数 | 说明 |
|---|---|---|
| a. 进程启动 → 窗口出现 | ___ s | 主要是 Electron 壳 |
| b. 窗口出现 → 界面可用 | ___ s | 主要是渲染进程 + 前端 bundle |
| c. 界面可用 → 首个会话可发消息 | ___ s | 主要是 host 组合 + 插件 |

**判读**：
- 时间主要在 a → Electron/系统层面。**精简插件没用**，去看 Windows Defender 排除项（见 3.4）。
- 时间主要在 b → 前端 bundle 层面，DSH 固有，不建议动。
- 时间主要在 c → **插件层确实是瓶颈**，第 3 节方案有效。

### 方法 2：A/B 对比精测（关键验证手段）

任何"砍某插件能提速"的说法都必须有 A/B 数据支撑。做法：

```bash
# 1) 备份 profile 清单
cd "$USERPROFILE/.dsh/profiles/desktop"
cp package.json "package.json.bak-abl$(date +%Y%m%d%H%M%S)"
```

编辑 `package.json`，从 `dsh.profile.bundles` 数组里注掉 `"dshmarket"`，保存 → **重启 DSH 测 3 次取平均** → 再恢复，测 3 次取平均。

> `dshmarket` 在 profile 里是**复制副本**（非软链），改源目录不影响它，反之亦然。

### 方法 3：确认插件是否真的加载了

```bash
# 应用自带插件清单服务（dsh-host-plugin-inventory）用于列出实际装配的插件
# 也可直接看 profile 组合：
cat "$USERPROFILE/.dsh/profiles/desktop/package.json"
```

---

## 三、已经查实的结论

### 3.1 内置 4 个 Agent 预设：删不得，也不必删

**它们的位置**（不在你的配置区）：

```
D:\Program Files\DSH Desktop\resources\app\node_modules\@deepseek-ai\dsh-agent-presets\presets\
  ├── standard\   （标准模式）  agent.cordis.yml 12,928 字节
  ├── ptc\        （PTC 模式）  agent.cordis.yml 14,003 字节
  ├── minimal\    （极简模式）  agent.cordis.yml  3,119 字节
  └── cordis\     （创造模式）  agent.cordis.yml 14,010 字节 + skills/
```

**官方明确警告**（引自 `cordis` 预设 persona 原文）：

> *NEVER edit or delete the shipped preset install (the `agent-presets` directory beside the deployment's own config): **it belongs to the deployment, an upgrade overwrites it**, and corrupting the `cordis` preset would disable this very mode. To change what a shipped preset does, copy its composition into a new preset directory and edit the copy.*

三条硬理由：

1. **不属于你** —— 属部署方（应用安装目录），**覆盖安装/升级即还原**，白折腾。
2. **删了不省启动时间** —— 这些是静态 YAML；只有会话**挂载**某预设时才解析它。列表枚举走的是应用自带目录，成本是 `readdir` 级别。
3. **破坏性** —— 删掉 `cordis` 会让"创造模式"失效（该模式的 persona 自己就是靠它工作的）。

**你的预设在这里**（可以动，但没必要删）：

```
%USERPROFILE%\.dsh\.agent-presets\ai-finance\   （14.5 KB + 89 skills）
```

> 注：预设**列表是"未记忆化"的** —— `list()` / `resolve()` 每次调用都重读磁盘（源码注释：*Discovery is unmemoized*）。所以预设**越少，打开选择器越快**。这是"列表更干净"的收益，不是启动收益。
> 另外：`agent-presets` 命名空间**只支持一个可写设置 `default`**（默认预设 id），**没有"隐藏/禁用"某个预设的开关**。

### 3.2 89 个 skill：不是启动瓶颈，但是每轮税

| 指标 | 实测值 |
|---|---|
| skill 目录数 | 89 |
| 扫描 + 读 SKILL.md 耗时 | **18.3 ms** |
| 读取字节数 | 374 KB |
| catalog 注入体量 | 8,576 字符 ≈ **5,717 tokens / 轮** |

**结论**：18.3 ms 可以忽略，**排除嫌疑**。
但 5,717 tokens 是**每轮固定成本** —— 会让首字变慢、也吃免费额度。如果你实际只用其中 20-30 个，砍到那个规模每轮能省 3-4K tokens，**这是"每轮慢"最实在的优化点**。

### 3.3 插件组合规模（这部分动不了）

| 层 | 插件行数 | 归属 |
|---|---|---|
| `@deepseek-ai/dsh-base` | 84 | DSH 固有 |
| `@deepseek-ai/dsh-web-app` | 94 | DSH 固有 |
| 应用自带 patch（`desktop-*`） | 7（其中 `desktop-updates` 已被你的更新守卫禁用） | 应用固有 |
| **profile 增加（你自己的）** | **3** | ✅ 唯一可动的 |

`@deepseek-ai` 包共 2,270 个文件 / 33 MB —— 这 243 个包互相依赖，**删任何一个都会直接起不来**。

### 3.4 很可能被忽略的大头：Windows Defender 实时扫描

Electron 应用启动要读几千个 JS 文件。若 `D:\Program Files\DSH Desktop` 和 `%USERPROFILE%\.dsh` 不在 Defender 排除列表里，**每次启动都会被逐个扫描**。这在 Windows 上经常是数百毫秒到数秒的差异。

代价：需要管理员权限；安全性略降（可只排除这两个目录，不要排除整个磁盘）。

---

## 四、可精简清单（按风险分级）

### ✅ L0 —— 零风险，建议直接做

| # | 动作 | 收益 | 说明 |
|---|---|---|---|
| 1 | **清理 `settings.yaml` 里的过期市场缓存** | settings 文件从 62KB 降到 ~2KB | `dsh-community-market.catalogCache`（500 条插件目录，`expiresAt` 已过期 3 周）。纯缓存，删了会自动重建 |
| 2 | **给 Defender 加排除项** | 可能显著（取决于方法 1 的判读） | 排除 `D:\Program Files\DSH Desktop` 与 `%USERPROFILE%\.dsh` |
| 3 | **清理历史会话** | 减少 workspace 恢复开销 | `~/.dsh/sessions/`、`storages/session_projcache.json`（58 KB） |

### ⚠️ L1 —— 低风险，需要你确认用途

| # | 动作 | 收益 | 代价 |
|---|---|---|---|
| 4 | **精简 89 个 skill → 保留实际使用的** | 每轮省 3-4K tokens | 需你圈定保留清单；skill 是你自己的资产，**删前必须备份** |
| 5 | 删掉未用的 `.credentials.yaml.bak-*` / `settings.yaml.bak-*` | 可忽略 | 建议保留最近 2 份 |

### 🔶 L2 —— 中风险，**必须 A/B 验证后再定**

| # | 动作 | 证据 | 代价 |
|---|---|---|---|
| 6 | **从 profile bundles 移除 `dshmarket`** | 它注册 `dsh-market` 插件、自带 client UI、维护 `<profile>/.dsh-market/` 热挂载子树（**每次启动清空**）、有 10 秒热挂载超时与 bundle reconcile 逻辑；settings 里还有它 60KB 过期缓存 | 从此不能用市场装插件；且**收益未经实测**，必须先跑第二节方法 2 |

> 说明：`dshmarket` 是**目前唯一有实质证据的可疑对象**（启动期有目录清理 + reconcile 行为）。但"有证据"≠"已证实是瓶颈"，所以归到 L2 而非 L0。
> `dsh-finance-tools`（21 个金融数据工具）与 `dsh-ai-invest-sidebar`（投研左侧栏）**是你的投研核心，不在精简范围内**。

### ⛔ L3 —— 不建议（做了白做或有害）

| 动作 | 为什么不做 |
|---|---|
| 删内置 4 预设 | 升级还原 + 零启动收益 + 可能破坏创造模式 |
| 改 `D:\Program Files\DSH Desktop\` 下的任何文件 | 覆盖安装即还原（除已固化的更新守卫脚本） |
| 删 `@deepseek-ai` 下的包 | 243 包互相依赖，删了直接起不来 |
| 关掉 `dsh-base` / `dsh-web-app` 的插件行 | 破坏核心能力，且属上游所有 |

---

## 五、建议执行顺序

```
1. 方法 1 粗测三分段        ← 先知道时间花在 a/b/c 哪一段
        │
        ├─ 若主要在 a → 做 L0-2（Defender 排除），收工
        ├─ 若主要在 b → 前端固有，接受；转去做 L1-4（每轮优化）
        └─ 若主要在 c → 继续
                │
2. 做 L0-1 / L0-3           ← 零风险，顺手清
3. 方法 2 A/B 测 dshmarket  ← 有数据才决定是否 L2-6
4. L1-4 skill 精简          ← 你圈定保留清单后我执行（带备份）
```

---

## 六、回滚与安全边界

| 动作 | 回滚方式 |
|---|---|
| 改 profile `package.json` | 已存 `package.json.bak-abl<时间戳>` |
| 改 `settings.yaml` | 已有 `.bak-<时间戳>` 系列；且 `dsh-settings-file` 是**注释保留的叶子级 diff**，手工编辑安全 |
| 删 skill | 执行前整体打包备份到 `dsh-update-guard\backup-skills-<日期>.zip` |

**红线**：
- 不碰 `D:\Program Files\DSH Desktop\` 下的应用文件（除已脚本化的更新守卫）
- 不删 `.workbuddy` / `~/.dsh` 里非缓存类文件
- skill 删除一律先备份、分批、逐批核对

---

## 七、待你决策

1. 先跑**方法 1 粗测**，把 a/b/c 三段秒数告诉我 —— 这决定后面砍什么。
2. **89 个 skill 保留哪些？** 从这 89 个里圈定（默认建议只留你真正会用的 20-30 个）：

`3-statement-model, accrual-schedule, ai-readiness, aml-check, audit-xls, benchmarking, break-trace, bull-bear-debate, buyer-list, cash-flow-analysis, catalyst-calendar, cim-builder, clean-data-xls, client-report, client-review, common-size, competitive-analysis, compliance-check, comps-analysis, datapack-builder, dcf-model, dd-checklist, dd-meeting-prep, deal-screening, deal-sourcing, deal-tracker, deck-refresh, dividend-analysis, dupont-analysis, earnings-analysis, earnings-calendar, earnings-preview, earnings-review, esg-score, event-study, fee-calculation, financial-plan, forensic-accounting, gl-recon, goal-planning, ib-check-deck, ic-memo, idea-generation, income-strategy, initiating-coverage, insider-trading, investment-proposal, investor-reporting, kyc-doc-parse, kyc-rules, lbo-model, merger-model, model-update, morning-note, nav-tieout, peer-comparison, performance-attribution, pitch-deck, portfolio-monitoring, portfolio-rebalance, ppt-template-creator, pptx-author, process-letter, quality-score, ratio-analysis, returns-analysis, risk-assessment, risk-profiling, roll-forward, sanctions-screening, scenario-analysis, sector-overview, sector-rotation, sensitivity-analysis, short-interest, skill-creator, stock-comparison, strip-profile, supply-chain, tax-loss-harvesting, teaser, technical-analysis, thesis-tracker, unit-economics, valuation-heatmap, value-creation-plan, variance-commentary, waterfall-chart, xlsx-author`

3. **`dshmarket` 还用吗？** 如果不用（你已自建插件），可以直接进 A/B 测试。
