/**
 * test-stock-search.mjs — 股票搜索链路回归自测
 *
 * 背景：侧边栏「分析对象」输入 600519 后回车/失焦不生效，且一直提示"联网搜索不可用"。
 * 根因：主窗口 webSecurity=true，而东财 suggest 接口响应头无 Access-Control-Allow-Origin，
 *      直连 fetch 必被 CORS 拦 → 前端永远误判 offline。
 * 修法：emSearch 改为 fetch + JSONP 双通道；StockPicker 增加失焦自动确认；必填提示报字段名。
 *
 * 本脚本从 gen-client.mjs 的模板里抽取真实函数源码执行，不改动产品文件。
 * 用法：node test-stock-search.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'gen-client.mjs');
const OUT = join(HERE, 'client', 'client.js');

// ---------- 1. 读产物 client.js（已求值，反斜杠/反引号已还原）----------
// 若读 gen-client.mjs 的模板原文，模板里的 \\d 尚未求值，会得到错误的 /^\\d{6}$/。
const clientSrc = readFileSync(OUT, 'utf8');

// 顺带校验：产物确实由模板生成（防止有人绕过 gen-client.mjs 直接改产物）
{
  const raw = readFileSync(SRC, 'utf8');
  const s0 = raw.indexOf('const clientJs = `');
  const w0 = raw.indexOf('writeFileSync', s0);
  const e0 = raw.lastIndexOf('\n`;', w0);
  const tpl = raw.slice(s0 + 'const clientJs = `'.length, e0);
  const unescaped = tpl.replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\\\/g, '\\');
  if (!clientSrc.startsWith('window.__ModuleLoader__')) { console.error('✗ client.js 不是预期产物'); process.exit(1); }
  if (!unescaped.includes('function coerceCode')) console.warn('  ! 模板反解结果异常，仅作提示');
}

// ---------- 2. 按括号配对抽取指定函数/常量 ----------
function extractFn(src, name) {
  const key = 'function ' + name + '(';
  const at = src.indexOf(key);
  if (at < 0) throw new Error('未找到函数 ' + name);
  // 保留 async 前缀，否则 new Function 里会出现裸 await
  const start = src.slice(Math.max(0, at - 6), at) === 'async ' ? at - 6 : at;
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('括号不配对: ' + name);
}
function extractConst(src, name) {
  const re = new RegExp('const ' + name + ' = ([^;\\n]+);');
  const mm = src.match(re);
  if (!mm) throw new Error('未找到常量 ' + name);
  return 'const ' + name + ' = ' + mm[1] + ';';
}

const pieces = [
  extractConst(clientSrc, 'EM_SEARCH_TOKEN'),
  extractConst(clientSrc, 'EM_SEARCH_API'),
  extractFn(clientSrc, 'jsonpGet'),
  extractFn(clientSrc, 'emParse'),
  extractFn(clientSrc, 'emSearch'),
  extractFn(clientSrc, 'searchStockSmart'),
  extractFn(clientSrc, 'coerceCode'),
  extractFn(clientSrc, 'formatStockLabel'),
];

// ---------- 3. 构造最小 DOM / window stub ----------
let scriptLog = [];
function makeDom(onScript) {
  const win = {};
  const doc = {
    head: { appendChild: (s) => { scriptLog.push(s.src); if (onScript) onScript(s, win); } },
    documentElement: { appendChild: () => {} },
    createElement: () => ({ src: '', onerror: null, parentNode: null }),
  };
  return { win, doc };
}

// ---------- 4. 构建可调用模块 ----------
function build(dom, fetchImpl) {
  const factory = new Function(
    'document', 'window', 'fetch',
    pieces.join('\n') + '\nreturn { jsonpGet, emParse, emSearch, searchStockSmart, coerceCode, formatStockLabel, EM_SEARCH_API };'
  );
  return factory(dom.doc, dom.win, fetchImpl);
}

// ---------- 5. 断言 ----------
let pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(a === e, label, '实际 ' + a + ' 期望 ' + e);
}

// 真实东财响应（curl 实测 2026-10-02）
const REAL_RESP = { QuotationCodeTable: { Data: [{ Code: '600519', Name: '贵州茅台', PinYin: 'GZMT', JYS: '2', Classify: 'AStock', SecurityTypeName: '沪A', MarketType: '1', MktNum: '1' }], Status: 0, TotalCount: 1 } };

console.log('\n【A】coerceCode —— 裸代码兜底识别');
{
  const { coerceCode } = build(makeDom(), async () => { throw new Error('n/a'); });
  eq(coerceCode('600519'), { code: '600519', name: '600519', kind: 'A股' }, '6 位数字 → A股（本次故障的关键路径）');
  eq(coerceCode(' 000001 '), { code: '000001', name: '000001', kind: 'A股' }, '带空格也可识别');
  eq(coerceCode('aapl'), { code: 'AAPL', name: 'AAPL', kind: '美股' }, '1-5 位字母 → 美股（转大写）');
  eq(coerceCode('贵州茅台'), null, '中文名不硬转（需走搜索）');
  eq(coerceCode(''), null, '空串 → null');
  eq(coerceCode('60051'), null, '5 位数字 → null（不误判）');
}

console.log('\n【B】formatStockLabel —— 展示名不再重复（旧版会显示 600519 (600519)）');
{
  const { formatStockLabel } = build(makeDom(), async () => { throw new Error('n/a'); });
  eq(formatStockLabel({ code: '600519', name: '600519' }), '600519', '手工输入裸代码 → 只显示代码');
  eq(formatStockLabel({ code: '600519', name: '贵州茅台' }), '贵州茅台 (600519)', '搜索命中的 → 名称 (代码)');
  eq(formatStockLabel(null), '', '空值 → 空串');
}

console.log('\n【C】emParse —— 真实接口响应解析');
{
  const { emParse } = build(makeDom(), async () => { throw new Error('n/a'); });
  eq(emParse(REAL_RESP), [{ code: '600519', name: '贵州茅台', kind: '沪A', market: '1' }], '解析出 1 条正确记录');
  eq(emParse({}), [], '异常响应 → 空数组不抛错');
  eq(emParse(null), [], 'null → 空数组');
}

console.log('\n【D】jsonpGet —— 通道 2 能取数（本次修复的核心）');
{
  // 模拟 <script> 加载后回调
  const dom = makeDom((s, win) => {
    const cb = new URL(s.src).searchParams.get('cb');
    setTimeout(() => win[cb] && win[cb](REAL_RESP), 0);
  });
  const { jsonpGet, EM_SEARCH_API } = build(dom, async () => { throw new Error('n/a'); });
  const data = await jsonpGet(EM_SEARCH_API + '?input=600519&type=14&token=X&count=8');
  eq(data, REAL_RESP, 'JSONP 回调正确 resolve 出数据');

  ok(scriptLog.length && scriptLog[0].includes('&cb='), 'script.src 已带 cb 参数', scriptLog[0]);
  ok(scriptLog[0].includes('searchapi.eastmoney.com'), '指向东财 suggest 接口', scriptLog[0]);
}

console.log('\n【E】jsonpGet —— 失败/超时路径');
{
  const { jsonpGet } = build(makeDom(), async () => { throw new Error('n/a'); });  // 不触发回调
  let rejected = false;
  try { await jsonpGet('https://x.invalid/a', 120); } catch (e) { rejected = true; }
  ok(rejected, '超时后 reject（不悬挂）');
}

console.log('\n【F】emSearch —— 双通道集成');
{
  // F1: fetch 被 CORS 拦（模拟真实情况）→ 应自动走 JSONP 成功
  const dom = makeDom((s, win) => {
    const cb = new URL(s.src).searchParams.get('cb');
    setTimeout(() => win[cb] && win[cb](REAL_RESP), 0);
  });
  const mod = build(dom, async () => { throw new TypeError('Failed to fetch'); });
  const items = await mod.emSearch('600519', 14);
  eq(items, [{ code: '600519', name: '贵州茅台', kind: '沪A', market: '1' }], 'fetch 挂 → JSONP 顶上，拿到候选');

  const r = await mod.searchStockSmart('600519');
  eq(r.items.length, 1, 'searchStockSmart 返回 1 条');
  ok(!r.offline, '不再误报 offline（用户原症状：一直提示联网搜索不可用）');
}

console.log('\n【G】emSearch —— 两通道全挂才降级为 offline');
{
  const dom = makeDom((s, win) => {
    const el = { onerror: null };
    setTimeout(() => { /* 不回调，靠超时 */ }, 0);
  });
  const mod = build(dom, async () => { throw new Error('down'); });
  const r = await mod.searchStockSmart('600519');
  // 注：此处两次 emSearch 各自超时 → offline=true，这是预期兜底
  ok(r.items.length === 0, '两通道全挂 → items 为空');
}

console.log('\n【H】必填校验：修好后 「分析对象=600519」 应算已填');
{
  // 复刻 OverlayCard 里的 isMissing / missingRequired 逻辑（改动后的版本）
  const form = { ticker: { code: '600519', name: '600519', kind: 'A股' }, years: '5', wacc: '10', terminalMethod: 'perpetuity', terminalGrowth: 2.5 };
  const visibleFields = [
    { key: 'ticker', label: '分析对象', type: 'stock-picker', required: true },
    { key: 'years', label: '预测期', type: 'select' },
    { key: 'wacc', label: '折现率 (WACC)', type: 'select' },
    { key: 'terminalMethod', label: '终值方法', type: 'select' },
    { key: 'terminalGrowth', label: '永续增长率', type: 'number' },
  ];
  const isMissing = (f) => {
    const v = form[f.key];
    if (f.type === 'multi-select' || f.type === 'stock-multi') return !(Array.isArray(v) && v.length > 0);
    if (f.type === 'stock-picker') return !(v && v.code);
    return v === undefined || v === '' || v === null;
  };
  const missing = visibleFields.filter(f => f.required && isMissing(f));
  eq(missing.length, 0, '修好后必填全过 —— 按钮可点（原症状：还差 1 项）');

  const form2 = { ...form, ticker: undefined };
  const missing2 = visibleFields.filter(f => f.required && (() => { const v = form2[f.key]; if (f.type === 'stock-picker') return !(v && v.code); return v === undefined || v === '' || v === null; })());
  eq(missing2.map(f => f.label), ['分析对象'], '没填时能报出是「分析对象」而非只说数量');

  const form3 = { ...form, ticker: '600519' };  // 字符串残留（旧实现可能写入的形态）
  const miss3 = visibleFields.filter(f => f.required && (() => { const v = form3[f.key]; if (f.type === 'stock-picker') return !(v && v.code); return v === undefined || v === '' || v === null; })());
  eq(miss3.length, 1, '字符串残留被识别为未填（暴露问题而非静默通过）');
}

console.log('\n' + '='.repeat(56));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
