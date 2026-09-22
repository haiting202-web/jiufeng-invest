# dsh-finance-tools

DSH（DeepSeek Harness Desktop）金融投研数据工具插件。把一套 Web 版投研工具积累的
金融数据源迁移注册进 DSH「AI金融投研」预设，共 21 个模型可见工具。

**零第三方依赖、零 API Key** —— 数据源全部是公开 HTTP 接口，用 Node 原生 `fetch` 直连。
全网搜索沿用 DSH 内置 provider，本插件不接管。

## 能力

### 金融数据工具（21 个，模型可见）

| 分组 | 工具 | 数据源 |
|---|---|---|
| 行情 | `get_stock_quote` | 腾讯→雪球→东财→凤凰→新浪 五源轮换；美股走东财+腾讯 |
| 搜索 | `search_stock` | 东财 suggest（A股/港股/美股） |
| 财报 | `get_financial_report` | 东财 datacenter 三表 + 核心指标 |
| 业绩 | `get_earnings_alerts` | 东财 RPT_PUBLIC_OP_NEWPREDICT |
| 新闻 | `get_stock_news` / `get_market_headlines` | 东财个股新闻 + 头条 |
| 资金 | `get_stock_fund_flow` / `get_sector_fund_flow` / `get_northbound_flow` | 东财 push2 / datacenter |
| 技术 | `get_kline` | 腾讯前复权日K |
| 情绪 | `get_market_sentiment` / `get_dragon_tiger` / `get_limit_up_pool` / `get_hot_stock_rank` | 东财 |
| F10 | `get_company_profile` / `get_company_info` / `get_top_shareholders` / `get_analyst_estimates` / `get_company_announcements` | 东财 F10 |
| 研究 | `get_research_reports` / `get_industry_overview` | 东财 reportapi / push2 |

### 关于 `search_stock`（代码 / 名称搜索）

该工具调用东方财富的公开 `suggest` 接口，接口需要一个 `token` 参数。
这个 token 是**公开接口的固定参数**，不是账号凭据 —— 代码里已内嵌默认值，开箱可用。

如需换成自己的 token，设环境变量覆盖即可：

```sh
export EM_SEARCH_TOKEN=<你的 token>
```

### 全网搜索

本插件**不注册自己的搜索 provider**，直接使用 DSH 内置的搜索能力
（由 `@deepseek-ai/dsh-web-search-deepseek` 注册，id 为 `deepseek-official`，
底层是 `web_search_20250305`）。因此无需配置任何搜索相关的 API Key。

> 为什么不在 `cordis.patch.yml` 里写 `searchProvider`：DSH 的 provider 选择规则是
> 「未配置时，若存在多个可用 provider 则报 `WEB_PROVIDER_AMBIGUOUS`，只有一个可用
> provider 时自动采用」。本插件不注册 provider，保持默认即可唯一定位到内置那个。

## 安装（3 步）

1. 把本目录放到稳定位置（如 `~/dsh-plugins/dsh-finance-tools`）。
2. 编辑 `~/.dsh/profiles/desktop/package.json`：
   - `dependencies` 增加 `"dsh-finance-tools": "file:<上一步的绝对路径>"`
   - `dsh.profile.bundles` 数组末尾增加 `"dsh-finance-tools"`
3. 让 `~/.dsh/profiles/desktop/node_modules/` 下能解析到本包（有 pnpm 就 `pnpm install`，没有就手工建目录链接），然后重启 DSH Desktop。

## 自测

```bash
node test.mjs
```

## 修改插件源码后必须同步副本（重要）

pnpm 对 `file:` 依赖是**复制模式**（非符号链接），改 `lib/` 或
`cordis.patch.yml` 后，DSH 实际加载的仍是 `node_modules` 里的旧副本。同步命令：

```bash
SRC=~/dsh-plugins/dsh-finance-tools
DEST="$HOME/.dsh/profiles/desktop/node_modules/dsh-finance-tools"
cp -f "$SRC"/lib/*.js "$DEST/lib/"
cp -f "$SRC"/cordis.patch.yml "$DEST/"
```
然后重启 DSH Desktop 生效。
