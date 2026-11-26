/**
 * 游资多专家研判：提交前拉取「已核证行情事实」（HTTP，不是模型调用）。
 *
 * 可被 gen-client.mjs 注入客户端（剥离 `export `），也可在 Node 测试里 import。
 * 拉不到的字段必须显式标缺失，禁止调用方用模型补全。
 */

export function extractStockCode(input) {
	if (input == null || input === '') return '';
	if (typeof input === 'object') {
		const nested = input.code || (input.ticker && input.ticker.code) || '';
		if (nested) return normalizeCode(nested);
	}
	const s = String(input).trim();
	const dotted = s.match(/\b(\d{6})\.(SH|SZ|BJ)\b/i);
	if (dotted) return dotted[1];
	const six = s.match(/(?:^|[^\d])(\d{6})(?:[^\d]|$)/);
	if (six) return six[1];
	if (/^[A-Za-z][A-Za-z.]{0,5}$/.test(s)) return s.toUpperCase();
	return '';
}

export function normalizeCode(code) {
	const s = String(code || '').trim().toUpperCase();
	const m = s.match(/^(\d{6})\.(?:SH|SZ|BJ)$/);
	if (m) return m[1];
	return s.replace(/^(SH|SZ|SS)/, '');
}

export function isUSTicker(code) {
	const s = String(code || '');
	return /^[A-Za-z][A-Za-z.]{0,5}$/.test(s) && !/^\d+$/.test(s);
}

export function isAShareCode(code) {
	return /^\d{6}$/.test(String(code || ''));
}

/** 板块默认涨跌停幅度（%）。ST 需名称，无名称时不臆测 5%。 */
export function boardLimitPercent(code) {
	const c = String(code || '');
	if (/^8\d{5}$/.test(c) || /^4\d{5}$/.test(c) || /^9\d{5}$/.test(c)) return 30;
	if (/^688/.test(c) || /^689/.test(c) || /^300/.test(c) || /^301/.test(c)) return 20;
	if (/^\d{6}$/.test(c)) return 10;
	return null;
}

export function marketPrefix(code) {
	const c = String(code || '');
	if (/^[69]/.test(c)) return 'sh';
	if (/^8/.test(c) || /^4/.test(c)) return 'bj';
	return 'sz';
}

export function eastmoneySecid(code) {
	const c = String(code || '');
	if (/^[69]/.test(c)) return '1.' + c;
	if (/^8/.test(c) || /^4/.test(c)) return '0.' + c;
	return '0.' + c;
}

function finite(n) {
	const x = typeof n === 'number' ? n : parseFloat(n);
	return Number.isFinite(x) ? x : null;
}

function nearlyEqual(a, b, eps) {
	if (a == null || b == null) return false;
	return Math.abs(a - b) <= (eps == null ? 0.011 : eps);
}

/**
 * 仅在有官方涨停价/跌停价时给出「涨停/跌停/未涨跌停」。
 * 没有官方价时不根据默认 10%/20% 宣称涨停（那是未核证）。
 */
export function inferLimitStatus(quote) {
	if (!quote || quote.price == null) {
		return { status: null, knowable: false, note: '无最新价，无法判断涨跌停' };
	}
	const { price, limitUp, limitDown } = quote;
	if (limitUp == null && limitDown == null) {
		return {
			status: null,
			knowable: false,
			note: '未取得官方涨停价/跌停价，涨跌停状态未核证，禁止宣称涨停或跌停',
		};
	}
	if (limitUp != null && (price >= limitUp || nearlyEqual(price, limitUp))) {
		return { status: '涨停', knowable: true, note: `最新价 ${price} 触及涨停价 ${limitUp}` };
	}
	if (limitDown != null && (price <= limitDown || nearlyEqual(price, limitDown))) {
		return { status: '跌停', knowable: true, note: `最新价 ${price} 触及跌停价 ${limitDown}` };
	}
	const bits = [];
	if (limitUp != null) bits.push('涨停价 ' + limitUp);
	if (limitDown != null) bits.push('跌停价 ' + limitDown);
	return { status: '未涨跌停', knowable: true, note: `最新价 ${price}，${bits.join('，')}` };
}

/** 腾讯行情 `v_sh600519="..."` 或 `~` 分隔文本。 */
export function parseTencentQuote(text, fallbackCode) {
	if (!text || typeof text !== 'string' || text.indexOf('~') < 0) return null;
	const quoted = text.match(/"([^"]*)"/);
	const raw = quoted ? quoted[1] : text.replace(/^[\s\S]*?=/, '');
	const p = raw.split('~');
	if (p.length < 4) return null;
	const price = finite(p[3]);
	if (price == null || price <= 0) return null;
	const prevClose = finite(p[4]);
	let changePct = finite(p[32]);
	if (changePct == null && prevClose) changePct = ((price - prevClose) / prevClose) * 100;
	const volHands = finite(p[6]);
	const amountWan = finite(p[37]);
	return {
		name: p[1] || '',
		code: p[2] || fallbackCode || '',
		price: price,
		prevClose: prevClose,
		open: finite(p[5]),
		changePct: changePct,
		// 腾讯 p[6] 为手、p[37] 为万元；统一成股 / 元，避免事实块把 28 亿写成 28 万
		volume: volHands == null ? null : volHands * 100,
		amount: amountWan == null ? null : amountWan * 10000,
		turnover: finite(p[38]),
		high: finite(p[33]),
		low: finite(p[34]),
		limitUp: finite(p[47]),
		limitDown: finite(p[48]),
		source: 'TENCENT',
	};
}

export function parseEastmoneyQuote(json, fallbackCode) {
	const d = json && json.data;
	if (!d) return null;
	const price = finite(d.f2 != null ? d.f2 : d.f43);
	if (price == null || price <= 0) return null;
	return {
		name: d.f14 || d.f58 || '',
		code: String(d.f12 || fallbackCode || ''),
		price: price,
		changePct: finite(d.f3),
		volume: finite(d.f5),
		amount: finite(d.f6),
		turnover: finite(d.f8),
		limitUp: finite(d.f47),
		limitDown: finite(d.f48),
		industry: d.f127 || d.f100 || '',
		source: 'EASTMONEY',
	};
}

export function parseTencentKline(json, symbol) {
	const rows = json && json.data && json.data[symbol] && (json.data[symbol].qfqday || json.data[symbol].day);
	if (!Array.isArray(rows) || !rows.length) return null;
	return rows.slice(-15).map((k) => ({
		date: k[0],
		open: finite(k[1]),
		close: finite(k[2]),
		high: finite(k[3]),
		low: finite(k[4]),
		volume: finite(k[5]),
	})).filter((k) => k.date && k.close != null);
}

export function parseEastmoneyKline(json) {
	const rows = json && json.data && json.data.klines;
	if (!Array.isArray(rows) || !rows.length) return null;
	return rows.slice(-15).map((line) => {
		const p = String(line).split(',');
		return {
			date: p[0],
			open: finite(p[1]),
			close: finite(p[2]),
			high: finite(p[3]),
			low: finite(p[4]),
			volume: finite(p[5]),
			amount: finite(p[6]),
		};
	}).filter((k) => k.date && k.close != null);
}

export function parseMarketSentiment(json) {
	const diff = json && json.data && json.data.diff;
	const list = Array.isArray(diff) ? diff : (diff ? Object.values(diff) : []);
	if (!list.length) return null;
	const indices = list.map((item) => ({
		name: item.f14 || item.f12,
		code: item.f12,
		price: finite(item.f2),
		changePct: finite(item.f3),
		amount: finite(item.f6),
		advance: item.f104,
		decline: item.f105,
	})).filter((x) => x.name);
	if (!indices.length) return null;
	return { indices, source: 'EASTMONEY' };
}

export function parseDragonTiger(json, code) {
	const rows = json && json.result && json.result.data;
	if (!Array.isArray(rows)) return { available: false, reason: '龙虎榜接口返回非列表', items: [] };
	const want = String(code || '');
	const items = rows
		.filter((r) => !want || String(r.SECURITY_CODE || r.SECUCODE || '').indexOf(want) >= 0)
		.slice(0, 8)
		.map((r) => ({
			code: r.SECURITY_CODE,
			name: r.SECURITY_NAME_ABBR,
			date: (r.TRADE_DATE || '').slice(0, 10),
			changePct: r.CHANGE_RATE,
			netBuyYi: r.BILLBOARD_NET_AMT != null ? Math.round(parseFloat(r.BILLBOARD_NET_AMT) / 1e8 * 100) / 100 : null,
			reason: r.EXPLANATION || r.EXPLAIN || r.EXPLAINATION || '',
			buySeat: r.OPERATEDEPT_NAME_BUY || r.BUY_BOOTH || '',
			sellSeat: r.OPERATEDEPT_NAME_SELL || r.SELL_BOOTH || '',
		}));
	return {
		available: true,
		window: items.length ? (items[items.length - 1].date + ' ~ ' + items[0].date) : '',
		items: items,
		source: 'EASTMONEY',
	};
}

export function parseCompanyProfile(json) {
	const d = json && json.jbzl && json.jbzl[0];
	if (!d) return null;
	return {
		name: d.SECURITY_NAME_ABBR || d.ORG_NAME || '',
		industry: d.EM2016 || d.INDUSTRYCSRC1 || '',
		source: 'EASTMONEY-F10',
	};
}

function fmtNum(n, digits) {
	if (n == null || !Number.isFinite(n)) return '缺失';
	const d = digits == null ? 2 : digits;
	return String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
}

function fmtYi(n) {
	if (n == null || !Number.isFinite(n)) return '缺失';
	if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
	if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + ' 万';
	return String(n);
}

export function emptyFacts(code, reason) {
	return {
		code: code || '',
		fetchedAt: new Date().toISOString(),
		ok: false,
		quote: null,
		kline: null,
		limit: { status: null, knowable: false, note: '行情缺失，涨跌停未核证' },
		sector: null,
		market: null,
		dragonTiger: { available: false, reason: reason || '未拉取', items: [] },
		missing: ['最新价', '涨跌幅', '成交量/额', '涨跌停', '板块', 'K线', '龙虎榜', '大盘背景'],
		sources: [],
		error: reason || '行情拉取失败',
	};
}

export function summarizeFacts(facts) {
	const missing = [];
	if (!facts.quote || facts.quote.price == null) missing.push('最新价');
	if (!facts.quote || facts.quote.changePct == null) missing.push('涨跌幅');
	if (!facts.quote || (facts.quote.volume == null && facts.quote.amount == null)) missing.push('成交量/额');
	if (!facts.limit || !facts.limit.knowable) missing.push('涨跌停');
	if (!(facts.sector && facts.sector.industry) && !(facts.quote && facts.quote.industry)) missing.push('板块');
	if (!facts.kline || !facts.kline.length) missing.push('K线');
	if (!facts.dragonTiger || facts.dragonTiger.available !== true) missing.push('龙虎榜');
	if (!facts.market || !facts.market.indices || !facts.market.indices.length) missing.push('大盘背景');
	return missing;
}

export function formatTraderFactsBlock(facts) {
	const f = facts || emptyFacts('', '未提供事实对象');
	const code = f.code || '未知';
	const lines = [];
	lines.push('【已核证行情事实】');
	lines.push('（由工作台在提交时拉取，不是模型记忆。未列出或标「缺失」的数字禁止编造，引用时必须来自本块。）');
	lines.push('标的代码: ' + code);
	lines.push('拉取时间: ' + (f.fetchedAt || '未知'));

	if (f.quote && f.quote.price != null) {
		const q = f.quote;
		lines.push('最新价: ' + fmtNum(q.price) + (q.name ? '（' + q.name + '）' : ''));
		lines.push('涨跌幅: ' + (q.changePct == null ? '缺失' : fmtNum(q.changePct) + '%'));
		const volAmt = [];
		if (q.volume != null) volAmt.push('成交量 ' + fmtYi(q.volume));
		if (q.amount != null) volAmt.push('成交额 ' + fmtYi(q.amount));
		lines.push('量能: ' + (volAmt.length ? volAmt.join('，') : '缺失'));
		if (q.turnover != null) lines.push('换手率: ' + fmtNum(q.turnover) + '%');
		if (q.prevClose != null) lines.push('昨收: ' + fmtNum(q.prevClose));
		if (q.high != null || q.low != null) lines.push('当日高低: ' + fmtNum(q.high) + ' / ' + fmtNum(q.low));
		lines.push('行情来源: ' + (q.source || '未知'));
	} else {
		lines.push('最新价: 缺失');
		lines.push('涨跌幅: 缺失');
		lines.push('量能: 缺失');
	}

	const lim = f.limit || inferLimitStatus(f.quote);
	if (lim.knowable && lim.status) {
		lines.push('涨跌停: ' + lim.status + '（' + lim.note + '）');
	} else {
		lines.push('涨跌停: 缺失（' + (lim.note || '无法核证') + '）');
	}

	const industry = (f.sector && f.sector.industry) || (f.quote && f.quote.industry) || '';
	if (industry) {
		lines.push('板块/行业: ' + industry + (f.sector && f.sector.source ? '（' + f.sector.source + '）' : ''));
	} else {
		lines.push('板块/行业: 缺失');
	}

	if (f.market && f.market.indices && f.market.indices.length) {
		const idx = f.market.indices.map((x) => {
			const pct = x.changePct == null ? '涨跌缺失' : (fmtNum(x.changePct) + '%');
			return (x.name || x.code) + ' ' + fmtNum(x.price) + ' ' + pct;
		}).join('；');
		lines.push('大盘背景: ' + idx);
	} else {
		lines.push('大盘背景: 缺失（无指数涨跌，不得据此推荐具体买入）');
	}

	if (f.kline && f.kline.length) {
		lines.push('近 ' + f.kline.length + ' 日K线（日期 开/收/高/低/量）:');
		f.kline.forEach((k) => {
			lines.push('  ' + k.date + ' ' + fmtNum(k.open) + '/' + fmtNum(k.close) + '/' + fmtNum(k.high) + '/' + fmtNum(k.low) + '/' + (k.volume == null ? '量缺失' : fmtYi(k.volume)));
		});
	} else {
		lines.push('K线: 缺失');
	}

	const dt = f.dragonTiger;
	if (dt && dt.available === true) {
		if (!dt.items || !dt.items.length) {
			lines.push('龙虎榜: 已查询，窗口内无该标的上榜记录' + (dt.window ? '（窗口 ' + dt.window + '）' : ''));
		} else {
			lines.push('龙虎榜: 有记录' + (dt.window ? '（窗口 ' + dt.window + '）' : '') + ' 来源 ' + (dt.source || 'EASTMONEY'));
			dt.items.forEach((it) => {
				const seatBits = [];
				if (it.buySeat) seatBits.push('买席 ' + it.buySeat);
				if (it.sellSeat) seatBits.push('卖席 ' + it.sellSeat);
				if (!seatBits.length) seatBits.push('席位名称未提供（禁止编造席位）');
				lines.push('  ' + (it.date || '') + ' ' + (it.name || '') + ' 涨跌' + (it.changePct == null ? '缺失' : it.changePct + '%') + ' 净买' + (it.netBuyYi == null ? '缺失' : it.netBuyYi + '亿') + ' ' + (it.reason || '') + ' ' + seatBits.join('，'));
			});
		}
	} else {
		lines.push('龙虎榜: 缺失（' + ((dt && dt.reason) || '本次未能从本应用已接入的东财龙虎榜接口取得') + '）。禁止编造席位名称或上榜事实。');
	}

	const missing = (f.missing && f.missing.length) ? f.missing : summarizeFacts(f);
	lines.push('缺失字段: ' + (missing.length ? missing.join('、') : '无'));
	if (f.error) lines.push('拉取备注: ' + f.error);
	if (!f.quote || f.quote.price == null) {
		lines.push('硬约束: 核证行情缺失，模型不得给出具体买入价位或仓位操作建议，只能说明缺什么、为什么不能下具体买点。');
	} else if (!f.market || !f.market.indices || !f.market.indices.length) {
		lines.push('硬约束: 大盘/情绪背景缺失，模型不得推荐具体买入。');
	}
	return lines.join('\n');
}

function withTimeout(promise, ms, label) {
	return new Promise((resolve) => {
		let done = false;
		const timer = setTimeout(() => {
			if (done) return;
			done = true;
			resolve({ ok: false, error: (label || '请求') + '超时' });
		}, ms);
		Promise.resolve(promise).then((value) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve({ ok: true, value: value });
		}, (err) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve({ ok: false, error: (err && err.message) ? err.message : String(err) });
		});
	});
}

const EM_HEADERS = { Referer: 'https://quote.eastmoney.com/' };

async function httpJson(url, fetchFn, timeoutMs, headers) {
	if (!fetchFn) return { ok: false, error: '无 fetch' };
	const raced = await withTimeout(fetchFn(url, { method: 'GET', headers: headers || {} }), timeoutMs || 5000, url);
	if (!raced.ok) return raced;
	const res = raced.value;
	if (!res || !res.ok) return { ok: false, error: 'HTTP ' + ((res && res.status) || '?') };
	try {
		return { ok: true, value: await res.json() };
	} catch (e) {
		return { ok: false, error: 'JSON 解析失败' };
	}
}

async function httpText(url, fetchFn, timeoutMs, gbk) {
	if (!fetchFn) return { ok: false, error: '无 fetch' };
	const raced = await withTimeout(fetchFn(url, { method: 'GET' }), timeoutMs || 5000, url);
	if (!raced.ok) return raced;
	const res = raced.value;
	if (!res || !res.ok) return { ok: false, error: 'HTTP ' + ((res && res.status) || '?') };
	try {
		if (typeof res.arrayBuffer === 'function') {
			const buf = await res.arrayBuffer();
			const bytes = new Uint8Array(buf);
			if (gbk) {
				try { return { ok: true, value: new TextDecoder('gbk').decode(bytes) }; } catch (e) { /* 部分运行时无 gbk */ }
			}
			try { return { ok: true, value: new TextDecoder('utf-8').decode(bytes) }; } catch (e) {}
		}
		if (typeof res.text === 'function') return { ok: true, value: await res.text() };
		return { ok: false, error: '文本读取失败' };
	} catch (e) {
		return { ok: false, error: '文本读取失败' };
	}
}

function tencentSymbol(code) {
	if (isUSTicker(code)) return 'us' + String(code).toLowerCase();
	return marketPrefix(code) + code;
}

/**
 * 拉取核证事实。opts: { fetch, jsonp, timeoutMs }
 * jsonp(url) 可选，签名与侧栏 jsonpGet 相同，用于绕开 CORS。
 */
export async function fetchTraderFacts(code, opts) {
	const options = opts || {};
	const fetchFn = options.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
	const jsonpFn = options.jsonp;
	const timeoutMs = options.timeoutMs || 5500;
	const raw = normalizeCode(code);
	if (!raw) return emptyFacts('', '未提供股票代码，无法拉取行情');

	const facts = emptyFacts(raw, '');
	facts.error = '';
	facts.missing = [];
	facts.ok = false;
	const sources = [];

	const tryJsonp = async (url) => {
		if (typeof jsonpFn !== 'function') return { ok: false, error: '无 JSONP' };
		const raced = await withTimeout(jsonpFn(url, timeoutMs), timeoutMs + 500, 'jsonp');
		if (!raced.ok) return raced;
		return { ok: true, value: raced.value };
	};

	const quoteJobs = [];
	if (isAShareCode(raw)) {
		quoteJobs.push((async () => {
			const url = 'https://qt.gtimg.cn/q=' + tencentSymbol(raw);
			const t = await httpText(url, fetchFn, timeoutMs, true);
			if (t.ok) {
				const q = parseTencentQuote(t.value, raw);
				if (q) return q;
			}
			const jp = await tryJsonp(url);
			if (jp.ok) {
				const text = typeof jp.value === 'string' ? jp.value : JSON.stringify(jp.value);
				const q = parseTencentQuote(text, raw);
				if (q) return q;
			}
			return null;
		})());
		quoteJobs.push((async () => {
			const url = 'https://push2.eastmoney.com/api/qt/stock/get?fltt=2&invt=2&secid=' + eastmoneySecid(raw)
				+ '&fields=f2,f3,f5,f6,f8,f12,f14,f47,f48,f100,f127,f152';
			const j = await httpJson(url, fetchFn, timeoutMs, EM_HEADERS);
			if (j.ok) {
				const q = parseEastmoneyQuote(j.value, raw);
				if (q) return q;
			}
			const jp = await tryJsonp(url);
			if (jp.ok) {
				const q = parseEastmoneyQuote(jp.value, raw);
				if (q) return q;
			}
			return null;
		})());
	} else if (isUSTicker(raw)) {
		quoteJobs.push((async () => {
			const url = 'https://qt.gtimg.cn/q=us' + raw.toLowerCase();
			const t = await httpText(url, fetchFn, timeoutMs, true);
			if (t.ok) {
				const q = parseTencentQuote(t.value, raw);
				if (q) return q;
			}
			return null;
		})());
	}

	const klineJob = (async () => {
		if (!isAShareCode(raw)) return null;
		const symbol = tencentSymbol(raw);
		const url = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=' + symbol + ',day,,,15,qfq';
		const j = await httpJson(url, fetchFn, timeoutMs);
		if (j.ok) return parseTencentKline(j.value, symbol);
		const em = 'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=' + eastmoneySecid(raw)
			+ '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=101&fqt=1&end=20500101&lmt=15';
		const e = await httpJson(em, fetchFn, timeoutMs, EM_HEADERS);
		if (e.ok) return parseEastmoneyKline(e.value);
		return null;
	})();

	const marketJob = (async () => {
		const urls = [
			'https://push2delay.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f6,f12,f14,f104,f105,f106&secids=1.000001,0.399001,0.399006',
			'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&fields=f2,f3,f6,f12,f14,f104,f105,f106&secids=1.000001,0.399001,0.399006',
		];
		for (let i = 0; i < urls.length; i++) {
			const j = await httpJson(urls[i], fetchFn, timeoutMs, EM_HEADERS);
			if (j.ok) {
				const parsed = parseMarketSentiment(j.value);
				if (parsed) return parsed;
			}
		}
		const jp = await tryJsonp(urls[0]);
		if (jp.ok) return parseMarketSentiment(jp.value);
		const tx = await httpText('https://qt.gtimg.cn/q=sh000001,sz399001,sz399006', fetchFn, timeoutMs, true);
		if (tx.ok && tx.value) {
			const parts = String(tx.value).split(';').map((s) => parseTencentQuote(s)).filter(Boolean);
			if (parts.length) {
				return {
					indices: parts.map((q) => ({ name: q.name, code: q.code, price: q.price, changePct: q.changePct })),
					source: 'TENCENT',
				};
			}
		}
		return null;
	})();

	const profileJob = (async () => {
		if (!isAShareCode(raw)) return null;
		const mkt = /^[69]/.test(raw) ? 'SH' : 'SZ';
		const url = 'https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=' + mkt + raw;
		const j = await httpJson(url, fetchFn, timeoutMs, { Referer: 'https://emweb.securities.eastmoney.com/' });
		if (j.ok) return parseCompanyProfile(j.value);
		return null;
	})();

	const dtJob = (async () => {
		if (!isAShareCode(raw)) {
			return { available: false, reason: '非A股，龙虎榜不适用', items: [] };
		}
		const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
		const params = 'reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&filter='
			+ encodeURIComponent("(TRADE_DATE>='" + start + "')(SECURITY_CODE=\"" + raw + "\")")
			+ '&pageSize=10&sortTypes=-1&sortColumns=TRADE_DATE&source=WEB&client=WEB';
		const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?' + params;
		const j = await httpJson(url, fetchFn, 6000, { Referer: 'https://data.eastmoney.com/' });
		if (j.ok) {
			const parsed = parseDragonTiger(j.value, raw);
			if (parsed.available) {
				if (!parsed.window) parsed.window = start + ' 起近 7 日';
				return parsed;
			}
		}
		const fallback = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&filter='
			+ encodeURIComponent("(TRADE_DATE>='" + start + "')")
			+ '&pageSize=50&sortTypes=-1&sortColumns=TRADE_DATE&source=WEB&client=WEB';
		const j2 = await httpJson(fallback, fetchFn, 6000, { Referer: 'https://data.eastmoney.com/' });
		if (j2.ok) {
			const parsed = parseDragonTiger(j2.value, raw);
			parsed.window = start + ' 起近 7 日';
			if (parsed.available) return parsed;
		}
		return { available: false, reason: '东财龙虎榜接口不可达或被跨域拦截', items: [] };
	})();

	const quoteSettled = await Promise.all(quoteJobs.map((p) => p.catch(() => null)));
	facts.quote = quoteSettled.find((q) => q && q.price != null) || null;
	if (facts.quote) sources.push(facts.quote.source);

	const extra = await Promise.all([
		klineJob.catch(() => null),
		marketJob.catch(() => null),
		profileJob.catch(() => null),
		dtJob.catch(() => ({ available: false, reason: '龙虎榜拉取异常', items: [] })),
	]);
	facts.kline = extra[0] || null;
	facts.market = extra[1] || null;
	facts.sector = extra[2] || (facts.quote && facts.quote.industry ? { industry: facts.quote.industry, source: facts.quote.source } : null);
	facts.dragonTiger = extra[3] || { available: false, reason: '未拉取', items: [] };

	if (facts.kline && facts.kline.length) sources.push('TENCENT-KLINE/EASTMONEY-KLINE');
	if (facts.market) sources.push('EASTMONEY-INDEX');
	if (facts.sector && facts.sector.source) sources.push(facts.sector.source);
	if (facts.dragonTiger && facts.dragonTiger.available) sources.push('EASTMONEY-LHB');

	facts.limit = inferLimitStatus(facts.quote);
	if (!isAShareCode(raw)) {
		if (!facts.limit.knowable) {
			facts.limit = { status: null, knowable: false, note: '非A股，不适用A股涨跌停制度' };
		}
	}
	facts.sources = sources;
	facts.missing = summarizeFacts(facts);
	facts.ok = !!(facts.quote && facts.quote.price != null);
	if (!facts.ok) facts.error = facts.error || '实时行情五源/东财均未返回有效最新价';
	return facts;
}

export async function collectTraderFactsBlock(code, opts) {
	try {
		const facts = await fetchTraderFacts(code, opts);
		return formatTraderFactsBlock(facts);
	} catch (e) {
		return formatTraderFactsBlock(emptyFacts(code, (e && e.message) ? e.message : String(e)));
	}
}
