/**
 * 玖峰投研工作台 · 客户端系统模块（jf-sys）
 * ==========================================================================
 * 只做两件事，不贪多：
 *   ① 基础使用上报 —— 每日使用情况（时长 / 功能点击次数）与操作异常
 *   ② 版本更新提示 —— 启动时向自有服务端询问最新版本，弹窗让用户选「更新 / 不更新」
 *
 * 设计约束
 *   - 纯逻辑 + 纯展示组件；storage / fetch / document / 定时器 / 日志全部由调用方注入，
 *     因此在 node 里可直接单测（见 test-jf-sys.mjs），无需起浏览器。
 *   - 不依赖 Electron 主进程能力；渲染进程直连自有服务端（服务端需返回 CORS 头）。
 *   - ★ 隐私红线：只上报「行为标签 + 计数」，绝不上报标的、持仓、文件路径、输入原文。
 *     错误栈里的用户目录路径会被归一化为 %USERPROFILE%。
 *
 * 本文件由 gen-client.mjs 读入并注入 client bundle；注入时剥离所有 `export ` 前缀。
 */

const JF_SCHEMA = 1;

/* ==================== 纯工具 ==================== */

/** "1.10.2" -> [1, 10, 2]；非法段按 0 */
export function parseVersion(v) {
	const parts = String(v == null ? "" : v).trim().split(".");
	const out = [];
	for (let i = 0; i < 3; i++) out.push(parseInt(parts[i], 10) || 0);
	return out;
}

/** 语义化比较：a>b 返回 1，a<b 返回 -1，相等 0。按数字比，不按字符串比。 */
export function cmpVersion(a, b) {
	const A = parseVersion(a), B = parseVersion(b);
	for (let i = 0; i < 3; i++) {
		if (A[i] > B[i]) return 1;
		if (A[i] < B[i]) return -1;
	}
	return 0;
}

export function isNewer(latest, current) {
	return cmpVersion(latest, current) > 0;
}

export function randomHex(n) {
	const chars = "0123456789abcdef";
	let s = "";
	try {
		const c = globalThis.crypto || globalThis.msCrypto;
		if (c && typeof c.getRandomValues === "function") {
			const buf = new Uint8Array(Math.ceil(n / 2));
			c.getRandomValues(buf);
			for (let i = 0; i < buf.length; i++) s += chars[buf[i] >> 4] + chars[buf[i] & 15];
		}
	} catch (e) { /* 退回 Math.random */ }
	while (s.length < n) s += chars[Math.floor(Math.random() * 16)];
	return s.slice(0, n);
}

/** 本地日期 YYYY-MM-DD（按用户所在时区，不用 UTC） */
export function todayKey(ts) {
	const d = (ts === undefined || ts === null) ? new Date() : new Date(ts);
	const p = function (x) { return (x < 10 ? "0" : "") + x; };
	return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export function blankDay(date) {
	return { date: date, active_seconds: 0, sessions: 0, skills: {}, experts: {}, errors: 0 };
}

export function bumpCounter(map, key) {
	if (!key) return map;
	map[key] = (map[key] || 0) + 1;
	return map;
}

/**
 * 敏感信息清洗。错误栈里经常夹着用户目录（含 Windows 用户名），必须归一化。
 */
export function scrubText(input, max) {
	let t = String(input == null ? "" : input);
	t = t.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/g, "%USERPROFILE%");
	t = t.replace(/[A-Za-z]:[\\/]+Documents and Settings[\\/]+[^\\/\s"']+/g, "%USERPROFILE%");
	t = t.replace(/\/Users\/[^/\s"']+/g, "%USERPROFILE%");
	t = t.replace(/\/home\/[^/\s"']+/g, "%HOME%");
	t = t.replace(/\s+/g, " ").trim();
	const limit = max || 240;
	return t.length > limit ? t.slice(0, limit) + "…" : t;
}

/** 只留错误栈的前几帧 —— 定位够用，且不会把整段代码发出去 */
export function scrubStack(stack, frames) {
	const lines = String(stack == null ? "" : stack).split("\n")
		.map(function (l) { return l.trim(); }).filter(Boolean);
	return scrubText(lines.slice(0, frames || 3).join(" | "), 300);
}

export function safeStorage(raw) {
	try {
		if (raw && typeof raw.getItem === "function" && typeof raw.setItem === "function") {
			raw.setItem("__jf_probe", "1");
			raw.removeItem("__jf_probe");
			return raw;
		}
	} catch (e) { /* 隐私模式 / 配额满 → 退回内存实现 */ }
	const mem = Object.create(null);
	return {
		getItem: function (k) { return (k in mem) ? mem[k] : null; },
		setItem: function (k, v) { mem[k] = String(v); },
		removeItem: function (k) { delete mem[k]; },
	};
}

/** 匿名设备标识：本地随机生成，不做任何机器指纹 */
export function ensureDeviceId(storage, key) {
	const k = key || "jf.device_id";
	try {
		const v = storage.getItem(k);
		if (v && /^[0-9a-f]{16,64}$/.test(v)) return v;
	} catch (e) { /* ignore */ }
	const id = randomHex(32);
	try { storage.setItem(k, id); } catch (e) { /* ignore */ }
	return id;
}

/* ==================== 每日使用台账 ==================== */

/**
 * 本地累计，随时可上报。
 * 服务端按 (device_id, date) 覆盖写 → 重复上报幂等，断电也不丢。
 */
export function createJournal(storage, key, opts) {
	const options = opts || {};
	const keepDays = options.keepDays || 7;
	const maxErrors = options.maxErrors || 30;

	let data = { days: {}, errors: [] };
	try {
		const raw = storage.getItem(key);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === "object") {
				if (parsed.days && typeof parsed.days === "object") data.days = parsed.days;
				if (Array.isArray(parsed.errors)) data.errors = parsed.errors;
			}
		}
	} catch (e) { /* 数据损坏就重建，不能影响使用 */ }

	function save() {
		try {
			const dates = Object.keys(data.days).sort();
			if (dates.length > keepDays) {
				dates.slice(0, dates.length - keepDays).forEach(function (d) { delete data.days[d]; });
			}
			storage.setItem(key, JSON.stringify(data));
		} catch (e) { /* 写失败无所谓 */ }
	}

	function day(date) {
		if (!data.days[date]) data.days[date] = blankDay(date);
		return data.days[date];
	}

	function incDay(date, field, by) {
		const d = day(date);
		d[field] = (d[field] || 0) + (by || 1);
		return d;
	}

	return {
		day: day,
		days: function () { return data.days; },
		errors: function () { return data.errors; },
		addSeconds: function (date, seconds) {
			if (!(seconds > 0)) return;
			const d = day(date);
			d.active_seconds = Math.round(d.active_seconds + seconds);
			save();
		},
		inc: function (date, field, by) {
			incDay(date, field, by);
			save();
		},
		bumpSkill: function (date, id) { if (id) { bumpCounter(day(date).skills, id); save(); } },
		bumpExpert: function (date, id) { if (id) { bumpCounter(day(date).experts, id); save(); } },
		pushError: function (event, date) {
			data.errors.push(event);
			if (data.errors.length > maxErrors) data.errors = data.errors.slice(-maxErrors);
			// 异常同时计入当天计数（调用方不必再手动 inc，避免双计或漏计）
			let d = date;
			if (!d) {
				const t = (event && event.ts) ? Date.parse(event.ts) : NaN;
				d = isNaN(t) ? todayKey() : todayKey(t);
			}
			incDay(d, "errors");
			save();
		},
		dropErrors: function (count) {
			data.errors = data.errors.slice(count);
			save();
		},
		save: save,
	};
}

/** 组装上报载荷：最近 3 天台账 + 全部待发异常，一次批量发走 */
export function buildBatch(journal, cfg, deviceId, env) {
	const e = env || {};
	const batch = [];
	Object.keys(journal.days()).sort().slice(-3).forEach(function (d) {
		const x = journal.days()[d];
		batch.push({
			t: "day_usage",
			date: x.date,
			active_seconds: Math.round(x.active_seconds || 0),
			sessions: x.sessions || 0,
			skills: x.skills || {},
			experts: x.experts || {},
			errors: x.errors || 0,
		});
	});
	journal.errors().forEach(function (item) {
		batch.push(Object.assign({ t: "error" }, item));
	});
	return {
		schema: JF_SCHEMA,
		app: cfg.app,
		app_version: cfg.version,
		channel: cfg.channel || "stable",
		device_id: deviceId,
		os: e.os || "",
		os_version: e.osVersion || "",
		arch: e.arch || "",
		tz: e.tz || "",
		lang: e.lang || "",
		sent_at: e.at || new Date().toISOString(),
		batch: batch,
	};
}

/* ==================== 系统主体 ==================== */

/**
 * @param cfg  见 gen-client.mjs 顶部的 JF_CONFIG
 * @param deps { React, storage, document, fetch, now, setInterval, clearInterval, on, env, openExternal, log }
 */
export function createSystem(cfg, deps) {
	const React = deps.React;
	const h = React.createElement;
	const storage = safeStorage(deps.storage);
	const doc = deps.document;
	const nowFn = deps.now || function () { return Date.now(); };
	const fetchFn = deps.fetch;
	const env = deps.env || {};
	const log = deps.log || function () {};
	const setTimer = deps.setInterval || function (fn, ms) { return globalThis.setInterval(fn, ms); };
	const clearTimer = deps.clearInterval || function (id) { globalThis.clearInterval(id); };
	const on = deps.on || function (target, type, fn, opt) {
		if (target && typeof target.addEventListener === "function") target.addEventListener(type, fn, opt);
	};

	const K_DEVICE = "jf.device_id";
	const K_CONSENT = "jf.consent";
	const K_JOURNAL = "jf.journal";
	const K_SKIP = "jf.skip_version";
	const K_SNOOZE = "jf.snooze";

	const journal = createJournal(storage, K_JOURNAL, { keepDays: 7, maxErrors: 30 });
	const deviceId = ensureDeviceId(storage, K_DEVICE);

	let ctx = null;
	let lastTick = nowFn();
	let lastReport = 0;
	let timer = null;
	let uiListeners = new Set();
	let uiState = { open: false, mode: "about", update: null, checking: false, checkedAt: 0, lastError: "" };

	function emitUi(patch) {
		uiState = Object.assign({}, uiState, patch);
		uiListeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
	}

	function consent() { return storage.getItem(K_CONSENT); }
	function telemetryOn() { return consent() === "on"; }
	function today() { return todayKey(nowFn()); }

	/* ---------- 埋点接口（模板在用户操作处调用） ---------- */

	function trackSession() {
		try { if (telemetryOn()) journal.inc(today(), "sessions"); } catch (e) { /* ignore */ }
	}
	function trackSkill(id) {
		try { if (telemetryOn()) journal.bumpSkill(today(), id); } catch (e) { /* ignore */ }
	}
	function trackExpert(id) {
		try { if (telemetryOn()) journal.bumpExpert(today(), id); } catch (e) { /* ignore */ }
	}
	function trackError(kind, where, err) {
		try {
			if (!telemetryOn()) return;
			const msg = scrubText((err && (err.message || err.msg)) || err, 240);
			const stack = scrubStack(err && err.stack, 3);
			if (!msg && !stack) return;
			journal.pushError({ ts: new Date(nowFn()).toISOString(), kind: kind, where: where, msg: msg, stack: stack }, today());
		} catch (e) { /* ignore */ }
	}

	/* ---------- 时长累计 ---------- */

	/** 结算自上次 tick 以来的前台时长；睡眠/挂起的时间会被截断，不虚增 */
	function tickSeconds(force) {
		const t = nowFn();
		const delta = (t - lastTick) / 1000;
		lastTick = t;
		if (!(delta > 0)) return;
		if (!force && doc && doc.visibilityState && doc.visibilityState !== "visible") return;
		if (telemetryOn()) journal.addSeconds(today(), Math.min(delta, 180));
	}

	/* ---------- 上报 ---------- */

	async function flush(reason) {
		try {
			if (!telemetryOn()) return { ok: false, reason: "off" };
			if (!fetchFn || !cfg.apiBase) return { ok: false, reason: "no-endpoint" };
			const payload = buildBatch(journal, cfg, deviceId, Object.assign({ at: new Date(nowFn()).toISOString() }, env));
			if (!payload.batch.length) return { ok: true, reason: "empty" };
			const res = await fetchFn(cfg.apiBase + "/api/report", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				cache: "no-store",
				keepalive: true,
			});
			if (res && res.ok) {
				journal.dropErrors(journal.errors().length);
				lastReport = nowFn();
				return { ok: true, reason: reason || "sent" };
			}
			return { ok: false, reason: "http-" + (res ? res.status : "?") };
		} catch (e) {
			log("report failed", e);
			return { ok: false, reason: "network" };
		}
	}

	function maybeFlush() {
		if (nowFn() - lastReport >= (cfg.reportIntervalMs || 180000)) flush("interval");
	}

	/* ---------- 更新检查 ---------- */

	function updateUrl() {
		return cfg.apiBase + "/api/update?app=" + encodeURIComponent(cfg.app)
			+ "&channel=" + encodeURIComponent(cfg.channel || "stable")
			+ "&version=" + encodeURIComponent(cfg.version);
	}

	/** 拉取远端版本信息；网络异常一律静默（不能打扰用户） */
	async function fetchUpdate() {
		if (!fetchFn || !cfg.apiBase) return { ok: false, error: "未配置服务端地址" };
		try {
			const res = await fetchFn(updateUrl(), { cache: "no-store" });
			if (!res || !res.ok) return { ok: false, error: "服务端返回 " + (res ? res.status : "网络错误") };
			const info = await res.json();
			if (!info || !info.latest) return { ok: false, error: "返回内容无版本号" };
			return { ok: true, info: info };
		} catch (e) {
			return { ok: false, error: "无法连接更新服务" };
		}
	}

	async function checkUpdate() {
		emitUi({ checking: true, lastError: "" });
		const r = await fetchUpdate();
		if (!r.ok) { emitUi({ checking: false, lastError: r.error }); return null; }
		emitUi({ checking: false, checkedAt: nowFn(), lastError: "" });
		return isNewer(r.info.latest, cfg.version) ? r.info : null;
	}

	/** 启动路径：有新版就弹窗；用户「稍后」当天不再弹，「跳过此版本」永久不再弹 */
	async function checkAndPrompt() {
		const info = await checkUpdate();
		if (!info) return;
		if (!info.force) {
			if (storage.getItem(K_SKIP) === String(info.latest)) return;
			if (storage.getItem(K_SNOOZE) === String(info.latest) + "@" + today()) return;
		}
		emitUi({ open: true, mode: "update", update: info });
	}

	/* ---------- 外部动作 ---------- */

	function openExternal(url) {
		if (!url) return false;
		try {
			if (typeof deps.openExternal === "function" && deps.openExternal(url)) return true;
		} catch (e) { /* 继续兜底 */ }
		try {
			const a = doc.createElement("a");
			a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
			doc.body.appendChild(a); a.click(); a.remove();
			return true;
		} catch (e) { /* 再兜底 */ }
		try { globalThis.open(url, "_blank", "noopener"); return true; } catch (e) { /* give up */ }
		return false;
	}

	function copyText(text) {
		try {
			if (globalThis.navigator && navigator.clipboard) { navigator.clipboard.writeText(text); return true; }
		} catch (e) { /* ignore */ }
		return false;
	}

	/* ---------- UI ---------- */

	function SystemCard() {
		const [s, setS] = React.useState(uiState);
		React.useEffect(function () {
			const fn = function () { setS(Object.assign({}, uiState)); };
			uiListeners.add(fn);
			return function () { uiListeners.delete(fn); };
		}, []);

		if (!s.open) return null;
		const close = function () { emitUi({ open: false }); };
		const stop = function (e) { e.stopPropagation(); };

		let title = "关于";
		let body = null;

		if (s.mode === "privacy") {
			title = "关于使用数据";
			body = h("div", { className: "jf-sys-body" },
				h("p", { className: "jf-sys-lead" }, "为了把产品做得更好，我们会匿名记录三项基本信息："),
				h("ul", { className: "jf-sys-list" },
					h("li", null, h("b", null, "使用时长"), "，以及每天打开软件的次数"),
					h("li", null, h("b", null, "用到了哪些功能"), "（只记功能名与次数）"),
					h("li", null, h("b", null, "程序报错信息"), "，用于定位故障")
				),
				h("p", { className: "jf-sys-note" }, "不会记录：你查询的股票、自选股、持仓、文档内容，以及任何输入的文字。样本以匿名设备号区分，不含任何账号信息。"),
				h("div", { className: "jf-sys-actions" },
					h("button", {
						className: "jf-sys-btn ghost",
						onClick: function () { storage.setItem(K_CONSENT, "off"); close(); },
					}, "不开启"),
					h("button", {
						className: "jf-sys-btn primary",
						onClick: function () {
							storage.setItem(K_CONSENT, "on");
							close();
							checkAndPrompt();
						},
					}, "开启并继续")
				)
			);
		} else if (s.mode === "update") {
			const info = s.update || {};
			const notes = Array.isArray(info.notes) ? info.notes : (info.notes ? [String(info.notes)] : []);
			title = "发现新版本 v" + info.latest;
			body = h("div", { className: "jf-sys-body" },
				h("div", { className: "jf-sys-meta" },
					"当前 v" + cfg.version,
					info.released_at ? " · 发布于 " + info.released_at : "",
					info.size_mb ? " · " + info.size_mb + " MB" : ""
				),
				info.title ? h("div", { className: "jf-sys-sub" }, info.title) : null,
				notes.length ? h("ul", { className: "jf-sys-list" }, notes.map(function (n, i) { return h("li", { key: i }, n); })) : null,
				info.force ? h("p", { className: "jf-sys-note warn" }, "本次为必要更新，建议尽快升级。") : null,
				!info.force ? h("label", { className: "jf-sys-check" },
					h("input", {
						type: "checkbox",
						checked: !!s.skipNext,
						onChange: function (e) { emitUi({ skipNext: e.target.checked }); },
					}),
					"跳过此版本，不再提示"
				) : null,
				h("div", { className: "jf-sys-actions" },
					!info.force ? h("button", {
						className: "jf-sys-btn ghost",
						onClick: function () {
							if (s.skipNext) storage.setItem(K_SKIP, String(info.latest));
							else storage.setItem(K_SNOOZE, String(info.latest) + "@" + today());
							close();
						},
					}, "稍后再说") : null,
					h("button", {
						className: "jf-sys-btn primary",
						onClick: function () {
							const ok = openExternal(info.download_url);
							if (!ok) emitUi({ mode: "update", lastError: "无法自动打开浏览器，请手动访问：" + (info.download_url || "（未配置下载地址）") });
							else close();
						},
					}, "立即更新")
				),
				s.lastError ? h("div", { className: "jf-sys-err" }, s.lastError) : null
			);
		} else {
			title = "玖峰投研工作台";
			const up = s.update;
			body = h("div", { className: "jf-sys-body" },
				h("div", { className: "jf-sys-meta" }, "版本 v" + cfg.version + " · " + (cfg.channel || "stable")),
				h("div", { className: "jf-sys-rows" },
					h("div", { className: "jf-sys-row" },
						h("span", null, "软件更新"),
						h("span", { className: "jf-sys-rowv" },
							s.checking ? "检查中…"
								: up ? "发现 v" + up.latest
								: (s.checkedAt ? "已是最新版本" : "尚未检查"),
							" ",
							h("button", {
								className: "jf-sys-link",
								onClick: function () { up ? emitUi({ mode: "update", update: up }) : checkUpdate().then(function (info) { if (info) emitUi({ mode: "update", update: info }); }); },
							}, up ? "去更新" : "检查更新")
						)
					),
					h("div", { className: "jf-sys-row" },
						h("span", null, "使用数据上报"),
						h("span", { className: "jf-sys-rowv" },
							// 首启不再弹告知卡片，所以把告知文本的入口放在这里，随时可复查
							h("button", {
								className: "jf-sys-link",
								onClick: function () { emitUi({ mode: "privacy" }); },
							}, "查看告知"),
							" ",
							h("button", {
								className: "jf-sys-toggle " + (telemetryOn() ? "on" : "off"),
								onClick: function () {
									storage.setItem(K_CONSENT, telemetryOn() ? "off" : "on");
									emitUi({});
									if (telemetryOn()) flush("manual");
								},
							}, telemetryOn() ? "已开启" : "已关闭")
						)
					),
					h("div", { className: "jf-sys-row" },
						h("span", null, "匿名设备号"),
						h("span", { className: "jf-sys-rowv mono" }, deviceId.slice(0, 8) + "…")
					)
				),
				h("p", { className: "jf-sys-note" }, "数据仅用于产品改进，不含股票、持仓或任何输入内容。"),
				s.lastError ? h("div", { className: "jf-sys-err" }, s.lastError) : null,
				h("div", { className: "jf-sys-actions" },
					h("button", { className: "jf-sys-btn ghost", onClick: close }, "关闭")
				)
			);
		}

		return h("div", { className: "jf-sys-overlay", onClick: close },
			h("div", { className: "jf-sys-card", onClick: stop },
				h("button", { className: "jf-sys-close", onClick: close }, "✕"),
				h("div", { className: "jf-sys-title" }, title),
				body
			)
		);
	}

	/* ---------- 生命周期 ---------- */

	function attach(context) {
		ctx = context || ctx;
		// 重复挂载（插件热重载）时先清掉旧心跳，避免定时器堆积
		if (timer) { clearTimer(timer); timer = null; }
		trackSession();

		try {
			on(globalThis, "error", function (ev) {
				const where = "window";
				trackError("js_error", where, (ev && ev.error) || (ev && ev.message));
			});
			on(globalThis, "unhandledrejection", function (ev) {
				trackError("unhandled_rejection", "promise", ev && ev.reason);
			});
		} catch (e) { /* ignore */ }

		timer = setTimer(function () { tickSeconds(false); maybeFlush(); }, cfg.heartbeatMs || 60000);

		try {
			on(doc, "visibilitychange", function () {
				if (doc.visibilityState === "hidden") { tickSeconds(true); flush("hidden"); }
				else { lastTick = nowFn(); }
			});
			on(globalThis, "beforeunload", function () { tickSeconds(true); flush("unload"); });
		} catch (e) { /* ignore */ }

		// ★ 2026-10-15：首启不再弹「关于使用数据」卡片。
		//   安装程序在安装阶段已做使用数据告知（控制台会打印一行，见 install.ps1 第 4 步），
		//   这里直接把同意记为「已开启」——否则用户一进软件就要先点掉一个全屏卡片，
		//   与「装完只需配 API Key，进去就是玖峰投研正式版窗口」冲突。
		//   告知文本没有删：它仍在「关于」面板的「查看告知」里可随时读到，
		//   开关也仍在同一行，用户想关随时能关。
		if (consent() === null) { storage.setItem(K_CONSENT, "on"); }
		setTimeout(function () {
			if (telemetryOn()) { checkAndPrompt(); flush("start"); }
		}, cfg.checkDelayMs || 4000);

		return function detach() {
			if (timer) clearTimer(timer);
			timer = null;
		};
	}

	return {
		attach: attach,
		SystemCard: SystemCard,
		state: function () { return uiState; },
		subscribe: function (fn) {
			uiListeners.add(fn);
			return function () { uiListeners.delete(fn); };
		},
		open: function (mode) { emitUi({ open: true, mode: mode || "about" }); },
		close: function () { emitUi({ open: false }); },
		trackSession: trackSession,
		trackSkill: trackSkill,
		trackExpert: trackExpert,
		trackError: trackError,
		flush: flush,
		checkUpdate: checkUpdate,
		checkAndPrompt: checkAndPrompt,
		openExternal: openExternal,
		journal: journal,
		deviceId: deviceId,
		telemetryOn: telemetryOn,
	};
}
