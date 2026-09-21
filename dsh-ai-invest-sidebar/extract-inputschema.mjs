// 从 WEB 端 src/skills/index.ts 提取所有带 inputSchema 的 skill
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = process.env.UPSTREAM_SKILLS_TS || './upstream-project/src/skills/index.ts';
const src = readFileSync(SRC, 'utf8');

// 按 skill 对象切分：找顶层的 `  {` ... `  },`
// 更稳的方式：找所有 id: "xxx" 的位置，然后向后找 inputSchema
const out = [];

// 用正则找所有 skill 块：以 "  {\n    id: " 开头
const blockRe = /\n  \{\n    id: "([^"]+)",\n/g;
let m;
const blocks = [];
while ((m = blockRe.exec(src)) !== null) {
  blocks.push({ id: m[1], start: m.index });
}

for (let i = 0; i < blocks.length; i++) {
  const b = blocks[i];
  const end = i + 1 < blocks.length ? blocks[i + 1].start : src.length;
  const body = src.slice(b.start, end);
  if (!body.includes('inputSchema:')) continue;

  // 提取 name
  const nameM = body.match(/name: "([^"]+)"/);
  const catM = body.match(/category: "([^"]+)"/);
  const iconM = body.match(/icon: "([^"]+)"/);
  const descM = body.match(/\n    description: "((?:[^"\\]|\\.)*)"/);

  // 用状态机提取 inputSchema 数组
  const isIdx = body.indexOf('inputSchema:');
  const arrStart = body.indexOf('[', isIdx);
  let depth = 0, j = arrStart, inStr = false, strQ = '', esc = false;
  while (j < body.length) {
    const c = body[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === strQ) inStr = false;
    } else {
      if (c === '"' || c === "'" || c === '`') { inStr = true; strQ = c; }
      else if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) break; }
    }
    j++;
  }
  const arrStr = body.slice(arrStart, j + 1);

  let fields = null;
  try {
    fields = Function('return ' + arrStr)();
  } catch (e) {
    console.error('解析失败:', b.id, e.message);
  }

  out.push({
    id: b.id,
    name: nameM ? nameM[1] : '',
    icon: iconM ? iconM[1] : '',
    category: catM ? catM[1] : '',
    description: descM ? descM[1] : '',
    fieldCount: fields ? fields.length : 0,
    inputSchema: fields,
  });
}

writeFileSync(`${import.meta.dirname}/inputschema-inventory.json`, JSON.stringify(out, null, 2), 'utf8');
console.log('带 inputSchema 的 skill 数量:', out.length);
console.log('');
for (const s of out) {
  console.log(`【${s.id}】${s.icon} ${s.name}  (${s.category}, ${s.fieldCount} 字段)`);
  for (const f of (s.inputSchema || [])) {
    const opt = f.options ? ` options=[${f.options.map(o => o.label).join('|')}]` : '';
    const req = f.required ? ' *必填' : '';
    console.log(`   - ${f.key}: ${f.label} (${f.type})${req}${opt}`);
  }
  console.log('');
}
