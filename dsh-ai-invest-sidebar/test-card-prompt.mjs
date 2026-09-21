// 从生成的 client.js 中提取 buildCardPrompt / displayValueOf 做逻辑单测
import { readFileSync } from 'node:fs';
const f = readFileSync(`${import.meta.dirname}/client/client.js`, 'utf8');

// 抽取两个函数的源码
function grab(name) {
  const marker = 'function ' + name + '(';
  const s = f.indexOf(marker);
  if (s === -1) throw new Error('未找到 ' + name);
  let depth = 0, i = f.indexOf('{', s), started = false;
  while (i < f.length) {
    const c = f[i];
    if (c === '{') { depth++; started = true; }
    else if (c === '}') { depth--; if (started && depth === 0) return f.slice(s, i + 1); }
    i++;
  }
  throw new Error('括号未闭合 ' + name);
}

const code = grab('optionLabel') + '\n' + grab('displayValueOf') + '\n' + grab('buildCardPrompt');
const { buildCardPrompt } = new Function(code + '\nreturn { buildCardPrompt };')();

// 取真实的 china-dcf-model / stock-comparison schema
const idx = f.indexOf('const ALL_SKILLS = ');
const start = f.indexOf('[', idx);
let depth = 0, i = start, inStr = false, esc = false, q = '';
while (i < f.length) {
  const c = f[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; }
  else {
    if (c === '"' || c === "'") { inStr = true; q = c; }
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) break; }
  }
  i++;
}
const arr = JSON.parse(f.slice(start, i + 1));
const skillOf = (id) => arr.find(s => s.id === id);

console.log('════════ 测试 1：A股DCF估值模型（含 dependsOn 条件字段）════════');
const dcf = skillOf('china-dcf-model');
const dcfForm = {
  ticker: { name: '贵州茅台', code: '600519' },
  years: '5',
  rfRate: 'cn10y',
  erp: '6.0',
  taxRate: '25',
  terminalMethod: 'perpetuity',
  terminalGrowth: 2.5,
};
// 只看永续增长法时可见的字段
const dcfVisible = dcf.inputSchema.filter(fl => !fl.dependsOn || dcfForm[fl.dependsOn.key] === fl.dependsOn.value);
console.log(buildCardPrompt(dcf, dcfForm, dcfVisible));
console.log('\n可见字段数:', dcfVisible.length, '（totalMethod=perpetuity → 应隐藏 exitMultiple）');
console.log('是否隐藏 exitMultiple:', !dcfVisible.some(x => x.key === 'exitMultiple') ? '✓ 是' : '✗ 否');

console.log('\n════════ 测试 2：切换为退出倍数法 ════════');
const dcfForm2 = { ...dcfForm, terminalMethod: 'exit', exitMultiple: 12 };
const dcfVisible2 = dcf.inputSchema.filter(fl => !fl.dependsOn || dcfForm2[fl.dependsOn.key] === fl.dependsOn.value);
console.log(buildCardPrompt(dcf, dcfForm2, dcfVisible2));
console.log('\n是否显示 exitMultiple:', dcfVisible2.some(x => x.key === 'exitMultiple') ? '✓ 是' : '✗ 否');
console.log('是否隐藏 terminalGrowth:', !dcfVisible2.some(x => x.key === 'terminalGrowth') ? '✓ 是' : '✗ 否');

console.log('\n════════ 测试 3：多股票横向对比（stock-multi + multi-select）════════');
const cmp = skillOf('stock-comparison');
const cmpForm = {
  tickers: [
    { name: '贵州茅台', code: '600519' },
    { name: '五粮液', code: '000858' },
    { name: '泸州老窖', code: '000568' },
  ],
  dimensions: ['valuation', 'growth', 'profitability'],
  period: '2025年报',
};
console.log(buildCardPrompt(cmp, cmpForm, cmp.inputSchema));

console.log('\n════════ 测试 4：技术面综合分析（multi-select 默认全选）════════');
const ta = skillOf('technical-analysis');
const taForm = {
  tickers: [{ name: '宁德时代', code: '300750' }],
  period: 'daily',
  range: '6m',
  indicators: ['ma', 'macd', 'volume'],
};
console.log(buildCardPrompt(ta, taForm, ta.inputSchema));

console.log('\n════════ 测试 5：美股财报分析（来自 WEB 的卡片）════════');
const ea = skillOf('earnings-analysis');
console.log(buildCardPrompt(ea, { ticker: { name: 'Apple Inc', code: 'AAPL' }, quarter: '2025Q4' }, ea.inputSchema));

console.log('\n════════ 测试 6：空值/未填字段应被跳过 ════════');
const empty = buildCardPrompt(dcf, { ticker: { name: '宁德时代', code: '300750' } }, dcf.inputSchema);
console.log(empty);
console.log('行数:', empty.split('\n').length, '（应只含 标题+空行+分析对象 = 3 行）');

console.log('\n✅ 单测完成');
