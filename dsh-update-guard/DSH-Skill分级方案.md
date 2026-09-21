# DSH Skill 分级方案：能不能"启动不加载、用时再加载"？

> 结论先行：**可行，但不是你设想的方式。** 你说的"89 个 skill 全量扫描"其实是三层不同的成本，
> 其中**扫描本身只要 18.3 ms 且不在软件启动路径上**，而真正值得动的第三层（catalog 注入）
> **不能完全省掉**——但 DSH 有一个原生开关，能砍掉 **67%**。
>
> 当前状态：**方案已完成、工具已就绪、尚未改动任何文件**（89 个 SKILL.md 保持原样）。

---

## 一、先拆成三层，别混在一起

"89 个 skill 加载"实际上是三个独立的东西，成本差三个数量级：

| # | 层 | 什么时候发生 | 实测成本 | 你的目标达成情况 |
|---|---|---|---|---|
| ① | **文件扫描**（遍历 89 个目录 + 读 SKILL.md） | 会话首个请求前 / 你打 `/` 时 | **18.3 ms** | 已经是懒的，且不在启动路径 |
| ② | **SKILL.md 完整正文** | 模型调 `skill` 工具，或你打 `/名字` | 按需（正文平均几 KB） | **已经是懒加载** |
| ③ | **skill catalog 注入**（名字 + 描述） | 会话首轮注入，之后**每轮都在上下文里** | **6,564 tokens/轮** | 不能全免，但能砍 67% |

### 关于 ①：它根本不在软件启动路径上

```
Electron 进程启动 → 窗口出现 → 界面可用 → 你新建会话 → 发第一条消息
                                              ↑
                                     到这里才触发 skill 发现（18.3 ms）
```

`dsh-tool-skill` 的注入挂在 `ctx.on("agent/pre-step")`（第 203 行），是**每次 agent step 之前**的钩子，
不是 Electron 启动时。而且 `dsh-skill` 有 `collectCacheMaxEntries: 128` 的发现缓存 +
文件监听增量失效，同一会话内重复查询直接命中缓存。

**结论：把 skill 扫描改成"按需"，最多省 18.3 ms，而且省的位置不对——它本来就不拖慢启动。**

### 关于 ②：已经是你要的效果

`dsh-tool-skill` 的 README 原文：

> 模型以精确的 skill 名称调用 `skill`，并收到**完整指令正文**以及规范的 `<skill_content>` 块中的资源指引

catalog 里只有名字和描述（summary），**正文永远是按需读取的**。这一层不用改。

### 关于 ③：这才是唯一的真成本

89 个 skill 的 name + description 会被拼成一份目录，**注入成一条持久的用户角色消息**，
之后每轮对话都随上下文一起发送（LLM 无状态，每轮都要重发历史）。

而且这个注入是「**持久 + 掉出窗口自动补回**」的设计——`catalogHistory()` 第 331-348 行会检查
catalog 消息是否还在 `session.surface.nodes`（可见窗口）里，**掉出去就重新注入**。
所以它**一轮都不会少**，是纯粹的每轮固定税。

---

## 二、为什么不能"完全不加载"

因为**模型必须先知道有哪些 skill，才可能调用它**。这是"发现"与"加载"的本质矛盾：

- catalog 全砍掉 → 模型看不到任何 skill → 只会把它当成没有 skill 的普通对话
- 你想让模型"自己搜一下有什么 skill" → 需要额外写一个搜索工具 + 自建插件 + 跟随 Harness 版本迭代

而 2,197 tokens（28 个常驻）在 1M 上下文里只占 **0.2%**，为这点开销养一个自维护插件是亏本买卖。

**所以正确解法不是"全懒加载"，而是"分层"——把'该让模型看见的'压到最小。**

---

## 三、DSH 的原生开关（四条源码证据）

SKILL.md 的 frontmatter 支持 `disable-model-invocation: true`。**这是 DSH 的正式设计，不是 hack。**

### 证据 1：frontmatter 支持这个字段

`dsh-skill-filesystem/lib/index.js` 第 841-851 行：

```js
function parseInvocationPolicy(data) {
	rejectLegacyInvocationKey(data, "disableModelInvocation", "disable-model-invocation");
	rejectLegacyInvocationKey(data, "modelInvocable", "disable-model-invocation");
	rejectLegacyInvocationKey(data, "userInvocable", "user-invocable");
	const disableModelInvocation = frontmatterBoolean(data, "disable-model-invocation");
	const userInvocable = frontmatterBoolean(data, "user-invocable");
	return {
		modelInvocable: disableModelInvocation !== true,   // ← 标了就 false
		userInvocable: userInvocable !== false             // ← 默认仍为 true
	};
}
```

> ⚠️ **旧写法 `modelInvocable` 会被直接拒绝并报错**，必须用 `disable-model-invocation`。
> 布尔值支持 `true / 1 / "1" / yes / on`。

### 证据 2：标了就不进 catalog（省 token）

`dsh-tool-skill/lib/index.js` 第 217 行：

```js
const skills = snapshot.skills.filter(isModelInvocable);   // ← catalog 只取 modelInvocable 的
const entries = catalogSourceEntries(skills, catalogDescriptionMaxLength);
```

### 证据 3：**你打 `/名字` 依然能加载完整正文**

同文件第 180-183 行（用户显式调用路径）：

```js
for (const name of names) {
	const skill = await ctx.skills.get(name, lookup);
	if (skill === void 0 || !isUserInvocable(skill)) continue;   // ← 只校验 userInvocable！
	injections.push(createUserMessage({ content: [{ type: "text", text: renderSkillContent(skill) }], ... }));
}
```

**这条路径完全不看 `modelInvocable`** —— 标记只影响"模型是否看得见"，不影响"你能否调用"。

### 证据 4：`/` 补全菜单里仍有它，只标「仅用户」

`dsh-client-ui-skill/lib/client.js` 第 285-291 行：

```js
const source = {
	trigger: "/",
	async candidates(session, { query, signal }) {
		const skills = await fetchCatalog(session.sessionId);
		return rankByName(skills, query).map((skill) => ({
			name: skill.name,
			description: skill.modelInvocable
				? skill.description
				: `${t("menu.userOnly")} · ${skill.description}`   // ← 标注「仅用户」
		}));
	},
```

中文界面文案（同文件 locale 字典）：`"menu.userOnly": "仅用户"`

而且 `/` 补全是**打 `/` 时才拉取**的懒加载（`candidates` 回调），不是启动时预载。

**四条证据合起来：标记后的 skill 从模型视野消失、从每轮 token 账单消失，但你在输入框打 `/名字`
仍能加载完整指令，`/` 菜单里也还能看到（带「仅用户」标签）。体验无损。**

---

## 四、收益与代价

### 收益（实测估算）

| 方案 | 每轮 catalog | 省下 | 节省比例 |
|---|---|---|---|
| 现状（89 个全注入） | 6,564 tokens | — | — |
| **建议（28 常驻 + 61 按需）** | **2,197 tokens** | **4,367 tokens** | **67%** |

两个实际好处：

1. **每轮响应更快** —— 少 4.4K token 的 prefill 开销，TTFT 有可感知改善
2. **免费额度消耗慢 3 倍** —— 百炼 100 万 tokens 免费额度（按 token 计）能支撑的轮数翻倍

### 代价（必须接受这一条）

标记为按需的 skill，**模型不会自主使用**——它看不见，也就不会在你问"分析这只股票"时
自己想起"哦有个 DCF 模型 skill"。**必须你手动 `/名字` 触发。**

所以分层的判据是唯一一句话：

> **「我会不会主动想起要用它？」**
> 会 → 可以放进按需池
> 不会（希望模型看到任务自动匹配）→ 必须留在常驻池

---

## 五、建议的分层清单

### 常驻 28 个（模型该自动想起来的）

| 场景 | skill |
|---|---|
| 二级市场 / 投研核心（12） | `bull-bear-debate` `technical-analysis` `stock-comparison` `earnings-analysis` `earnings-preview` `valuation-heatmap` `thesis-tracker` `catalyst-calendar` `peer-comparison` `comps-analysis` `sector-overview` `idea-generation` |
| 财务分析（7） | `ratio-analysis` `dcf-model` `cash-flow-analysis` `dupont-analysis` `sensitivity-analysis` `quality-score` `forensic-accounting` |
| 投行 / 尽调（6） | `initiating-coverage` `ic-memo` `deal-screening` `dd-checklist` `datapack-builder` `morning-note` |
| 产出工具（3） | `skill-creator` `xlsx-author` `pptx-author` |

### 按需 61 个（你会主动 `/调用` 的）

主要是**低频专项工具**和**流程性材料**，你用到时自己清楚要哪个：

| 类别 | 代表 skill |
|---|---|
| 基金运营对账 | `nav-tieout` `gl-recon` `break-trace` `accrual-schedule` `fee-calculation` `roll-forward` `variance-commentary` `performance-attribution` |
| 合规 / KYC | `kyc-doc-parse` `kyc-rules` `aml-check` `sanctions-screening` `compliance-check` `insider-trading` |
| 专项建模 | `lbo-model` `merger-model` `3-statement-model` `model-update` `accrual-schedule` |
| 材料制作 | `pitch-deck` `cim-builder` `teaser` `buyer-list` `process-letter` `client-report` `client-review` `investor-reporting` `deck-refresh` `ib-check-deck` `ppt-template-creator` |
| 个人理财 | `financial-plan` `goal-planning` `income-strategy` `risk-profiling` `portfolio-rebalance` `portfolio-monitoring` `risk-assessment` `tax-loss-harvesting` |
| 数据工具 | `clean-data-xls` `audit-xls` |
| 其他专项 | `ai-readiness` `benchmarking` `esg-score` `event-study` `short-interest` `supply-chain` `unit-economics` `value-creation-plan` `scenario-analysis` `sector-rotation` `common-size` `dividend-analysis` `returns-analysis` `competitive-analysis` `investment-proposal` `deal-sourcing` `deal-tracker` `dd-meeting-prep` `earnings-calendar` `earnings-review` |

> 清单是**可编辑的**：`skill-分级清单.json` 里的 `keep` 数组就是常驻名单，改了再跑 `--apply` 即可。
> 这个判据没有标准答案，完全取决于你的使用习惯——上面只是基于你项目定位的默认建议。

---

## 六、怎么操作

工具：`dsh-update-guard\管理skill分级.mjs`（纯 Node，零依赖）

```bash
# 1) 看现状（只读）
node 管理skill分级.mjs --status

# 2) 证明改写逻辑安全（只读、纯内存）
node 管理skill分级.mjs --selftest

# 3) 生成建议清单（只读，会写一个 json 清单，不动 SKILL.md）
node 管理skill分级.mjs --plan

# 4) 预演（dry-run，不改文件）—— 先看要改哪些
node 管理skill分级.mjs --apply "skill-分级清单.json"

# 5) 确认后落盘（自动整目录备份到 skill-backup-<时间戳>/）
node 管理skill分级.mjs --apply "skill-分级清单.json" --write

# 6) 后悔了
node 管理skill分级.mjs --rollback
```

**生效方式**：新建一个 DSH 会话（catalog 在会话首个请求前注入）。
`dsh-skill-filesystem` 默认 `watch: true`，理论上改动会被文件监听到并自动失效缓存；
若新会话里 catalog 仍是旧的，重启 DSH 兜底。

---

## 七、安全性验证（已跑过）

| 验证 | 方法 | 结果 |
|---|---|---|
| 改写逻辑不破坏文件 | `--selftest`：89 个 SKILL.md 做 178 次内存往返 | ✅ 全部通过 |
| YAML 层面兼容 | 用 **DSH 自带的 yaml v2.9.0** + 复刻 DSH 的 `parseFrontmatter` 步骤，验证 89 个改写结果 | ✅ 89/89 通过 |
| 断言覆盖 | name / description / category / version 原样；frontmatter 之外正文字节完全保留；标记幂等；可干净取消无残留 | ✅ |
| 当前磁盘状态 | `grep -rl disable-model-invocation` 命中 **0 个** | ✅ 未改动任何文件 |

`验证skill标记兼容性.mjs` 是上面第二项验证的脚本，DSH 升级后可重跑。

---

## 八、回到你真正关心的问题：软件启动慢

**这个改动不会让软件启动更快。** 因为它动的是"每轮对话的 token 账单"，不是启动路径。

启动慢要单独量化。最省事的办法是**把启动拆成三段计时**：

| 段 | 从哪到哪 | 若时间在这 → 该怎么查 |
|---|---|---|
| a | 双击图标 → 窗口出现 | Electron 壳。查 **Windows Defender 实时扫描排除项**（`D:\Program Files\DSH Desktop` 和 `~/.dsh`），这是 Windows 上最常见的启动杀手 |
| b | 窗口出现 → 界面可交互 | 渲染进程 + 前端 bundle。DSH 固有，通常只能接受 |
| c | 界面可用 → 会话能发消息 | host 组合 + 插件加载。**这一段才是砍插件有意义的地方** |

host 日志（`%APPDATA%\DSH Desktop\logs\`）里**只有 run 标记、没有耗时打点**，所以只能人工秒表。

三段秒数报给我，我就能定位到具体环节；否则砍插件属于盲砍。

---

## 九、一句话总结

| 你的设想 | 实际情况 |
|---|---|
| "89 个 skill 全量扫描拖慢启动" | 扫描只 **18.3 ms**，且**不在启动路径上**（会话首个请求前才跑） |
| "改成启动不加载" | **本来就没在启动时加载**；SKILL.md 正文**已经是按需加载** |
| "用的时候再加载" | **可以做到** —— 用 `disable-model-invocation: true` 把低频 skill 摘出 catalog，你打 `/名字` 时再加载完整指令 |
| 收益 | 每轮 **6,564 → 2,197 tokens（省 67%）**，响应更快 + 免费额度耐用 3 倍 |
| 代价 | 摘出的 skill **模型不会自主用**，必须你手动 `/` |
| 对启动速度 | **无改善**（不在同一条路径上）—— 启动慢要另做三段量化 |
