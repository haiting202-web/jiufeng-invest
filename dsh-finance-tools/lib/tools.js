/**
 * dsh-finance-tools — 模型可见工具定义（defineTool）
 *
 * 覆盖 ai-butler 全部金融数据源，按「一个工具一类数据」分组：
 *   行情/搜索/财报/业绩预告/新闻/资金流/K线/市场情绪/板块/龙虎榜/北向/涨停池/
 *   热榜/F10概况/公司详情/股东/分析师预期/公告/研报/行业概览
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import * as ds from './datasource.js'

const MAX_RENDER = 9000

/**
 * DSH 工具输出要求 lossless JSON：递归把 undefined/NaN/Infinity 归一为 null，
 * 拒绝函数/符号等不可序列化值，避免 "value is not lossless JSON" 报错。
 */
function sanitizeJson(value) {
  if (value === undefined || value === null) return null
  const t = typeof value
  if (t === 'number') return Number.isFinite(value) ? value : null
  if (t === 'string' || t === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitizeJson)
  if (t === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeJson(v)
    return out
  }
  return null
}

function textRenderer(value) {
  let text = JSON.stringify(value, null, 2)
  if (text.length > MAX_RENDER) text = text.slice(0, MAX_RENDER) + '\n...(结果已截断)'
  return [{ type: 'text', text }]
}

function makeTool({ name, description, params = {}, run, timeoutMs = 20000 }) {
  return defineTool({
    name,
    description,
    parameters: params,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => textRenderer(value),
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const value = await run(args, exec)
      return sanitizeJson(value)
    },
  })
}

const codeParam = (extra = '') => ({
  code: { type: 'string', required: true, description: `A股代码（如 600519 / 300418）或美股 ticker（如 NVDA）${extra}` },
})

export function financeTools() {
  return [
    makeTool({
      name: 'get_stock_quote',
      description: '获取实时行情：A股五源轮换（腾讯/雪球/东财/凤凰/新浪），美股走东财+腾讯。返回价格、涨跌幅、成交额、来源。',
      params: codeParam(),
      run: async (args) => {
        const q = await ds.getQuoteSmart(args.code)
        return q ?? { error: `行情获取失败: ${args.code}（五源均不可用）` }
      },
    }),

    makeTool({
      name: 'search_stock',
      description: '按名称/关键词搜索股票代码，A股与美股均可。返回代码、名称、市场。',
      params: { keyword: { type: 'string', required: true, description: '股票名称或关键词，如 昆仑万维 / 贵州茅台 / NVDA' } },
      run: async (args) => {
        const r = await ds.searchStockSmart(args.keyword)
        return r ?? { error: `未找到匹配 "${args.keyword}" 的股票` }
      },
    }),

    makeTool({
      name: 'get_financial_report',
      description: '获取财务报表（东方财富）：利润表/资产负债表/现金流量表/核心指标(ROE/毛利率/EPS/增速)。reportType 选 income|balance|cashflow|indicators，默认 all。',
      params: {
        ...codeParam('，仅支持A股'),
        reportType: { type: 'string', description: 'income=利润表, balance=资产负债表, cashflow=现金流量表, indicators=核心指标, 省略=全部' },
      },
      run: async (args) => {
        const t = args.reportType || 'all'
        if (t === 'income') return { income: await ds.getIncomeStatement(args.code) }
        if (t === 'balance') return { balance: await ds.getBalanceSheet(args.code) }
        if (t === 'cashflow') return { cashflow: await ds.getCashFlow(args.code) }
        if (t === 'indicators') return { indicators: await ds.getFinancialIndicators(args.code) }
        return ds.getFullFinancials(args.code)
      },
      timeoutMs: 30000,
    }),

    makeTool({
      name: 'get_earnings_alerts',
      description: '获取近期业绩预告（预增/预减/预亏/扭亏等），按变动幅度排序，含公告日期与原因摘要。',
      params: { daysBack: { type: 'number', description: '回溯天数，默认7天' } },
      run: async (args) => {
        const list = await ds.getRecentEarningsAlerts(args.daysBack || 7)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_stock_news',
      description: '获取个股新闻（东财个股新闻+市场头条聚合去重）。',
      params: { ...codeParam(), count: { type: 'number', description: '条数，默认10' } },
      run: async (args) => {
        const list = await ds.getAggregatedNews(args.code, args.count || 10)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_market_headlines',
      description: '获取东财市场头条（当日重要财经新闻）。',
      params: { count: { type: 'number', description: '条数，默认10' } },
      run: async (args) => {
        const list = await ds.getMarketHeadlines()
        return { count: Math.min(list.length, args.count || 10), items: list.slice(0, args.count || 10) }
      },
    }),

    makeTool({
      name: 'get_stock_fund_flow',
      description: '获取个股近20日资金流向（主力/超大单/大单/中单/小单净流入）。',
      params: codeParam(),
      run: async (args) => {
        const list = await ds.getStockFundFlow(args.code)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_kline',
      description: '获取日K线（腾讯前复权，60天默认），返回日期/开/收/高/低/量。',
      params: { ...codeParam(), days: { type: 'number', description: 'K线天数，默认60' } },
      run: async (args) => {
        const list = await ds.getDailyKline(args.code, args.days || 60)
        return { count: list.length, items: list }
      },
      timeoutMs: 15000,
    }),

    makeTool({
      name: 'get_market_sentiment',
      description: '获取市场情绪：三大指数(上证/深成/创业板) + 涨跌家数 + 成交额(亿)。',
      params: {},
      run: async () => (await ds.getMarketSentiment()) ?? { error: '市场情绪获取失败' },
    }),

    makeTool({
      name: 'get_sector_fund_flow',
      description: '获取板块资金流排名（东财行业板块，按净流入排序）。',
      params: { topN: { type: 'number', description: '返回板块数，默认10' } },
      run: async (args) => {
        const list = await ds.getSectorFundFlow(args.topN || 10)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_dragon_tiger',
      description: '获取近几日龙虎榜明细（上榜股票、涨跌幅、净买入、上榜原因）。',
      params: { days: { type: 'number', description: '回溯天数，默认3' } },
      run: async (args) => {
        const list = await ds.getDragonTiger(args.days || 3)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_northbound_flow',
      description: '获取北向资金流向（今日净买入、连续净买入天数、近5日明细）。',
      params: {},
      run: async () => (await ds.getNorthboundFlow()) ?? { error: '北向资金获取失败' },
    }),

    makeTool({
      name: 'get_limit_up_pool',
      description: '获取涨停池（含连板天数、行业、涨停原因），无数据时回溯近3个交易日。',
      params: {},
      run: async () => {
        const list = await ds.getLimitUpPool()
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_hot_stock_rank',
      description: '获取人气热榜（东方财富股吧人气排名，含代码与名称）。',
      params: { num: { type: 'number', description: '返回数量，默认10' } },
      run: async (args) => {
        const list = await ds.getHotStockRank(args.num || 10)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_company_profile',
      description: '获取公司概况（东财F10）：名称/代码/行业/主营业务/注册资本/员工数。',
      params: codeParam('，仅支持A股'),
      run: async (args) => (await ds.getCompanyProfile(args.code)) ?? { error: `公司概况获取失败: ${args.code}` },
    }),

    makeTool({
      name: 'get_company_info',
      description: '获取公司详细信息（东财F10网页端）：法人/董事长/董秘/注册号/网址/经营范围/简介。',
      params: codeParam('，仅支持A股'),
      run: async (args) => (await ds.getCompanyInfo(args.code)) ?? { error: `公司详情获取失败: ${args.code}` },
      timeoutMs: 15000,
    }),

    makeTool({
      name: 'get_top_shareholders',
      description: '获取十大股东/十大流通股东/机构持仓（东财F10）。',
      params: codeParam('，仅支持A股'),
      run: async (args) => {
        const r = await ds.getTopShareholders(args.code)
        return r && Object.keys(r).length ? r : { error: `股东数据获取失败: ${args.code}` }
      },
    }),

    makeTool({
      name: 'get_analyst_estimates',
      description: '获取分析师一致预期（目标价/评级/EPS与营收预测）。',
      params: codeParam('，仅支持A股'),
      run: async (args) => {
        const list = await ds.getAnalystEstimates(args.code)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_company_announcements',
      description: '获取公司公告列表（类型/标题/日期/原文链接）。',
      params: { ...codeParam('，仅支持A股'), count: { type: 'number', description: '条数，默认5' } },
      run: async (args) => {
        const list = await ds.getCompanyAnnouncements(args.code, args.count || 5)
        return { count: list.length, items: list }
      },
    }),

    makeTool({
      name: 'get_research_reports',
      description: '获取券商研报（标题/券商/分析师/评级/摘要/行业）。',
      params: { ...codeParam('，仅支持A股'), count: { type: 'number', description: '条数，默认10' } },
      run: async (args) => {
        const r = await ds.getResearchReports(args.code, args.count || 10)
        return { total: r.total, count: r.reports.length, items: r.reports }
      },
      timeoutMs: 15000,
    }),

    makeTool({
      name: 'get_industry_overview',
      description: '获取行业板块概览：股票数、平均涨跌幅、领涨领跌股。',
      params: {},
      run: async () => (await ds.getIndustryOverview()) ?? { error: '行业概览获取失败' },
    }),
  ]
}
