#!/usr/bin/env node
/**
 * DSH agent preset 配置契约核对器
 * ---------------------------------------------------------------------------
 * 为什么需要它
 *   agent preset（~/.dsh/.agent-presets/<name>/agent.cordis.yml）是**用户目录里的
 *   自定义文件**，基座升级不会更新它。而 Harness 升级经常改动插件行的 config
 *   schema（例如 0.1.5-rc.2 把 dsh-persona 的 `text` 拆成了 `prefix` + `suffix`，
 *   且 prefix 必填）。一旦失配，症状是：
 *       session create failed: agent-preset/invalid: preset "X" failed to mount:
 *       failed to apply loader entry <插件>: invalid config: $.yyy missing required value
 *   loader 遇到第一个错就停 —— 修一个试一个非常低效。本脚本一次性列出所有失配。
 *
 * 用法
 *   node 核对预设配置.mjs [preset文件路径]
 *   默认核对 ~/.dsh/.agent-presets/ai-finance/agent.cordis.yml
 *
 * 依赖
 *   js-yaml（用 ~/.dsh/profiles/desktop/node_modules 里 DSH 自带的那份）
 *   运行前设置 NODE_PATH 指向它，或直接跑：
 *     NODE_PATH="$USERPROFILE/.dsh/profiles/desktop/node_modules" node 核对预设配置.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * 定位 js-yaml —— 优先用 DSH 自带的那份，避免要求用户在项目里装依赖。
 * （createRequire 不读 NODE_PATH，所以必须按绝对路径 require。）
 */
function loadJsYaml() {
    const candidates = [
        process.env.DSH_JS_YAML,
        path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'js-yaml'),
        path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', 'js-yaml'),
        'D:/Program Files/DSH Desktop/resources/app/node_modules/js-yaml',
    ].filter(Boolean);
    for (const c of candidates) {
        try {
            return require(c);
        } catch { /* 试下一个 */ }
    }
    try {
        return require('js-yaml');
    } catch { /* fallthrough */ }
    console.error('找不到 js-yaml。可用 DSH_JS_YAML 环境变量指定其目录，或在有 js-yaml 的目录下运行。');
    process.exit(3);
}

const yaml = loadJsYaml();

const DSH_HOME = path.join(os.homedir(), '.dsh');
const PRESET =
    process.argv[2] ||
    path.join(DSH_HOME, '.agent-presets', 'ai-finance', 'agent.cordis.yml');
const NM = 'D:/Program Files/DSH Desktop/resources/app/node_modules/@deepseek-ai';

// ── 1. 解析 preset ─────────────────────────────────────────────────────────
// preset 里用了 Cordis 的 `!!js` 标签（如 `disabled: !!js process.platform === 'win32'`）。
// js-yaml 默认不认这个标签，而注册自定义 Type 又容易踩标签归一化的坑
// （`!!js` 会被规范成 `tag:yaml.org,2002:js`）。这里的目的是核对 config 字段，
// 不需要真的求值 JS 表达式 —— 直接把 `!!js` 标记剥掉，让值退化成普通标量即可。
function parsePreset(text) {
    const stripped = text.replace(/!!js\s+/g, '');
    return yaml.load(stripped);
}

if (!fs.existsSync(PRESET)) {
    console.error(`找不到预设文件: ${PRESET}`);
    process.exit(2);
}

const doc = parsePreset(fs.readFileSync(PRESET, 'utf8'));

/** 递归收集所有带 name 的条目（group 的 config 是数组，里面还有子条目） */
function collect(rows, out = []) {
    for (const r of rows || []) {
        if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
        if (typeof r.name === 'string') out.push(r);
        if (Array.isArray(r.config)) collect(r.config, out);
    }
    return out;
}

const entries = collect(doc);

// ── 2. 从包里提取 Config schema（正则，不 import 以避免副作用）──────────────
//
// 三个必须处理的写法（初版正则只覆盖第一种，导致漏报 + 假阳性）：
//   const Config = z.object({\n  a: z.string().required()\n});     ← 多行
//   const Config = z.object({ allowParallelInProgress: ... });     ← 单行
//   static Config = z.object({ ... });                             ← class 静态字段
//
// 必填判定：**只有显式 `.required()` 才是必填**。
// schemastery 里裸的 `z.string()` 是可选的，把它当必填会造出一堆假阳性
// （实测 dsh-skill-filesystem 一个 .required() 都没有，但裸字段一堆）。
const schemaCache = new Map();

/** 从源码里抠出所有 `Config = z.object({...})` 的括号内文本（括号配平，跳过字符串） */
function findConfigBodies(src) {
    const bodies = [];
    const re = /(?:const\s+|static\s+|readonly\s+)*Config\s*=\s*z\.object\(\s*\{/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        const start = src.indexOf('{', m.index + m[0].length - 1);
        let depth = 0;
        let i = start;
        let quote = null;
        for (; i < src.length; i++) {
            const c = src[i];
            if (quote) {
                if (c === '\\') { i++; continue; }
                if (c === quote) quote = null;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
            if (c === '{') depth++;
            else if (c === '}') {
                depth--;
                if (depth === 0) { i++; break; }
            }
        }
        bodies.push(src.slice(start + 1, i - 1));
        re.lastIndex = i;
    }
    return bodies;
}

/** 取顶层字段：以最小缩进为界，其余缩进的行归属上一个字段（多行对象值） */
function topLevelFields(body) {
    const width = (s) => s.replace(/\t/g, '  ').length;
    const lines = body.split('\n');

    let min = Infinity;
    for (const l of lines) {
        if (!l.trim()) continue;
        min = Math.min(min, width(l.match(/^[ \t]*/)[0]));
    }
    if (min === Infinity) return new Map();

    const fields = new Map();
    let cur = null;
    let buf = [];
    const flush = () => {
        if (!cur) return;
        // `.required()` 只会出现在该字段声明的首行（单行写法）或末行（多行结尾）
        const first = buf[0] ?? '';
        const last = buf[buf.length - 1] ?? '';
        const required = /\.required\(\)/.test(first) || /\.required\(\)/.test(last);
        const optional = /\.default\(|\.optional\(/.test(first) || /\.default\(|\.optional\(/.test(last);
        fields.set(cur, { required: required && !optional, decl: first.trim().replace(/,$/, '') });
        cur = null;
        buf = [];
    };

    for (const l of lines) {
        if (!l.trim()) { if (cur) buf.push(l); continue; }
        if (width(l.match(/^[ \t]*/)[0]) === min) {
            const f = l.trim().match(/^([A-Za-z_$][\w$]*)\s*:/);
            if (f) { flush(); cur = f[1]; buf = [l]; continue; }
        }
        if (cur) buf.push(l);
    }
    flush();
    return fields;
}

function extractSchema(pkgDir) {
    if (schemaCache.has(pkgDir)) return schemaCache.get(pkgDir);

    const files = [];
    const libDir = path.join(pkgDir, 'lib');
    if (fs.existsSync(libDir)) {
        for (const f of fs.readdirSync(libDir)) {
            if (f.endsWith('.js')) files.push(path.join(libDir, f));
        }
    }
    try {
        const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
        const main = pj.main || pj.module;
        if (main && fs.existsSync(path.join(pkgDir, main))) {
            const p = path.join(pkgDir, main);
            if (!files.includes(p)) files.push(p);
        }
    } catch { /* ignore */ }

    let result = { hasConfig: false, fields: new Map(), source: null, usageKeys: [], manual: false };

    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        for (const body of findConfigBodies(src)) {
            const fields = topLevelFields(body);
            if (fields.size) {
                result = { hasConfig: true, fields, source: path.relative(pkgDir, file), usageKeys: [], manual: false };
                break;
            }
        }
        if (result.hasConfig) break;
    }

    // 有些插件不用 schemastery Config，而是自己写校验器（例：dsh-plan-mode 的
    // resolveConfig()，明确只接受 { section }，多余键直接 throw）。
    // 这种情况退化为"从源码里收集被读取的 config.<key>"来交叉核对。
    if (!result.hasConfig && files.length) {
        const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
        const manual = /Config\b[^\n]*(needs a|has unknown key)|unknown key\(s\)/.test(src);
        const keys = new Set();
        for (const mm of src.matchAll(/\bconfig\.([A-Za-z_$][\w$]*)/g)) keys.add(mm[1]);
        result = {
            hasConfig: false,
            fields: new Map(),
            source: files[0] ? path.relative(pkgDir, files[0]) : null,
            usageKeys: [...keys],
            manual,
        };
    }

    schemaCache.set(pkgDir, result);
    return result;
}

// ── 3. 逐个条目核对 ────────────────────────────────────────────────────────
const problems = [];
const notes = [];
let checked = 0;
let skipped = 0;

for (const e of entries) {
    const name = e.name;

    // 跳过非 @deepseek-ai 的（cordis:group、app 自带的 dsh-plugin-desktop/*）
    if (!name.startsWith('@deepseek-ai/')) {
        notes.push(`  [跳过] ${String(e.id).padEnd(28)} name=${name}（非 @deepseek-ai 包）`);
        skipped++;
        continue;
    }

    const seg = name.split('/');
    const pkgName = seg[1];
    const pkgDir = path.join(NM, pkgName);
    const label = String(e.id ?? pkgName).padEnd(28);

    // `!!js` 被剥离后 disabled 会变成非空字符串（真值），统一按"存在即跳过"处理
    if (e.disabled) {
        notes.push(`  [跳过] ${label} name=${name}（disabled）`);
        skipped++;
        continue;
    }

    if (!fs.existsSync(pkgDir)) {
        problems.push(`❌ ${label} name=${name} —— 该包在新版中不存在（模块解析会失败）`);
        continue;
    }

    const sch = extractSchema(pkgDir);
    const cfg = e.config && !Array.isArray(e.config) ? e.config : {};

    if (!sch.hasConfig) {
        const cfgKeys = Object.keys(cfg);
        if (!cfgKeys.length) {
            notes.push(`  [ok]   ${label} name=${name}（无 Config，未传 config）`);
        } else if (sch.usageKeys.length) {
            const notUsed = cfgKeys.filter((k) => !sch.usageKeys.includes(k));
            if (notUsed.length) {
                problems.push(
                    `⚠️  ${label} name=${name}\n        该包用手工校验（非 schemastery Config），源码里读取到的 config 键只有: ${sch.usageKeys.join(', ')}\n        预设传了它没读的字段: ${notUsed.join(', ')} —— 可能已改名，配置会被忽略甚至抛错`
                );
            } else {
                notes.push(`  [ok]   ${label} name=${name}（手工校验；预设字段均在源码读取列表内）`);
            }
        } else {
            notes.push(`  [参考] ${label} name=${name} —— 未找到 Config 也未发现 config.* 读取，无法自动核对（预设传了 ${cfgKeys.join(', ')}）`);
        }
        checked++;
        continue;
    }

    // 只把显式 `.required()` 的字段算必填；裸字段（如 dshHome）由宿主或默认值兜底
    const missing = [];
    for (const [key, info] of sch.fields) {
        if (info.required && !(key in cfg)) missing.push(`${key} (${info.decl})`);
    }
    const unknown = Object.keys(cfg).filter((k) => !sch.fields.has(k));

    if (missing.length) {
        problems.push(
            `❌ ${label} name=${name}\n        缺必填字段: ${missing.join('; ')}\n        该包 Config 字段: ${[...sch.fields.keys()].join(', ')}`
        );
    }
    if (unknown.length) {
        problems.push(
            `⚠️  ${label} name=${name}\n        传了 schema 里不存在的字段: ${unknown.join(', ')}\n        该包 Config 字段: ${[...sch.fields.keys()].join(', ')}`
        );
    }
    if (!missing.length && !unknown.length) {
        notes.push(`  [ok]   ${label} name=${name}（config 字段全部匹配）`);
    }
    checked++;
}

// ── 4. 报告 ────────────────────────────────────────────────────────────────
console.log('='.repeat(74));
console.log('  DSH agent preset 配置契约核对');
console.log('='.repeat(74));
console.log(`  预设文件 : ${PRESET}`);
console.log(`  条目总数 : ${entries.length}（核对 ${checked} / 跳过 ${skipped}）`);
console.log(`  Harness  : ${fs.existsSync(NM) ? path.basename(NM) : '(找不到包目录)'}`);
console.log('');

if (problems.length === 0) {
    console.log('  ✅ 未发现失配 —— 触发配置校验的条目全部与新版 schema 一致。');
} else {
    console.log(`  发现 ${problems.length} 处问题：`);
    console.log('');
    for (const p of problems) console.log(`  ${p}\n`);
}

if (notes.length) {
    console.log('  ── 明细 ──');
    for (const n of notes) console.log(n);
}

console.log('');
process.exit(problems.length ? 1 : 0);
