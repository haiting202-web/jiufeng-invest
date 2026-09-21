/**
 * verify-placeholders.mjs — 无需浏览器，直接验证输入框占位词是否随技能/分类正确变化。
 *
 * 原理：client.js 是 CJS-in-factory 结构（window.__ModuleLoader__.load({ factory })），
 * 我们用一个假 loader 把它加载进 vm，再注入假 React hooks（useState 第一次返回指定的
 * active 快照）后**直接调用 OverlayCard()**，从返回的元素树里读 textarea 的 placeholder
 * 与「试试这样问」快捷按钮文案。不渲染、不需要 react-dom。
 *
 * 用法： node verify-placeholders.mjs            # 抽样对照表
 *        node verify-placeholders.mjs --all      # 全量断言（101 技能 + 7 专家）
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = import.meta.dirname;
const DSH_APP = 'D:/Program Files/DSH Desktop/resources/app';
const ALL = process.argv.includes('--all');

// ── 真实 React（只用它的 createElement；hooks 用假的）────────────────────────
const req = createRequire(path.join(DSH_APP, 'noop.js'));
let realReact;
try {
    realReact = req('react');
} catch {
    realReact = { createElement: (t, p, ...c) => ({ $$typeof: Symbol.for('react.element'), type: t, props: { ...(p || {}), children: c.length > 1 ? c : c[0] } }), Fragment: Symbol.for('react.fragment') };
}

// ── 假 React ────────────────────────────────────────────────────────────────
let hookOrder = 0;
let injectedActive = { activeExpert: null, activeSkill: null, expandedCategories: {} };
const fakeReact = {
    createElement: realReact.createElement,
    Fragment: realReact.Fragment,
    useState: (init) => {
        const i = hookOrder++;
        if (i === 0) return [injectedActive, () => {}];
        return [typeof init === 'function' ? init() : init, () => {}];
    },
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v === undefined ? null : v }),
    useCallback: (fn) => fn,
    useSyncExternalStore: (_sub, get) => (typeof get === 'function' ? get() : null),
};

// ── 假 window / document + 假 loader ────────────────────────────────────────
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
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: () => Promise.reject(new Error('no network in test')),
    require: (n) => (n === 'react' ? fakeReact : req(n)),
};
win.__ModuleLoader__ = { load: ({ factory }) => { mod = factory(sandbox.require); } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client/client.js'), 'utf8'), sandbox, { filename: 'client.js' });

if (!mod || typeof mod.apply !== 'function') {
    console.error('✗ 加载失败：factory 未返回带 apply 的 exports');
    process.exit(1);
}
console.log('✓ client.js 加载成功（含 apply）');

// ── 用假 ctx 调 apply，捕获注册的组件 ───────────────────────────────────────
const slots = {};
mod.apply({
    effect: (fn) => { try { fn(); } catch { /* CSS/字典注册，测试里无所谓 */ } return () => {}; },
    locale: { register: () => {} },
    slots: {
        inject: (name, fn) => { slots[name] = fn(); },
        register: (_def, comp) => ({ comp }),
    },
    sessions: { open() {} },
    theme: {}, connection: {}, workspaces: {},
});
console.log('✓ apply 执行成功，注册 ' + Object.keys(slots).length + ' 个 slot：' + Object.keys(slots).join(', '));

const OverlayCard = slots['shell.overlay']?.comp;
if (!OverlayCard) { console.error('✗ 没捕获到 shell.overlay 组件'); process.exit(1); }

// ── 调用组件，读元素树 ─────────────────────────────────────────────────────
function walk(node, pred, acc = []) {
    if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return acc;
    if (Array.isArray(node)) { for (const c of node) walk(c, pred, acc); return acc; }
    if (typeof node !== 'object') return acc;
    if (pred(node)) acc.push(node);
    if (node.props && node.props.children !== undefined) walk(node.props.children, pred, acc);
    return acc;
}

function render(active) {
    injectedActive = { activeExpert: null, activeSkill: null, expandedCategories: {}, ...active };
    hookOrder = 0;
    const tree = OverlayCard();
    if (!tree) return null;
    const ta = walk(tree, (n) => n.props?.className === 'dsh-invest-card-input')[0];
    const chips = walk(tree, (n) => n.props?.className === 'dsh-invest-card-sug')
        .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
    const hint = walk(tree, (n) => n.props?.className === 'dsh-invest-card-hint')[0];
    const sugTitle = walk(tree, (n) => n.props?.className === 'dsh-invest-card-sugs-title')[0];
    return {
        placeholder: ta?.props?.placeholder,
        chips,
        hint: hint && (Array.isArray(hint.props.children) ? hint.props.children.join('') : hint.props.children),
        sugTitle: sugTitle && (Array.isArray(sugTitle.props.children) ? sugTitle.props.children.join('') : sugTitle.props.children),
        hasTextarea: !!ta,
    };
}

// ── 数据 ────────────────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills-data.json'), 'utf8'));
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'skill-placeholders.json'), 'utf8'));
const EXPERTS = ['financial-analysis', 'equity-research', 'investment-banking', 'private-equity', 'wealth-management', 'fund-admin', 'trader'];

if (!ALL) {
    console.log('\n=== 抽样对照（点开卡片后输入框里的提示词）===');
    for (const id of ['dcf-model', 'buyer-list', 'ic-memo', 'financial-plan', 'short-interest', 'nav-tieout', 'aml-check', 'earnings-review']) {
        const s = data.skills.find((x) => x.id === id);
        if (!s) continue;
        const r = render({ activeSkill: id });
        console.log(`  [${s.category}] ${s.name}`);
        console.log(`      placeholder : ${r.placeholder}`);
        console.log(`      chips (${r.chips.length}) : ${r.chips.join('  |  ') || '（无）'}`);
    }
    console.log('\n=== 专家卡 ===');
    for (const id of EXPERTS) {
        const r = render({ activeExpert: id });
        console.log(`  ${id.padEnd(20)} : ${r.placeholder}`);
    }
    console.log('\n（加 --all 跑全量断言）');
    process.exit(0);
}

// ── 全量断言 ────────────────────────────────────────────────────────────────
let fail = 0;
const seen = new Map();
for (const s of data.skills) {
    const r = render({ activeSkill: s.id });
    const isForm = Array.isArray(s.inputSchema) && s.inputSchema.length > 0;
    if (isForm) {
        if (r.hasTextarea) { console.error(`✗ ${s.id}: 有表单却渲染了 textarea（预期表单模式）`); fail++; }
        continue;
    }
    const expect = "例如：" + P.bySkill[s.id][0] + "…";
    if (r.placeholder !== expect) { console.error(`✗ ${s.id}: placeholder 不符\n    实际 ${r.placeholder}\n    预期 ${expect}`); fail++; }
    if (r.sugTitle !== '试试这样问') { console.error(`✗ ${s.id}: chips 标题应为「试试这样问」，实际 ${r.sugTitle}`); fail++; }
    if (seen.has(r.placeholder)) { console.error(`✗ ${s.id}: 与 ${seen.get(r.placeholder)} 文案重复`); fail++; }
    seen.set(r.placeholder, s.id);
}
for (const id of EXPERTS) {
    const r = render({ activeExpert: id });
    const expect = "例如：" + P.byExpert[id][0] + "…";
    if (r.placeholder !== expect) { console.error(`✗ 专家 ${id}: placeholder 不符\n    实际 ${r.placeholder}\n    预期 ${expect}`); fail++; }
}
// 空状态不应崩
if (render({}) !== null) { console.error('✗ 无选中项时应返回 null'); fail++; }

const freeSkills = data.skills.filter((s) => !(Array.isArray(s.inputSchema) && s.inputSchema.length)).length;
console.log(`\n=== 全量断言 ===`);
console.log(`  自由输入技能 : ${freeSkills} 个，全部 placeholder 正确且互不重复`);
console.log(`  表单技能     : ${data.skills.length - freeSkills} 个，均未误渲染 textarea`);
console.log(`  专家         : ${EXPERTS.length} 个，placeholder 正确`);
console.log(fail ? `\n✗ ${fail} 项失败` : `\n✓ 全部通过（0 失败）`);
process.exit(fail ? 1 : 0);
