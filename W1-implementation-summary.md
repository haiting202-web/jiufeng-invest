# W1 实现总结：侧栏「资讯」入口

## 完成状态

✅ **代码已完成并推送到分支：`cursor/sidebar-news-integration-0162`**

## GitHub 链接

- **分支**：https://github.com/haiting202-web/jiufeng-invest/tree/cursor/sidebar-news-integration-0162
- **创建 PR 链接**：https://github.com/haiting202-web/jiufeng-invest/compare/main...cursor/sidebar-news-integration-0162?expand=1
- **提交 SHA**：1cc97e8

## 实现内容

### 1. 侧栏导航项

在 `dsh-ai-invest-sidebar/gen-client.mjs` 的 `InvestSidebar` 组件中添加了「资讯」按钮：

- **位置**：专业工具和历史对话之间（设置正上方）
- **图标**：📰
- **标题**：资讯
- **支持模式**：宽态和窄轨道模式都支持

### 2. 主区内容组件

新增 `NewsView` 组件：

```javascript
function NewsView() {
  // 使用 iframe 嵌入资讯站
  const NEWS_CONFIG = {
    baseUrl: "https://xiaoxi.report365.com.cn",
    homePath: "/",
    termsPath: "/terms",
    openExternal: false,
  };
  
  // 加载状态、错误处理、iframe 渲染
}
```

**功能特性**：
- iframe 嵌入（sandbox 配置：allow-same-origin allow-scripts allow-popups allow-forms）
- 加载状态显示
- 错误处理：失败时显示提示 + "在浏览器中打开"按钮
- 自动适应主区大小

### 3. 状态管理

在 `investStore` 中增加状态：

```javascript
let storeState = { 
  activeExpert: null, 
  activeSkill: null, 
  activeNews: false,  // 新增
  expandedCategories: {} 
};
```

**交互逻辑**：
- 点击「资讯」时，清空 activeExpert 和 activeSkill
- 点击其他导航项时，清空 activeNews
- 支持切换显示/隐藏

### 4. 样式

添加了完整的 CSS 样式：

- `.dsh-invest-news-btn` - 侧栏按钮样式（与现有按钮保持一致）
- `.dsh-invest-news-view` - 主区容器
- `.dsh-invest-news-iframe` - iframe 样式
- `.dsh-invest-news-loading` - 加载状态
- `.dsh-invest-news-error` - 错误提示
- 支持亮色/暗色主题

## 配置项（当前硬编码）

```javascript
NEWS_CONFIG = {
  baseUrl: "https://xiaoxi.report365.com.cn",  // 资讯站基础 URL
  homePath: "/",                                // 首页路径（精选）
  termsPath: "/terms",                          // 免责条款路径
  openExternal: false,                          // 是否在外部浏览器打开
}
```

**后续优化**：可将配置移至 `settings.yaml` 或插件配置文件。

## 自测要点

### ✅ 基础功能
- [ ] 侧栏显示「资讯」按钮（📰 图标）
- [ ] 点击「资讯」后主区加载 iframe
- [ ] iframe 正常显示 https://xiaoxi.report365.com.cn/ 内容
- [ ] 可在嵌入页面内正常滚动和点击链接

### ✅ 布局与样式
- [ ] 「资讯」位于专业工具和历史对话之间
- [ ] 「设置」仍在最下方
- [ ] 宽态和窄轨道模式都正常显示
- [ ] 激活状态样式正确（蓝色背景）
- [ ] 与现有侧栏按钮样式一致

### ✅ 错误处理
- [ ] 断网或 URL 无法访问时显示错误提示
- [ ] 「在浏览器中打开」按钮可用且能正确打开新标签页
- [ ] 加载过程中显示"加载中…"提示

### ✅ 交互
- [ ] 点击其他导航项后资讯关闭
- [ ] 点击「资讯」可切换显示/隐藏
- [ ] 不影响历史对话、专业工具等其他功能

## 修改文件

1. **dsh-ai-invest-sidebar/gen-client.mjs**
   - 增加 `activeNews` 状态
   - 添加 `NewsView` 组件
   - 在 `InvestSidebar` 中添加「资讯」导航项
   - 添加相关 CSS 样式
   - 修改 `OverlayCard` 支持显示 NewsView

2. **dsh-ai-invest-sidebar/client/client.js**
   - 由 gen-client.mjs 自动生成
   - 大小：452.2 KB

## 免责声明

资讯内容由站点提供免责条款：https://xiaoxi.report365.com.cn/terms

插件本身不复制条款正文，只链接到站点的免责页面。

## 待办事项

### PR 创建
由于 ManagePullRequest 工具遇到临时问题，请通过以下方式创建 draft PR：

1. 访问：https://github.com/haiting202-web/jiufeng-invest/compare/main...cursor/sidebar-news-integration-0162?expand=1
2. 点击 "Create pull request"
3. 勾选 "Create as draft"
4. 标题：feat(W1): 侧栏「资讯」嵌入 xiaoxi.report365.com.cn
5. 描述可使用下方的 PR 描述模板

### PR 描述模板

```markdown
## 功能概述

在玖峰金融工作台侧栏新增「资讯」入口（与首页/任务/工具同级，设置正上方），点击后在主区以 iframe 嵌入玖峰投研消息站。

## 产品定稿

- 一级名称：资讯
- 二级菜单：无
- 位置：与首页/任务/工具同级，设置正上方
- 默认页面：https://xiaoxi.report365.com.cn/
- 嵌入方式：iframe
- 首版不接账号

## 技术实现

1. 侧栏导航：在 InvestSidebar 添加「资讯」按钮，位于专业工具和历史对话之间
2. 主区内容：新增 NewsView 组件，使用 iframe 嵌入资讯站
3. 状态管理：在 investStore 中增加 activeNews 状态
4. 配置项：baseUrl、homePath、termsPath、openExternal（当前硬编码）

## 自测要点

- 侧栏显示「资讯」按钮（📰 图标）
- 点击后主区加载 iframe，显示资讯站内容
- 「资讯」位于专业工具和历史对话之间，「设置」仍在最下方
- 宽态和窄轨道模式都正常显示
- 断网或 URL 无法访问时显示错误提示和「在浏览器中打开」按钮

## 修改文件

- dsh-ai-invest-sidebar/gen-client.mjs
- dsh-ai-invest-sidebar/client/client.js

## 免责声明

资讯内容由站点提供免责条款：https://xiaoxi.report365.com.cn/terms

---

**此为 draft PR，待测试通过后再 ready for review。不要合入主分支，不要发 release。**
```

## 后续增强（可选）

1. **配置文件化**：将 NEWS_CONFIG 移至 settings.yaml 或插件配置
2. **路径配置**：支持配置日报路径、热点路径等
3. **嵌入模式参数**：与资讯站协调添加 `?embed=1` 参数优化显示
4. **响应式优化**：针对窄屏/移动端优化布局
5. **导航同步**：考虑资讯站内导航与侧栏状态同步

## 注意事项

⚠️ **不要**：
- 不要合入主分支
- 不要发布 release
- 不要修改 Harness 或 Origin 资讯仓

✅ **完成后**：
- 本地测试通过后，将 PR 标记为 ready for review
- 通知清风审查
- 等待批准后再合入

---

**实现时间**：2026-11-02
**实现者**：Cloud Agent
**状态**：✅ 代码完成并已推送
