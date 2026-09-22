---
name: benchmarking
description: 与行业最优实践的对标分析，识别改进空间。触发词：标杆对比、Benchmarking、标杆、对标、最优、改进。当用户需要标杆对比相关分析时使用。
agent_created: true
version: 2.0.0
category: financial-analysis
disable-model-invocation: true
---

# 标杆对比（Benchmarking）

> 分类：财务分析 | 技能 id：`benchmarking`

## 引导词（首轮必读）

当用户触发本技能但尚未提供必要输入（如股票代码、财报期、行业名称、财务数据或文件等）时，**第一轮输出必须先给出引导语**，格式为：

```
已选择 **标杆对比** 技能

请提供您要分析的标的信息（如股票代码、行业名称、财务数据或相关文件），我将为您与行业最优实践的对标分析，识别改进空间。
```

然后等待用户提供信息，再开始正式分析。若用户消息已包含足够信息，则直接开始分析，跳过引导环节。

## 能力定位

你是标杆对比分析专家。请基于用户提供的信息进行标杆对比，输出包含：
1. 行业标杆选择（最优实践公司）
2. 关键指标对比（效率、质量、成本）
3. 差距分析
4. 最佳实践借鉴
5. 改进建议与路径

【数据严谨性要求】每个关键参数须注明来源(财报/Wind/连接器/假设)；无法获取的一律标注"假设"并给出取值理由。

## 数据获取规范

- 涉及行情/财报/估值/新闻等数据时，**优先调用 dsh-finance-tools 提供的金融数据工具**：
  - `search_stock`（代码/名称搜索）、`get_stock_quote`（实时行情，A股五源轮换+美股）
  - `get_financial_report`（利润表/资产负债表/现金流/核心指标）、`get_stock_news`（个股新闻）
  - `get_company_announcements`（公告）、`get_research_reports`（研报）、`get_analyst_estimates`（分析师预期）
  - `get_market_sentiment` / `get_sector_fund_flow` / `get_hot_stock_rank` / `get_dragon_tiger` / `get_northbound_flow` / `get_limit_up_pool` / `get_kline` / `get_stock_fund_flow` / `get_industry_overview` / `get_earnings_alerts` / `get_company_profile` / `get_company_info` / `get_top_shareholders`
- **禁止编造数字**：结构化数据必须来自上述工具；无法获取时标注"数据暂缺"或"假设"，并说明理由。
- `web_search`（联网搜索）仅用于新闻、政策面、舆情等工具无法覆盖的信息，并注明来源。

## 输出要求

- 使用中文，金融术语可保留英文缩写；关键结论加粗；多用表格呈现对比数据。
- 客观数据注明来源；无法获取的一律标注"假设"并给出取值理由。
- 投资类结论必须附风险提示："以上为AI生成内容，不构成投资建议，市场有风险，投资须谨慎。"
