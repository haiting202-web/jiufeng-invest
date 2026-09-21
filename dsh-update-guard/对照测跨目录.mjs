/**
 * 跨目录对照：判断“打开新文件 23ms”是全局现象（杀软/系统级）还是某个目录特有的策略。
 * 同时排除“是不是测量工具本身的问题”。
 *
 *   A app 安装目录   D:\Program Files\DSH Desktop\...   （System 盘、受保护位置）
 *   B 用户项目目录   D:\project\...\node_modules        （普通位置）
 *   C 临时目录新建   %TEMP%\dsh-io-probe                （刚写出来的新文件）
 *   D 基线          同一文件重复读
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function collectFiles(dir, limit, ext = /\.js$/) {
    const out = [];
    const stack = [dir];
    while (stack.length && out.length < limit) {
        const cur = stack.pop();
        let ents;
        try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
        for (const e of ents) {
            if (out.length >= limit) break;
            const p = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(p);
            else if (ext.test(e.name)) out.push(p);
        }
    }
    return out;
}

function timeRead(files, times) {
    // 预热一个，避免把 Node 首次读到该目录的开销算进来
    try { fs.readFileSync(files[0]); } catch { /* 忽略 */ }
    const t = process.hrtime.bigint();
    let bytes = 0;
    for (let i = 0; i < times; i++) bytes += fs.readFileSync(files[i % files.length]).length;
    return { ms: Number(process.hrtime.bigint() - t) / 1e6, bytes };
}

function report(label, dir, times = 200) {
    const files = collectFiles(dir, times);
    if (!files.length) { console.log(`${label.padEnd(26)} 无可读样本，跳过`); return null; }
    const r = timeRead(files, times);
    const per = r.ms / times;
    console.log(`${label.padEnd(26)} ${String(r.ms.toFixed(0)).padStart(6)} ms / ${times} 个   平均 ${per.toFixed(2)} ms/个   (${(r.bytes / 1048576).toFixed(1)} MB)`);
    return per;
}

console.log('=== 跨目录：读 N 个不同文件（首次打开）===');
const perApp = report('A app 安装目录', 'D:/Program Files/DSH Desktop/resources/app/node_modules');
const perProj = report('B 用户项目目录', process.env.PROBE_PROJECT_DIR || 'D:/some-project/node_modules');
const perWin = report('C 系统目录 System32', 'C:/Windows/System32/winevt');

// D 组：临时目录里现写现读
const tmp = path.join(os.tmpdir(), 'dsh-io-probe');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(tmp, `f${i}.js`), 'x'.repeat(2000));
const perTmp = report('D 临时目录(新写入)', tmp);

// E 组：基线
const one = collectFiles('D:/Program Files/DSH Desktop/resources/app/node_modules', 1);
if (one.length) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < 200; i++) fs.readFileSync(one[0]);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(`${'E 基线(同一文件)'.padEnd(26)} ${String(ms.toFixed(0)).padStart(6)} ms / 200 个   平均 ${(ms / 200).toFixed(3)} ms/个  <-- 纯读取上限`);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
console.log('=== 判读 ===');
const vals = [perApp, perProj, perWin, perTmp].filter((v) => v !== null);
const min = Math.min(...vals), max = Math.max(...vals);
console.log(`  最慢 ${max.toFixed(2)} ms/个，最快 ${min.toFixed(2)} ms/个，相差 ${(max / min).toFixed(1)} 倍`);
if (max / min < 3) {
    console.log('  => 各目录同样慢：全局性的（杀软实时保护 / 系统级文件过滤驱动），不是某个目录的策略。');
    console.log('     加defender排除项对“被排除的那几个目录”依然有效（排除是按路径生效）。');
} else {
    console.log('  => 目录之间差异明显：慢的目录命中了特定策略（多为受保护位置/第三方安全软件的重点监控区）。');
}
