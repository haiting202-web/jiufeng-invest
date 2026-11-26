/**
 * 游资多专家研判 Step 1 单测：人格契约、事实格式化、缺失路径、发送仍一次 prompt。
 * 跑法：node test-trader-consultation.mjs
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = import.meta.dirname;

let pass = 0;
let fail = 0;
const ok = (label, cond, extra) => {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + extra : '')); }
};

const facts = await import(pathToFileURL(ROOT + '/runtime/trader-facts.js').href);
const data = JSON.parse(readFileSync(ROOT + '/skills-data.json', 'utf8'));
const skill = data.skills.find((s) => s.id === 'trader-consultation');
const prompt = skill && skill.prompt ? skill.prompt : '';
const skillMd = readFileSync(ROOT + '/../agent-preset/ai-finance/skills/trader-consultation/SKILL.md', 'utf8');
const gen = readFileSync(ROOT + '/gen-client.mjs', 'utf8');
const client = readFileSync(ROOT + '/client/client.js', 'utf8');

console.log('── skills-data.json 提示词（侧栏真源）──');
ok('存在 trader-consultation', !!skill);
ok('prompt 远长于旧版一句话标签（>2000 字）', prompt.length > 2000, prompt.length);
ok('含 Asking 完整方法论', prompt.includes('市场合力') && prompt.includes('半仓试错'));
ok('含炒股养家情绪周期', prompt.includes('发酵期') && prompt.includes('养家心法'));
ok('含 92 科比三大模式', prompt.includes('反包二板') && prompt.includes('不碰中位股'));
ok('含陈小群总龙头', prompt.includes('买在分歧') && prompt.includes('空仓是最高级技能'));
ok('含涅槃重升/涅槃重生', prompt.includes('涅槃重升') && prompt.includes('涅槃重生') && prompt.includes('树干'));
ok('含著名刺客高前三', prompt.includes('高前三') && prompt.includes('20日线'));
ok('含利弗莫尔关键点', prompt.includes('最小阻力线') && prompt.includes('金字塔加仓'));
ok('含缠论三类买卖点', prompt.includes('走势终完美') && prompt.includes('第三类买点'));
ok('未扩张到 23 游资名单', !/赵老哥|徐晓|章盟主|方新侠/.test(prompt));
ok('硬规则：无行情不得具体买入', prompt.includes('不得给出具体买入') || prompt.includes('不下具体买点'));
ok('硬规则：大盘缺失不得推荐买入', prompt.includes('大盘') && prompt.includes('不得推荐具体买入'));
ok('硬规则：禁止编造席位/涨停', prompt.includes('禁止编造') && prompt.includes('席位'));
ok('输出契约含买点/仓位/止损/证伪', ['买点', '仓位', '止损', '证伪'].every((k) => prompt.includes(k)));
ok('输出契约含依据/风险/缺失信息', ['依据', '风险', '缺失信息'].every((k) => prompt.includes(k)));
ok('未核证标记', prompt.includes('未核证'));
ok('仍是一次模型调用', prompt.includes('一次模型调用') && prompt.includes('禁止') && (prompt.includes('快评') || prompt.includes('第二轮')));
ok('保留免责声明', prompt.includes('不构成任何投资建议') && prompt.includes('股市有风险'));
ok('先市场后个股', prompt.includes('先判断市场') && prompt.includes('再判断个股'));

console.log('\n── SKILL.md 同步契约 ──');
ok('SKILL.md 禁止额外模型轮次', skillMd.includes('一次模型调用') && skillMd.includes('禁止'));
ok('SKILL.md 含买点/证伪/缺失信息', ['买点', '证伪', '缺失信息', '未核证'].every((k) => skillMd.includes(k)));
ok('SKILL.md 以注入事实为准', skillMd.includes('【已核证行情事实】'));
ok('SKILL.md 仍含六位游资+两套择时', ['Asking', '炒股养家', '92科比', '陈小群', '涅槃重升', '著名刺客', '利弗莫尔', '缠论'].every((k) => skillMd.includes(k)));

console.log('\n── 代码解析 / 涨跌停推断 ──');
ok('extractStockCode 从表单对象取值', facts.extractStockCode({ name: '茅台', code: '600519' }) === '600519');
ok('extractStockCode 从「贵州茅台 (600519)」取值', facts.extractStockCode('贵州茅台 (600519)') === '600519');
ok('主板默认 10%', facts.boardLimitPercent('600519') === 10);
ok('创业板默认 20%', facts.boardLimitPercent('300418') === 20);
ok('科创板默认 20%', facts.boardLimitPercent('688981') === 20);

const tx = 'v_sh600519="1~贵州茅台~600519~1411.00~1400.00~1405.00~123456~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~0~11.00~0.79~1420~1400~0~1000~88888.00~0.50~0~0~0~0~0~0~0~0~1552.10~1269.00"';
const q = facts.parseTencentQuote(tx, '600519');
ok('parseTencentQuote 解析最新价', q && q.price === 1411 && q.name.includes('茅台'));
ok('parseTencentQuote 解析涨停价', q && q.limitUp === 1552.1 && q.limitDown === 1269);
ok('腾讯成交额按万元转成元', q && q.amount === 888880000);

const atLimit = facts.inferLimitStatus({ price: 1552.1, limitUp: 1552.1, limitDown: 1269 });
ok('有官方涨停价且触及 → 涨停', atLimit.status === '涨停' && atLimit.knowable === true);
const noLimitPx = facts.inferLimitStatus({ price: 11, changePct: 10.01 });
ok('无官方涨停价不宣称涨停', noLimitPx.knowable === false && !noLimitPx.status);
const mid = facts.inferLimitStatus({ price: 1411, limitUp: 1552.1, limitDown: 1269 });
ok('未触及涨跌停 → 未涨跌停', mid.status === '未涨跌停');

console.log('\n── 事实块：成功路径与缺失路径 ──');
const good = {
	code: '600519',
	fetchedAt: '2026-11-26T00:00:00.000Z',
	ok: true,
	quote: { name: '贵州茅台', price: 1411, changePct: 0.79, volume: 1e6, amount: 8.8e8, turnover: 0.5, source: 'TENCENT', industry: '白酒' },
	limit: { status: '未涨跌停', knowable: true, note: '最新价 1411，涨停价 1552.1' },
	kline: [{ date: '2026-11-25', open: 1400, close: 1411, high: 1420, low: 1399, volume: 1e6 }],
	sector: { industry: '白酒', source: 'EASTMONEY-F10' },
	market: { indices: [{ name: '上证指数', price: 3900, changePct: 0.4 }] },
	dragonTiger: { available: true, window: '2026-11-20 ~ 2026-11-25', source: 'EASTMONEY', items: [] },
	missing: [],
	sources: ['TENCENT'],
};
const goodBlock = facts.formatTraderFactsBlock(good);
ok('成功块含已核证标题', goodBlock.includes('【已核证行情事实】'));
ok('成功块含最新价与涨跌幅', goodBlock.includes('1411') && goodBlock.includes('0.79%'));
ok('成功块含量能', goodBlock.includes('成交额') || goodBlock.includes('成交量'));
ok('成功块含涨跌停', goodBlock.includes('未涨跌停'));
ok('成功块含板块', goodBlock.includes('白酒'));
ok('成功块含K线', goodBlock.includes('2026-11-25'));
ok('成功块含大盘', goodBlock.includes('上证指数'));
ok('龙虎榜已查询无上榜不编造席位', goodBlock.includes('无该标的上榜'));

const bad = facts.emptyFacts('600519', '五源均不可用');
const badBlock = facts.formatTraderFactsBlock(bad);
ok('失败块声明缺失', badBlock.includes('缺失') && badBlock.includes('最新价'));
ok('失败块禁止具体买入', badBlock.includes('不得给出具体买入') || badBlock.includes('核证行情缺失'));
ok('失败块禁止编造席位', badBlock.includes('禁止编造席位'));
ok('失败块含龙虎榜缺失原因', badBlock.includes('龙虎榜'));

const dtMissing = facts.formatTraderFactsBlock({
	...good,
	dragonTiger: { available: false, reason: '东财龙虎榜接口不可达或被跨域拦截', items: [] },
	missing: ['龙虎榜'],
});
ok('龙虎榜不可达时说清楚', dtMissing.includes('未能') || dtMissing.includes('不可达') || dtMissing.includes('跨域'));

console.log('\n── fetchTraderFacts mock：成功 / 全失败 ──');
const mockOk = async (url) => {
	const u = String(url);
	if (u.includes('qt.gtimg.cn')) {
		return { ok: true, text: async () => tx };
	}
	if (u.includes('fqkline')) {
		return { ok: true, json: async () => ({ data: { sh600519: { qfqday: [['2026-11-25', '1400', '1411', '1420', '1399', '1000']] } } }) };
	}
	if (u.includes('ulist.np')) {
		return { ok: true, json: async () => ({ data: { diff: [{ f12: '000001', f14: '上证指数', f2: 3900, f3: 0.4 }] } }) };
	}
	if (u.includes('CompanySurvey')) {
		return { ok: true, json: async () => ({ jbzl: [{ SECURITY_NAME_ABBR: '贵州茅台', EM2016: '白酒' }] }) };
	}
	if (u.includes('DAILYBILLBOARD')) {
		return { ok: true, json: async () => ({ result: { data: [] } }) };
	}
	if (u.includes('push2.eastmoney.com/api/qt/stock/get')) {
		return { ok: true, json: async () => ({ data: { f2: 1411, f3: 0.79, f5: 1000, f6: 8.8e8, f12: '600519', f14: '贵州茅台', f47: 1552.1, f48: 1269, f127: '白酒' } }) };
	}
	return { ok: false, status: 404 };
};
const fetched = await facts.fetchTraderFacts('600519', { fetch: mockOk, timeoutMs: 2000 });
ok('mock 拉取到最新价', fetched.ok && fetched.quote && fetched.quote.price === 1411);
ok('mock 涨跌停可核证', fetched.limit && fetched.limit.knowable);
ok('mock 有 K 线', fetched.kline && fetched.kline.length === 1);
ok('mock 有大盘', fetched.market && fetched.market.indices.length >= 1);
ok('mock 板块白酒', fetched.sector && fetched.sector.industry === '白酒');
ok('mock 龙虎榜 available（空记录也算查到）', fetched.dragonTiger && fetched.dragonTiger.available === true);

const mockFail = async () => ({ ok: false, status: 500 });
const failed = await facts.fetchTraderFacts('600519', { fetch: mockFail, timeoutMs: 200 });
ok('全部失败仍返回对象且无价格', failed && !failed.ok && !(failed.quote && failed.quote.price));
const failedBlock = facts.formatTraderFactsBlock(failed);
ok('失败路径写入硬约束', failedBlock.includes('核证行情缺失') || failedBlock.includes('不得给出具体买入'));
ok('无代码时明确缺失', facts.formatTraderFactsBlock(await facts.fetchTraderFacts('', { fetch: mockFail })).includes('未提供股票代码'));

console.log('\n── 会诊发送路径：仍一次模型调用 ──');
ok('gen-client 在 submit 注入事实', gen.includes('injectTraderFactsIfNeeded(skill, form, content)'));
ok('gen-client 仍只调用一次 sendConsultation', (gen.match(/await sendConsultation\(/g) || []).length === 1);
ok('sendConsultation 仍一次 session.prompt', gen.includes('await session.prompt([') && !gen.includes('for (const trader'));
ok('client.js 含 injectTraderFactsIfNeeded', client.includes('function injectTraderFactsIfNeeded'));
ok('client.js 含已核证行情事实', client.includes('【已核证行情事实】'));
ok('client.js 游资专家仍路由到 trader-consultation', client.includes('expert.id === "trader"') && client.includes('findSkill("trader-consultation")'));
ok('build-persona-skills 读取完整 prompt 文件', readFileSync(ROOT + '/build-persona-skills.py', 'utf8').includes('trader-consultation-prompt.md'));

console.log('\n── client.js 内嵌技能 prompt ──');
ok('产物 ALL_SKILLS 含完整 Asking 人格', client.includes('市场合力') && client.includes('半仓试错'));
ok('产物含输出契约证伪', client.includes('证伪') && client.includes('缺失信息'));

console.log('\n' + '='.repeat(48));
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(48));
process.exit(fail === 0 ? 0 : 1);
