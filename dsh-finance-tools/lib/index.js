/**
 * dsh-finance-tools — DeepSeek Harness 插件入口
 *
 * 注册两样东西：
 *   1. ctx.tools 全部金融数据工具（21 个，覆盖从上游 Web 版项目迁移的数据源）
 *   2. systemPrompt 引导段（告诉模型：财报走工具，web_search 只作新闻补充）
 *
 * 全网搜索不接管：直接使用 DSH 内置的 web 搜索 provider（`deepseek-official`）。
 * 数据源全部是公开 HTTP 接口，零第三方依赖，无需任何 API Key。
 */

import { financeTools } from './tools.js'

const name = 'dsh-finance-tools'
const inject = ['tools', 'systemPrompt']

function apply(ctx, config = {}) {
  // 1) 金融数据工具
  for (const tool of financeTools()) {
    ctx.tools.register(tool)
  }

  // 2) 系统提示引导
  if (ctx.systemPrompt?.section) {
    ctx.systemPrompt.section({
      name: 'tool:finance-data',
      order: 120,
      text:
        'A股/美股投研数据工具：实时行情用 get_stock_quote；财报(利润/负债/现金流/指标)用 get_financial_report；' +
        '个股新闻用 get_stock_news；代码/名称搜索用 search_stock；资金流 get_stock_fund_flow；K线 get_kline；' +
        '市场情绪 get_market_sentiment；研报 get_research_reports；公告 get_company_announcements。' +
        '财报、行情、估值等结构化数据必须通过上述工具获取，禁止编造数字；' +
        '仅当需要最新新闻、政策面、舆情等工具无法覆盖的信息时，才调用 web_search，并注明来源。' +
        '数据不可得时明确标注"数据暂缺"。',
    })
  }
}

export { apply, inject, name }
