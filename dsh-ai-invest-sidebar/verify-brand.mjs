/**
 * verify-brand.mjs — 不开 DSH、不开浏览器，验证「品牌与文案覆盖」真的生效。
 *
 * 覆盖的机制：DSH 的 locale 服务只提供 register（同一 ns+语言重复注册会抛错），
 * 没有覆盖入口；但 register 存进 dicts 的是字典对象的引用，所以插件拿到字典改属性即可。
 * 本脚本用一份**忠实复刻 register/publish 语义的假 locale 服务**，把 client.js 的
 * apply() 跑起来，断言字典被改、未覆盖的 key 不受影响、迟到注册与结构变更都有兜底。
 *
 * 用法： node verify-brand.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = import.meta.dirname;
const DSH_APP = 'D:/Program Files/DSH Desktop/resources/app';
const BRAND = { name: '玖峰投研工作台', slogan: '让投研工作更简单', upstream: 'DeepSeek Harness' };

const req = createRequire(path.join(DSH_APP, 'noop.js'));
let realReact;
try { realReact = req('react'); }
catch {
    realReact = { createElement: (t, p, ...c) => ({ type: t, props: { ...(p || {}), children: c.length > 1 ? c : c[0] } }), Fragment: Symbol.for('react.fragment') };
}

// ── 假 React / document / MutationObserver ─────────────────────────────────
let hookOrder = 0;
const fakeReact = {
    createElement: realReact.createElement,
    Fragment: realReact.Fragment,
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (v) => ({ current: v === undefined ? null : v }),
    useCallback: (fn) => fn,
    useSyncExternalStore: (_s, get) => (typeof get === 'function' ? get() : null),
};

const doc = {
    title: BRAND.upstream,                       // DSH 的 productTitle，模拟初始窗口标题
    body: { getAttribute: () => null },
    createElement: () => ({ setAttribute() {}, appendChild() {} }),
    head: { appendChild() {} },
    documentElement: {},
    getElementById: () => null,
};
const moInstances = [];
class FakeMutationObserver {
    constructor(cb) { this.cb = cb; this.observed = false; moInstances.push(this); }
    observe() { this.observed = true; }
    disconnect() {}
}

const win = {};
let mod = null;
const sandbox = {
    window: win,
    document: doc,
    location: { href: '' },
    navigator: { userAgent: 'node' },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    MutationObserver: FakeMutationObserver,
    fetch: () => Promise.reject(new Error('no network in test')),
    require: (n) => (n === 'react' ? fakeReact : req(n)),
};
win.__ModuleLoader__ = { load: ({ factory }) => { mod = factory(sandbox.require); } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'client/client.js'), 'utf8'), sandbox, { filename: 'client.js' });
if (!mod || typeof mod.apply !== 'function') { console.error('✗ client.js 加载失败'); process.exit(1); }

// ── 假 locale 服务：语义对齐 dsh-client-locale ─────────────────────────────
class FakeLocale {
    constructor({ withDicts = true } = {}) {
        this.dicts = withDicts ? new Map() : undefined;   // 结构缺失场景用于验证 translate 兜底
        this.snapshot = { active: 'zh', locales: ['zh', 'en'], revision: 0 };
        this.publishCount = 0;
        this.fallbacks = [];
    }
    register(ns, localeOrDicts, dict) {
        const pairs = typeof localeOrDicts === 'string' ? [[localeOrDicts, dict]] : Object.entries(localeOrDicts);
        if (!this.dicts) return () => {};
        let locales = this.dicts.get(ns);
        if (!locales) { locales = new Map(); this.dicts.set(ns, locales); }
        for (const [l] of pairs) {
            if (locales.has(l.toLowerCase())) throw new Error(`locale namespace "${ns}" already has locale "${l}"`);
        }
        for (const [l, e] of pairs) locales.set(l.toLowerCase(), e);
        this.publish(false);
        return () => {};
    }
    publish(_changed) { this.publishCount++; this.snapshot = { ...this.snapshot, revision: this.snapshot.revision + 1 }; }
    lookup(ns, key) { const m = this.dicts?.get(ns); if (!m) return undefined; const d = m.get('zh'); return d ? d[key] : undefined; }
    translate(ns, key) { return this.lookup(ns, key) ?? key; }
    bind(ns) { const self = this; return (k, p) => self.translate(ns, k, p); }
}

function makeCtx(locale) {
    const slots = {};
    return {
        locale,
        effect: (fn) => { try { fn(); } catch { /* 注册类副作用 */ } return () => {}; },
        slots: {
            inject: (name, fn) => { slots[name] = fn(); },
            register: (_def, comp) => ({ comp }),
        },
        sessions: { open() {} },
        theme: {}, connection: {}, workspaces: {},
        __slots: slots,
    };
}

const CONV_DICT = {
    'hero.headline': '探索未至之境',
    'hero.preview': '预览版',
    'hero.chooseWorkspace': '选择工作区',
    'placeholder.hero': '描述你想要构建的内容, / 调用指令, @ 文件或对话',
    'image.tooLarge': '图片过大',          // 不该被碰的 key
    'todo.title': '任务',
};
const CONV_EN = { 'hero.headline': 'Into the Unknown', 'hero.preview': 'Preview' };

let fail = 0;
const ok = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.error('  ✗ ' + msg); fail++; } };

// ── 场景 A：字典已注册（正常启动顺序）────────────────────────────────────
console.log('\n=== A. 字典已注册时 apply ===');
{
    const locale = new FakeLocale();
    const zh = { ...CONV_DICT };                       // 注意：注册前先复制，验证改的是注册进去的那份
    locale.register('conversation', { zh, en: { ...CONV_EN } });
    // 「settings.models」里的内测声明（对应 key 用 ns 限定后才该被覆盖）
    const settings = { welcomeTitle: '测试声明', welcomeBody: 'DeepSeek Harness 目前的 0.1 版本仍处在面向 Harness 开发者进行测试的阶段…' };
    locale.register('settings.models', { zh: settings, en: {} });
    // 另一个 ns 里的同名 key —— 绝不能被误伤
    const other = { welcomeTitle: '别的插件的欢迎语' };
    locale.register('other.plugin', { zh: other, en: {} });
    const before = locale.publishCount;
    mod.apply(makeCtx(locale));
    ok(zh['hero.headline'] === BRAND.slogan, `hero.headline 被改成「${BRAND.slogan}」`);
    ok(zh['hero.preview'] === '内测版', 'hero.preview 改成「内测版」');
    ok(zh['placeholder.hero'].indexOf('投研需求') > 0, 'placeholder.hero 去掉编程语境');
    ok(settings.welcomeTitle === '内测声明', 'settings.models 的 welcomeTitle 被覆盖');
    ok(settings.welcomeBody.indexOf('玖峰投研工作台') === 0, '内测声明正文换成玖峰投研的说明');
    ok(settings.welcomeBody.indexOf('DeepSeek Harness') < 0, '内测声明里不再提上游产品名');
    ok(other.welcomeTitle === '别的插件的欢迎语', 'ns 限定的 key 不会误伤其他命名空间同名 key');
    ok(zh['image.tooLarge'] === '图片过大', '未在覆盖表里、也不含术语的 key 原样保留');
    ok(zh['hero.chooseWorkspace'] === '选择投研空间', '含「工作区」的 key 被术语表改成「投研空间」');
    ok(locale.dicts.get('conversation').get('en')['hero.headline'] === 'Into the Unknown', '英文（en）字典未被改动');
    ok(locale.publishCount > before, 'publish 被调用（否则界面不会重绘，改了也看不见）');
    ok(locale.lookup('conversation', 'hero.headline') === BRAND.slogan, 'translate 查询返回新文案');
}

// ── 场景 B：字典迟到注册（apply 时还没有）───────────────────────────────
console.log('\n=== B. 字典晚于插件注册（验证包装 register）===');
{
    const locale = new FakeLocale();
    mod.apply(makeCtx(locale));                        // 此刻 conversation 还没注册
    const late = { ...CONV_DICT };
    locale.register('conversation', { zh: late, en: { ...CONV_EN } });   // 后到的字典
    ok(late['hero.headline'] === BRAND.slogan, '迟到注册的字典同样被覆盖');
    ok(locale.lookup('conversation', 'hero.headline') === BRAND.slogan, '查询返回新文案');
}

// ── 场景 C：dicts 结构变更 → translate 兜底 ──────────────────────────────
console.log('\n=== C. dicts 不可用时的 translate 兜底 ===');
{
    const locale = new FakeLocale({ withDicts: false });
    mod.apply(makeCtx(locale));
    locale.translate = locale.translate.bind(locale);
    const t = locale.bind ? (k) => locale.translate('conversation', k) : null;
    ok(locale.translate('conversation', 'hero.headline') === BRAND.slogan, 'translate 兜底返回新文案');
    ok(locale.translate('conversation', 'todo.title') === 'todo.title', '未覆盖的 key 仍走原逻辑（此处返回 key）');
}

// ── 场景 D：窗口标题 ───────────────────────────────────────────────────
console.log('\n=== D. 窗口标题替换 ===');
{
    doc.title = BRAND.upstream;                        // 重置成 DSH 的 productTitle
    moInstances.length = 0;
    const locale = new FakeLocale();
    mod.apply(makeCtx(locale));
    ok(doc.title === BRAND.name, `无会话标题时：${BRAND.upstream} → ${BRAND.name}`);
    ok(moInstances.some((m) => m.observed), '装了 MutationObserver（DSH 每次重渲染都会重写标题）');

    doc.title = '财务监控诊断 — ' + BRAND.upstream;     // 模拟 React 再次写回带产品名的标题
    moInstances.forEach((m) => m.cb());
    ok(doc.title === '财务监控诊断 — ' + BRAND.name, `有会话标题时：会话名 — ${BRAND.name}`);
    ok(doc.title.indexOf(BRAND.upstream) < 0, '旧产品名已完全消失');
}

// ── 场景 F：页面没设标题（Windows 会用窗口 spec 的标题）──────────────────
console.log('\n=== F. 页面标题为空时 ===');
{
    doc.title = '';
    const locale = new FakeLocale();
    mod.apply(makeCtx(locale));
    ok(doc.title === BRAND.name, `空标题 → 直接落品牌名（实际「${doc.title}」）`);
}

// ── 场景 E：重复 apply 不炸、不重复注册 ─────────────────────────────────
console.log('\n=== E. 幂等性 ===');
{
    const locale = new FakeLocale();
    const zh = { ...CONV_DICT };
    locale.register('conversation', { zh, en: { ...CONV_EN } });
    let err = null;
    try { mod.apply(makeCtx(locale)); mod.apply(makeCtx(locale)); } catch (e) { err = e; }
    ok(!err, '连续 apply 两次不抛错' + (err ? '（' + err.message + '）' : ''));
    ok(zh['hero.headline'] === BRAND.slogan, '覆盖结果稳定');
}

// ── 场景 G：术语本地化（工作区 → 投研空间）─────────────────────────────
console.log('\n=== G. 术语本地化 ===');
{
    const locale = new FakeLocale();
    const zh = {
        'access.preset.workspaceWrite': '工作区内修改',
        'placeholder.workspace': '选择一个工作区开始',
        'crumb.root': '工作区',
        'multi.hit': '工作区与工作区之间',
        'safe': '投研工作台',                                  // 「工作台」≠「工作区」，不该动
        'placeholder.default': '发消息或创建任务, / 调用指令, @ 文件或对话',   // 精确覆盖应压过术语表
    };
    locale.register('conversation', { zh, en: { 'crumb.root': 'workspace' } });
    mod.apply(makeCtx(locale));

    ok(zh['access.preset.workspaceWrite'] === '投研空间内修改', '权限档位「工作区内修改」→「投研空间内修改」');
    ok(zh['placeholder.workspace'] === '选择一个投研空间开始', '输入框提示跟着变');
    ok(zh['crumb.root'] === '投研空间', '单独成词的「工作区」也替换');
    ok(zh['multi.hit'] === '投研空间与投研空间之间', '同一条文案里出现多次，全部替换（不是只替第一个）');
    ok(zh['safe'] === '投研工作台', '形近词「工作台」不被误伤');
    ok(zh['placeholder.default'] === '描述你的投研需求, / 调用指令, @ 文件或对话', '精确覆盖优先于术语替换');
    ok(locale.dicts.get('conversation').get('en')['crumb.root'] === 'workspace', '英文字典不做术语替换');
}
{
    // 兜底路径（dicts 结构不可用）也要做术语替换
    const locale = new FakeLocale({ withDicts: false });
    locale.translate = (ns, key) => (key === 'crumb.root' ? '工作区' : key);
    mod.apply(makeCtx(locale));
    ok(locale.translate('conversation', 'crumb.root') === '投研空间', 'translate 兜底路径同样做术语替换');
    ok(locale.translate('conversation', 'other.key') === 'other.key', '兜底路径不影响无关 key');
}

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ 全部通过（0 失败）');
process.exit(fail ? 1 : 0);
