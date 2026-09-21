# dsh-ai-invest-sidebar

投研风格侧边栏插件 —— 把 DSH Desktop（DeepSeek Harness）左侧栏替换为投研工作流导航。

面向中国金融从业者：财务监控诊断、股票多空博弈、投行业务、项目筛选尽调、资产配置规划、基金对账核查、游资多专家研判。

## 功能

- **品牌区替换**：侧边栏顶部 Logo 与产品名替换为内联品牌标（图标为 base64 内联，不依赖外部文件）
- **投研工作流导航**：7 大投研工作流，点击直接新建会话
- **专业工具**：101 个专业技能，按 7 个分类导航
- **历史对话**：实时订阅 DSH 会话列表，点击打开历史会话
- **主题适配**：浅色 / 深色主题自动跟随 DSH

## 7 大工作流

| 工作流 | 说明 |
|---|---|
| 财务监控诊断 | 财报拆解、指标异动、盈利质量 |
| 股票多空博弈 | 多空双角色辩论 + 加权汇总 |
| 投行业务 | 并购、增发、IPO 全链路 |
| 项目筛选尽调 | 一级市场标的筛选与尽调 |
| 资产配置规划 | 组合构建与再平衡 |
| 基金对账核查 | 净值、持仓、费用核对 |
| 游资多专家研判 | 6 游资人格 + 2 择时 |

## 技能分类（101 个）

| 分类 | 数量 |
|---|---|
| 股票研究 equity-research | 33 |
| 财务分析 financial-analysis | 24 |
| 投资银行 investment-banking | 10 |
| 私募股权 private-equity | 10 |
| 财富管理 wealth-management | 9 |
| 基金运营 fund-admin | 9 |
| 运营操作 operations | 6 |

## 安装

DSH Desktop **不带** `dsh` 命令和 pnpm，所以走 profile 手改三步：

1. 把本目录放到一个稳定位置，例如 `~/dsh-plugins/dsh-ai-invest-sidebar`。
2. 编辑 `~/.dsh/profiles/desktop/package.json`：
   - `dependencies` 增加一项 `"dsh-ai-invest-sidebar": "file:<上一步的绝对路径>"`
   - `dsh.profile.bundles` 数组末尾增加 `"dsh-ai-invest-sidebar"`
3. 让 `~/.dsh/profiles/desktop/node_modules/` 下能解析到本包：
   - 有 pnpm → 在 `~/.dsh/profiles/desktop` 执行 `pnpm install`
   - 没 pnpm → 手工建一个目录链接指向本目录（Windows 用 `mklink /J`，macOS/Linux 用 `ln -s`）

完成后**重启 DSH Desktop** 生效。

> 改了 `client/client.js` 之后要跑 `node gen-client.mjs` 重新生成，同样需要重启 DSH 才看得到。

## 卸载

1. 从 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 和 `dsh.profile.bundles` 里删掉本包。
2. 删掉 `node_modules` 下对应的目录或链接。
3. 重启 DSH Desktop。

## 实现原理

DSH 是"一切皆插件"架构，侧边栏是 `ui-sidebar` 插件渲染的三栏 AppFrame 中的一栏。本插件通过客户端 slot 注入替换侧边栏内容：

| Slot | 注入内容 |
|---|---|
| `sidebar.brand.mark` | 品牌图标（内联 base64） |
| `sidebar.brand.name` | 产品名 |
| `sidebar.workspaces` | 投研工作流 + 专业工具 + 历史对话（`priority: -10` shadow 官方） |

- 客户端入口：`client/client.js`（`window.__ModuleLoader__.load` 格式）
- 服务端入口：`lib/index.js`（空实现，UI 全在客户端）
- 注册声明：`cordis.patch.yml`

## 开发

```sh
node gen-client.mjs          # 由 skills-data.json 等生成 client/client.js
node verify-cards.mjs        # 校验卡片定义
node verify-placeholders.mjs # 校验占位符
```

`gen-client.mjs` 等脚本全部使用**脚本自身目录**作为基准路径，从任意工作目录执行都可以。

若要从上游项目同步技能定义（可选）：

```sh
UPSTREAM_SKILLS_TS=/path/to/upstream/src/skills/index.ts node sync-from-web.mjs
```

## 目录结构

```
dsh-ai-invest-sidebar/
├── package.json              # 插件元数据 + dsh.bundle.patch + dsh.client.inject 依赖声明
├── cordis.patch.yml          # bundle patch：把本插件插入 profile 层栈
├── lib/index.js              # 服务端入口
├── client/client.js          # 客户端 UI 注入（由 gen-client.mjs 生成）
├── skills-data.json          # 101 个技能定义
├── skill-placeholders.json   # 占位符文案
├── gen-client.mjs            # 生成器
└── verify-*.mjs              # 自检脚本
```

## 已知限制

技能卡里的**股票搜索框**调用东方财富公开 `suggest` 接口，需要一个 `token` 参数。
开源版不内置该 token，未设置 `EM_SEARCH_TOKEN` 环境变量时，搜索框降级为**手工输入代码**，
不影响其余功能。

```sh
export EM_SEARCH_TOKEN=<你的 token>
```

## 许可

MIT
