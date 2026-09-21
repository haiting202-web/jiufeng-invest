/**
 * 生成提示词对照预览页（验收用，不需要启动 DSH）。
 * 用法: node gen-placeholder-preview.mjs
 * 产出: 提示词对照预览.html
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills-data.json'), 'utf8'));
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'skill-placeholders.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function examplesFor(skill) {
    const l = P.bySkill[skill.id] || P.byCategory[skill.category];
    if (Array.isArray(l) && l.length) return l;
    return ['说说你在「' + skill.name + '」上想解决的具体问题'];
}

const totalSkills = d.skills.length;
const uniq = new Set(d.skills.map((s) => examplesFor(s)[0])).size;
const formSkills = d.skills.filter((s) => Array.isArray(s.inputSchema) && s.inputSchema.length).length;

let body = '';
for (const cat of d.cats) {
    const list = d.skills.filter((s) => s.category === cat.id);
    body += `<section class="cat">\n<h2><span class="ico">${esc(cat.icon)}</span>${esc(cat.name)}<em>${list.length} 个技能</em></h2>\n`;
    body += `<div class="cards">\n`;
    for (const s of list) {
        const isForm = Array.isArray(s.inputSchema) && s.inputSchema.length > 0;
        const ex = examplesFor(s);
        if (isForm) {
            const fh = s.inputSchema.map((f) => `<span class="fld${f.required ? ' req' : ''}">${esc(f.label)}</span>`).join('');
            body += `<article class="card form">
        <div class="row"><span class="name">${esc(s.icon)} ${esc(s.name)}</span><span class="badge form">表单卡</span></div>
        <div class="ph form">该技能走结构化表单，输入框处会显示为参数选择器</div>
        <div class="chips">${fh}</div>
      </article>\n`;
        } else {
            const place = '例如：' + ex[0] + '…';
            const chips = ex.slice(1).map((c) => `<span class="chip">${esc(c)}</span>`).join('');
            body += `<article class="card">
        <div class="row"><span class="name">${esc(s.icon)} ${esc(s.name)}</span></div>
        <div class="ph">${esc(place)}</div>
        ${chips ? `<div class="chiplabel">试试这样问</div><div class="chips">${chips}</div>` : ''}
      </article>\n`;
        }
    }
    body += `</div>\n</section>\n`;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>侧边栏输入框提示词对照</title>
<style>
  :root { --bg:#f5f5f7; --card:#fff; --ink:#1d1d1f; --sub:#6e6e73; --line:rgba(0,0,0,.09); --blue:#0071e3; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:880px; margin:0 auto; padding:28px 18px 60px; }
  header h1 { font-size:24px; margin:0 0 6px; letter-spacing:-.02em; }
  header p { color:var(--sub); margin:0 0 18px; font-size:13.5px; }
  .stats { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:22px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 14px; min-width:104px; }
  .stat b { display:block; font-size:20px; color:var(--blue); letter-spacing:-.02em; }
  .stat span { font-size:12px; color:var(--sub); }
  .toolbar { position:sticky; top:0; background:rgba(245,245,247,.88); backdrop-filter:blur(10px);
             padding:10px 0; margin-bottom:8px; z-index:9; }
  .toolbar input { width:100%; padding:10px 13px; border-radius:10px; border:1px solid var(--line);
                   background:var(--card); font:inherit; font-size:14px; outline:none; }
  .toolbar input:focus { border-color:var(--blue); }
  section.cat h2 { font-size:16px; margin:26px 0 12px; display:flex; align-items:center; gap:8px; }
  section.cat h2 .ico { font-size:18px; }
  section.cat h2 em { font-style:normal; font-size:12px; color:var(--sub); font-weight:400; margin-left:auto; }
  .cards { display:grid; gap:10px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:13px 15px; }
  .row { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
  .name { font-weight:600; font-size:14px; }
  .badge { margin-left:auto; font-size:11px; padding:2px 8px; border-radius:99px; background:rgba(0,113,227,.1); color:var(--blue); }
  .ph { font-size:13px; color:#3a3a3c; background:#f2f2f4; border-radius:8px; padding:9px 11px;
        border-left:3px solid var(--blue); word-break:break-word; }
  .ph.form { border-left-color:#c7c7cc; color:var(--sub); font-style:normal; }
  .chiplabel { font-size:11px; color:var(--sub); margin:9px 0 5px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip, .fld { font-size:12px; padding:4px 9px; border-radius:8px; border:1px solid var(--line); color:#3a3a3c; }
  .chip { cursor:pointer; }
  .chip:hover { background:rgba(0,113,227,.08); border-color:var(--blue); color:var(--blue); }
  .fld { background:#f7f7f9; }
  .fld.req::after { content:" *"; color:#d70015; }
  footer { margin-top:36px; color:var(--sub); font-size:12.5px; text-align:center; }
  .hide { display:none !important; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>侧边栏输入框提示词对照</h1>
    <p>点开技能卡片后，输入框里的「例如：…」占位词，以及下方的可点击示例。共 ${totalSkills} 个技能，每条文案互不重复。</p>
    <div class="stats">
      <div class="stat"><b>${totalSkills}</b><span>技能总数</span></div>
      <div class="stat"><b>${uniq}</b><span>不重复提示词</span></div>
      <div class="stat"><b>${formSkills}</b><span>表单技能</span></div>
      <div class="stat"><b>${d.skills.length - formSkills}</b><span>自由输入技能</span></div>
    </div>
    <div class="toolbar"><input id="q" type="search" placeholder="输入技能名或关键词过滤，如：估值 / 尽调 / 净值 / KYC"></div>
  </header>
  ${body}
  <footer>数据源：skill-placeholders.json · 改完需执行 node gen-client.mjs 才在应用里生效</footer>
</div>
<script>
  const q = document.getElementById('q');
  q.addEventListener('input', () => {
    const k = q.value.trim().toLowerCase();
    document.querySelectorAll('section.cat').forEach((sec) => {
      let shown = 0;
      sec.querySelectorAll('.card').forEach((c) => {
        const hit = !k || c.textContent.toLowerCase().includes(k);
        c.classList.toggle('hide', !hit);
        if (hit) shown++;
      });
      sec.classList.toggle('hide', k && shown === 0);
    });
  });
</script>
</body>
</html>
`;

const out = path.join(ROOT, '提示词对照预览.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`已生成: ${out}  (${(html.length / 1024).toFixed(1)} KB)`);
console.log(`技能 ${totalSkills} 个｜不重复提示词 ${uniq} 条｜表单卡 ${formSkills} 个`);
