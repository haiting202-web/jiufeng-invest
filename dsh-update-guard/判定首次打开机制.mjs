/**
 * 机制判定：读同一批【全新】文件两遍，看第二遍是否变快。
 *   变快 → 存在“首次打开时扫描/校验，之后缓存信任”的机制（Defender 实时保护的典型行为）
 *   不变 → 是固定的每文件开销（过滤驱动 hook / 沙盒包装）
 *
 * 同时输出每轮的进程环境信息，便于区分沙盒 vs 系统杀软。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function pick(root, n) {
    const out = [];
    const stack = [root];
    while (stack.length && out.length < n) {
        const cur = stack.pop();
        let ents;
        try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
            if (out.length >= n) break;
            const p = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(p);
            else out.push(p);
        }
    }
    return out;
}

function round(files, label) {
    const t = process.hrtime.bigint();
    let bytes = 0;
    for (const f of files) { try { bytes += fs.readFileSync(f).length; } catch { /* 跳过 */ } }
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(`  ${label.padEnd(16)} ${String(ms.toFixed(0)).padStart(6)} ms  / ${files.length} 个   平均 ${(ms / files.length).toFixed(2)} ms/个`);
    return ms;
}

// 全新样本：从一个之前没摸过的深处目录取（用通配挑一个没访问过的包）
const roots = [
    ['dsh-web-app 内部', 'D:/Program Files/DSH Desktop/resources/app/node_modules/@deepseek-ai/dsh-web-app/lib'],
    ['侧边栏项目 dist', `${import.meta.dirname}/../dsh-ai-invest-sidebar/client`],
];
for (const [label, root] of roots) {
    if (!fs.existsSync(root)) { console.log(`${label}: 不存在，跳过`); continue; }
    const files = pick(root, 120);
    if (!files.length) { console.log(`${label}: 没样本`); continue; }
    console.log(`\n=== ${label}（${files.length} 个文件）===`);
    const r1 = round(files, '第 1 遍(冷)');
    const r2 = round(files, '第 2 遍(热)');
    const r3 = round(files, '第 3 遍');
    console.log(`  第1遍/第2遍 = ${(r1 / Math.max(r2, 0.001)).toFixed(1)} 倍`);
}

console.log('\n=== 进程环境 ===');
console.log('  execPath :', process.execPath);
console.log('  cwd      :', process.cwd());
console.log('  tmpdir   :', os.tmpdir());
const envKeys = Object.keys(process.env).filter((k) => /SANDBOX|CODEBUDDY|WORKBUDDY|SECURITY|SEATBELT/i.test(k));
console.log('  沙盒相关环境变量:', envKeys.length ? envKeys.map((k) => `${k}=${process.env[k]}`).join(' | ') : '（无）');
