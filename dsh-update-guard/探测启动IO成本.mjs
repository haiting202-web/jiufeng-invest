/**
 * 探测：DSH 启动路径上的真实文件读取成本（不启动 GUI，纯 IO 测量）
 *
 * 背景：DSH 2.0.10 取消了 ASAR 归档，app 包的 21,921 个文件以真实文件形式躺在磁盘上。
 * Node/Electron 启动时要逐个读取模块（同步 require），此脚本量化这个下限。
 */
import fs from 'node:fs';
import path from 'node:path';

const APP = 'D:/Program Files/DSH Desktop/resources/app';

function walk(dir, out = []) {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

let t = Date.now();
const all = walk(path.join(APP, 'node_modules'));
const enumMs = Date.now() - t;
const js = all.filter((f) => /\.(js|cjs|mjs|json)$/.test(f));
const jsBytes = js.reduce((a, f) => a + fs.statSync(f).size, 0);
console.log(`枚举 node_modules : ${all.length} 文件，${enumMs} ms`);
console.log(`其中 js/json      : ${js.length} 个，${(jsBytes / 1048576).toFixed(1)} MB`);

t = Date.now();
let readBytes = 0;
for (const f of js) {
    try { readBytes += fs.readFileSync(f).length; } catch { /* 跳过 */ }
}
const readMs = Date.now() - t;
console.log(`串行读取全部内容  : ${(readBytes / 1048576).toFixed(1)} MB，${readMs} ms  <-- 热缓存下的“纯读取”下限`);
console.log(`平均单文件        : ${(readMs / js.length).toFixed(3)} ms`);

const pkgs = all.filter((f) => f.endsWith('package.json'));
t = Date.now();
for (const f of pkgs) { try { fs.readFileSync(f); } catch { /* 跳过 */ } }
console.log(`只读 package.json : ${pkgs.length} 个，${Date.now() - t} ms`);

console.log('');
console.log(`结论：启动时 JS 模块树读取下限 ≈ ${readMs} ms（热缓存、无杀软干预）。`);
console.log(`      冷启动 + Defender 逐文件实时校验时，通常放大 3-10 倍 —— 这才是“启动慢”的量级来源。`);
