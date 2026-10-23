/**
 * 专业工具卡片行为测试：在桩环境里真正跑一遍
 *   侧栏点分类 → 点技能 → 卡片渲染 → 选文件 → 提交
 * 断言：
 *   ① 专业工具卡片不出现「会诊」字样，按钮是「开始」，标签是「专业工具 · 分类」
 *   ② 专家卡片仍然保留「开始会诊分析」，且没有上传入口
 *   ③ 上传文件能把真实磁盘绝对路径写进发出的提示词
 *   （DSH preload 暴露 window.__DSH_DESKTOP_FILE_PATH__.getPathForFile）
 * 跑法：node verify-tool-card.mjs
 */
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

/* ---------- 最小 React 运行时（支持 re-render + 函数组件展开）---------- */
let currentHooks = null;

function makeRunner(comp, props) {
	const state = [];
	const depCells = [];
	let tree = null;
	let cursor = 0;

	function renderOnce(p) {
		cursor = 0;
		const pending = [];
		currentHooks = {
			useState(init) {
				const i = cursor++;
				if (!(i in state)) state[i] = typeof init === 'function' ? init() : init;
				const set = (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v; };
				return [state[i], set];
			},
			useEffect(fn, d) {
				const i = cursor++;
				const prev = depCells[i];
				const changed = !prev || !d || d.length !== prev.length || d.some((x, k) => x !== prev[k]);
				if (changed) { depCells[i] = d; pending.push(fn); }
			},
			useMemo(fn) { cursor++; return fn(); },
			useRef(v) { const i = cursor++; if (!(i in state)) state[i] = { current: v }; return state[i]; },
			useSyncExternalStore(sub, get) { cursor++; return get(); },
		};
		tree = comp(p === undefined ? props : p);
		pending.forEach((fn) => { try { fn(); } catch (e) { console.log('   (effect 抛错: ' + e.message + ')'); } });
		return tree;
	}
	return { render: renderOnce, get tree() { return tree; } };
}

const React = {
	createElement: function (type, props) { return { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }; },
	Fragment: 'Fragment',
	useState: (i) => currentHooks.useState(i),
	useEffect: (f, d) => currentHooks.useEffect(f, d),
	useMemo: (f) => currentHooks.useMemo(f),
	useRef: (v) => currentHooks.useRef(v),
	useSyncExternalStore: (s, g) => currentHooks.useSyncExternalStore(s, g),
};

/* ---------- 浏览器桩 ---------- */
const mem = Object.create(null);
const fakeEl = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, addEventListener() {} });
const define = (n, v) => Object.defineProperty(globalThis, n, { value: v, writable: true, configurable: true });

let capturedDef = null;
define('window', globalThis);
globalThis.__ModuleLoader__ = { load: (def) => { capturedDef = def; } };
define('document', {
	title: '', head: { appendChild() {}, removeChild() {} },
	body: { getAttribute: () => null, appendChild() {}, removeChild() {}, setAttribute() {} },
	documentElement: { appendChild() {}, style: {} },
	createElement: fakeEl, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
	addEventListener() {}, visibilityState: 'visible',
});
define('navigator', { platform: 'Win32', language: 'zh-CN', userAgent: 'Mozilla (x64)', userAgentData: null });
define('localStorage', {
	getItem: (k) => (k in mem ? mem[k] : null),
	setItem: (k, v) => { mem[k] = String(v); },
	removeItem: (k) => { delete mem[k]; },
});
define('MutationObserver', function () { this.observe = () => {}; this.disconnect = () => {}; });
define('addEventListener', () => {});
define('setInterval', () => 1);
define('clearInterval', () => {});
define('fetch', () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));

// DSH 桌面端的文件路径桥梁（真实存在于 preload.cjs）
const FAKE_DISK = { 'deck.pptx': 'D:/资料/路演/2025年度路演.pptx', 'data.xlsx': 'D:/资料/财务/数据.xlsx' };
define('__DSH_DESKTOP_FILE_PATH__', { getPathForFile: (f) => FAKE_DISK[f.name] || '' });

/* ---------- 工具函数：展开函数组件 + 取文本 ---------- */
const subRunners = new Map();
function expand(node) {
	if (node === null || node === undefined || node === false || node === true) return node;
	if (Array.isArray(node)) return node.map(expand);
	if (typeof node === 'string' || typeof node === 'number') return node;
	if (typeof node.type === 'function') {
		if (!subRunners.has(node.type)) subRunners.set(node.type, makeRunner(node.type, null));
		const sub = subRunners.get(node.type);
		return expand(sub.render(node.props));
	}
	return { type: node.type, props: node.props || {}, children: (node.children || []).map(expand) };
}
function textOf(node) {
	if (node === null || node === undefined || node === false) return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(textOf).join(' ');
	return (node.children || []).map(textOf).join(' ');
}
function findAll(node, pred) {
	const out = [];
	(function walk(n) {
		if (!n || typeof n !== 'object') return;
		if (Array.isArray(n)) return n.forEach(walk);
		if (pred(n)) out.push(n);
		(n.children || []).forEach(walk);
	})(node);
	return out;
}
const byClass = (root, cls) => findAll(root, (n) => n.props && typeof n.props.className === 'string' && n.props.className.indexOf(cls) >= 0);
const byText = (root, t) => findAll(root, (n) => textOf(n).indexOf(t) >= 0 && n.props && (n.props.onClick || n.props.className));

/* ---------- 加载产物 ---------- */
const src = readFileSync(`${import.meta.dirname}/client/client.js`, 'utf8');
new Function(src)();
const prompts = [];
const ctx = {
	effect: (fn) => { try { return fn(); } catch (e) {} },
	locale: { register: () => ({}) },
	theme: {},
	slots: { inject: (n, fn) => { try { fn(); } catch (e) {} }, register: (o, c) => { (ctx._reg = ctx._reg || []).push({ o, c }); return () => {}; } },
	sessions: {
		open() {},
		create: () => Promise.resolve('s1'),
		list: { getSnapshot: () => ({ current: 's0', ids: ['s0'], byId: { s0: { id: 's0', blank: false, displayTitle: '历史会话', updatedAt: 1 } } }) },
		binding: () => ({ session: { prompt: (parts) => prompts.push(parts) } }),
	},
	workspaces: {
		list: { getSnapshot: () => ({ items: [{ workspaceId: 'w1', sessionIds: ['s0'] }] }) },
		connectWorkspace: () => Promise.resolve('s1'),
		archiveSession() {},
	},
};
const mod = capturedDef.factory((id) => { if (id === 'react') return React; throw new Error('unexpected require ' + id); });
mod.apply(ctx);

const regs = ctx._reg || [];
const sidebarComp = regs.find(r => r.o.id === 'ai-invest-workspaces').c;
const cardComp = regs.find(r => r.o.id === 'ai-invest-card').c;

console.log('── 打开专业工具卡片（财务分析 › 路演材料更新）──');
const side = makeRunner(sidebarComp, { wide: true, useSessions: () => null, open() {}, archive() {}, expandSidebar() {} });
let tree = expand(side.render());
const catBtn = byClass(tree, 'dsh-invest-cat').find(n => textOf(n).indexOf('财务分析') >= 0);
ok('侧栏渲染出「财务分析」分类', !!catBtn);
catBtn.props.onClick();
tree = expand(side.render());
const skillBtn = byClass(tree, 'dsh-invest-skill').find(n => textOf(n).indexOf('路演材料更新') >= 0);
ok('展开分类后出现「路演材料更新」', !!skillBtn);
skillBtn.props.onClick();

const card = makeRunner(cardComp, {});
let cardTree = expand(card.render());
let cardText = textOf(cardTree);
ok('卡片标题是「路演材料更新」', cardText.indexOf('路演材料更新') >= 0);
ok('★ 卡片里不再出现「会诊」', cardText.indexOf('会诊') < 0, cardText.match(/.{0,12}会诊.{0,12}/));
ok('★ 身份标签是「专业工具 · 财务分析」', cardText.indexOf('专业工具 · 财务分析') >= 0);
ok('★ 卡片里有上传入口', cardText.indexOf('上传资料（可选）') >= 0);
ok('提示语不再写「能力引导分析」', cardText.indexOf('能力引导分析') < 0);
const submitBtn = byClass(cardTree, 'dsh-invest-card-submit')[0];
ok('★ 按钮文案是「开始」（不是会诊）', submitBtn && textOf(submitBtn).trim() === '开始', submitBtn && textOf(submitBtn));
ok('无内容时按钮禁用', submitBtn && submitBtn.props.disabled === true, submitBtn && submitBtn.props.disabled);

console.log('\n── 选择文件 → 提交 ──');
const fileInput = findAll(cardTree, (n) => n.type === 'input' && n.props && n.props.type === 'file')[0];
ok('卡片里有 file input 且支持多选', fileInput && fileInput.props.multiple === true);
fileInput.props.onChange({ target: { files: [Object.assign(new File(['x'], 'deck.pptx'), {})], value: '' } });
cardTree = expand(card.render());
cardText = textOf(cardTree);
ok('已选文件显示在卡片里', cardText.indexOf('deck.pptx') >= 0);
const submit2 = byClass(cardTree, 'dsh-invest-card-submit')[0];
ok('只有文件也能提交（无需输入文字）', submit2.props.disabled === false);

await submit2.props.onClick();
const sent = prompts.length ? prompts[0].map(p => p.text).join('\n') : '';
ok('提交后确实发出了消息', prompts.length === 1, prompts.length);
ok('★ 提示词里带真实磁盘绝对路径', sent.indexOf('D:/资料/路演/2025年度路演.pptx') >= 0, sent.slice(-220));
ok('提示词里带技能 prompt（不是只发名字）', sent.indexOf('Deck Refresh') >= 0);
ok('提示词里没有文件名占位替代路径', sent.indexOf('1. deck.pptx') < 0);

console.log('\n── 专家卡片（投研工作流）保持不变 ──');
const expertBtn = byClass(tree, 'dsh-invest-expert')[0];
expertBtn.props.onClick();
const card2 = makeRunner(cardComp, {});
const t2 = textOf(expand(card2.render()));
ok('专家卡片仍有「开始会诊分析」', t2.indexOf('开始会诊分析') >= 0);
ok('专家卡片没有上传入口', t2.indexOf('上传资料（可选）') < 0);
ok('专家卡片不挂「专业工具 ·」身份标签', t2.indexOf('专业工具 · ') < 0);

console.log('\n' + '='.repeat(48));
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(48));
process.exit(fail === 0 ? 0 : 1);
