/**
 * 产物级冒烟测试：在桩环境里真正执行 client.js，确认
 *   ① 插件工厂能加载、导出 name/inject/apply
 *   ② apply() 能跑完并注册全部 slot（含新增的系统浮层）
 *   ③ 系统模块（jf-sys）挂载后埋点/心跳/更新检查都能初始化
 * 跑法：node test-client-bundle.mjs
 *
 * 之所以不只在源码层面单测：注入是字符串拼接，只有真正跑一遍打包产物
 * 才能确认「模板 → bundle」这一步没把代码拼坏。
 */
import { readFileSync } from 'node:fs';

let captured = null;

/* ---------- 浏览器桩 ---------- */
const mem = Object.create(null);
const fakeElement = () => ({
	style: {}, textContent: '', className: '', id: '',
	setAttribute() {}, appendChild() {}, remove() {}, click() {},
	addEventListener() {},
});

function defineGlobal(name, value) {
	Object.defineProperty(globalThis, name, { value: value, writable: true, configurable: true });
}
defineGlobal('window', globalThis);
globalThis.__ModuleLoader__ = { load: (def) => { captured = def; } };

const React = {
	createElement: function (type, props) { return { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }; },
	useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
	useEffect: () => {},
	useMemo: (fn) => fn(),
	useRef: (v) => ({ current: v }),
	useSyncExternalStore: (sub, get) => get(),
};

const documentStub = {
	title: '',
	head: { appendChild() {}, removeChild() {} },
	body: { getAttribute: () => null, appendChild() {}, removeChild() {}, setAttribute() {} },
	documentElement: { appendChild() {}, style: {} },
	createElement: fakeElement,
	getElementById: () => null,
	querySelector: () => null,
	querySelectorAll: () => [],
	addEventListener() {},
	visibilityState: 'visible',
};

defineGlobal('document', documentStub);
defineGlobal('navigator', { platform: 'Win32', language: 'zh-CN', userAgent: 'Mozilla (x64)', userAgentData: null });
defineGlobal('localStorage', {
	getItem: (k) => (k in mem ? mem[k] : null),
	setItem: (k, v) => { mem[k] = String(v); },
	removeItem: (k) => { delete mem[k]; },
});
defineGlobal('MutationObserver', function () { this.observe = () => {}; this.disconnect = () => {}; });
defineGlobal('addEventListener', () => {});
const timers = [];
defineGlobal('setInterval', (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; });
defineGlobal('clearInterval', () => {});

let reportCalls = 0;
defineGlobal('fetch', (url) => {
	if (String(url).indexOf('/api/report') >= 0) reportCalls++;
	return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
});

/* ---------- 执行产物 ---------- */
let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

console.log('── 加载 client.js ──');
const src = readFileSync('client/client.js', 'utf8');
new Function(src)();
ok('__ModuleLoader__.load 被调用', !!captured);
ok('id 正确', captured && captured.id === 'dsh-ai-invest-sidebar', captured && captured.id);

console.log('\n── 执行插件工厂 ──');
const requireStub = (id) => {
	if (id === 'react') return React;
	throw new Error('unexpected require: ' + id);
};
let mod = null;
let factoryErr = null;
try { mod = captured.factory(requireStub); } catch (e) { factoryErr = e; }
ok('工厂执行无异常', !factoryErr, factoryErr && (factoryErr.message + '\n' + factoryErr.stack));
ok('导出 name', mod && mod.name === 'dsh-ai-invest-sidebar');
ok('导出 inject 含 slots/locale/sessions/workspaces', mod && Array.isArray(mod.inject) && ['slots', 'locale', 'sessions', 'workspaces'].every(k => mod.inject.indexOf(k) >= 0), mod && mod.inject);
ok('导出 apply 是函数', mod && typeof mod.apply === 'function');

console.log('\n── 执行 apply(ctx) 并收集 slot ──');
const registered = [];
const slotRegistrations = [];
const ctx = {
	effect: (fn) => { try { return fn(); } catch (e) { return undefined; } },
	locale: { register: () => ({}) },
	theme: {},
	slots: {
		inject: (name, fn) => { slotRegistrations.push(name); try { fn(); } catch (e) {} },
		register: (opts, comp) => { registered.push({ opts: opts, comp: comp }); return () => {}; },
	},
	sessions: {
		open() {}, create: () => Promise.resolve('s1'),
		list: { getSnapshot: () => ({ current: null, ids: [], byId: {} }) },
		binding: () => null,
	},
	workspaces: {
		list: { getSnapshot: () => ({ items: [] }) },
		archiveSession() {}, connectWorkspace: () => Promise.resolve('s1'),
	},
};
let applyErr = null;
try { mod.apply(ctx); } catch (e) { applyErr = e; }
ok('apply() 执行无异常', !applyErr, applyErr && (applyErr.message + '\n' + applyErr.stack));

const ids = registered.map(r => r.opts.id);
ok('注册了侧边栏主组件', ids.indexOf('ai-invest-workspaces') >= 0, ids);
ok('注册了技能浮层卡片', ids.indexOf('ai-invest-card') >= 0, ids);
ok('★ 注册了系统浮层卡片（本次新增）', ids.indexOf('jf-sys-card') >= 0, ids);
ok('每个 slot 都带组件', registered.every(r => typeof r.comp === 'function'));

console.log('\n── 系统模块运行时 ──');
ok('attach 后注册了心跳定时器', timers.length >= 1, timers.length);
ok('心跳周期 60s', timers.length >= 1 && timers[0].ms === 60000, timers.length ? timers[0].ms : null);
ok('设备号已写入 localStorage', typeof mem['jf.device_id'] === 'string' && /^[0-9a-f]{32}$/.test(mem['jf.device_id']), mem['jf.device_id']);
ok('首次运行未自动同意（等用户选择）', mem['jf.consent'] === undefined, mem['jf.consent']);

console.log('\n── 浮层组件可渲染 ──');
const sysCard = registered.find(r => r.opts.id === 'jf-sys-card').comp;
let renderErr = null, node = null;
try { node = sysCard(); } catch (e) { renderErr = e; }
ok('关闭态返回 null（不遮挡界面）', !renderErr && node === null, renderErr && renderErr.message);

console.log('\n' + '='.repeat(48));
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(48));
process.exit(fail === 0 ? 0 : 1);
