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

/**
 * 上报同意状态：**默认开启，不弹窗**（合规声明放在安装器里，软件内「关于」可随时关闭）。
 *
 * ★ 2026-10-22 迁移说明：早期版本首启会弹「关于使用数据」卡片，用户点「不开启」后会永久
 *   写入 `jf.consent = "off"`，而当时的卡片是唯一入口、关掉就再无提示 —— 实测作者本机
 *   正是这个状态（有 device_id、无 journal、零上报）。这里用 `jf.consent_v` 做一次性迁移：
 *   没有版本标记的 off 一律纠正为 on；用户在**新版界面**里手动关掉的（带 v=2 标记）继续尊重。
 */
export function ensureConsent(storage) {
	const K = "jf.consent";
	const KV = "jf.consent_v";
	const VERSION = "2";
	try {
		const ver = storage.getItem(KV);
		const cur = storage.getItem(K);
		if (cur === null) {
			storage.setItem(K, "on");
			storage.setItem(KV, VERSION);
			return "on";
		}
		if (cur === "off" && ver !== VERSION) {
			storage.setItem(K, "on");
			storage.setItem(KV, VERSION);
			return "on";
		}
		if (ver !== VERSION) storage.setItem(KV, VERSION);
		return cur;
	} catch (e) {
		return "on";
	}
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
	const K_CONSENT_VER = "jf.consent_v";
	const K_JOURNAL = "jf.journal";
	const K_SKIP = "jf.skip_version";
	const K_SNOOZE = "jf.snooze";
	const K_LASTVER = "jf.last_seen_ver";

	const journal = createJournal(storage, K_JOURNAL, { keepDays: 7, maxErrors: 30 });
	const deviceId = ensureDeviceId(storage, K_DEVICE);
	// 默认开启（不弹窗）；把旧版遗留的 off 一次性迁到 on，见 ensureConsent 注释
	ensureConsent(storage);

	// 升级完成提示：上次启动的版本与本次不同 → 启动后弹一个几秒自消失的小窗。
	// 这是「小更新不打扰」的收尾动作：更新过程静默，只在装完之后轻提示一次。
	const lastSeenVer = (function () { try { return storage.getItem(K_LASTVER); } catch (e) { return null; } })();
	const updatedFrom = (lastSeenVer && String(lastSeenVer) !== String(cfg.version || "")) ? String(lastSeenVer) : "";
	try { storage.setItem(K_LASTVER, String(cfg.version || "")); } catch (e) { /* ignore */ }

	let ctx = null;
	let lastTick = nowFn();
	let lastReport = 0;
	let timer = null;
	let uiListeners = new Set();
	let uiState = { open: false, mode: "about", update: null, checking: false, checkedAt: 0, lastError: "", lastReport: null, toast: null, forceMask: false };

	function emitUi(patch) {
		uiState = Object.assign({}, uiState, patch);
		uiListeners.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
	}

	function consent() { return storage.getItem(K_CONSENT); }
	function telemetryOn() { return consent() === "on"; }
	function today() { return todayKey(nowFn()); }

	/** 更新档位归一化：silent（静默）/ notice（提示）/ force（强制）。
	 *  服务端未给 level 时退回旧语义：force 字段为真 → force，否则 notice。 */
	function levelOf(info) {
		const raw = String((info && info.level) || "").toLowerCase();
		if (raw === "silent" || raw === "notice" || raw === "force") return raw;
		return (info && info.force) ? "force" : "notice";
	}

	/** 轻提示小窗：右下角，几秒后自动消失，不抢焦点、不阻断操作 */
	function showToast(text, opts) {
		opts = opts || {};
		const at = nowFn();
		emitUi({ toast: { text: String(text || ""), at: at, kind: opts.kind || "info", action: opts.action || null } });
		const later = deps.setTimeout || function (fn, ms) { return globalThis.setTimeout(fn, ms); };
		try {
			later(function () {
				if (uiState.toast && uiState.toast.at === at) emitUi({ toast: null });
			}, opts.ms || 5200);
		} catch (e) { /* ignore */ }
		return true;
	}

	function dismissToast() { emitUi({ toast: null }); }

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

	/** 记录最近一次上报结果（只在「关于」面板显示，不打扰用户；避免失败后完全无痕） */
	function reportState(r) {
		try {
			if (r && r.reason !== "empty" && r.reason !== "off") {
				emitUi({ lastReport: { ok: !!r.ok, reason: String(r.reason || ""), at: nowFn() } });
			}
		} catch (e) { /* ignore */ }
		return r;
	}

	async function flush(reason) {
		try {
			if (!telemetryOn()) return reportState({ ok: false, reason: "off" });
			if (!fetchFn || !cfg.apiBase) return reportState({ ok: false, reason: "no-endpoint" });
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
				return reportState({ ok: true, reason: reason || "sent" });
			}
			return reportState({ ok: false, reason: "http-" + (res ? res.status : "?") });
		} catch (e) {
			log("report failed", e);
			return reportState({ ok: false, reason: "network" });
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

	/**
	 * 启动路径：按服务端下发的 level 决定打扰程度（档位由我们自己手动设置，客户端不自动分级）
	 *   silent → 什么都不弹，由后台更新器静默装；装完下次启动用「升级小窗」告知
	 *   notice → 弹卡片，可「稍后 / 跳过此版本」
	 *   force  → 全屏遮罩，不可关闭，只有「立即更新 / 退出软件」
	 */
	async function checkAndPrompt() {
		const info = await checkUpdate();
		if (!info) return null;
		const level = levelOf(info);
		const tagged = Object.assign({}, info, { level: level });
		// 静默档也要记住，好让「关于」面板显示「有新版本（后台自动安装）」
		emitUi({ update: tagged });

		if (level === "silent") return tagged;   // 不打扰

		if (level === "force") {
			emitUi({ open: true, mode: "update", update: tagged, forceMask: true });
			return tagged;
		}

		if (storage.getItem(K_SKIP) === String(info.latest)) return tagged;
		if (storage.getItem(K_SNOOZE) === String(info.latest) + "@" + today()) return tagged;
		emitUi({ open: true, mode: "update", update: tagged, forceMask: false });
		return tagged;
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

		if (!s.open) {
			// 未开卡片时只可能有轻提示小窗（升级完成等），不占焦点
			if (!s.toast) return null;
			return h("div", { className: "jf-sys-toast " + (s.toast.kind || "info"), onClick: dismissToast, title: "点击关闭" },
				h("div", { className: "jf-sys-toast-txt" }, s.toast.text),
				h("div", { className: "jf-sys-toast-bar" })
			);
		}
		const close = function () { emitUi({ open: false, forceMask: false }); };
		const stop = function (e) { e.stopPropagation(); };
		// 强制更新：遮罩不可关闭，不给「稍后」，只有更新或退出
		const forceMode = !!(s.forceMask || (s.mode === "update" && s.update && levelOf(s.update) === "force"));

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
			const lvl = levelOf(info);
			title = lvl === "force" ? "需要更新才能继续使用" : "发现新版本 v" + info.latest;
			body = h("div", { className: "jf-sys-body" },
				h("div", { className: "jf-sys-meta" },
					"当前 v" + cfg.version,
					info.released_at ? " · 发布于 " + info.released_at : "",
					info.size_mb ? " · " + info.size_mb + " MB" : ""
				),
				info.title ? h("div", { className: "jf-sys-sub" }, info.title) : null,
				notes.length ? h("ul", { className: "jf-sys-list" }, notes.map(function (n, i) { return h("li", { key: i }, n); })) : null,
				info.force || lvl === "force" ? h("p", { className: "jf-sys-note warn" }, "本次为必须更新：请更新后再继续使用，否则软件无法正常工作。") : null,
				lvl === "silent" ? h("p", { className: "jf-sys-note" }, "本次为小更新，软件会在后台自动安装，装好后会轻提示你一次；也可以现在就手动更新。") : null,
				lvl === "notice" ? h("label", { className: "jf-sys-check" },
					h("input", {
						type: "checkbox",
						checked: !!s.skipNext,
						onChange: function (e) { emitUi({ skipNext: e.target.checked }); },
					}),
					"跳过此版本，不再提示"
				) : null,
				h("div", { className: "jf-sys-actions" },
					lvl !== "force" ? h("button", {
						className: "jf-sys-btn ghost",
						onClick: function () {
							if (s.skipNext) storage.setItem(K_SKIP, String(info.latest));
							else storage.setItem(K_SNOOZE, String(info.latest) + "@" + today());
							close();
						},
					}, lvl === "silent" ? "知道了" : "稍后再说") : null,
					h("button", {
						className: "jf-sys-btn primary",
						onClick: function () {
							const ok = openExternal(info.download_url);
							if (!ok) emitUi({ mode: "update", lastError: "无法自动打开浏览器，请手动访问：" + (info.download_url || "（未配置下载地址）") });
							else if (lvl !== "force") close();
						},
					}, lvl === "force" ? "立即更新（必须）" : "立即更新"),
					lvl === "force" ? h("button", {
						className: "jf-sys-btn danger",
						onClick: function () {
							// 不更新就只能退出。渲染进程能关窗口就关，关不掉就明确告知用户手动退出。
							try { (globalThis.close || window.close).call(window); } catch (e) { /* ignore */ }
							try { emitUi({ lastError: "请手动关闭软件窗口。更新完成后再打开即可。" }); } catch (e) { /* ignore */ }
						},
					}, "退出软件") : null
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
								: up ? (levelOf(up) === "silent" ? "有新版本 v" + up.latest + "（后台自动安装）" : "发现 v" + up.latest)
								: (s.checkedAt ? "已是最新版本" : "尚未检查"),
							" ",
							h("button", {
								className: "jf-sys-link",
								onClick: function () {
									const openIt = function (info) { emitUi({ mode: "update", update: Object.assign({}, info, { level: levelOf(info) }), forceMask: levelOf(info) === "force" }); };
									up ? openIt(up) : checkUpdate().then(function (info) { if (info) openIt(info); });
								},
							}, up ? "去更新" : "检查更新")
						)
					),
					h("div", { className: "jf-sys-row" },
						h("span", null, "使用数据上报"),
						h("span", { className: "jf-sys-rowv" },
							// 首启不弹告知卡片，所以把告知文本的入口放在这里，随时可复查
							h("button", {
								className: "jf-sys-link",
								onClick: function () { emitUi({ mode: "privacy" }); },
							}, "查看告知"),
							" ",
							h("button", {
								className: "jf-sys-toggle " + (telemetryOn() ? "on" : "off"),
								onClick: function () {
									storage.setItem(K_CONSENT, telemetryOn() ? "off" : "on");
									storage.setItem(K_CONSENT_VER, "2");
									emitUi({});
									if (telemetryOn()) flush("manual");
								},
							}, telemetryOn() ? "已开启" : "已关闭")
						)
					),
					h("div", { className: "jf-sys-row" },
						h("span", null, "上报状态"),
						h("span", { className: "jf-sys-rowv" },
							(function () {
								const r = uiState.lastReport;
								if (!telemetryOn()) return "已关闭";
								if (!r) return "本次启动尚未上报";
								if (r.ok) return "成功 · " + new Date(r.at).toLocaleTimeString();
								return "失败（" + r.reason + "）";
							})()
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

		return h("div", { className: "jf-sys-overlay" + (forceMode ? " force" : ""), onClick: forceMode ? stop : close },
			h("div", { className: "jf-sys-card" + (forceMode ? " force" : ""), onClick: stop },
				forceMode ? null : h("button", { className: "jf-sys-close", onClick: close }, "✕"),
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

		// ★ 2026-10-22：更新检查与上报**解耦**。旧代码把 checkAndPrompt() 也放在
		//   `if (telemetryOn())` 里，导致关掉上报的用户连新版本都收不到（永久留在
		//   无埋点/有 bug 的旧版）。更新检查属于必要功能，与数据上报无关。
		//   同意状态已在 createSystem 初始化时由 ensureConsent() 处理（默认 on、不弹窗）。
		setTimeout(function () {
			checkAndPrompt();
			if (telemetryOn()) flush("start");
		}, cfg.checkDelayMs || 4000);

		return function detach() {
			if (timer) clearTimer(timer);
			timer = null;
		};
	}

	// 升级完成：启动 2.5 秒后轻提示一次（不阻断任何操作，6 秒自动消失）
	// 这是「小更新不打扰」的收尾：更新过程本身静默，只有这一步让用户知道版本变了。
	if (updatedFrom) {
		const later = deps.setTimeout || function (fn, ms) { return globalThis.setTimeout(fn, ms); };
		try {
			later(function () {
				showToast("已更新到 v" + cfg.version + "（原 v" + updatedFrom + "）", { kind: "updated", ms: 6000 });
			}, 2500);
		} catch (e) { /* ignore */ }
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
		levelOf: levelOf,
		showToast: showToast,
		dismissToast: dismissToast,
	};
}
