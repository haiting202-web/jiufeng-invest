// 临时端到端验证：模拟 DSH 的真实解析路径（用同一个 yaml 库 + 同样的步骤）
// 跑完即删。不修改任何 SKILL.md。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// 直接用 DSH 应用自带的那个 yaml（就是 dsh-skill-filesystem 实际 import 的库）
const req = createRequire('file:///D:/Program Files/DSH Desktop/resources/app/node_modules/');
const { parse } = req('yaml');
const YAML_VERSION = req('yaml/package.json').version;

const SKILLS_DIR = path.join(os.homedir(), '.dsh', '.agent-presets', 'ai-finance', 'skills');
const FLAG = 'disable-model-invocation';

// ── 忠实复刻 DSH 的 parseFrontmatter / findClosingFrontmatter ──────────────
function findClosingFrontmatter(raw, start) {
  let lineStart = start;
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart);
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline;
    const line = raw.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (line === '---') {
      return { start: lineStart, bodyStart: Math.min(raw.length, lineEnd + 1) };
    }
    if (nextNewline < 0) break;
    lineStart = nextNewline + 1;
  }
  return undefined;
}
function parseFrontmatter(raw) {
  const firstLineEnd = raw.indexOf('\n');
  if (firstLineEnd < 0) return undefined;
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined;
  const start = firstLineEnd + 1;
  const closing = findClosingFrontmatter(raw, start);
  if (closing === undefined) return undefined;
  const parsed = parse(raw.slice(start, closing.start));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return { data: parsed, body: raw.slice(closing.bodyStart) };
}

// ── 与 管理skill分级.mjs 完全一致的改写逻辑 ────────────────────────────────
function rewrite(raw, setOnDemand) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[0];
  const rest = raw.slice(fm.length);
  const body = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
  let b = body.replace(/\r/g, '')
    .replace(new RegExp(`^\\s*${FLAG}\\s*:.*\\n?`, 'mi'), '')
    .replace(/\s+$/, '');
  if (setOnDemand) b += `\n${FLAG}: true`;
  return `---\n${b}\n---${rest}`;
}

// ── 跑全部 89 个 ──────────────────────────────────────────────────────────
const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
  .map((d) => d.name);

let ok = 0;
const fails = [];

for (const dir of dirs) {
  const file = path.join(SKILLS_DIR, dir, 'SKILL.md');
  const raw = fs.readFileSync(file, 'utf8');
  const before = parseFrontmatter(raw);
  if (!before) { fails.push(`${dir}: 原文件无法解析（跳过）`); continue; }

  // 改写 → 用 DSH 的解析器读回
  const marked = rewrite(raw, true);
  const after = parseFrontmatter(marked);

  const e = (m) => fails.push(`${dir}: ${m}`);

  if (!after) { e('改写后无法被 DSH 解析器解析'); continue; }
  if (after.data[FLAG] !== true) e(`标记未被读为 true（实际 ${JSON.stringify(after.data[FLAG])}）`);
  if (after.data.name !== before.data.name) e('name 变化');
  if (after.data.description !== before.data.description) e('description 变化');
  if (after.body !== before.body) e('正文变化');
  if (after.data.category !== before.data.category) e('category 变化');
  if (after.data.version !== before.data.version) e('version 变化');

  // 取消标记后应能干净还原
  const unm = parseFrontmatter(rewrite(marked, false));
  if (!unm) { e('取消标记后无法解析'); continue; }
  if (unm.data[FLAG] !== undefined) e('取消后仍残留标记');
  if (unm.body !== before.body) e('取消后正文变化');
  if (unm.data.description !== before.data.description) e('取消后 description 变化');

  ok++;
}

console.log(`端到端验证（DSH 自带 yaml v${YAML_VERSION} + 复刻 DSH 解析步骤）`);
console.log(`参与: ${dirs.length} 个 SKILL.md`);
console.log(`通过: ${ok} 个`);
if (fails.length === 0) {
  console.log('\n✅ 全部通过 —— 改写后的文件能被 DSH 真实解析路径正确读取：');
  console.log('   · data["disable-model-invocation"] === true   → 会被判为 modelInvocable: false');
  console.log('   · name / description / category / version 全部原样');
  console.log('   · frontmatter 之后的正文字节完全保留');
  console.log('   · 可干净取消，无残留');
} else {
  console.log(`\n❌ ${fails.length} 项失败：`);
  fails.slice(0, 20).forEach((f) => console.log('   ' + f));
  process.exitCode = 1;
}
