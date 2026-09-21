import { readFileSync } from 'node:fs';
const f = readFileSync(`${import.meta.dirname}/client/client.js`, 'utf8');

// 状态机提取 ALL_SKILLS
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

console.log('=== 数据验证 ===');
console.log('技能总数:', arr.length);
const withCard = arr.filter(s => Array.isArray(s.inputSchema) && s.inputSchema.length);
console.log('带卡片技能:', withCard.length);

console.log('\n=== 卡片清单 ===');
const cn = [], us = [];
for (const s of withCard) {
  const isCn = s.id.startsWith('china-') || s.id === 'technical-analysis' || s.id === 'stock-comparison';
  (isCn ? cn : us).push(s);
}
console.log('【A股/行情 ' + cn.length + '】');
cn.forEach(s => console.log('  ' + (s.icon || '') + ' ' + s.name.padEnd(16) + ' ' + s.inputSchema.length + '字段  ' + s.id));
console.log('【美股 ' + us.length + '】');
us.forEach(s => console.log('  ' + (s.icon || '') + ' ' + s.name.padEnd(16) + ' ' + s.inputSchema.length + '字段  ' + s.id));

// 字段类型统计
const types = {};
withCard.forEach(s => s.inputSchema.forEach(fl => { types[fl.type] = (types[fl.type] || 0) + 1; }));
console.log('\n字段类型分布:', JSON.stringify(types));

// 渲染引擎特性检查
console.log('\n=== 渲染引擎特性 ===');
const checks = [
  ['SelectField 组件', 'function SelectField('],
  ['MultiSelectField 组件', 'function MultiSelectField('],
  ['StockPickerField 组件', 'function StockPickerField('],
  ['StockMultiField 组件（DSH扩展）', 'function StockMultiField('],
  ['FileField 组件', 'function FileField('],
  ['FieldRenderer 分发器', 'function FieldRenderer('],
  ['buildCardPrompt 提示词拼装', 'function buildCardPrompt('],
  ['emSearch 东方财富搜索', 'function emSearch('],
  ['searchStockSmart 智能搜索', 'function searchStockSmart('],
  ['coerceCode 离线降级', 'function coerceCode('],
  ['dependsOn 条件显隐', 'f.dependsOn || form[f.dependsOn.key]'],
  ['required 必填校验', 'allRequiredFilled'],
  ['侧栏卡片徽标', 'dsh-invest-badge'],
  ['卡片预览区', 'dsh-invest-summary'],
  ['useRef 引入', 'useRef'],
];
let pass = 0;
for (const [name, needle] of checks) {
  const ok = f.includes(needle);
  if (ok) pass++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name);
}

// select 选项数量规则检查（≤4 横排，>4 下拉）
console.log('\n=== 遗留特性保护 ===');
const legacy = [
  ['archive 删除按钮', 'dsh-invest-sess-del'],
  ['archiveSession 注入', 'archiveSession'],
  ['s.id 字段', 's.id'],
];
for (const [name, needle] of legacy) {
  const ok = f.includes(needle);
  if (ok) pass++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name);
}

console.log('\n' + (pass === checks.length + legacy.length ? '✅ 全部通过 (' + pass + '/' + (checks.length + legacy.length) + ')' : '❌ 有失败 (' + pass + '/' + (checks.length + legacy.length) + ')'));
