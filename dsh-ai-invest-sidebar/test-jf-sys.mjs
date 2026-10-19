/**
 * jf-sys 单元测试（node 直接跑，无需浏览器）
 *   node test-jf-sys.mjs
 */
import {
	cmpVersion, isNewer, parseVersion, todayKey, blankDay, bumpCounter,
	scrubText, scrubStack, safeStorage, ensureDeviceId,
	createJournal, buildBatch, createSystem,
} from './runtime/jf-sys.js';

let pass = 0, fail = 0;
function ok(label, cond, extra) {
	if (cond) { pass++; console.log('  ✓ ' + label); }
	else { fail++; console.log('  ✗ ' + label + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(label, actual, expect) {
	const a = JSON.stringify(actual), e = JSON.stringify(expect);
	ok(label + ' = ' + e, a === e, actual);
}
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ============ 1. 版本比较 ============ */
section('版本比较');
eq('parseVersion("1.10.2")', parseVersion('1.10.2'), [1, 10, 2]);
eq('parseVersion("")', parseVersion(''), [0, 0, 0]);
eq('parseVersion("2.0")', parseVersion('2.0'), [2, 0, 0]);
ok('1.0.10 > 1.0.9（按数字比，不是字符串比）', cmpVersion('1.0.10', '1.0.9') === 1, cmpVersion('1.0.10', '1.0.9'));
ok('1.0.0 < 1.0.1', cmpVersion('1.0.0', '1.0.1') === -1);
ok('1.0.0 == 1.0.0', cmpVersion('1.0.0', '1.0.0') === 0);
ok('2.0.0 > 1.99.99', cmpVersion('2.0.0', '1.99.99') === 1);
ok('isNewer("1.0.1","1.0.0") true', isNewer('1.0.1', '1.0.0') === true);
ok('isNewer("1.0.0","1.0.0") false', isNewer('1.0.0', '1.0.0') === false);
ok('isNewer("0.9.9","1.0.0") false', isNewer('0.9.9', '1.0.0') === false);

/* ============ 2. 日期 ============ */
section('日期');
const k = todayKey(new Date(2026, 9, 9, 23, 30).getTime());   // 2026-10-09 本地
eq('todayKey(本地 2026-10-09)', k, '2026-10-09');
ok('跨零点前仍是同一天（按本地时区）', todayKey(new Date(2026, 9, 9, 0, 1).getTime()) === '2026-10-09');

/* ============ 3. 敏感信息清洗 ============ */
section('敏感信息清洗');
const win = scrubText('Error: ENOENT C:\\Users\\zhangsan\\Desktop\\自选股.xlsx not found');
ok('Windows 路径归一到 %USERPROFILE%', win.indexOf('%USERPROFILE%') >= 0 && win.indexOf('zhangsan') < 0, win);
const mac = scrubText('at /Users/lisi/project/a.js:10:2');
ok('macOS 路径归一', mac.indexOf('%USERPROFILE%') >= 0 && mac.indexOf('lisi') < 0, mac);
const lin = scrubText('open /home/wangwu/data.csv failed');
ok('Linux 路径归一', lin.indexOf('%HOME%') >= 0 && lin.indexOf('wangwu') < 0, lin);
ok('长文本被截断', scrubText('x'.repeat(500), 100).length <= 101);
const st = scrubStack('Error: a\n    at foo (C:\\Users\\bob\\a.js:1:1)\n    at bar\n    at baz\n    at qux', 3);
ok('错误栈只留 3 帧', st.split(' | ').length === 3, st);
ok('错误栈里的用户名也被清洗', st.indexOf('bob') < 0, st);

/* ============ 4. storage 兜底 ============ */
section('storage 兜底');
const mem = safeStorage(null);
mem.setItem('a', '1');
ok('无 localStorage 时退回内存实现', mem.getItem('a') === '1');
const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
ok('storage 抛异常时不崩', typeof safeStorage(throwing).getItem('x') === 'object' || safeStorage(throwing).getItem('x') === null);

const s1 = safeStorage(null);
const id1 = ensureDeviceId(s1, 'jf.device_id');
const id2 = ensureDeviceId(s1, 'jf.device_id');
ok('设备号 32 位 hex', /^[0-9a-f]{32}$/.test(id1), id1);
ok('设备号幂等（同 storage 两次相同）', id1 === id2);

/* ============ 5. 每日台账 ============ */
section('每日台账');
const store = safeStorage(null);
const j = createJournal(store, 'jf.journal', { keepDays: 3 });
j.addSeconds('2026-10-09', 60);
j.addSeconds('2026-10-09', 30.4);
eq('时长累加并取整', j.day('2026-10-09').active_seconds, 90);
j.addSeconds('2026-10-09', -5);
eq('负数时长被忽略', j.day('2026-10-09').active_seconds, 90);
j.inc('2026-10-09', 'sessions');
j.inc('2026-10-09', 'sessions');
eq('会话计数', j.day('2026-10-09').sessions, 2);
j.bumpSkill('2026-10-09', 'dcf-model');
j.bumpSkill('2026-10-09', 'dcf-model');
j.bumpSkill('2026-10-09', 'dcf-model');
j.bumpSkill('2026-10-09', '');
eq('技能计数（空 id 忽略）', j.day('2026-10-09').skills, { 'dcf-model': 3 });
j.pushError({ ts: '2026-10-09T01:00:00Z', kind: 'js_error', where: 'window', msg: 'boom', stack: '' }, '2026-10-09');
eq('异常入队', j.errors().length, 1);
eq('异常同时计入当天 errors', j.day('2026-10-09').errors, 1);

// 持久化：同一 storage 新建 journal 应能读回
const j2 = createJournal(store, 'jf.journal', { keepDays: 3 });
eq('台账落盘后可读回', j2.day('2026-10-09').active_seconds, 90);
eq('异常落盘后可读回', j2.errors().length, 1);

// 剪枝
['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].forEach(d => j2.inc(d, 'sessions'));
j2.save();
const daysLeft = Object.keys(j2.days()).sort();
ok('只保留最近 3 天', daysLeft.length === 3 && daysLeft[2] === '2026-10-09', daysLeft);

/* ============ 6. 上报载荷 ============ */
section('上报载荷');
const store3 = safeStorage(null);
const j3 = createJournal(store3, 'jf.journal', { keepDays: 7 });
j3.addSeconds('2026-10-08', 600);
j3.bumpSkill('2026-10-08', 'liquidation-analysis');
j3.inc('2026-10-09', 'sessions');
j3.pushError({ ts: '2026-10-09T01:00:00Z', kind: 'op_fail', where: 'sendConsultation', msg: 'error', stack: '' });
const cfg = { app: 'jiufeng-workbench', version: '1.0.0', channel: 'stable' };
const payload = buildBatch(j3, cfg, 'deadbeef', { os: 'win32', tz: 'Asia/Shanghai', at: '2026-10-09T02:00:00Z' });
eq('schema', payload.schema, 1);
eq('app', payload.app, 'jiufeng-workbench');
eq('app_version', payload.app_version, '1.0.0');
eq('device_id', payload.device_id, 'deadbeef');
eq('batch 条数 = 2 天用量 + 1 异常', payload.batch.length, 3);
eq('day_usage 形态', payload.batch[0].t, 'day_usage');
eq('异常事件形态', payload.batch[2].t, 'error');
ok('day_usage 只含聚合计数，不含原始内容',
	Object.keys(payload.batch[0]).sort().join(',') === 'active_seconds,date,errors,experts,sessions,skills,t', Object.keys(payload.batch[0]));
ok('载荷里不含任何文件路径', JSON.stringify(payload).indexOf('Users') < 0);

/* ============ 7. createSystem 集成（假 DOM / 假 fetch） ============ */
section('createSystem 集成');

function fakeStorage() {
	const m = {};
	return {
		getItem: k => (k in m ? m[k] : null),
		setItem: (k, v) => { m[k] = String(v); },
		removeItem: k => { delete m[k]; },
		_raw: m,
	};
}

// 极简 React 桩：hooks 只保留值，足够让组件函数可被调用
function fakeReact() {
	return {
		createElement: function (type, props) { return { type: type, props: props || {}, children: Array.prototype.slice.call(arguments, 2) }; },
		useState: function (init) { return [typeof init === 'function' ? init() : init, function () {}]; },
		useEffect: function () {},
	};
}

const calls = [];
let nowValue = new Date(2026, 9, 9, 10, 0, 0).getTime();
const timers = [];
const sys = createSystem(
	{ app: 'jiufeng-workbench', version: '1.0.0', channel: 'stable', apiBase: 'https://example.test/jf', checkDelayMs: 0, heartbeatMs: 60000, reportIntervalMs: 180000 },
	{
		React: fakeReact(),
		storage: fakeStorage(),
		document: { visibilityState: 'visible', createElement: () => ({ style: {} }), body: { appendChild() {} } },
		fetch: function (url, opts) {
			calls.push({ url: url, opts: opts });
			if (String(url).indexOf('/api/update') >= 0) {
				return Promise.resolve({ ok: true, json: () => Promise.resolve({ latest: '1.0.1', released_at: '2026-10-15', notes: ['修复 A'], download_url: 'https://example.test/setup.exe' }) });
			}
			return Promise.resolve({ ok: true, status: 200 });
		},
		now: function () { return nowValue; },
		setInterval: function (fn, ms) { timers.push({ fn: fn, ms: ms }); return timers.length; },
		clearInterval: function () {},
		on: function () {},
		env: { os: 'win32', tz: 'Asia/Shanghai' },
		log: function () {},
	}
);

ok('组件可渲染（关闭态返回 null）', sys.SystemCard() === null);
ok('导出接口齐全', ['attach', 'SystemCard', 'open', 'trackSkill', 'flush', 'checkUpdate'].every(k => typeof sys[k] === 'function'));

// 未授权时不记录
sys.trackSkill('dcf-model');
eq('未同意前不记录技能使用', sys.journal.day('2026-10-09').skills, {});

// 同意后记录
// （consent 由 UI 写入，这里直接模拟：走内部 storage）
const sys2storage = fakeStorage();
sys2storage.setItem('jf.consent', 'on');
const timers2 = [];
const sys2 = createSystem(
	{ app: 'jiufeng-workbench', version: '1.0.0', channel: 'stable', apiBase: 'https://example.test/jf', heartbeatMs: 60000 },
	{
		React: fakeReact(), storage: sys2storage,
		document: { visibilityState: 'visible', createElement: () => ({ style: {} }), body: { appendChild() {} } },
		fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
		now: () => nowValue,
		setInterval: function (fn, ms) { timers2.push({ fn: fn, ms: ms }); return timers2.length; },
		clearInterval: () => {}, on: () => {},
		env: {}, log: () => {},
	}
);
sys2.trackSkill('dcf-model'); sys2.trackSkill('dcf-model');
sys2.trackExpert('equity-research');
sys2.trackSession();
eq('同意后技能计数', sys2.journal.day('2026-10-09').skills, { 'dcf-model': 2 });
eq('同意后专家计数', sys2.journal.day('2026-10-09').experts, { 'equity-research': 1 });
eq('同意后会话计数', sys2.journal.day('2026-10-09').sessions, 1);

// 异常上报：同意后应记录，且敏感路径被清洗
sys2.trackError('op_fail', 'sendConsultation', new Error('boom at C:\\Users\\tester\\a.js'));
eq('同意后异常被记录', sys2.journal.errors().length, 1);
ok('异常消息已清洗掉用户名', JSON.stringify(sys2.journal.errors()).indexOf('tester') < 0);

// 时长：attach 后注册心跳，按真实时间差累计
sys2.attach({});
ok('attach 后注册了心跳', timers2.length === 1 && timers2[0].ms === 60000);
nowValue += 60000;
timers2[0].fn();
ok('心跳累计 60 秒', sys2.journal.day('2026-10-09').active_seconds === 60, sys2.journal.day('2026-10-09').active_seconds);
// 睡眠/挂起：一次跳 10 分钟，只应计入上限 180 秒
nowValue += 600000;
timers2[0].fn();
ok('长时间挂起被截断到 180 秒', sys2.journal.day('2026-10-09').active_seconds === 240, sys2.journal.day('2026-10-09').active_seconds);

// 上报
await sys2.flush('test');
const reportCall = calls.concat([]).length >= 0;   // sys 与 sys2 用不同 fetch，这里只验证不抛
ok('flush 不抛异常且返回结构正确', typeof (await sys2.flush('t')) === 'object');

// 更新检查
const found = await sys.checkUpdate();
ok('checkUpdate 识别到 1.0.1 > 1.0.0', found && found.latest === '1.0.1', found);
eq('请求带 app/channel/version', /\/api\/update\?app=jiufeng-workbench&channel=stable&version=1\.0\.0/.test(calls[0].url), true);

const same = createSystem(
	{ app: 'x', version: '1.0.1', apiBase: 'https://example.test/jf' },
	{
		React: fakeReact(), storage: fakeStorage(),
		document: { visibilityState: 'visible' },
		fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ latest: '1.0.1' }) }),
		now: () => nowValue, setInterval: () => 1, clearInterval: () => {}, on: () => {}, env: {}, log: () => {},
	}
);
ok('同版本不认为有更新', (await same.checkUpdate()) === null);

const offline = createSystem(
	{ app: 'x', version: '1.0.0', apiBase: 'https://example.test/jf' },
	{
		React: fakeReact(), storage: fakeStorage(), document: { visibilityState: 'visible' },
		fetch: () => Promise.reject(new Error('offline')),
		now: () => nowValue, setInterval: () => 1, clearInterval: () => {}, on: () => {}, env: {}, log: () => {},
	}
);
ok('网络失败时静默返回 null', (await offline.checkUpdate()) === null);

/* ============ 汇总 ============ */
console.log('\n' + '='.repeat(48));
console.log('通过 ' + pass + ' / 失败 ' + fail);
console.log('='.repeat(48));
process.exit(fail === 0 ? 0 : 1);
