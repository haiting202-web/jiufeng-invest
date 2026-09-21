/**
 * verify-history-box.mjs — 不开浏览器，验证「历史对话」文本框的折叠/展开行为。
 *
 * 原理同 verify-placeholders.mjs：把 client.js 用假 loader 加载进 vm，注入可写的假
 * React hooks（useState 记忆化 + 手动触发重渲染），直接调用侧边栏组件函数，从返回
 * 的元素树里数会话条目、找「展开全部」按钮，并模拟点击后再数一次。
 *
 * 用法： node verify-history-box.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = import.meta.dirname;
const DSH_APP = 'D:/Program Files/DSH Desktop/resources/app';

const req = createRequire(path.join(DSH_APP, 'noop.js'));
let realReact;
try { realReact = req('react'); }
catch {
    realReact = { createElement: (t, p, ...c) => ({ type: t, props: { ...(p || {}), children: c.length > 1 ? c : c[0] } }), Fragment: Symbol.for('react.fragment') };
}

// ── 假 React：useState 记忆化，便于模拟「点击后重渲染」─────────────────────
let hookOrder = 0;
let stateStore = [];
let injectedActive = { activeExpert: null, activeSkill: null, expandedCategories: {} };
const fakeReact = {
    createElement: realReact.createElement,
    Fragment: realReact.Fragment,
    useState: (init) => {
        const i = hookOrder++;
        if (i === 0) return [injectedActive, () => {}];
        if (!(i in stateStore)) stateStore[i] = typeof init === 'function' ? init() : init;
        return [stateStore[i], (v) => { stateStore[i] = typeof v === 'function' ? v(stateStore[i]) : v; }];
    },
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v === undefined ? null : v }),
    useCallback: (fn) => fn,
    useSyncExternalStore: (_s, get) => (typeof get === 'function' ? get() : null),
};

const win = {};
let mod = null;
const sandbox = {
    window: win,
    document: {
        body: { getAttribute: () => null },
        createElement: () => ({ setAttribute() {}, appendChild() {} }),
        head: { appendChild() {} },
        getElementById: () => null,
    },
    location: { href: '' },
    navigator: { userAgent: 'node' },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: () => Promise.reject(new Error('no network in test')),
    require: (n) => (n === 'react' ? fakeReact : req(n)),
};
win.__ModuleLoader__ = { load: ({ factory }) => { mod = factory(sandbox.require); } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client/client.js'), 'utf8'), sandbox, { filename: 'client.js' });
if (!mod || typeof mod.apply !== 'function') { console.error('✗ client.js 加载失败'); process.exit(1); }

// ── 假 ctx：捕获注册的组件 ─────────────────────────────────────────────────
const slots = {};
mod.apply({
    effect: (fn) => { try { fn(); } catch { /* 注册类副作用，忽略 */ } return () => {}; },
    locale: { register: () => {} },
    slots: {
        inject: (name, fn) => { slots[name] = fn(); },
        register: (_def, comp) => ({ comp }),
    },
    sessions: { open() {} },
    theme: {}, connection: {}, workspaces: {},
});
const Sidebar = slots['sidebar.workspaces']?.comp;
if (typeof Sidebar !== 'function') { console.error('✗ 没捕获到 sidebar.workspaces 组件'); process.exit(1); }
console.log('✓ 侧边栏组件已捕获');

// ── 工具：遍历元素树 ───────────────────────────────────────────────────────
function walk(node, pred, acc = []) {
    if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return acc;
    if (Array.isArray(node)) { for (const c of node) walk(c, pred, acc); return acc; }
    if (typeof node !== 'object') return acc;
    if (pred(node)) acc.push(node);
    if (node.props && node.props.children !== undefined) walk(node.props.children, pred, acc);
    return acc;
}
/** 递归取纯文本（children 可能是嵌套元素，直接 join 会得到 [object Object]）*/
const txt = (n) => {
    if (n === null || n === undefined || typeof n === 'boolean') return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    const c = n?.props?.children;
    return (Array.isArray(c) ? c : [c]).map(txt).join('');
};

let sessionsSnap = { ids: [], byId: {}, current: null };
const opened = [];
const fakeUseSessions = (sel) => sel(sessionsSnap);

function render() {
    hookOrder = 0;
    const tree = Sidebar({
        useSessions: fakeUseSessions,
        open: (id) => opened.push(id),
        archive: () => {},
    });
    const items = walk(tree, (n) => n.props?.className === 'dsh-invest-sess' || n.props?.className === 'dsh-invest-sess active');
    const more = walk(tree, (n) => n.props?.className === 'dsh-invest-more')[0];
    const box = walk(tree, (n) => typeof n.props?.className === 'string' && n.props.className.startsWith('dsh-invest-box'))[0];
    const label = walk(tree, (n) => n.props?.className === 'dsh-invest-group-label').map(txt).filter(t => t.includes('历史对话'))[0];
    return {
        tree,
        titles: items.map((n) => txt(walk(n, (x) => x.props?.className === 'ttl')[0])),
        count: items.length,
        moreLabel: more ? txt(more) : null,
        moreOnClick: more?.props?.onClick,
        boxClass: box?.props?.className || null,
        hasBox: !!box,
        labelText: label || null,
        empty: walk(tree, (n) => n.props?.className === 'dsh-invest-empty').length > 0,
        activeCount: items.filter((n) => n.props.className.includes('active')).length,
    };
}

function makeSnap(n, currentIdx = 0) {
    const ids = [], byId = {};
    for (let i = 0; i < n; i++) {
        const id = 'sess-' + i;
        ids.push(id);
        // updatedAt 递减 → 列表应按此降序排列
        byId[id] = { id, blank: false, displayTitle: '对话 ' + i, updatedAt: 1_700_000_000_000 - i * 60_000 };
    }
    return { ids, byId, current: n ? ids[currentIdx] : null };
}

// ── 断言 ───────────────────────────────────────────────────────────────────
let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg); fail++; } };

console.log('\n=== 1. 空列表 ===');
stateStore = []; sessionsSnap = makeSnap(0);
let r = render();
ok(r.empty, '显示「暂无对话」');
ok(!r.hasBox, '不渲染文本框');

console.log('\n=== 2. 少于此阈值（3 条）===');
stateStore = []; sessionsSnap = makeSnap(3);
r = render();
ok(r.count === 3, `渲染 3 条（实际 ${r.count}）`);
ok(r.moreLabel === null, '无「展开全部」按钮');
ok(r.hasBox, '渲染在文本框内');
ok(r.boxClass === 'dsh-invest-box', '折叠态类名 = dsh-invest-box');
ok(r.labelText === '历史对话(3)', `标题带计数（实际「${r.labelText}」）`);

console.log('\n=== 3. 边界：恰好 10 条 ===');
stateStore = []; sessionsSnap = makeSnap(10);
r = render();
ok(r.count === 10, `渲染 10 条（实际 ${r.count}）`);
ok(r.moreLabel === null, '不折叠（阈值是「超过 10」）');

console.log('\n=== 4. 11 条 → 折叠 ===');
stateStore = []; sessionsSnap = makeSnap(11);
r = render();
ok(r.count === 10, `默认只渲染 10 条（实际 ${r.count}）`);
ok(r.titles[0] === '对话 0', '按更新时间降序（最新在前）');
ok(r.moreLabel === '展开全部 (11)', `按钮文案（实际「${r.moreLabel}」）`);
ok(r.labelText === '历史对话(11)', `标题计数反映总数 11（实际「${r.labelText}」）`);
ok(typeof r.moreOnClick === 'function', '按钮可点击');

console.log('\n=== 5. 点击展开 ===');
r.moreOnClick();          // 触发 setHistoryExpanded(true)，stateStore 保留
r = render();             // 模拟重渲染
ok(r.count === 11, `展开后渲染全部 11 条（实际 ${r.count}）`);
ok(r.moreLabel === '收起', `按钮变为「收起」（实际「${r.moreLabel}」）`);
ok(r.boxClass === 'dsh-invest-box open', '展开态类名含 open（容器变高）');
ok(sessionsSnap.ids.length === 11, '全量已在树中（容器内滚动查看）');

console.log('\n=== 6. 再点击收起 ===');
r.moreOnClick();
r = render();
ok(r.count === 10, `收回 10 条（实际 ${r.count}）`);
ok(r.moreLabel === '展开全部 (11)', '按钮还原');

console.log('\n=== 7. 大量会话（57 条）===');
stateStore = []; sessionsSnap = makeSnap(57, 3);
r = render();
ok(r.count === 10, `折叠状态渲染 10 条（实际 ${r.count}）`);
ok(r.activeCount === 1, '当前会话高亮唯一');
const act = walk(r.tree, (n) => n.props?.className === 'dsh-invest-sess active')[0];
ok(txt(walk(act, (x) => x.props?.className === 'ttl')[0]) === '对话 3', '高亮的是 current 指向的会话');
ok(r.moreLabel === '展开全部 (57)', `按钮显示总数（实际「${r.moreLabel}」）`);

console.log('\n=== 8. 归档按钮仍可用 ===');
const del = walk(r.tree, (n) => n.props?.className === 'dsh-invest-sess-del');
ok(del.length === 10, `每条都有归档按钮（实际 ${del.length}）`);

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ 全部通过（0 失败）');
process.exit(fail ? 1 : 0);
