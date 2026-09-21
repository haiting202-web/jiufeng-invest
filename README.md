# 玖峰投研工作台 · DSH 插件集

面向中国金融从业者的 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)（DeepSeek Harness）插件集：把 AI 助手改造成投研工作台。

| 目录 | 是什么 | 能装吗 |
|---|---|---|
| [`dsh-ai-invest-sidebar/`](./dsh-ai-invest-sidebar) | 投研风格侧边栏：7 大工作流 + 101 个专业技能 | ✅ DSH 插件 |
| [`dsh-finance-tools/`](./dsh-finance-tools) | 21 个金融数据工具（行情 / 财报 / 资金面，零 API Key） | ✅ DSH 插件 |
| [`dsh-update-guard/`](./dsh-update-guard) | 品牌化与升级守卫工具集（脚本，非插件） | ⚠️ 见该目录 README |

## 装什么

先用 DSH Desktop 打开插件市场，搜「投研」，一键安装（市场会自动处理依赖）。装完**重启 DSH Desktop** 生效。

手工安装（无市场时）见各子目录 README。

## 这套东西解决什么

**二级市场**：财务监控诊断、股票多空博弈、游资多专家研判、资产配置规划、基金对账核查
**一级市场**：投行业务全链路、项目筛选尽调

数据源覆盖东方财富 / 腾讯 / 雪球 / 新浪 / 凤凰，全部为公开 HTTP 接口，零第三方依赖、零 API Key。全网搜索沿用 DSH 内置的 `web_search`（DeepSeek），插件不接管。

## 环境要求

- DSH Desktop 稳定版 **2.0.10 ~ 2.0.13**（这一段的 Harness 恒为 `0.1.5-rc.2`，插件在版本间通用）
- **Beta 通道不兼容**：Beta 换成了 Harness `0.1.6-alpha.x` 且使用独立数据目录 `~/.dsh-beta`，请勿在 Beta 上安装

## 免责声明

所有技能输出均为**研究辅助**，不构成投资建议。数据来自公开第三方接口，可能存在延迟或错漏，请自行核实后决策。

## 许可

MIT
