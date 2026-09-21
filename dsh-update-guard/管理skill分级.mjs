#!/usr/bin/env node
/**
 * 管理 DSH ai-finance 预设的 skill 分级（常驻 / 按需）
 * ------------------------------------------------------------------
 * 原理（全部来自 DSH 源码实证，非猜测）：
 *
 *   1. SKILL.md 的 frontmatter 支持 `disable-model-invocation: true`
 *      （dsh-skill-filesystem 的 parseInvocationPolicy，第 841-851 行）
 *      => modelInvocable: false, userInvocable 仍为默认 true
 *
 *   2. dsh-tool-skill 第 217 行：catalog = snapshot.skills.filter(isModelInvocable)
 *      => 标了标记的 skill 不进模型可见的 skill catalog，省掉每轮固定 token
 *
 *   3. dsh-tool-skill 第 181-183 行（用户显式调用路径）：
 *        const skill = await ctx.skills.get(name, lookup);
 *        if (skill === void 0 || !isUserInvocable(skill)) continue;
 *      => 只校验 userInvocable，完全不看 modelInvocable
 *      => 你在输入框打 /skill名 依然能加载完整指令
 *
 *   4. dsh-client-ui-skill 第 290 行（/ 补全菜单）：
 *        description: skill.modelInvocable
 *          ? skill.description
 *          : `${t("menu.userOnly")} · ${skill.description}`
 *      => 被摘出的 skill 仍在 / 补全列表里，只是标注「仅用户」("menu.userOnly": "仅用户")
 *
 * 用法：
 *   node 管理skill分级.mjs --status            # 只读：列出当前分级 + token 账
 *   node 管理skill分级.mjs --plan              # 只读：生成建议清单（保留 28 个常驻）
 *   node 管理skill分级.mjs --plan --keep-all   # 只读：生成"全部常驻"清单（即现状）
 *   node 管理skill分级.mjs --apply 清单.json            # 预演（dry-run，不改文件）
 *   node 管理skill分级.mjs --apply 清单.json --write    # 真正落盘（自动备份）
 *   node 管理skill分级.mjs --rollback          # 回滚最近一次备份
 *
 * 安全保证：
 *   - 不删除任何文件；只增删 frontmatter 里的一行标记
 *   - --apply 默认 dry-run，必须显式加 --write 才落盘
 *   - 落盘前整目录备份到 skill-backup-<时间戳>/
 *   - 幂等：重复跑同一清单结果一致
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── 路径 ────────────────────────────────────────────────────────────────────
const SKILLS_DIR = path.join(
  os.homedir(), '.dsh', '.agent-presets', 'ai-finance', 'skills'
);
const GUARD_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FLAG = 'disable-model-invocation';

// ── 默认「常驻」建议清单 ────────────────────────────────────────────────────
// 判据：模型应当"看到任务就自动想起来用"的高频 skill。
// 其余全部标为按需（用户手动 /名字 调用）。
const DEFAULT_KEEP = [
  // 二级市场 / 投研核心
  'bull-bear-debate', 'technical-analysis', 'stock-comparison',
  'earnings-analysis', 'earnings-preview', 'valuation-heatmap',
  'thesis-tracker', 'catalyst-calendar', 'peer-comparison',
  'comps-analysis', 'sector-overview', 'idea-generation',
  // 财务分析
  'ratio-analysis', 'dcf-model', 'cash-flow-analysis',
  'dupont-analysis', 'sensitivity-analysis', 'quality-score',
  'forensic-accounting',
  // 投行 / 尽调
  'initiating-coverage', 'ic-memo', 'deal-screening',
  'dd-checklist', 'datapack-builder', 'morning-note',
  // 产出工具
  'skill-creator', 'xlsx-author', 'pptx-author',
];

// ── token 估算（ASCII 约 4 字符/token，CJK 约 1 字符/token）────────────────────
function estTokens(s) {
  let ascii = 0, cjk = 0;
  for (const ch of s) (ch.charCodeAt(0) < 128 ? ascii++ : cjk++);
  return ascii / 4 + cjk;
}

// ── 读写 SKILL.md ──────────────────────────────────────────────────────────
function skillPath(name) {
  return path.join(SKILLS_DIR, name, 'SKILL.md');
}

function parseRaw(raw, dir) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return undefined;
  const body = m[1];
  const name_ = ((body.match(/^\s*name:\s*(.*)$/m) || [])[1] || dir)
    .replace(/^["']|["']$/g, '').trim();
  const desc = ((body.match(/^\s*description:\s*(.*)$/m) || [])[1] || '').trim();
  const onDemand = new RegExp(`^\\s*${FLAG}\\s*:\\s*(true|1|yes|on)\\s*$`, 'mi').test(body);
  return { name: name_, dir, file: skillPath(dir), raw, body, desc, onDemand };
}

function readSkill(name) {
  const file = skillPath(name);
  if (!fs.existsSync(file)) return undefined;
  return parseRaw(fs.readFileSync(file, 'utf8'), name);
}

/** 重写 frontmatter：增删 `disable-model-invocation: true`，其余原样保留。 */
function rewriteSkill(skill, setOnDemand) {
  const head = '---\n';
  const rest = skill.raw.slice(skill.raw.match(/^---\r?\n[\s\S]*?\r?\n---/)[0].length);
  let b = skill.body.replace(/\r/g, '')
    .replace(new RegExp(`^\\s*${FLAG}\\s*:.*\\n?`, 'mi'), '')
    .replace(/\s+$/, '');
  if (setOnDemand) b += `\n${FLAG}: true`;
  return `${head}${b}\n---${rest}`;
}

function allSkillNames() {
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(skillPath(d.name)))
    .map((d) => d.name)
    .sort();
}

function loadAll() {
  return allSkillNames().map((n) => readSkill(n)).filter(Boolean);
}

// ── 命令：--status ─────────────────────────────────────────────────────────
function cmdStatus() {
  const skills = loadAll();
  const onDemand = skills.filter((s) => s.onDemand);
  const resident = skills.filter((s) => !s.onDemand);

  const tokOf = (s) => estTokens(`- \`${s.name}\`: ${s.desc}`) + 0.5;
  const residentTok = resident.reduce((a, s) => a + tokOf(s), 0);
  const demandTok = onDemand.reduce((a, s) => a + tokOf(s), 0);

  console.log(`skill 目录: ${SKILLS_DIR}\n`);
  console.log(`总计 ${skills.length} 个 skill`);
  console.log(`  ├ 常驻（进 catalog，模型可见）: ${resident.length} 个`);
  console.log(`  └ 按需（仅用户 /名字 调用）  : ${onDemand.length} 个\n`);
  console.log('每轮 catalog token 账（实测估算）:');
  console.log(`  当前注入        ≈ ${Math.round(residentTok).toLocaleString()} tokens/轮`);
  if (onDemand.length > 0) {
    console.log(`  若全部常驻      ≈ ${Math.round(residentTok + demandTok).toLocaleString()} tokens/轮`);
    console.log(`  已省下          ≈ ${Math.round(demandTok).toLocaleString()} tokens/轮`);
  }
  console.log('\n按需清单（模型看不到，你用 /名字 调用）:');
  if (onDemand.length === 0) {
    console.log('  （无 —— 全部 89 个都注入给模型）');
  } else {
    for (const s of onDemand) console.log(`  /${s.name}`);
  }
}

// ── 命令：--plan ───────────────────────────────────────────────────────────
function cmdPlan(keepAll) {
  const skills = loadAll();
  const names = skills.map((s) => s.name);
  const keep = keepAll ? names : DEFAULT_KEEP.filter((n) => names.includes(n));
  const missing = DEFAULT_KEEP.filter((n) => !names.includes(n));

  const outFile = path.join(GUARD_DIR, 'skill-分级清单.json');
  const payload = {
    _说明: 'keep 里的 skill 保持常驻（注入模型 catalog）；未列出的全部标为按需（disable-model-invocation: true），你用 /名字 手动调用。改完这个文件后跑 --apply 查看预演。',
    _判据: '模型应当"看到任务就自动想起来用"的高频 skill 放 keep；低频、你会主动 /调用 的放按需。',
    generatedAt: new Date().toISOString(),
    skillsDir: SKILLS_DIR,
    keep,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

  const keepSet = new Set(keep);
  const onDemand = names.filter((n) => !keepSet.has(n));
  const tokOf = (n) => {
    const s = skills.find((x) => x.name === n);
    return estTokens(`- \`${s.name}\`: ${s.desc}`) + 0.5;
  };
  const keepTok = keep.reduce((a, n) => a + tokOf(n), 0);
  const totalTok = names.reduce((a, n) => a + tokOf(n), 0);

  console.log(`建议清单已生成: ${outFile}\n`);
  console.log(`  常驻: ${keep.length} 个   ≈ ${Math.round(keepTok).toLocaleString()} tokens/轮`);
  console.log(`  按需: ${onDemand.length} 个   ≈ ${Math.round(totalTok - keepTok).toLocaleString()} tokens/轮（省下）`);
  console.log(`\n  对比现状 ${names.length} 个全注入 ≈ ${Math.round(totalTok).toLocaleString()} tokens/轮`);
  console.log(`  节省比例: ${Math.round((1 - keepTok / totalTok) * 100)}%`);
  if (missing.length) console.log(`\n  ⚠ 默认清单里有 ${missing.length} 个名字在本机找不到: ${missing.join(', ')}`);
  console.log('\n下一步：编辑该文件的 keep 数组 → 跑 --apply 预演 → 加 --write 落盘');
}

// ── 命令：--apply ──────────────────────────────────────────────────────────
function cmdApply(listFile, write) {
  if (!fs.existsSync(listFile)) {
    console.error(`清单文件不存在: ${listFile}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const keep = new Set(cfg.keep ?? []);
  const skills = loadAll();

  const toMark = skills.filter((s) => !keep.has(s.name) && !s.onDemand);
  const toUnmark = skills.filter((s) => keep.has(s.name) && s.onDemand);
  const unchanged = skills.length - toMark.length - toUnmark.length;

  const unknown = [...keep].filter((n) => !skills.some((s) => s.name === n));

  console.log(`清单: ${listFile}`);
  console.log(`常驻 ${keep.size} 个 | 目录内 ${skills.length} 个\n`);
  console.log(`  → 要标为按需 : ${toMark.length} 个`);
  console.log(`  → 要恢复常驻 : ${toUnmark.length} 个`);
  console.log(`  → 无需改动   : ${unchanged} 个`);
  if (unknown.length) console.log(`  ⚠ 清单中未匹配到: ${unknown.join(', ')}`);

  if (toMark.length === 0 && toUnmark.length === 0) {
    console.log('\n已是最新状态，无需改动。');
    return;
  }

  if (!write) {
    console.log('\n[预演] 将要改动的文件:');
    for (const s of toMark) console.log(`  + ${s.name}  → 加 ${FLAG}: true`);
    for (const s of toUnmark) console.log(`  - ${s.name}  → 移除标记`);
    console.log('\n未落盘。确认无误后加 --write 真正执行（会自动备份）。');
    return;
  }

  // 备份
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backupDir = path.join(GUARD_DIR, `skill-backup-${ts}`);
  fs.cpSync(SKILLS_DIR, backupDir, { recursive: true });
  console.log(`\n已备份 → ${backupDir}`);

  let n = 0;
  for (const s of toMark) {
    fs.writeFileSync(s.file, rewriteSkill(s, true), 'utf8');
    n++;
  }
  for (const s of toUnmark) {
    fs.writeFileSync(s.file, rewriteSkill(s, false), 'utf8');
    n++;
  }
  console.log(`已改写 ${n} 个 SKILL.md`);

  // 复核
  const after = loadAll();
  const residentTok = after.filter((s) => !s.onDemand)
    .reduce((a, s) => a + estTokens(`- \`${s.name}\`: ${s.desc}`) + 0.5, 0);
  console.log(`\n复核: 常驻 ${after.filter((s) => !s.onDemand).length} 个 / 按需 ${after.filter((s) => s.onDemand).length} 个`);
  console.log(`每轮 catalog ≈ ${Math.round(residentTok).toLocaleString()} tokens`);
  console.log('\n下一步：新开一个 DSH 会话（catalog 在会话首个请求前注入）。');
  console.log('若 catalog 未变化，重启 DSH（文件监听见 dsh-skill-filesystem watch: true）。');
}

// ── 命令：--rollback ───────────────────────────────────────────────────────
function cmdRollback() {
  const backups = fs.readdirSync(GUARD_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('skill-backup-'))
    .map((d) => ({ name: d.name, mtime: fs.statSync(path.join(GUARD_DIR, d.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (backups.length === 0) {
    console.error('没有找到任何 skill-backup-* 备份');
    process.exit(1);
  }
  const latest = backups[0];
  const src = path.join(GUARD_DIR, latest.name);

  // 回滚前再备份当前状态，避免回滚本身不可逆
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const safeDir = path.join(GUARD_DIR, `skill-backup-prerollback-${ts}`);
  fs.cpSync(SKILLS_DIR, safeDir, { recursive: true });

  const names = fs.readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory());
  let n = 0;
  for (const d of names) {
    const from = path.join(src, d.name, 'SKILL.md');
    const to = path.join(SKILLS_DIR, d.name, 'SKILL.md');
    if (fs.existsSync(from) && fs.existsSync(path.dirname(to))) {
      fs.copyFileSync(from, to);
      n++;
    }
  }
  console.log(`已从 ${latest.name} 回滚 ${n} 个 SKILL.md`);
  console.log(`回滚前的状态另存于 ${path.basename(safeDir)}（可再次回滚）`);
}

// ── 命令：--selftest ───────────────────────────────────────────────────────
/** 纯内存往返验证：证明改写逻辑不破坏任何 SKILL.md（不碰磁盘）。 */
function cmdSelfTest() {
  const skills = loadAll();
  const fails = [];
  let roundTrips = 0;

  for (const s of skills) {
    const check = (label, cond, extra = '') => {
      if (!cond) fails.push(`${s.dir} [${label}] ${extra}`);
      return cond;
    };

    const fmLen = (raw) => raw.match(/^---\r?\n[\s\S]*?\r?\n---/)[0].length;
    const restOf = (raw) => raw.slice(fmLen(raw));

    // 1) 标记为按需
    const marked = rewriteSkill(s, true);
    const p1 = parseRaw(marked, s.dir);
    roundTrips++;
    check('标记后可解析', p1 !== undefined);
    if (!p1) continue;
    check('标记生效', p1.onDemand === true);
    check('name 未变', p1.name === s.name, `${s.name} → ${p1.name}`);
    check('description 未变', p1.desc === s.desc);
    check('正文未变', restOf(marked) === restOf(s.raw));

    // 2) 幂等：重复标记结果一致
    const marked2 = rewriteSkill(p1, true);
    check('标记幂等', marked2 === marked);

    // 3) 取消标记（从已标记状态出发）
    const unmarked = rewriteSkill(p1, false);
    const p2 = parseRaw(unmarked, s.dir);
    roundTrips++;
    check('取消后可解析', p2 !== undefined);
    if (!p2) continue;
    check('取消生效', p2.onDemand === false);
    check('取消后 name 未变', p2.name === s.name);
    check('取消后 description 未变', p2.desc === s.desc);
    check('取消后正文未变', restOf(unmarked) === restOf(s.raw));
    check('取消后无残留标记', !new RegExp(`^\\s*${FLAG}\\s*:`, 'mi').test(p2.body));

    // 4) 往返闭合：未标记 → 标记 → 未标记 应回到起点
    const back = rewriteSkill(parseRaw(unmarked, s.dir), false);
    check('往返闭合', back === unmarked || parseRaw(back, s.dir).onDemand === false);
  }

  console.log(`自测: ${skills.length} 个 SKILL.md，${roundTrips} 次往返解析\n`);
  if (fails.length === 0) {
    console.log('✅ 全部通过 —— 改写逻辑安全：');
    console.log('   · name / description 全程不变');
    console.log('   · frontmatter 之外的正文字节完全保留');
    console.log('   · 标记幂等（重复执行不会叠加或损坏）');
    console.log('   · 可干净取消，无残留');
    console.log('\n（本命令纯内存运行，未修改任何文件）');
  } else {
    console.log(`❌ ${fails.length} 项失败：`);
    for (const f of fails.slice(0, 30)) console.log('   ' + f);
    process.exitCode = 1;
  }
}

// ── 入口 ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

if (!fs.existsSync(SKILLS_DIR)) {
  console.error(`找不到 skill 目录: ${SKILLS_DIR}`);
  process.exit(1);
}

if (has('--status')) {
  cmdStatus();
} else if (has('--selftest')) {
  cmdSelfTest();
} else if (has('--plan')) {
  cmdPlan(has('--keep-all'));
} else if (has('--apply')) {
  const listFile = argv[argv.indexOf('--apply') + 1];
  if (!listFile || listFile.startsWith('--')) {
    console.error('用法: --apply <清单.json> [--write]');
    process.exit(1);
  }
  cmdApply(path.resolve(listFile), has('--write'));
} else if (has('--rollback')) {
  cmdRollback();
} else {
  console.log(`管理 DSH skill 分级（常驻 / 按需）

  node 管理skill分级.mjs --status                     只读：当前分级 + token 账
  node 管理skill分级.mjs --selftest                   只读：证明改写逻辑不破坏文件
  node 管理skill分级.mjs --plan                       只读：生成建议清单（保留 ${DEFAULT_KEEP.length} 个常驻）
  node 管理skill分级.mjs --plan --keep-all            只读：生成"全部常驻"清单
  node 管理skill分级.mjs --apply 清单.json            预演（不改文件）
  node 管理skill分级.mjs --apply 清单.json --write    落盘（自动备份）
  node 管理skill分级.mjs --rollback                   回滚最近一次

skill 目录: ${SKILLS_DIR}`);
}
