# 玖峰投研工作台

面向中国金融从业者的 [DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)（DeepSeek Harness）插件集：把 AI 助手改造成投研工作台。

装完之后，DSH 的左侧栏变成投研工作流导航，对话里多出 21 个金融数据工具，Agent 换成带 89 个投研技能的「AI金融投研」预设。

---

## 安装

### 第一次用 —— 一次装好（推荐）

1. 打开 **[最新版本发布页](https://github.com/haiting202-web/jiufeng-invest/releases/latest)**
2. 下载 **`jiufeng-invest-all-in-one.zip`**（约 150 MB，里面已经带了 DSH Desktop 官方安装程序）
3. 把整个压缩包**解压**出来（要在解压后的文件夹里操作，不要直接双击压缩包里的文件）
4. 双击 **`install.bat`**，跟着提示走

中途可能弹出一次「用户账户控制」，点「是」放行即可 —— 最后一步要往 DSH 的安装目录写图标和品牌文案，脚本会自己申请提权，你不用手动右键「以管理员身份运行」。

### 已经装过 DSH Desktop

下载 **`jiufeng-invest-plugin-only.zip`**（约 1.2 MB），解压后双击 `install.bat`。

### 用插件市场装

在 DSH Desktop 里打开插件市场，搜「投研」。

> 市场收录审核中，上架后本节会更新。上架前请用上面两种方式。

---

## ⚠️ 装完还需要你做一件事：配置模型

四层内容都会装好，但**模型要你自己出**。

作者本机用的是自己的 API Key，额度是个人的，没法分发。请打开 DSH Desktop 的设置，填上你自己的 Key（DeepSeek / 通义 / 智谱 等）。

不配也能打开界面、能看到全部卡片，但一发起对话就会报错。

---

## 装完会看到什么

左侧栏会变成：

- **投研工作流** —— 7 个分析师工作流
- **专业工具** —— 101 个专业技能，分成 7 类
- **历史对话**

跟 Agent 对话时用的是「AI金融投研」预设 —— 89 个投研技能随时可调用，包括多空辩论、技术面诊断（MA / MACD / RSI / 布林带）、DCF 估值等。

21 个金融数据工具在对话里直接可用，不需要配置任何 API Key。股票代码搜索也开箱可用（走公开搜索接口，不需要账号）。

---

## 包含什么

| 目录 | 是什么 |
|---|---|
| [`dsh-ai-invest-sidebar/`](./dsh-ai-invest-sidebar) | 投研风格侧边栏：7 大工作流 + 101 个专业技能 |
| [`dsh-finance-tools/`](./dsh-finance-tools) | 21 个金融数据工具（行情 / 财报 / 资金面，零 API Key） |
| [`agent-preset/`](./agent-preset) | 投研 Agent 预设 `ai-finance`：89 个投研技能 + 人设 |
| [`dsh-update-guard/`](./dsh-update-guard) | 品牌化与升级守卫工具集（脚本，不是插件，不进市场） |

## 这套东西解决什么

**二级市场**：财务监控诊断、股票多空博弈、游资多专家研判、资产配置规划、基金对账核查
**一级市场**：投行业务全链路、项目筛选尽调

数据源覆盖东方财富 / 腾讯 / 雪球 / 新浪 / 凤凰，全部为公开 HTTP 接口，零第三方依赖、零 API Key。全网搜索沿用 DSH 内置的 `web_search`，插件不接管。

## 环境要求

- DSH Desktop 稳定版 **2.0.10 ~ 2.0.13**（这一段的 Harness 恒为 `0.1.5-rc.2`，插件在版本间通用）
- **Beta 通道不兼容**：Beta 换成了 Harness `0.1.6-alpha.x` 且使用独立数据目录 `~/.dsh-beta`，请勿在 Beta 上安装
- 一键安装脚本需要 Windows + PowerShell 5.1（Win10 / Win11 自带）

## 安装脚本做了什么

`install.bat` 调用 `install.ps1`，一共装**四层**：

| 层 | 落点 | 内容 |
|---|---|---|
| 1 · 插件 | `~\.dsh\jiufeng-plugins\` + profile 的 `package.json` | 两个插件本体、依赖声明、`node_modules` junction |
| 2 · 预设 | `~\.dsh\.agent-presets\ai-finance\` | 投研 Agent 预设（89 个技能） |
| 3 · 配置 | `~\.dsh\settings.yaml`、`~\.dsh\icons\` | 默认 Agent 设为 `ai-finance`、铺品牌图标 |
| 4 · 外观 | DSH 安装目录 | 图标、品牌文案、受控更新守卫、prompt 收窄（需提权） |

改配置前都会自动备份（文件名带 `.bak-jiufeng-时间戳`）。

**重复运行是安全的**：已经正确的配置不会重复改，也不会重复备份。升级插件版本时，直接再双击一次 `install.bat` 即可。

想单独做第 4 层（或者 DSH 升级后补做），以管理员身份运行包内的 `app-patch.ps1`。

## 免责声明

所有技能输出均为**研究辅助**，不构成投资建议。数据来自公开第三方接口，可能存在延迟或错漏，请自行核实后决策。

## 许可

MIT

`jiufeng-invest-all-in-one.zip` 内含 DSH Desktop 官方安装程序，版权归 anywhere-labs 所有，以 MIT 许可发布，未做任何修改。
