/**
 * 更新三档行为测试（直接跑 runtime/jf-sys.js 的真实实现，fetch 与 React 全部打桩）
 *   ① silent  → 不弹卡片，只记录「有新版本」
 *   ② notice  → 弹卡片，可稍后；当天不再弹，跳过此版本后永不弹
 *   ③ force   → 无视「稍后 / 跳过」，弹不可关闭的遮罩（无 ✕、无稍后、有退出）
 *   ④ 老数据兼容：只有 force:true 没有 level 时按 force 处理
 *   ⑤ 升级完成小窗：上次版本 ≠ 本次版本 → 启动后弹一次轻提示，且能自动消失
 * 跑法：node test-update-levels.mjs
 */
import { createSystem } from './runtime/jf-sys.js';

let pass = 0, fail = 0;
const ok = (label, cond, extra) => {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

function mkStorage(init) {
	const m = new Map(Object.entries(init || {}));
	return {
		getItem: (k) => (m.has(k) ? m.get(k) : null),
		setItem: (k, v) => m.set(k, String(v)),
		removeItem: (k) => m.delete(k),
		_map: m,
	};
}

const CFG = { apiBase: 'https://report365.com.cn/jiufeng', app: 'jiufeng-workbench', channel: 'stable', version: '1.1.9', heartbeatMs: 60000, reportIntervalMs: 180000, checkDelayMs: 4000 };

/** 把 fetch 的返回内容做成可配 */
function mkDeps(storage, remote, hooks) {
	const later = [];
	return {
		React: {
			createElement: (t, p, ...c) => ({ t, p: p || {}, c }),
			useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
			useEffect: () => {},
			useMemo: (fn) => fn(),
			useRef: (v) => ({ current: v }),
		},
		storage,
		document: { visibilityState: 'visible', addEventListener() {}, body: {}, createElement: () => ({ click() {}, remove() {}, setAttribute() {}, appendChild() {} }) },
		fetch: async (url) => {
			if (String(url).indexOf('/api/update') >= 0) return { ok: true, status: 200, json: async () => remote };
			return { ok: true, status: 200, json: async () => ({ ok: true }) };
		},
		setTimeout: (fn) => { later.push(fn); return later.length; },   // 不自动执行，测试手动触发
		setInterval: () => 1,
		clearInterval: () => {},
		on: () => {},
		env: { platform: 'test' },
		log: () => {},
		_timers: later,
	};
}

console.log('\n[1] silent：小更新不打扰');
{
	const st = mkStorage();
	const d = mkDeps(st, { latest: '1.1.10', level: 'silent', title: 't', download_url: 'https://x/y.exe' });
	const S = createSystem(CFG, d);
	const r = await S.checkAndPrompt();
	ok('不弹卡片（state.open === false）', S.state().open === false);
	ok('等级识别为 silent', r && r.level === 'silent', r && r.level);
	ok('记录到 state.update（「关于」里能看到）', S.state().update && S.state().update.latest === '1.1.10');
	ok('不写 snooze（静默档不占用「稍后」状态）', st.getItem('jf.snooze') === null);
}

console.log('\n[2] notice：大更新提示但不强制');
{
	const st = mkStorage();
	const d = mkDeps(st, { latest: '1.2.0', level: 'notice', title: 't' });
	const S = createSystem(CFG, d);
	await S.checkAndPrompt();
	ok('弹卡片', S.state().open === true && S.state().mode === 'update');
	ok('不是强制遮罩', S.state().forceMask === false);
	ok('等级识别为 notice', S.state().update.level === 'notice');
}
{
	// 「稍后」之后再启动，当天不再弹
	const st = mkStorage();
	const remote = { latest: '1.2.0', level: 'notice' };
	const d1 = mkDeps(st, remote);
	const S1 = createSystem(CFG, d1);
	await S1.checkAndPrompt();
	const todayKey = new Date().toISOString().slice(0, 10);
	st.setItem('jf.snooze', '1.2.0@' + todayKey);
	const S2 = createSystem(CFG, mkDeps(st, remote));
	await S2.checkAndPrompt();
	ok('「稍后」当天不再弹', S2.state().open === false);
	st.setItem('jf.skip_version', '1.2.0');
	const S3 = createSystem(CFG, mkDeps(st, remote));
	await S3.checkAndPrompt();
	ok('「跳过此版本」永久不弹', S3.state().open === false);
}

console.log('\n[3] force：必须更新才能用');
{
	const st = mkStorage({ 'jf.skip_version': '1.3.0', 'jf.snooze': '1.3.0@' + new Date().toISOString().slice(0, 10) });
	const d = mkDeps(st, { latest: '1.3.0', level: 'force', title: 't' });
	const S = createSystem(CFG, d);
	await S.checkAndPrompt();
	ok('弹强制遮罩', S.state().open === true && S.state().forceMask === true);
	ok('无视「跳过此版本」', S.state().open === true);
	ok('等级识别为 force', S.state().update.level === 'force');
}
{
	// 老服务端只给 force:true（没有 level 字段）也要按强制处理
	const st = mkStorage();
	const d = mkDeps(st, { latest: '1.3.1', force: true });
	const S = createSystem(CFG, d);
	await S.checkAndPrompt();
	ok('老字段 force:true 归一化为 force', S.state().update.level === 'force' && S.state().forceMask === true);
}
{
	// 服务端没给 level 也没给 force → 按 notice（不误强制）
	const st = mkStorage();
	const d = mkDeps(st, { latest: '1.3.2' });
	const S = createSystem(CFG, d);
	await S.checkAndPrompt();
	ok('缺省按 notice，不误强制', S.state().update.level === 'notice' && S.state().forceMask === false);
}

console.log('\n[4] 强制遮罩的卡片结构');
{
	const st = mkStorage();
	const d = mkDeps(st, { latest: '1.3.0', level: 'force', title: 't' });
	const S = createSystem(CFG, d);
	await S.checkAndPrompt();
	const tree = S.SystemCard();
	const texts = [];
	const btns = [];
	(function walk(n) {
		if (n === null || n === undefined || n === false) return;
		if (typeof n === 'string' || typeof n === 'number') { texts.push(String(n)); return; }
		if (Array.isArray(n)) return n.forEach(walk);
		if (typeof n !== 'object') return;
		if (n.t === 'button') btns.push(n);
		const kids = n.children || n.c || [];
		kids.forEach(walk);
	})(tree);
	const all = texts.join(' ');
	ok('标题明确「需要更新才能继续使用」', all.indexOf('需要更新才能继续使用') >= 0, all.slice(0, 40));
	ok('没有「稍后再说」', all.indexOf('稍后再说') < 0);
	ok('没有「跳过此版本」', all.indexOf('跳过此版本') < 0);
	ok('有「退出软件」', all.indexOf('退出软件') >= 0);
	ok('没有关闭按钮 ✕', !btns.some((b) => (b.c || []).some((c) => c === '✕')));
	ok('点遮罩不会关闭（onClick 不是关闭逻辑）', typeof tree.p.onClick === 'function' && S.state().open === true);
}

console.log('\n[5] 升级完成小窗');
{
	// 上次记录 1.1.8，本次 1.1.9 → 启动 2.5 秒后提示一次
	const st = mkStorage({ 'jf.last_seen_ver': '1.1.8' });
	const d = mkDeps(st, { latest: '1.1.9', level: 'silent' });
	const S = createSystem(CFG, d);
	ok('启动时不立刻弹（延后 2.5s）', S.state().toast === null);
	ok('注册了一个延时器', d._timers.length === 1, d._timers.length);
	d._timers[0]();
	ok('小窗出现', !!S.state().toast);
	ok('文案含新旧版本', S.state().toast && S.state().toast.text.indexOf('1.1.9') >= 0 && S.state().toast.text.indexOf('1.1.8') >= 0, S.state().toast && S.state().toast.text);
	ok('版本号已落盘', st.getItem('jf.last_seen_ver') === '1.1.9');
	// 自动消失：showToast 内部又注册了一个定时器
	const last = d._timers[d._timers.length - 1];
	last();
	ok('到时自动消失', S.state().toast === null);
}
{
	// 同版本启动不弹
	const st = mkStorage({ 'jf.last_seen_ver': '1.1.9' });
	const d = mkDeps(st, { latest: '1.1.9' });
	const S = createSystem(CFG, d);
	ok('同版本启动不提示', S.state().toast === null && d._timers.length === 0);
}

console.log('\n' + '='.repeat(48));
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(48));
process.exit(fail === 0 ? 0 : 1);
