#!/usr/bin/env node
/**
 * DSH 每轮固定 token 量化器
 * ---------------------------------------------------------------------------
 * 为什么需要它
 *   `~/.dsh/sessions/<workspace>/<session>/` 里的事件流记录了**每轮真实请求负载**。
 *   `request/header` 事件的 data.header 里有：
 *       config  → provider / model
 *       system  → system prompt 全文
 *       tools   → 工具数组（含 description + input_schema）
 *   这是本机唯一能精确量化「每轮固定前缀」的数据源，比翻源码估算准得多。
 *   投研收窄（B→A→D→C）到底省了多少，用这个脚本前后各跑一次就有硬数字。
 *
 * 用法
 *   node 量化每轮token.mjs                     # 自动找最近一个会话
 *   node 量化每轮token.mjs <会话目录或文件>     # 指定
 *   node 量化每轮token.mjs --json              # 只输出 JSON（便于比对）
 *
 * 说明
 *   会话文件有两种：调试用的 `_decoded.jsonl`（明文）与 `session.v3.jsonl.zstd`
 *   （zstd 压缩，正式存储）。两种都支持，优先找 _decoded.jsonl。
 *   Token 数是**估算**：按 CJK 1.5 字/token、ASCII 3.6 字/token 分段折算 ——
 *   不同 tokenizer 会有偏差，但同一脚本前后对比是可靠的。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';

const DSH = path.join(os.homedir(), '.dsh', 'sessions');
const wantJson = process.argv.includes('--json');
const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));

// ── 1. 定位会话负载文件 ─────────────────────────────────────────────────────
function newestUnder(root, names) {
    const out = [];
    const walk = (dir, depth) => {
        if (depth > 3) return;
        let items = [];
        try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const it of items) {
            const p = path.join(dir, it.name);
            if (it.isDirectory()) walk(p, depth + 1);
            else if (names.some((n) => it.name === n || it.name.startsWith(n))) {
                try { out.push({ p, m: fs.statSync(p).mtimeMs }); } catch { /* ignore */ }
            }
        }
    };
    walk(root, 0);
    out.sort((a, b) => b.m - a.m);
    return out;
}

function readEvents(target) {
    let cands = [];
    if (target) {
        const st = fs.statSync(target);
        cands = st.isDirectory()
            ? ['_decoded.jsonl', 'session.v3.jsonl.zstd', 'session.jsonl.zstd']
                .map((n) => path.join(target, n)).filter((p) => fs.existsSync(p))
            : [target];
    } else {
        const decoded = newestUnder(DSH, ['_decoded.jsonl']);
        const zst = newestUnder(DSH, ['session.v3.jsonl.zstd', 'session.jsonl.zstd']);
        // 优先明文；只有压缩件时才用它（压缩件 mtime 更新，说明是真在用）
        cands = decoded.length && decoded[0].m > (zst[0]?.m ?? 0) - 3 * 864e5
            ? [decoded[0].p]
            : [zst[0]?.p].filter(Boolean);
        if (!cands.length && decoded.length) cands = [decoded[0].p];
    }
    if (!cands.length) throw new Error('找不到会话负载文件');

    const file = cands[0];
    let text;
    if (file.endsWith('.zstd')) {
        // ⚠️ 会话文件是**追加写的多帧 zstd**（每批事件一帧）。
        // Node 的 zstdDecompressSync / createZstdDecompress 都**只解第一帧**，
        // 直接解会得到 200 字节的 session 头、看起来"没有 request/header"。
        // 按帧魔数 0xFD2FB528 切分后逐帧解压才是完整数据。
        text = decodeZstdFrames(fs.readFileSync(file));
    } else {
        text = fs.readFileSync(file, 'utf8');
    }
    const events = [];
    for (const line of text.split('\n')) {
        const s = line.trim();
        if (!s.startsWith('{')) continue;
        try { events.push(JSON.parse(s)); } catch { /* 跳过坏行 */ }
    }
    return { file, events };
}

/** 多帧 zstd → 明文（逐帧解压后拼接）*/
function decodeZstdFrames(buf) {
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
    const offs = [];
    let i = 0;
    while ((i = buf.indexOf(magic, i)) !== -1) { offs.push(i); i += 4; }

    // 单帧（或魔数只出现一次）→ 直接解
    if (offs.length <= 1) return zlib.zstdDecompressSync(buf).toString('utf8');

    let out = '';
    let failed = 0;
    for (let k = 0; k < offs.length; k++) {
        const end = k + 1 < offs.length ? offs[k + 1] : buf.length;
        try {
            out += zlib.zstdDecompressSync(buf.subarray(offs[k], end)).toString('utf8');
        } catch {
            failed++;   // 压缩流里偶发的假魔数：跳过即可，不影响后面的帧
        }
    }
    if (!out) throw new Error('多帧 zstd 解压失败（所有帧都无法解码）');
    if (failed) process.stderr.write(`[提示] ${failed}/${offs.length} 个帧无法解码（多为假魔数），已跳过\n`);
    return out;
}


// ── 2. token 估算（用本机 usage 反推定标的经验系数）──────────────────────────
// ⭐ 最权威的数字不是估算，而是 `assistant/message` 事件里的 usage.inputTokens
//    —— 那是 API 返回的真实输入 token 数。本脚本把它作为头部锚点。
//
// 下面是**分块估算**，系数由本机真实数据反推：
//   一次 ai-finance 会话首轮 usage.inputTokens = 15,259，其中
//       system prompt  7,244 字符  ≈ 1,830 tok → 3.96 字符/tok（英文为主）
//       skill catalog  9,894 字符  ≈ 6,564 tok → 1.51 字符/tok（中文密集，含触发词）
//       工具数组      31,853 字符  ≈ 6,780 tok → 4.70 字符/tok（JSON，键名重复度高）
//   三种内容类型差异极大，用单一系数会偏 30% 以上，所以按类型分别折算。
const RATIO = { cjk: 1.5, english: 3.96, json: 4.7 };

/** 中文密集文本（skill catalog、中文正文）*/
function tokChinese(str) { return Math.round((str ? str.length : 0) / RATIO.cjk); }
/** 英文为主文本（system prompt）*/
function tokEnglish(str) { return Math.round((str ? str.length : 0) / RATIO.english); }
/** JSON 结构化负载（工具数组）*/
function tokJson(str) { return Math.round((str ? str.length : 0) / RATIO.json); }

/** 通用混合估算：按 CJK 占比在三档之间线性插值 */
function estTokens(str) {
    if (!str) return 0;
    let cjk = 0;
    for (const ch of str) if (ch.codePointAt(0) >= 0x2e80) cjk++;
    const r = cjk / str.length;
    const ratio = RATIO.english + (RATIO.cjk - RATIO.english) * Math.min(1, r / 0.4);
    return Math.round(str.length / ratio);
}



/** 把 event 的 message.content 归一成纯文本（content 可能是 string 或 [{type,text}]） */
function contentText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((p) => p?.text ?? '').join('\n');
    return '';
}

// ── 3. 主流程 ───────────────────────────────────────────────────────────────
const { file, events } = readEvents(arg);
const headers = events.filter((e) => e?.type === 'request/header');
if (!headers.length) {
    console.error(`没找到 request/header 事件：${file}`);
    process.exit(2);
}
const last = headers[headers.length - 1];
const h = last.data?.header ?? {};
const tools = Array.isArray(h.tools) ? h.tools : [];

// system prompt：v3 会话放在 system/message 事件里；老格式在 header.system
let system = typeof h.system === 'string' ? h.system : '';
if (!system) {
    const sysEv = events.find((e) => e?.type === 'system/message');
    system = sysEv ? contentText(sysEv.data?.message?.content) : '';
}

// skill catalog：**不是** header 的一部分，而是一条单独注入的 user/message 事件
// （正文含 <available_skills>）。它虽然按需重注入、但持久存在于上下文里 → 同样是每轮固定税。
// ⭐ 最准确的数量来源：事件的 data.source.entries（kind='skill-catalog'），不用正则猜。
let catalogText = '';
let catalogEvent = null;
let catalogEntries = null;
for (const e of events) {
    if (e?.type !== 'user/message') continue;
    let t = contentText(e.data?.content ?? e.data?.message?.content);
    const src = e.data?.source;
    const isCatalog = (src && typeof src === 'object' && src.kind === 'skill-catalog')
        || t.includes('<available_skills>');
    if (!isCatalog) continue;
    // source 变成对象时，DSH 会把它以结构化形式记录在事件里 —— 文本自身就是 catalog
    if (src && typeof src === 'object' && Array.isArray(src.entries)) catalogEntries = src.entries;
    // 有的写入路径只留 source 结构、content 里是同一份文本
    if (!t.includes('<available_skills>') && src && typeof src === 'object') {
        t = String(e.data?.content ?? '');
    }
    if (t) { catalogText = t; catalogEvent = e; }
}
if (!catalogEntries) {
    const names = [...catalogText.matchAll(/^-\s+`?([a-z0-9][a-z0-9-]+)`?\s*[:：]/gm)].map((m) => m[1]);
    catalogEntries = [...new Set(names)];
}
const skillCount = catalogEntries.length;
const catalogNames = new Set(catalogEntries.map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean));


// system prompt 分段
const parts = system
    .split(/\n(?=#{1,3}\s)|(?=\n<[a-z-]+>)/)
    .map((s) => s.trim())
    .filter(Boolean);

// 工具明细
const rows = tools.map((t) => {
    const label = t.name ?? t.function?.name ?? '(unnamed)';
    const json = JSON.stringify(t);
    return { tool: label, chars: json.length, tok: tokJson(json) };
}).sort((a, b) => b.tok - a.tok);

// 权威锚点：首轮真实 usage.inputTokens（API 返回，不是估算）
const firstUsage = events.find((e) => e?.type === 'assistant/message')?.data?.usage ?? null;

const sysTok = tokEnglish(system);
const toolTok = rows.reduce((a, r) => a + r.tok, 0);
const catTok = tokChinese(catalogText);
const toolChars = rows.reduce((a, r) => a + r.chars, 0);

const result = {
    file,
    provider: h.config?.provider ?? '?',
    model: h.config?.model ?? '?',
    headersInFile: headers.length,
    realUsage: firstUsage,
    systemPrompt: {
        chars: system.length,
        estTokens: sysTok,
        charsPerToken: RATIO.english,
        sections: parts.map((p) => ({
            head: p.split('\n')[0].slice(0, 60),
            estTokens: tokEnglish(p),
        })).sort((a, b) => b.estTokens - a.estTokens).slice(0, 8),
    },
    skillCatalog: {
        found: !!catalogEvent,
        source: catalogEvent ? 'user/message（source.kind=skill-catalog）' : '未找到',
        chars: catalogText.length,
        estTokens: catTok,
        charsPerToken: RATIO.cjk,
        skillCount,
        skills: [...catalogNames],
    },
    tools: {
        count: tools.length,
        chars: toolChars,
        estTokens: toolTok,
        charsPerToken: RATIO.json,
        top: rows.slice(0, 15),
    },
    totalFixedPrefix: {
        chars: system.length + catalogText.length + toolChars,
        estTokens: sysTok + catTok + toolTok,
        note: 'system prompt + skill catalog + 工具 catalog（不含会话消息本身）',
    },
};

if (wantJson) {
    console.log(JSON.stringify(result, null, 2));
} else {
    const t = result.totalFixedPrefix;
    const W = 76;
    console.log('='.repeat(W));
    console.log('  DSH 每轮固定前缀 · 实测');
    console.log('='.repeat(W));
    console.log(`  负载文件 : ${path.basename(path.dirname(file))}\\${path.basename(file)}`);
    console.log(`  路由     : ${result.provider} / ${result.model}`);
    console.log('');
    if (firstUsage) {
        console.log(`  ★ 真实首轮输入（API usage，权威）: ${firstUsage.inputTokens} tok`);
        console.log(`     （本脚本分块估算合计 ${t.estTokens} tok，偏差 ${(((t.estTokens - firstUsage.inputTokens) / firstUsage.inputTokens) * 100).toFixed(1)}%）`);
    } else {
        console.log('  （本文件没有 usage 数据，只能用估算）');
    }
    console.log('');
    console.log('                                字符     折算 tok   系数');
    console.log(`  ① system prompt           ${String(system.length).padStart(7)}  ${String(sysTok).padStart(9)}   ÷${RATIO.english}`);
    console.log(`  ② skill catalog           ${String(catalogText.length).padStart(7)}  ${String(catTok).padStart(9)}   ÷${RATIO.cjk}   （${skillCount} 个 skill）`);
    console.log(`  ③ 工具数组                ${String(toolChars).padStart(7)}  ${String(toolTok).padStart(9)}   ÷${RATIO.json}   （${tools.length} 个工具）`);
    console.log('  ────────────────────────────────────────────────────────────');
    console.log(`  合计（固定前缀）          ${String(t.chars).padStart(7)}  ${String(t.estTokens).padStart(9)}`);
    console.log('');
    console.log('  ── 最贵的 15 个工具 ──');
    for (const r of rows.slice(0, 15)) {
        console.log(`     ${r.tool.padEnd(28)} ${String(r.tok).padStart(5)} tok`);
    }
    console.log('');
    console.log(`  ── catalog 里的 skill（${skillCount} 个）──`);
    console.log(`     ${[...catalogNames].slice(0, 12).join(', ')}${skillCount > 12 ? ` … 共 ${skillCount} 个` : ''}`);
    console.log('');
    console.log('  用法：收窄前后各跑一次，比 usage.inputTokens 与「合计」两列。');
    console.log('');
}



