// sync-from-web.mjs — 以 WEB 端 src/skills/index.ts 为唯一 skill 源，同步 skills-data.json + client/client.js
// 用法: node sync-from-web.mjs
// 说明:
//   1. WEB 端 skills(index.ts) ⊃ DSH 旧清单(data/skills.ts)：缺失的 13 个(china-* 10个 +
//      merger-accretion-model + tear-sheet + us-dcf-model)以 WEB 为准合并；DSH 独有 30 个美方 skill 保留。
//   2. 合并后 101 个 skill，两边都有者以 WEB 端定义刷新 name/description/prompt/category（单一事实源）。
//   3. client.js 重建时保留线上新版特性（历史对话 archive 删除按钮 + inject 注入）——
//      ⚠️ 不要直接跑 gen-client.mjs，其模板滞后于线上版（缺 archive），会把新特性覆盖掉。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const WEB_SKILLS_TS = process.env.UPSTREAM_SKILLS_TS || './upstream-project/src/skills/index.ts';
const OUT_JSON = `${import.meta.dirname}/skills-data.json`;
const OUT_CLIENT = `${import.meta.dirname}/client/client.js`;
const CLIENT_BASELINE = `${import.meta.dirname}/client/client.js.bak-20260828`; // archive 版骨架基线

// ===== 状态机提取 TS 数组字面量（与 extract.mjs 相同逻辑）=====
function extractArray(text, marker) {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const eq = text.indexOf('=', idx);
  const open = text.indexOf('[', eq);
  let depth = 0, i = open;
  let inSingle = false, inDouble = false, inBacktick = false;
  while (i < text.length) {
    const c = text[i];
    if (inBacktick) { if (c === '\\') i++; else if (c === '`') inBacktick = false; }
    else if (inSingle) { if (c === '\\') i++; else if (c === "'") inSingle = false; }
    else if (inDouble) { if (c === '\\') i++; else if (c === '"') inDouble = false; }
    else {
      if (c === "'") inSingle = true;
      else if (c === '"') inDouble = true;
      else if (c === '`') inBacktick = true;
      else if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) return text.slice(open, i + 1); }
    }
    i++;
  }
  return null;
}

// ===== 1. 读 WEB 端最新 skill 源 =====
const webSrc = readFileSync(WEB_SKILLS_TS, 'utf8');
const webCats = Function('return ' + extractArray(webSrc, 'export const skillCategories'))();
const webSkills = Function('return ' + extractArray(webSrc, 'export const skills'))();

// ===== 2. 读 DSH 现有数据（无则从基线 client.js 提取）=====
let dsh;
try {
  dsh = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
} catch {
  console.error('skills-data.json 缺失，请先从备份恢复或跑 extract.mjs');
  process.exit(1);
}

// ===== 3. 合并 =====
const dshIds = new Set(dsh.skills.map(s => s.id));
const added = [], updated = [];
const slim = (s) => ({
  id: s.id, name: s.name, icon: s.icon || '🔧', category: s.category,
  description: s.description, prompt: (s.prompt || '').trim(),
});

// 提取 WEB 端 inputSchema（卡片定义）；WEB 没有的返回 undefined，
// 这样 3b 的 Object.assign 不会把 DSH 侧自建的 A股卡片覆盖掉。
const schemaOf = (s) => (Array.isArray(s.inputSchema) && s.inputSchema.length ? s.inputSchema : undefined);

// 3a. WEB 独有 → 新增
for (const ws of webSkills) {
  if (!dshIds.has(ws.id)) {
    dsh.skills.push(slim(ws));
    dshIds.add(ws.id);
    added.push(ws.id);
  }
}

// 3b. 两边都有 → 以 WEB 刷新（保持单一事实源；technical-analysis/stock-comparison 归 equity-research）
//     卡片定义：WEB 有则以 WEB 为准；WEB 无则保留 DSH 侧自建（A股/行情 12 个）
const webById = new Map(webSkills.map(s => [s.id, s]));
const schemaFromWeb = [];
for (const ds of dsh.skills) {
  const ws = webById.get(ds.id);
  if (ws) {
    const r = slim(ws);
    if (ds.name !== r.name || ds.description !== r.description || ds.prompt !== r.prompt || ds.category !== r.category) {
      updated.push(ds.id);
    }
    Object.assign(ds, r);
    const wsSchema = schemaOf(ws);
    if (wsSchema) { ds.inputSchema = wsSchema; schemaFromWeb.push(ds.id); }
  }
}

// ===== 4. 分类名称对齐 WEB =====
const cats = dsh.cats.map(c => {
  const wc = webCats.find(w => w.id === c.id);
  return wc ? { id: c.id, name: wc.name, icon: c.icon } : c;
});

const out = { cats, skills: dsh.skills };
writeFileSync(OUT_JSON, JSON.stringify(out), 'utf8');

// ===== 5. 重建 client.js =====
// ⚠️ 历史教训：不要用正则替换 ALL_SKILLS 数据块——非贪婪正则会在 prompt 字符串内部的
//    `]);` 处提前截断，导致文件语法损坏。现在统一走 gen-client.mjs（模板 + JSON.stringify 注入）。
//    gen-client.mjs 模板已含 archive 特性（历史对话删除按钮），可安全全量重生成。
execFileSync(process.execPath, [`${import.meta.dirname}/gen-client.mjs`], { stdio: 'inherit' });

// ===== 6. 报告 =====
const dist = out.skills.reduce((a, s) => { a[s.category] = (a[s.category] || 0) + 1; return a; }, {});
const withCard = out.skills.filter(s => Array.isArray(s.inputSchema) && s.inputSchema.length);
console.log('=== 同步完成 ===');
console.log('新增 skill (' + added.length + '):', added.join(', '));
console.log('以 WEB 刷新的 skill (' + updated.length + ')');
console.log('技能总数:', out.skills.length, '分类数:', cats.length);
console.log('分类分布:', JSON.stringify(dist));
console.log('');
console.log('带 inputSchema 卡片:', withCard.length, '个');
console.log('  ├ 来自 WEB:', schemaFromWeb.length, '个 →', schemaFromWeb.join(', '));
console.log('  └ DSH 自建:', (withCard.length - schemaFromWeb.length), '个（A股/行情，WEB 端无对应卡片）');
console.log('⚠️ 改完需重启 DSH Desktop 生效');
