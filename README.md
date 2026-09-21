# 玖峰投研工作台

面向中国金融从业者的 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)（DeepSeek Harness）插件集：把 AI 助手改造成投研工作台。

装完之后，DSH 的左侧栏变成投研工作流导航，对话里多出 21 个金融数据工具。

---

## 安装

### 第一次用 —— 一次装好（推荐）

1. 打开 **[最新版本发布页](https://github.com/haiting202-web/jiufeng-invest/releases/latest)**
2. 下载 **`jiufeng-invest-all-in-one.zip`**（约 150 MB，里面已经带了 DSH Desktop 官方安装程序）
3. 把整个压缩包**解压**出来（要在解压后的文件夹里操作，不要直接双击压缩包里的文件）
4. 双击 **`install.bat`**，跟着提示走

装完打开 DSH Desktop 就能用了。

### 已经装过 DSH Desktop

下载 **`jiufeng-invest-plugin-only.zip`**（约 0.5 MB），解压后双击 `install.bat`。

### 用插件市场装

在 DSH Desktop 里打开插件市场，搜「投研」。

> 市场收录审核中，上架后本节会更新。上架前请用上面两种方式。

---

## 装完会看到什么

左侧栏会变成：

- **投研工作流** —— 7 个分析师工作流
- **专业工具** —— 101 个专业技能，分成 7 类
- **历史对话**

21 个金融数据工具在对话里直接可用，不需要配置任何 API Key。

---

## 包含什么

| 目录 | 是什么 |
|---|---|
| [`dsh-ai-invest-sidebar/`](./dsh-ai-invest-sidebar) | 投研风格侧边栏：7 大工作流 + 101 个专业技能 |
| [`dsh-finance-tools/`](./dsh-finance-tools) | 21 个金融数据工具（行情 / 财报 / 资金面，零 API Key） |
| [`dsh-update-guard/`](./dsh-update-guard) | 品牌化与升级守卫工具集（脚本，不是插件，不进市场） |

## 这套东西解决什么

**二级市场**：财务监控诊断、股票多空博弈、游资多专家研判、资产配置规划、基金对账核查
**一级市场**：投行业务全链路、项目筛选尽调

数据源覆盖东方财富 / 腾讯 / 雪球 / 新浪 / 凤凰，全部为公开 HTTP 接口，零第三方依赖、零 API Key。全网搜索沿用 DSH 内置的 `web_search`（DeepSeek），插件不接管。

## 环境要求

- DSH Desktop 稳定版 **2.0.10 ~ 2.0.13**（这一段的 Harness 恒为 `0.1.5-rc.2`，插件在版本间通用）
- **Beta 通道不兼容**：Beta 换成了 Harness `0.1.6-alpha.x` 且使用独立数据目录 `~/.dsh-beta`，请勿在 Beta 上安装
- 一键安装脚本需要 Windows + PowerShell 5.1（Win10 / Win11 自带）

## 安装脚本做了什么

`install.bat` 调用 `install.ps1`，一共四步：

1. 检测 DSH Desktop 是否已安装，没有就调用包内的官方安装程序
2. 确认 DSH 已经初始化过（全新安装的 DSH 要先跑一次才会生成配置目录）
3. 把两个插件复制到 `%USERPROFILE%\.dsh\jiufeng-plugins\`
4. 改写 profile 的 `package.json`，并在 `node_modules` 下挂上目录链接

每次改写前都会自动备份 `package.json`（文件名带时间戳），想卸载时恢复这个备份即可。

## 免责声明

所有技能输出均为**研究辅助**，不构成投资建议。数据来自公开第三方接口，可能存在延迟或错漏，请自行核实后决策。

## 许可

MIT

`jiufeng-invest-all-in-one.zip` 内含 DSH Desktop 官方安装程序，版权归 anywhere-labs 所有，以 MIT 许可发布，未做任何修改。
