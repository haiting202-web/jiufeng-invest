/**
 * dsh-finance-tools 自测：真实调用全部数据源，验证可通性与返回结构。
 * 用法：node test.mjs [code]
 */
import * as ds from './lib/datasource.js'

const CODE = process.argv[2] || '300418' // 昆仑万维
let pass = 0
let fail = 0

async function check(name, fn) {
  const t0 = Date.now()
  try {
    const r = await fn()
    const ms = Date.now() - t0
    const ok = r !== null && r !== undefined && !(Array.isArray(r) && r.length === 0)
    if (ok) {
      pass++
      const sample = JSON.stringify(r).slice(0, 160)
      console.log(`✅ ${name} (${ms}ms) ${sample}`)
    } else {
      fail++
      console.log(`❌ ${name} (${ms}ms) 空结果`)
    }
  } catch (e) {
    fail++
    console.log(`❌ ${name} 异常: ${e.message}`)
  }
}

console.log(`=== dsh-finance-tools 自测 (code=${CODE}) ===\n`)

await check('getQuote 五源轮换', () => ds.getQuote(CODE))
await check('getUSQuote 美股(NVDA)', () => ds.getUSQuote('NVDA'))
await check('getIncomeStatement 利润表', () => ds.getIncomeStatement(CODE))
await check('getBalanceSheet 资产负债表', () => ds.getBalanceSheet(CODE))
await check('getCashFlow 现金流量表', () => ds.getCashFlow(CODE))
await check('getFinancialIndicators 指标', () => ds.getFinancialIndicators(CODE))
await check('getRecentEarningsAlerts 业绩预告', () => ds.getRecentEarningsAlerts(7))
await check('getStockFundFlow 资金流', () => ds.getStockFundFlow(CODE))
await check('getDailyKline K线', () => ds.getDailyKline(CODE, 30))
await check('getMarketSentiment 情绪', () => ds.getMarketSentiment())
await check('getNorthboundFlow 北向', () => ds.getNorthboundFlow())
await check('getDragonTiger 龙虎榜', () => ds.getDragonTiger(3))
await check('getSectorFundFlow 板块资金', () => ds.getSectorFundFlow(5))
await check('getLimitUpPool 涨停池', () => ds.getLimitUpPool())
await check('getCompanyProfile 概况', () => ds.getCompanyProfile(CODE))
await check('getCompanyInfo 详情', () => ds.getCompanyInfo(CODE))
await check('getTopShareholders 股东', () => ds.getTopShareholders(CODE))
await check('getAnalystEstimates 分析师预期', () => ds.getAnalystEstimates(CODE))
await check('getCompanyAnnouncements 公告', () => ds.getCompanyAnnouncements(CODE, 3))
await check('getStockNewsFromEM 个股新闻', () => ds.getStockNewsFromEM(CODE))
await check('getMarketHeadlines 头条', () => ds.getMarketHeadlines())
await check('searchStock 搜索(昆仑万维)', () => ds.searchStock('昆仑万维'))
await check('searchStockUS 美股搜索(AAPL)', () => ds.searchStockUS('AAPL'))
await check('getResearchReports 研报', () => ds.getResearchReports(CODE, 3))
await check('getHotStockRank 热榜', () => ds.getHotStockRank(5))
await check('getIndustryOverview 行业概览', () => ds.getIndustryOverview())

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`)
process.exit(fail > 0 ? 1 : 0)
