/**
 * 对照实验：判断“读文件慢”是不是杀软逐文件拦截。
 *
 *   A 组：读 300 个【不同】文件（每个都是首次打开 → 每次都要过一遍校验）
 *   B 组：读【同一个】文件 300 次（内容重复 → 缓存/校验命中）
 *
 * 若 A 组远慢于 B 组，说明瓶颈在“打开新文件”这一步，而不是磁盘吞吐。
 */
import fs from 'node:fs';
import path from 'node:path';

const APP = 'D:/Program Files/DSH Desktop/resources/app/node_modules';

function walk(dir, out = [], limit = 400) {
    if (out.length >= limit) return out;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) {
        if (out.length >= limit) break;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out, limit);
        else if (/\.js$/.test(e.name)) out.push(p);
    }
    return out;
}

const files = walk(APP, [], 400);
console.log(`样本：${files.length} 个 .js 文件\n`);

// 预热一次（让 Node 自身的模块/系统缓存到位，避免把首次开销算进 A 组）
fs.readFileSync(files[0]);

// ── A 组：300 个不同文件 ──────────────────────────────────────────────
let t = process.hrtime.bigint();
let bytes = 0;
for (let i = 0; i < 300; i++) bytes += fs.readFileSync(files[i % files.length]).length;
let aMs = Number(process.hrtime.bigint() - t) / 1e6;
console.log(`A 组 读 300 个不同文件 : ${aMs.toFixed(0)} ms  （${(bytes / 1048576).toFixed(1)} MB，平均 ${(aMs / 300).toFixed(2)} ms/个）`);

// ── B 组：同一个文件 300 次 ──────────────────────────────────────────
t = process.hrtime.bigint();
bytes = 0;
for (let i = 0; i < 300; i++) bytes += fs.readFileSync(files[0]).length;
let bMs = Number(process.hrtime.bigint() - t) / 1e6;
console.log(`B 组 读同一文件 300 次  : ${bMs.toFixed(0)} ms  （${(bytes / 1048576).toFixed(1)} MB，平均 ${(bMs / 300).toFixed(2)} ms/个）`);

console.log('');
const ratio = bMs > 0 ? aMs / bMs : Infinity;
console.log(`A / B = ${ratio.toFixed(1)} 倍`);
if (ratio > 3) {
    console.log('=> 打开“新文件”显著更贵：瓶颈在逐文件校验（典型为 Defender 实时保护）。');
    console.log('   推论：DSH 启动要逐个 require 上万个模块文件 → 这就是启动慢的量级来源。');
} else {
    console.log('=> 两者接近：瓶颈更可能是磁盘吞吐或系统整体负载，而非逐文件校验。');
}

// 外推：DSH 启动时 js/json 模块文件约 11,325 个
const perFile = aMs / 300;
const est = perFile * 11325 / 1000;
console.log('');
console.log(`外推：按 A 组单价，仅“读取” 11,325 个模块文件就需 ≈ ${est.toFixed(1)} s（不含解析与执行）。`);
