import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(process.env.UPSTREAM_SKILLS_TS || './upstream-project/src/data/skills.ts', 'utf8');

// 状态机提取数组（处理单引号/双引号/反引号字符串 + 嵌套括号）
function extractArray(text, marker) {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const eq = text.indexOf('=', idx);
  const open = text.indexOf('[', eq);
  let depth = 0;
  let i = open;
  let inSingle = false, inDouble = false, inBacktick = false;
  while (i < text.length) {
    const c = text[i];
    if (inBacktick) {
      if (c === '\\') i++;
      else if (c === '`') inBacktick = false;
    } else if (inSingle) {
      if (c === '\\') i++;
      else if (c === "'") inSingle = false;
    } else if (inDouble) {
      if (c === '\\') i++;
      else if (c === '"') inDouble = false;
    } else {
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

const catsArr = extractArray(src, 'export const skillCategories');
const skillsArr = extractArray(src, 'export const skills');

if (!catsArr || !skillsArr) {
  console.error('提取失败: cats=', !!catsArr, 'skills=', !!skillsArr);
  process.exit(1);
}

const cats = Function('return ' + catsArr)();
const skills = Function('return ' + skillsArr)();

const slim = skills.map(s => ({
  id: s.id, name: s.name, icon: s.icon, category: s.category,
  description: s.description, prompt: (s.prompt || '').trim(),
}));

const out = { cats: cats.map(c => ({ id: c.id, name: c.name, icon: c.icon })), skills: slim };
writeFileSync(`${import.meta.dirname}/skills-data.json`, JSON.stringify(out), 'utf8');

console.log('分类数:', cats.length, '技能数:', slim.length);
const dist = slim.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc; }, {});
console.log('分类分布:', JSON.stringify(dist));
console.log('JSON 大小:', (JSON.stringify(out).length / 1024).toFixed(1) + ' KB');
