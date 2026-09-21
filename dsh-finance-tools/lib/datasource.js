/**
 * dsh-finance-tools — 金融数据源层
 *
 * 从上游 Web 版投研项目的 electron/routers/* + data-source-manager.ts 原样移植，
 * 仅将 axios 换成 Node 原生 fetch（DSH 运行时 node v24，零依赖）。
 *
 * 2026-08-26 移植时修正的东财 API 漂移（原 ai-butler 代码部分已失效）：
 *   - push2.eastmoney.com/api/qt/clist/get 被反爬拒绝 → 换 push2delay.eastmoney.com
 *   - RPT_F10_BASIC / RPT_STOCK_CONSENSUS / RPT_NOTICE_INFO / RPT_ZT_POOL / RPT_CHG_NOTICE
 *     等 datacenter 报表名已不存在 → 改走 emweb F10 / np-anotice-stock / 研报接口
 *   - search-api-web 个股新闻需补 keyword 参数，响应在 result.cmsArticleWebOld
 *   - np-listapi 头条需 client/biz/req_trace 三参 → 改用 newsapi 快讯 JSONP
 *   - 业绩预告字段为 PREDICT_TYPE / ADD_AMP_LOWER|UPPER（非 PREDICT_FINANCE_TYPE）
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const EM_REFERER = 'https://data.eastmoney.com/'

// ── 基础 HTTP 工具（fetch 封装）───────────────────────────────────────────

async function httpGet(url, { timeout = 8000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  })
  return res
}

async function httpGetJson(url, opts = {}) {
  const res = await httpGet(url, opts)
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

async function httpPostJson(url, body, { timeout = 8000, headers = {} } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

// 解码 GBK 文本（腾讯/新浪行情）
async function httpGetGbk(url, { timeout = 8000, headers = {} } = {}) {
  const res = await httpGet(url, { timeout, headers })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  return new TextDecoder('gbk').decode(buf)
}

// ── 代码/市场辅助 ─────────────────────────────────────────────────────────

function normalizeCode(code) {
  return /^[69]/.test(code) ? `${code}.SH` : `${code}.SZ`
}

function secidOf(code) {
  return (/^[69]/.test(code) ? '1.' : '0.') + code
}

function marketPrefix(code) {
  return /^[69]/.test(code) ? 'sh' : 'sz'
}

function isUS(ticker) {
  return /^[A-Za-z][A-Za-z.]{0,5}$/.test(ticker) && !/^\d+$/.test(ticker)
}

// ── 行情 A股（五源轮换）───────────────────────────────────────────────────

export async function fetchQuoteTencent(code) {
  const url = `http://qt.gtimg.cn/q=${marketPrefix(code)}${code}`
  const text = await httpGetGbk(url, { timeout: 8000 })
  if (!text.includes('~')) return null
  const p = text.split('~')
  if (p.length <= 37) return null
  return {
    name: p[1], code: p[2],
    price: parseFloat(p[3]),
    changePct: parseFloat(p[32]),
    amount: parseFloat(p[37]) || 0,
    source: 'TENCENT',
  }
}

let xueqiuCookie = ''
async function xueqiuWarm() {
  if (xueqiuCookie) return
  try {
    const r = await httpGet('https://xueqiu.com/', { timeout: 3000 })
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]
    for (const c of sc) {
      if (c && c.includes('=')) {
        const kv = c.split(';')[0]
        if (!xueqiuCookie.includes(kv.split('=')[0])) xueqiuCookie += (xueqiuCookie ? '; ' : '') + kv
      }
    }
  } catch { /* 预热失败也不阻塞 */ }
}

export async function fetchQuoteXueqiu(code) {
  await xueqiuWarm()
  const symbol = (code.startsWith('6') || code.startsWith('9') ? 'SH' : 'SZ') + code
  const url = `https://stock.xueqiu.com/v5/stock/realtime/quotec.json?symbol=${symbol}`
  const res = await httpGet(url, {
    timeout: 5000,
    headers: { 'Referer': 'https://xueqiu.com/', ...(xueqiuCookie ? { Cookie: xueqiuCookie } : {}) },
  })
  if (!res.ok) return null
  const json = await res.json()
  const item = json?.data?.[0]
  if (!item) return null
  return {
    name: item.name, code: item.symbol?.slice(2),
    price: parseFloat(item.current),
    changePct: parseFloat(item.percent),
    amount: (parseFloat(item.amount) || 0) / 10000,
    source: 'XUEQIU',
  }
}

export async function fetchQuoteEastmoney(code) {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secidOf(code)}&fields=f2,f43,f58,f12,f14,f3,f37`
  const json = await httpGetJson(url, { timeout: 5000, headers: { 'Referer': 'https://quote.eastmoney.com/' } })
  const d = json?.data
  if (!d) return null
  return {
    name: d.f58 || d.f14, code: d.f12,
    price: parseFloat(d.f43 || d.f2 || 0) / 100,
    changePct: parseFloat(d.f3 || 0),
    amount: 0, source: 'EASTMONEY',
  }
}

export async function fetchQuoteIfeng(code) {
  const url = `https://hq.finance.ifeng.com/q.php?l=${marketPrefix(code)}${code}`
  const json = await httpGetJson(url, { timeout: 5000 })
  const d = json?.[0]
  if (!d) return null
  return {
    name: d.name, code: d.code,
    price: parseFloat(d.price),
    changePct: parseFloat(d.changePct || 0),
    amount: 0, source: 'IFENG',
  }
}

export async function fetchQuoteSina(code) {
  const url = `https://hq.sinajs.cn/list=${marketPrefix(code)}${code}`
  const text = await httpGetGbk(url, { timeout: 5000, headers: { 'Referer': 'https://finance.sina.com.cn/' } })
  const m = text.match(/"(.*)"/)
  if (!m) return null
  const p = m[1].split(',')
  if (p.length < 4) return null
  return {
    name: p[0], code,
    price: parseFloat(p[3]),
    changePct: p.length > 32 ? parseFloat(p[32]) : 0,
    amount: 0, source: 'SINA',
  }
}

/** A股实时行情 — 五源轮换（腾讯/雪球/东财/凤凰/新浪） */
export async function getQuote(code) {
  const sources = [
    ['腾讯', fetchQuoteTencent],
    ['雪球', fetchQuoteXueqiu],
    ['东财', fetchQuoteEastmoney],
    ['凤凰', fetchQuoteIfeng],
    ['新浪', fetchQuoteSina],
  ]
  for (const [name, fn] of sources) {
    try {
      const r = await fn(code)
      if (r) return r
    } catch { /* 尝试下一源 */ }
  }
  return null
}

// ── 行情 美股（东财主 → 腾讯兜底）─────────────────────────────────────────

async function fetchUSQuoteEastmoney(ticker) {
  for (const market of [105, 106]) {
    try {
      const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${market}.${ticker}&fields=f43,f57,f58,f169,f170,f46,f44,f45,f60,f116,f168,f117,f292`
      const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': 'https://quote.eastmoney.com/' } })
      const d = json?.data
      if (!d || !d.f58) continue
      return {
        code: d.f57 || ticker, name: d.f58,
        price: (d.f43 || 0) / 100, changePct: d.f169 || 0,
        changeAmount: (d.f170 || 0) / 100,
        open: (d.f46 || 0) / 100, high: (d.f44 || 0) / 100, low: (d.f45 || 0) / 100,
        volume: d.f60 || 0, marketCap: d.f116 || 0,
        pe: d.f168 != null ? d.f168 : null,
        high52w: d.f117 != null ? d.f117 / 100 : null,
        low52w: d.f292 != null ? d.f292 / 100 : null,
        source: 'EASTMONEY-US',
      }
    } catch { /* 试下一交易所 */ }
  }
  return null
}

async function fetchUSQuoteTencent(ticker) {
  const text = await httpGetGbk(`http://qt.gtimg.cn/q=us${ticker}`, { timeout: 8000 })
  if (!text.includes('~')) return null
  const p = text.split('~')
  if (p.length < 50) return null
  return {
    code: ticker, name: p[1],
    price: parseFloat(p[3]) || 0, changePct: parseFloat(p[32]) || 0,
    changeAmount: parseFloat(p[31]) || 0,
    open: parseFloat(p[5]) || 0, high: parseFloat(p[33]) || 0, low: parseFloat(p[34]) || 0,
    volume: parseFloat(p[6]) || 0, marketCap: parseFloat(p[45]) || 0,
    pe: parseFloat(p[39]) || null,
    high52w: parseFloat(p[41]) || null, low52w: parseFloat(p[42]) || null,
    source: 'TENCENT-US',
  }
}

export async function getUSQuote(ticker) {
  const upper = ticker.toUpperCase()
  const em = await fetchUSQuoteEastmoney(upper)
  if (em) return em
  try { return await fetchUSQuoteTencent(upper) } catch { return null }
}

/** 智能行情入口：A股按代码，美股按 ticker */
export async function getQuoteSmart(target) {
  const t = String(target).trim()
  if (isUS(t)) return getUSQuote(t)
  return getQuote(t)
}

// ── 财报（东财 datacenter）────────────────────────────────────────────────

async function fetchEastmoneyReport(reportName, filter, { pageSize = 20, sortColumns = 'REPORT_DATE', sortTypes = -1, columns = 'ALL' } = {}) {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
  const params = new URLSearchParams({
    reportName, columns,
    filter, pageSize: String(pageSize),
    sortTypes: String(sortTypes), sortColumns,
    source: 'WEB', client: 'WEB',
  })
  const json = await httpGetJson(`${url}?${params}`, { timeout: 8000, headers: { 'Referer': EM_REFERER } })
  const records = json?.result?.data || []
  return records.sort((a, b) => String(b.REPORT_DATE).localeCompare(String(a.REPORT_DATE)))
}

export async function getIncomeStatement(code) {
  const records = await fetchEastmoneyReport('RPT_DMSK_FN_INCOME', `(SECUCODE="${normalizeCode(code)}")`)
  return records.map((r) => ({
    date: r.REPORT_DATE?.replace(/-/g, '').slice(0, 6),
    revenue: r.TOTAL_OPERATE_INCOME,
    cost: r.OPERATE_COST,
    grossProfit: r.OPERATE_PROFIT,
    netProfit: r.PARENT_NETPROFIT,
    ebit: (r.OPERATE_PROFIT || 0) + (r.FINANCE_EXPENSE || 0),
    saleExpense: r.SALE_EXPENSE,
    manageExpense: r.MANAGE_EXPENSE,
    financeExpense: r.FINANCE_EXPENSE,
  }))
}

export async function getBalanceSheet(code) {
  const records = await fetchEastmoneyReport('RPT_DMSK_FN_BALANCE', `(SECUCODE="${normalizeCode(code)}")`)
  return records.map((r) => ({
    date: r.REPORT_DATE?.replace(/-/g, '').slice(0, 6),
    totalAssets: r.TOTAL_ASSETS,
    totalLiabilities: r.TOTAL_LIABILITIES,
    equity: r.TOTAL_EQUITY,
    cashAndEquivalents: r.MONETARYFUNDS,
    fixedAsset: r.FIXED_ASSET,
    inventory: r.INVENTORY,
    accountsReceivable: r.ACCOUNTS_RECE,
    debtRatio: r.DEBT_ASSET_RATIO,
    currentRatio: r.CURRENT_RATIO,
  }))
}

export async function getCashFlow(code) {
  const records = await fetchEastmoneyReport('RPT_DMSK_FN_CASHFLOW', `(SECUCODE="${normalizeCode(code)}")`)
  return records.map((r) => {
    const opCF = r.NETCASH_OPERATE
    const capex = r.CONSTRUCT_LONG_ASSET
    return {
      date: r.REPORT_DATE?.replace(/-/g, '').slice(0, 6),
      operatingCF: opCF,
      investingCF: r.NETCASH_INVEST,
      financingCF: r.NETCASH_FINANCE,
      capex,
      freeCashFlow: opCF != null && capex != null ? opCF - capex : null,
    }
  })
}

export async function getFinancialIndicators(code) {
  const records = await fetchEastmoneyReport('RPT_F10_FINANCE_MAINFINADATA', `(SECUCODE="${normalizeCode(code)}")`)
  return records.map((r) => ({
    date: r.REPORT_DATE?.replace(/-/g, '').slice(0, 6),
    roe: r.ROEJQ,
    grossMargin: r.XSMLL,
    netMargin: r.XSJLL,
    eps: r.EPSJB,
    bps: r.BPS,
    totalShares: r.TOTAL_SHARE,
    roic: r.ROIC,
    revenueGrowth: r.TOTALOPERATEREVETZ,
    profitGrowth: r.PARENTNETPROFITTZ,
  }))
}

export async function getFullFinancials(code) {
  const [income, balance, cashflow, indicators] = await Promise.allSettled([
    getIncomeStatement(code),
    getBalanceSheet(code),
    getCashFlow(code),
    getFinancialIndicators(code),
  ])
  return {
    income: income.status === 'fulfilled' ? income.value : [],
    balance: balance.status === 'fulfilled' ? balance.value : [],
    cashflow: cashflow.status === 'fulfilled' ? cashflow.value : [],
    indicators: indicators.status === 'fulfilled' ? indicators.value : [],
    source: 'EASTMONEY',
  }
}

// ── 业绩预告（东财，字段已随 API 漂移修正）──────────────────────────────

function quarterEnds(count) {
  const result = []
  let y = new Date().getFullYear()
  let q = Math.floor(new Date().getMonth() / 3) + 1
  const ends = ['0331', '0630', '0930', '1231']
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      result.push(`${y}-${ends[q - 1].slice(0, 2)}-${ends[q - 1].slice(2)}`)
    } else {
      q--
      if (q === 0) { q = 4; y-- }
      result.push(`${y}-${ends[q - 1].slice(0, 2)}-${ends[q - 1].slice(2)}`)
    }
  }
  return result
}

export async function getRecentEarningsAlerts(daysBack = 7) {
  const cutoff = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10).replace(/-/g, '')
  const periods = quarterEnds(4)
  const all = []
  const seen = new Set()
  const significant = ['预增', '预减', '预亏', '扭亏', '大增', '略增', '略减', '续亏', '首亏']
  for (const period of periods) {
    try {
      const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
      const params = new URLSearchParams({
        reportName: 'RPT_PUBLIC_OP_NEWPREDICT',
        columns: 'ALL',
        pageSize: '50', pageNo: '1', sortTypes: '-1', sortColumns: 'NOTICE_DATE',
        filter: `(REPORT_DATE='${period}')`, source: 'WEB', client: 'WEB',
      })
      const json = await httpGetJson(`${url}?${params}`, { timeout: 8000, headers: { 'Referer': EM_REFERER } })
      for (const item of json?.result?.data || []) {
        const code = item.SECURITY_CODE
        const pubDate = (item.NOTICE_DATE || '').replace(/-/g, '').slice(0, 8)
        const noticeType = item.PREDICT_TYPE || ''
        if (!noticeType || !significant.some((s) => noticeType.includes(s))) continue
        if (pubDate < cutoff || seen.has(code)) continue
        seen.add(code)
        const lo = parseFloat(item.ADD_AMP_LOWER)
        const hi = parseFloat(item.ADD_AMP_UPPER)
        const changeRange = Number.isFinite(lo) && Number.isFinite(hi)
          ? Math.round((lo + hi) / 2)
          : Math.round(((parseFloat(item.PREDICT_AMT_LOWER) || 0) + (parseFloat(item.PREDICT_AMT_UPPER) || 0)) / 2)
        all.push({
          name: item.SECURITY_NAME_ABBR || '', code,
          noticeType: noticeType.slice(0, 10),
          changeRange,
          pubDate: (item.NOTICE_DATE || '').slice(0, 10),
          summary: (item.CHANGE_REASON_EXPLAIN || item.PREDICT_CONTENT || '').slice(0, 120),
        })
      }
    } catch { /* 单报告期失败跳过 */ }
  }
  all.sort((a, b) => {
    const pri = (t) => (t.includes('增') ? 0 : t.includes('亏') ? 2 : 1)
    return pri(a.noticeType) - pri(b.noticeType) || Math.abs(b.changeRange) - Math.abs(a.changeRange)
  })
  return all.slice(0, 15)
}

// ── 市场数据（push2delay 规避反爬）──────────────────────────────────────

export async function getStockFundFlow(code) {
  const url = `https://push2.eastmoney.com/api/qt/stock/fflow/daykline/get?secid=${secidOf(code)}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65&lmt=20&klt=101`
  const json = await httpGetJson(url, { timeout: 5000, headers: { 'Referer': EM_REFERER } })
  return (json?.data?.klines || []).map((line) => {
    const p = line.split(',')
    return {
      date: p[0],
      mainNetInflow: parseFloat(p[1]) || 0,
      superLargeNet: parseFloat(p[2]) || 0,
      largeNet: parseFloat(p[3]) || 0,
      mediumNet: parseFloat(p[4]) || 0,
      smallNet: parseFloat(p[5]) || 0,
    }
  })
}

export async function getDailyKline(code, days = 60) {
  const symbol = marketPrefix(code) + code
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${days + 10},qfq`
  const json = await httpGetJson(url, { timeout: 10000 })
  const klines = json?.data?.[symbol]?.qfqday || []
  return klines.slice(-days).map((k) => ({
    date: k[0], open: parseFloat(k[1]), close: parseFloat(k[2]),
    high: parseFloat(k[3]), low: parseFloat(k[4]), volume: parseFloat(k[5]),
  }))
}

export async function getMarketSentiment() {
  const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f1,f2,f3,f4,f6,f104,f105,f106&secids=1.000001,0.399001,0.399006'
  const json = await httpGetJson(url, { timeout: 5000, headers: { 'Referer': 'https://quote.eastmoney.com/' } })
  const diff = json?.data?.diff || []
  const result = { indices: [], advance: 0, decline: 0, flat: 0, limitUp: 0, limitDown: 0, totalAmount: 0 }
  for (const item of diff) {
    result.indices.push({ name: item.f14 || item.f12, price: item.f2, changePct: item.f3 })
    result.advance += item.f104 || 0
    result.decline += item.f105 || 0
    result.flat += item.f106 || 0
    result.totalAmount += (item.f6 || 0) / 1e8
  }
  result.totalAmount = Math.round(result.totalAmount)
  return result
}

export async function getNorthboundFlow() {
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
  const params = new URLSearchParams({
    reportName: 'RPT_MUTUAL_DEAL_HISTORY', columns: 'ALL', pageSize: '5',
    sortColumns: 'TRADE_DATE', sortTypes: '-1', source: 'WEB', client: 'WEB',
  })
  const json = await httpGetJson(`${url}?${params}`, { timeout: 5000, headers: { 'Referer': EM_REFERER } })
  const data = json?.result?.data || []
  let consecutive = 0
  for (const item of data) {
    if (item.NET_BUY_AMT && parseFloat(item.NET_BUY_AMT) > 0) consecutive++
    else break
  }
  return {
    todayNetBuy: data[0] ? Math.round(parseFloat(data[0].NET_BUY_AMT || 0) / 1e8 * 100) / 100 : 0,
    consecutiveDays: consecutive,
    recentDays: data.map((r) => ({
      date: r.TRADE_DATE?.slice(0, 10),
      netBuy: Math.round(parseFloat(r.NET_BUY_AMT || 0) / 1e8 * 100) / 100,
    })),
  }
}

export async function getDragonTiger(days = 3) {
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
  const params = new URLSearchParams({
    reportName: 'RPT_DAILYBILLBOARD_DETAILSNEW', columns: 'ALL',
    filter: `(TRADE_DATE>='${start}')`, pageSize: '20',
    sortTypes: '-1', sortColumns: 'TRADE_DATE', source: 'WEB', client: 'WEB',
  })
  const json = await httpGetJson(`${url}?${params}`, { timeout: 8000, headers: { 'Referer': EM_REFERER } })
  return (json?.result?.data || []).map((r) => ({
    code: r.SECURITY_CODE, name: r.SECURITY_NAME_ABBR,
    date: r.TRADE_DATE?.slice(0, 10),
    changePct: r.CHANGE_RATE,
    netBuy: Math.round(parseFloat(r.BILLBOARD_NET_AMT || 0) / 1e8 * 100) / 100,
    reason: r.EXPLANATION || r.EXPLAIN || '',
  }))
}

const CLIST_DELAY = 'https://push2delay.eastmoney.com/api/qt/clist/get'

// clist 的 diff 有时是数组、有时是 {0:{...},1:{...}} 对象，统一归一为数组
function clistDiff(json) {
  const diff = json?.data?.diff
  if (!diff) return []
  return Array.isArray(diff) ? diff : Object.values(diff)
}

export async function getSectorFundFlow(topN = 10) {
  const url = `${CLIST_DELAY}?pn=1&pz=${topN}&po=1&np=1&ut=b2884a393a59ad64002292a3e90d46a5&fltt=2&invt=2&fid0=f62&fs=m:90+t:2&stat=1&fields=f12,f14,f2,f3,f62,f184`
  const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': EM_REFERER } })
  return clistDiff(json).map((item) => ({
    name: item.f14,
    changePct: item.f3,
    netInflow: Math.round((item.f62 || 0) / 1e8 * 100) / 100,
    netInflowPct: item.f184,
  }))
}

export async function getLimitUpPool() {
  // 东财涨停池标准 filter：沪深主板/创业板/科创板涨停
  const url = `${CLIST_DELAY}?pn=1&pz=30&po=1&np=1&ut=b2884a393a59ad64002292a3e90d46a5&fltt=2&invt=2&fid=f3&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14,f2,f3`
  const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': EM_REFERER } })
  return clistDiff(json).map((item) => ({
    name: item.f14, code: item.f12, price: item.f2, changePct: item.f3,
  }))
}

export async function getIndustryOverview() {
  const url = `${CLIST_DELAY}?pn=1&pz=10&po=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f12,f14,f20,f21,f23,f24,f25`
  const json = await httpGetJson(url, { timeout: 8000 })
  const stocks = clistDiff(json)
  return {
    count: stocks.length,
    avgChange: stocks.length ? (stocks.reduce((s, x) => s + (x.f3 || 0), 0) / stocks.length).toFixed(2) : 0,
    topGainers: stocks.filter((x) => x.f3 > 0).slice(0, 5).map((x) => ({ code: x.f12, name: x.f14, change: x.f3 })),
    topLosers: stocks.filter((x) => x.f3 < 0).slice(-5).map((x) => ({ code: x.f12, name: x.f14, change: x.f3 })),
  }
}

export async function getSectorPeers(code, count = 10) {
  const profile = await getCompanyProfile(code)
  if (!profile?.industry) return []
  const url = `${CLIST_DELAY}?pn=1&pz=${count}&po=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f2,f3,f12,f14,f20,f23`
  const json = await httpGetJson(url, { timeout: 8000 })
  return clistDiff(json).map((x) => ({
    code: x.f12, name: x.f14, price: x.f2, changePct: x.f3, marketCap: x.f20, pe: x.f23,
  }))
}

// ── F10（emweb 网页端接口，稳定性高）────────────────────────────────────

export async function getCompanyProfile(code) {
  const info = await getCompanyInfo(code)
  if (!info) return null
  return {
    name: info.name, code,
    industry: info.industry,
    mainBusiness: (info.profile || '').slice(0, 200),
    registeredCapital: info.registeredCapital,
    employees: info.employees,
  }
}

export async function getCompanyInfo(code) {
  const market = /^[69]/.test(code) ? 'SH' : 'SZ'
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${market}${code}`
  const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': 'https://emweb.securities.eastmoney.com/' } })
  const d = json?.jbzl?.[0]
  if (!d) return null
  return {
    name: d.SECURITY_NAME_ABBR || d.ORG_NAME, fullName: d.ORG_NAME, fullNameEn: d.ORG_NAME_EN,
    industry: d.EM2016 || d.INDUSTRYCSRC1, chairman: d.CHAIRMAN, president: d.PRESIDENT,
    legalPerson: d.LEGAL_PERSON, secretary: d.SECRETARY,
    independentDirectors: d.INDEDIRECTORS, employees: d.EMP_NUM,
    registeredCapital: d.REG_CAPITAL, regNumber: d.REG_NUM,
    website: d.ORG_WEB, email: d.ORG_EMAIL, phone: d.ORG_TEL, address: d.ADDRESS,
    profile: d.ORG_PROFILE, businessScope: d.BUSINESS_SCOPE,
  }
}

export async function getTopShareholders(code) {
  const market = /^[69]/.test(code) ? 'SH' : 'SZ'
  const url = `https://emweb.securities.eastmoney.com/PC_HSF10/ShareholderResearch/PageAjax?code=${market}${code}`
  const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': 'https://emweb.securities.eastmoney.com/' } })
  const result = {}
  if (json?.sdgd?.length) {
    result.topHolders = json.sdgd.slice(0, 10).map((h) => ({
      rank: h.HOLDER_RANK, name: h.HOLDER_NAME, shares: h.HOLD_NUM,
      ratio: h.HOLD_NUM_RATIO, change: h.HOLD_NUM_CHANGE,
    }))
  }
  if (json?.ltgd?.length) {
    result.topFloatHolders = json.ltgd.slice(0, 10).map((h) => ({
      rank: h.HOLDER_RANK, name: h.HOLDER_NAME, shares: h.HOLD_NUM,
      ratio: h.FREE_HOLDNUM_RATIO || h.HOLD_NUM_RATIO, change: h.HOLD_NUM_CHANGE,
    }))
  }
  if (json?.jgcc?.length) {
    result.instSummary = json.jgcc.slice(0, 5).map((i) => ({
      type: i.ORG_TYPE === '00' ? '合计' : i.ORG_TYPE === '01' ? '基金' : i.ORG_TYPE === '02' ? '券商' : '其他',
      count: i.TOTAL_ORG_NUM, shares: i.TOTAL_FREE_SHARES, shareRatio: i.TOTAL_SHARES_RATIO,
    }))
  }
  return result
}

/** 分析师一致预期：东财 datacenter 报表名已失效，改由券商研报的盈利预测聚合 */
export async function getAnalystEstimates(code) {
  const { reports } = await getResearchReports(code, 5)
  return reports.map((r) => ({
    date: r.publishDate?.slice(0, 10),
    org: r.orgSName,
    rating: r.rating,
    epsEstimate: r.predictNextTwoYearEps,
    peEstimate: r.predictNextTwoYearPe,
    title: r.title,
  }))
}

// ── 公告（np-anotice-stock 新版接口）────────────────────────────────────

export async function getCompanyAnnouncements(code, count = 5) {
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=${count}&page_index=1&ann_type=A&client_source=web&stock_list=${code}`
  const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': 'https://data.eastmoney.com/' } })
  return (json?.data?.list || []).map((item) => ({
    date: (item.notice_date || item.display_time || '').slice(0, 10),
    type: (item.columns || []).map((c) => c.column_name).join('/') || '公告',
    title: item.title_ch || item.title || '',
    url: `https://data.eastmoney.com/notices/detail/${code}/${item.art_code}.html`,
  }))
}

/** 并购/重组公告：从公告列表按标题筛 */
export async function getMADeals(count = 5) {
  const url = `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=${Math.max(count * 4, 30)}&page_index=1&ann_type=A&client_source=web&stock_list=`
  try {
    const json = await httpGetJson(url, { timeout: 8000, headers: { 'Referer': 'https://data.eastmoney.com/' } })
    const kw = /收购|重组|合并/
    return (json?.data?.list || [])
      .filter((item) => kw.test(item.title_ch || item.title || ''))
      .slice(0, count)
      .map((item) => ({
        date: (item.notice_date || item.display_time || '').slice(0, 10),
        type: (item.columns || []).map((c) => c.column_name).join('/'),
        title: item.title_ch || item.title || '',
        company: (item.codes || []).map((c) => `${c.short_name}(${c.stock_code})`).join(','),
      }))
  } catch { return [] }
}

// ── 新闻 ──────────────────────────────────────────────────────────────────

export async function getStockNewsFromEM(code) {
  const param = JSON.stringify({
    keyword: code, uid: code, type: ['cmsArticleWebOld'],
    client: 'web', clientType: 'web', clientVersion: '1.0',
    currPage: 1, pageSize: 10, sortFields: '', quoteId: '',
  })
  const url = `https://search-api-web.eastmoney.com/search/jsonp?cb=jQuery&param=${encodeURIComponent(param)}&_=${Date.now()}`
  const res = await httpGet(url, { timeout: 5000 })
  const text = await res.text()
  const json = JSON.parse(text.replace(/^jQuery\(/, '').replace(/\)$/, ''))
  const items = json?.result?.cmsArticleWebOld || json?.result?.list || []
  return items.map((item) => ({
    title: (item.title || '').replace(/<[^>]+>/g, ''),
    content: (item.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
    date: item.date,
    source: item.mediaName || '东方财富',
    url: item.url,
  }))
}

export async function getMarketHeadlines() {
  // 东财快讯 JSONP：返回 LivesList
  const url = 'https://newsapi.eastmoney.com/kuaixun/v1/getlist_102_ajaxResult_50_1_.html'
  const res = await httpGet(url, { timeout: 6000, headers: { 'Referer': 'https://www.eastmoney.com/' } })
  const text = await res.text()
  const json = JSON.parse(text.replace(/^var ajaxResult=/, '').replace(/;?\s*$/, ''))
  return (json?.LivesList || []).slice(0, 20).map((item) => ({
    title: (item.title || '').replace(/<[^>]+>/g, '').slice(0, 80),
    date: (item.time || item.sort || '').slice(0, 16),
    source: '东方财富快讯',
    url: item.url_w || item.url_m || '',
  }))
}

export async function getAggregatedNews(code, limit = 10) {
  const results = []
  if (code) {
    try { results.push(...await getStockNewsFromEM(code)) } catch { /* 忽略 */ }
  }
  if (results.length < limit) {
    try { results.push(...await getMarketHeadlines()) } catch { /* 忽略 */ }
  }
  const seen = new Set()
  return results.filter((item) => {
    if (seen.has(item.title)) return false
    seen.add(item.title)
    return true
  }).slice(0, limit)
}

// ── 搜索 ──────────────────────────────────────────────────────────────────

// 东方财富搜索接口 token：开源版不硬编码，改由环境变量 EM_SEARCH_TOKEN 注入。
// 未配置时下面的 searchStock / searchStockUS 会直接返回 null，调用方自动降级为手工输入。
const EM_SEARCH_TOKEN = process.env.EM_SEARCH_TOKEN || ''

export async function searchStock(keyword) {
  if (!EM_SEARCH_TOKEN) return null
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=${EM_SEARCH_TOKEN}&count=5`
  const json = await httpGetJson(url, { timeout: 5000 })
  const list = json?.QuotationCodeTable?.Data || json?.QuotationCodeTable?.data
  if (list && list.length > 0) {
    const item = list[0]
    return { code: item.Code || item.code, name: item.Name || item.name, market: item.Market || item.MktNum || '', securityType: item.SecurityTypeName || '' }
  }
  return null
}

export async function searchStockUS(keyword) {
  const upper = keyword.toUpperCase().trim()
  if (!EM_SEARCH_TOKEN) {
    return /^[A-Z]{1,5}$/.test(upper) ? { code: upper, name: upper, exchange: 'AUTO', market: 0 } : null
  }
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(upper)}&type=4&token=${EM_SEARCH_TOKEN}&count=5`
  try {
    const json = await httpGetJson(url, { timeout: 5000 })
    const list = json?.QuotationCodeTable?.Data || json?.QuotationCodeTable?.data
    if (list && list.length > 0) {
      const item = list[0]
      const market = item.Market || item.market || item.MktNum || ''
      const map = { '105': 'NASDAQ', '106': 'NYSE', '107': 'AMEX' }
      return { code: item.Code || item.code, name: item.Name || item.name || upper, exchange: map[market] || market, market: parseInt(market) || 0 }
    }
  } catch { /* 兜底 */ }
  if (/^[A-Z]{1,5}$/.test(upper)) return { code: upper, name: upper, exchange: 'AUTO', market: 0 }
  return null
}

export async function searchStockSmart(keyword) {
  const r = await searchStock(keyword)
  if (r) return { ...r, kind: 'A股/港股' }
  const us = await searchStockUS(keyword)
  if (us) return { ...us, kind: '美股' }
  return null
}

// ── 研报 ──────────────────────────────────────────────────────────────────

export async function getResearchReports(code, count = 10) {
  const endTime = new Date().toISOString().slice(0, 10)
  const url = `https://reportapi.eastmoney.com/report/list?code=${encodeURIComponent(code)}&pageSize=${count}&pageNo=1&qType=0&type=1&sortColumn=datetime&sortTypes=-1&beginTime=2025-01-01&endTime=${endTime}`
  const json = await httpGetJson(url, { timeout: 10000, headers: { 'User-Agent': UA } })
  if (!json?.data || !Array.isArray(json.data)) return { reports: [], total: 0 }
  const reports = json.data.map((r) => ({
    title: r.title || '', stockName: r.stockName || '', stockCode: r.stockCode || '',
    orgSName: r.orgSName || '', publishDate: r.publishDate || '',
    researcher: r.researcher || '', rating: r.rating || '', ratingChange: r.ratingChange || '',
    summary: (r.summary || '').replace(/<[^>]+>/g, '').slice(0, 200),
    industryName: r.indvInduName || '',
    predictNextTwoYearEps: r.predictNextTwoYearEps || '',
    predictNextTwoYearPe: r.predictNextTwoYearPe || '',
  }))
  return { reports, total: json.hits || reports.length }
}

// ── 热榜 ──────────────────────────────────────────────────────────────────

export async function getHotStockRank(num = 10) {
  let raw = []
  try {
    const json = await httpPostJson('https://emappdata.eastmoney.com/stockrank/getAllCurrentList', {
      appId: 'appId01', globalId: '786e4c21-70dc-435a-93bb-38',
      marketType: '', pageNo: 1, pageSize: num,
    }, { timeout: 8000 })
    raw = (json?.data || []).map((item) => ({ sc: item.sc || '', rk: item.rk || 0 }))
  } catch { return [] }
  if (raw.length === 0) return []
  const codes = raw.map((r) => r.sc.slice(2))
  const nameMap = {}
  try {
    const text = await httpGetGbk(`http://qt.gtimg.cn/q=${codes.map((c) => marketPrefix(c) + c).join(',')}`, { timeout: 5000 })
    for (const line of text.split(';')) {
      if (!line.includes('~')) continue
      const p = line.split('~')
      if (p.length > 2) nameMap[p[2]] = p[1]
    }
  } catch { /* 名称解析失败也返回 code */ }
  return raw.map((r) => ({ rank: r.rk, code: r.sc.slice(2), name: nameMap[r.sc.slice(2)] || r.sc }))
}
