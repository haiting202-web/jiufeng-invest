import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(`${import.meta.dirname}/skills-data.json`, 'utf8'));

// 7 大专家（对齐 experts.ts，含 suggestions 快捷建议）
const EXPERTS = [
  { id: "financial-analysis", name: "财务监控诊断", icon: "📊", desc: "精通 DCF/LBO/三表联动建模，全周期财务健康度诊断", tags: ["DCF", "LBO", "三表联动", "估值建模", "财务比率"], suggestions: ["帮我对这家公司做 DCF 估值", "分析这份财报的三表勾稽关系", "对比同行业公司的财务指标", "做一份 LBO 杠杆收购模型"] },
  { id: "equity-research", name: "股票多空博弈", icon: "🔬", desc: "财报深度拆解、行业格局研判、晨会纪要生成", tags: ["财报解读", "行业分析", "护城河", "晨会纪要", "评级"], suggestions: ["深度解读茅台最新季报", "这个行业的竞争格局如何", "评估这只股票的护城河", "生成今日晨会纪要"] },
  { id: "investment-banking", name: "投行业务", icon: "🏦", desc: "并购交易构建、路演材料制作、综合投行方案", tags: ["并购", "IPO", "路演", "资本结构", "交易结构"], suggestions: ["设计一个并购交易结构", "制作 IPO 路演 PPT 大纲", "评估目标公司估值区间", "撰写投资备忘录"] },
  { id: "private-equity", name: "项目筛选尽调", icon: "💼", desc: "项目筛选尽调、单位经济学分析、投后价值创造", tags: ["项目筛选", "尽调", "单位经济学", "投后管理", "退出"], suggestions: ["筛选潜在并购标的", "评估项目 IRR 和退出路径", "做投后运营改进方案", "搭建 SPV 交易架构"] },
  { id: "wealth-management", name: "资产配置规划", icon: "🏛️", desc: "资产配置策略、税务筹划优化、全生命周期理财", tags: ["资产配置", "理财规划", "税务优化", "风险管理"], suggestions: ["制定资产配置方案", "评估我的风险承受能力", "做家庭财富传承规划", "比较不同理财产品的优劣"] },
  { id: "fund-admin", name: "基金对账核查", icon: "📋", desc: "总账对账自动化、KYC反洗钱筛查、合规流程管理", tags: ["总账对账", "NAV", "KYC", "合规", "投资者报告"], suggestions: ["计算基金 NAV 和业绩归因", "准备 LP 季度报告", "检查合规风险点", "优化基金运营成本"] },
  { id: "trader", name: "游资多专家研判", icon: "🛸", desc: "6大顶级游资方法论 + 2大择时框架的多专家聚合研判", tags: ["游资", "短线", "龙头", "情绪周期", "缠论", "利弗莫尔"], suggestions: ["帮我看这只票的游资情绪周期", "用缠论分析当前走势", "给一个龙头的操作手册", "判断现在的市场情绪阶段"] },
];

// 专家 id → 技能分类 id 的映射（用于专家卡关联专业工具）
const EXPERT_CATEGORY = {
  "financial-analysis": "financial-analysis",
  "equity-research": "equity-research",
  "investment-banking": "investment-banking",
  "private-equity": "private-equity",
  "wealth-management": "wealth-management",
  "fund-admin": "fund-admin",
  "trader": "equity-research",
};

// 输入框提示词（技能级 → 分类级 → 兜底）；独立文件便于维护，且不会被 sync-from-web.mjs 覆盖
const HINTS = JSON.parse(readFileSync(`${import.meta.dirname}/skill-placeholders.json`, 'utf8'));

const expertsStr = JSON.stringify(EXPERTS);
const catsStr = JSON.stringify(data.cats);
const skillsStr = JSON.stringify(data.skills);
const mapStr = JSON.stringify(EXPERT_CATEGORY);

// 品牌标记（侧边栏标题左边的图形）：base64 内联，换图跑 生成品牌图标内联.py
const BRAND_MARK_B64 = readFileSync(`${import.meta.dirname}/brand-mark.b64.txt`, 'utf8').trim();
const brandMarkStr = JSON.stringify('data:image/png;base64,' + BRAND_MARK_B64);

const hintsStr = JSON.stringify({
  byCategory: HINTS.byCategory || {},
  byExpert: HINTS.byExpert || {},
  bySkill: HINTS.bySkill || {},
});

const clientJs = `window.__ModuleLoader__.load({ id: "dsh-ai-invest-sidebar", factory: (require) => {


	var module = { exports: {} };
	var exports = module.exports;
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

	let React = require("react");
	let { createElement: h, useState, useEffect, useMemo, useRef, useSyncExternalStore } = React;

	// #region ============ 数据 ============
	const EXPERTS = ${expertsStr};
	const SKILL_CATEGORIES = ${catsStr};
	const ALL_SKILLS = ${skillsStr};
	const HINTS = ${hintsStr};
	const EXPERT_CATEGORY = ${mapStr};

	function findExpert(id) { return EXPERTS.find(e => e.id === id); }
	function findSkill(id) { return ALL_SKILLS.find(s => s.id === id); }
	function skillsOfCategory(catId) { return ALL_SKILLS.filter(s => s.category === catId); }

	/**
	 * 输入框示例文案：技能级 → 分类级 → 通用兜底。
	 * 返回数组：第 0 条作 placeholder，其余作「试试这样问」快捷按钮。
	 */
	function examplesFor(skill, expert) {
		if (skill) {
			const list = HINTS.bySkill[skill.id] || HINTS.byCategory[skill.category];
			if (Array.isArray(list) && list.length) return list;
			return ["说说你在「" + skill.name + "」上想解决的具体问题"];
		}
		if (expert) {
			const list = HINTS.byExpert[expert.id];
			if (Array.isArray(list) && list.length) return list;
			if (Array.isArray(expert.suggestions) && expert.suggestions.length) return expert.suggestions;
		}
		return ["描述你的投研需求，例如：分析某家公司最新财报"];
	}

	// #region ============ 共享 store ============
	let storeState = { activeExpert: null, activeSkill: null, expandedCategories: {} };
	const storeListeners = new Set();
	const investStore = {
		subscribe(fn) { storeListeners.add(fn); return () => storeListeners.delete(fn); },
		getSnapshot() { return storeState; },
		set(patch) { storeState = { ...storeState, ...patch }; storeListeners.forEach(fn => fn()); },
	};
	let runtimeCtx = null;

	// #region ============ Harness 世代兼容层 ============
	// DSH 基座 2.0.10 将 Harness 由 0.1.1-rc.2 升至 0.1.5-rc.2，客户端接口有 3 处破坏性变更：
	//   1. IWorkspaces.connectWorkspace() 被移除  -> 改用 ISessions.create({ workspaceId })
	//   2. IWorkspaces.archiveSession(id) 参数改对象 -> archiveSession({ sessionId })
	//   3. WorkspaceSnapshot.recentWorkspaceId 移除 -> 改按 items[].updatedAt 推导
	// 此处做运行时能力探测，使同一份客户端代码在升级前后均可工作（回滚基座时无需改动插件）。
	function harnessGen(ctx) {
		const ws = ctx && ctx.workspaces;
		if (!ws) return "unknown";
		if (typeof ws.connectWorkspace === "function") return "legacy";
		if (typeof ws.getSnapshot === "function") return "modern";
		return "unknown";
	}

	/** 最近活跃 Workspace：0.1.1 读 recentWorkspaceId，0.1.5 无此字段改按 updatedAt 推导 */
	function pickRecentWorkspaceId(wsSnap) {
		if (!wsSnap) return undefined;
		if (wsSnap.recentWorkspaceId !== undefined) return wsSnap.recentWorkspaceId;
		const items = wsSnap.items || [];
		if (!items.length) return undefined;
		return items.slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0].workspaceId;
	}

	/** 取/建 Workspace 下的会话：0.1.1 走 connectWorkspace，0.1.5 走 sessions.create */
	async function openWorkspaceSession(ctx, workspaceId) {
		if (harnessGen(ctx) === "legacy") return await ctx.workspaces.connectWorkspace(workspaceId);
		return await ctx.sessions.create({ workspaceId });
	}

	/** 归档会话：0.1.5 起参数由 sessionId 改为 { sessionId } */
	function archiveSessionCompat(ctx, sessionId) {
		if (harnessGen(ctx) === "legacy") return ctx.workspaces.archiveSession(sessionId);
		return ctx.workspaces.archiveSession({ sessionId });
	}
	// #endregion

	// #region ============ 发消息 ============
	async function sendConsultation(expert, skill, content) {
		const ctx = runtimeCtx;
		if (!ctx) return { ok: false, error: "runtime not ready" };
		try {
			const workspaces = ctx.workspaces;
			const sessions = ctx.sessions;
			const wsSnap = workspaces.list.getSnapshot();
			const curSnap = sessions.list.getSnapshot();
			const currentId = curSnap.current;
			const curWsId = currentId ? wsSnap.items?.find(w => w.sessionIds?.includes(currentId))?.workspaceId : undefined;
			const target = curWsId ?? pickRecentWorkspaceId(wsSnap);
			if (target === undefined) return { ok: false, error: "请先在左侧选择一个工作目录（Workspace）" };

			const sessionId = await openWorkspaceSession(ctx, target);
			sessions.open(sessionId);
			const binding = sessions.binding(sessionId);
			const session = binding?.session;
			if (!session) return { ok: false, error: "session binding failed" };

			const parts = [];
			if (skill) {
				parts.push(\`【任务】使用「\${skill.name}」能力：\${skill.description}\`);
				if (skill.prompt) parts.push(skill.prompt);
			} else if (expert) {
				parts.push(\`【角色】你是「\${expert.name}」：\${expert.desc}\`);
			}
			parts.push(\`【用户需求】\${content}\`);

			await session.prompt([{ type: "text", text: parts.join("\\n") }], "queue");
			return { ok: true };
		} catch (e) {
			return { ok: false, error: String(e?.message || e) };
		}
	}

	// #region ============ 股票搜索（东方财富 suggest 接口，与 dsh-finance-tools 同源）============
	// 东方财富搜索接口 token。这是公开 suggest 接口的固定参数（非私密凭据），
	// 内嵌默认值以保证开箱可用；如需替换可用 globalThis.EM_SEARCH_TOKEN 覆盖。
	const EM_SEARCH_TOKEN = (typeof globalThis !== "undefined" && globalThis.EM_SEARCH_TOKEN) || "D43BF722C8E33BDC906FB84D85E326E8";
	const EM_SEARCH_API = "https://searchapi.eastmoney.com/api/suggest/get";

	/** type=14 → A股/港股；type=4 → 美股。返回 null 表示网络不可用（调用方需降级）*/
	async function emSearch(keyword, type) {
		if (!EM_SEARCH_TOKEN) return null;
		const url = EM_SEARCH_API + "?input=" + encodeURIComponent(keyword) + "&type=" + type + "&token=" + EM_SEARCH_TOKEN + "&count=8";
		try {
			const res = await fetch(url, { method: "GET" });
			if (!res || !res.ok) return null;
			const json = await res.json();
			const list = (json && json.QuotationCodeTable && (json.QuotationCodeTable.Data || json.QuotationCodeTable.data)) || [];
			return list.map(it => ({
				code: String(it.Code || it.code || ""),
				name: String(it.Name || it.name || ""),
				kind: String(it.SecurityTypeName || ""),
				market: String(it.Market || it.MktNum || ""),
			})).filter(it => it.code && it.name);
		} catch (e) {
			return null; // CORS / 离线 → 由调用方降级为手工输入
		}
	}

	/** 先搜 A股，无结果再搜美股（对齐 dsh-finance-tools 的 searchStockSmart）*/
	async function searchStockSmart(keyword) {
		const a = await emSearch(keyword, 14);
		if (a && a.length) return { items: a, market: "A股/港股" };
		const u = await emSearch(keyword, 4);
		if (u && u.length) return { items: u, market: "美股" };
		return { items: [], market: "", offline: a === null && u === null };
	}

	/** 离线降级：把裸代码当股票用（6位数字=A股，1-5位字母=美股）*/
	function coerceCode(text) {
		const t = String(text || "").trim();
		if (/^\\d{6}$/.test(t)) return { code: t, name: t, kind: "A股" };
		if (/^[A-Za-z]{1,5}$/.test(t)) return { code: t.toUpperCase(), name: t.toUpperCase(), kind: "美股" };
		return null;
	}

	// #region ============ 卡片 → 提示词（复刻 WEB 端 ChatArea.handleCardSubmit）============
	/** 取 option 的 label；查不到则回退到 value（比 WEB 端更稳：WEB 端 multi-select 只输出 value）*/
	function optionLabel(field, v) {
		const opt = (field.options || []).find(o => o.value === v);
		return opt ? opt.label : String(v);
	}

	function displayValueOf(field, value) {
		if (field.type === "select") return optionLabel(field, value);
		if (field.type === "multi-select") return (value || []).map(v => optionLabel(field, v)).join("、");
		if (field.type === "stock-picker") return value ? value.name + " (" + value.code + ")" : "";
		if (field.type === "stock-multi") return (value || []).map(v => v.name + " (" + v.code + ")").join("、");
		if (field.type === "file") return value ? value.name : "";
		return String(value);
	}

	function buildCardPrompt(skill, form, fields) {
		const lines = ["【" + skill.name + "】", ""];
		fields.forEach(field => {
			const v = form[field.key];
			if (v === undefined || v === "" || v === null) return;
			if (Array.isArray(v) && v.length === 0) return;
			lines.push(field.label + ": " + displayValueOf(field, v) + (field.unit || ""));
		});
		return lines.join("\\n");
	}

	// #region ============ 样式 ============
	const CSS = \`
.dsh-invest-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;font-size:16px;--inv-fs:16px;--inv-fs-sm:15px;--inv-fs-label:14px;--inv-fs-meta:12.5px;box-sizing:border-box}
.dsh-invest-scroll{flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 8px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box}
.dsh-invest-group-label{display:flex;align-items:center;gap:4px;padding:5px 8px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.55;cursor:pointer;border:none;background:none;width:100%;text-align:left;font:inherit;color:inherit;font-size:var(--inv-fs-label);box-sizing:border-box}
.dsh-invest-expert{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border-radius:6px;cursor:pointer;border:none;background:transparent;text-align:left;font:inherit;color:inherit;transition:background .15s;box-sizing:border-box}
.dsh-invest-expert:hover{background:rgba(0,0,0,.05)}
body[data-ds-dark-theme] .dsh-invest-expert:hover{background:rgba(255,255,255,.08)}
.dsh-invest-expert .ico{font-size:17px;width:21px;text-align:center;flex-shrink:0}
.dsh-invest-expert .nm{font-size:var(--inv-fs);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.dsh-invest-expert.active{background:rgba(0,113,227,.14);color:#0071e3}
body[data-ds-dark-theme] .dsh-invest-expert.active{background:rgba(10,132,255,.22);color:#0a84ff}
.dsh-invest-cat{display:flex;align-items:center;gap:9px;width:100%;padding:7px 10px;border-radius:6px;cursor:pointer;border:none;background:transparent;text-align:left;font:inherit;color:inherit;transition:background .15s;box-sizing:border-box}
.dsh-invest-cat:hover{background:rgba(0,0,0,.05)}
body[data-ds-dark-theme] .dsh-invest-cat:hover{background:rgba(255,255,255,.08)}
.dsh-invest-cat .ico{font-size:17px;width:21px;text-align:center;flex-shrink:0}
.dsh-invest-cat .nm{font-size:var(--inv-fs);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.dsh-invest-cat .cnt{font-size:var(--inv-fs-meta);opacity:.5;flex-shrink:0}
.dsh-invest-cat .arrow{font-size:11px;opacity:.5;flex-shrink:0}
.dsh-invest-skill{display:flex;align-items:center;gap:8px;width:100%;padding:5px 10px 5px 30px;border-radius:6px;cursor:pointer;border:none;background:none;text-align:left;font:inherit;color:inherit;transition:background .15s;box-sizing:border-box}
.dsh-invest-skill:hover{background:rgba(0,0,0,.05)}
body[data-ds-dark-theme] .dsh-invest-skill:hover{background:rgba(255,255,255,.08)}
.dsh-invest-skill .ico{font-size:15px;width:18px;text-align:center;flex-shrink:0}
.dsh-invest-skill .nm{font-size:var(--inv-fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.dsh-invest-badge{font-size:11px;opacity:.4;flex-shrink:0;line-height:1}
.dsh-invest-skill:hover .dsh-invest-badge{opacity:.75}
.dsh-invest-skill.active .dsh-invest-badge{opacity:.9}
.dsh-invest-skill.active{background:rgba(0,113,227,.12);color:#0071e3}
body[data-ds-dark-theme] .dsh-invest-skill.active{background:rgba(10,132,255,.18);color:#0a84ff}
.dsh-invest-sess{display:flex;flex-direction:column;gap:2px;width:100%;padding:6px 10px;border-radius:6px;cursor:pointer;border:none;background:none;text-align:left;font:inherit;color:inherit;transition:background .15s;box-sizing:border-box}
.dsh-invest-sess:hover{background:rgba(0,0,0,.05)}
body[data-ds-dark-theme] .dsh-invest-sess:hover{background:rgba(255,255,255,.08)}
.dsh-invest-sess .ttl{font-size:var(--inv-fs-sm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-invest-sess .tm{font-size:var(--inv-fs-meta);opacity:.5;margin-top:2px}
.dsh-invest-sess.active{background:rgba(0,113,227,.12);color:#0071e3}
body[data-ds-dark-theme] .dsh-invest-sess.active{background:rgba(10,132,255,.18);color:#0a84ff}
.dsh-invest-sess-del{position:absolute;top:50%;right:6px;transform:translateY(-50%);width:22px;height:22px;border-radius:4px;border:none;background:transparent;cursor:pointer;font-size:13px;opacity:0;color:inherit;display:flex;align-items:center;justify-content:center;transition:opacity .15s}
.dsh-invest-sess:hover .dsh-invest-sess-del{opacity:.45}
.dsh-invest-sess-del:hover{opacity:1;background:rgba(229,72,77,.15);color:#e5484d}
.dsh-invest-gcount{font-weight:400;opacity:.65;letter-spacing:0;text-transform:none}
.dsh-invest-hist{display:flex;flex-direction:column;gap:4px}
.dsh-invest-box{flex:0 0 auto;max-height:300px;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:1px;padding:4px;border-radius:10px;border:1px solid rgba(128,128,128,.16);background:rgba(128,128,128,.05);box-sizing:border-box;transition:max-height .18s ease-out}
body[data-ds-dark-theme] .dsh-invest-box{background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.1)}
.dsh-invest-box.open{max-height:min(56vh,520px)}
.dsh-invest-scroll::-webkit-scrollbar,.dsh-invest-box::-webkit-scrollbar{width:9px}
.dsh-invest-scroll::-webkit-scrollbar-track,.dsh-invest-box::-webkit-scrollbar-track{background:transparent}
.dsh-invest-scroll::-webkit-scrollbar-thumb,.dsh-invest-box::-webkit-scrollbar-thumb{background:rgba(128,128,128,.28);border-radius:5px;border:2px solid transparent;background-clip:content-box}
.dsh-invest-scroll::-webkit-scrollbar-thumb:hover,.dsh-invest-box::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.5);border:2px solid transparent;background-clip:content-box}
.dsh-invest-more{width:100%;padding:6px 10px;border-radius:8px;border:none;background:none;color:inherit;font:inherit;font-size:var(--inv-fs-label);opacity:.5;cursor:pointer;text-align:center;transition:opacity .15s,background .15s;box-sizing:border-box}
.dsh-invest-more:hover{opacity:.9;background:rgba(128,128,128,.1)}
.dsh-invest-empty{font-size:var(--inv-fs-label);opacity:.5;padding:2px 10px}
.dsh-invest-divider{border-top:1px solid rgba(128,128,128,.16);margin:2px 0}
.dsh-invest-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.dsh-invest-card{width:min(560px,92vw);max-height:88vh;overflow-y:auto;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:28px 28px 20px;position:relative;animation:dsinvc .18s ease-out}
@keyframes dsinvc{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.dsh-invest-card.light{background:#ffffff;color:#1d1d1f}
.dsh-invest-card.dark{background:#1e1e22;color:#f5f5f7}
.dsh-invest-card-close{position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:6px;border:none;background:transparent;cursor:pointer;font-size:16px;opacity:.55;color:inherit}
.dsh-invest-card-close:hover{opacity:1;background:rgba(128,128,128,.15)}
.dsh-invest-card-head{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:16px}
.dsh-invest-card-icon{font-size:52px;margin-bottom:8px}
.dsh-invest-card-title{font-size:20px;font-weight:700;margin-bottom:6px}
.dsh-invest-card-desc{font-size:13px;opacity:.7;line-height:1.6;max-width:420px;margin:0 auto}
.dsh-invest-card-tags{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:18px}
.dsh-invest-card-tag{font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid rgba(128,128,128,.25);opacity:.75}
.dsh-invest-card-body{max-width:420px;margin:0 auto;width:100%}
.dsh-invest-card-hint{font-size:12px;opacity:.6;text-align:center;margin-bottom:10px}
.dsh-invest-card-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid rgba(128,128,128,.3);font:inherit;font-size:13px;resize:none;outline:none;transition:border .15s;min-height:76px}
.dsh-invest-card.light .dsh-invest-card-input{background:#f5f5f7;color:#1d1d1f}
.dsh-invest-card.dark .dsh-invest-card-input{background:#2a2a30;color:#f5f5f7}
.dsh-invest-card-input:focus{border-color:#0071e3}
.dsh-invest-card-submit{width:100%;box-sizing:border-box;margin-top:10px;padding:11px;border-radius:10px;border:none;background:#0071e3;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}
.dsh-invest-card-submit:hover{background:#0077ed}
.dsh-invest-card-submit:disabled{background:rgba(128,128,128,.25);color:rgba(128,128,128,.6);cursor:not-allowed}
.dsh-invest-card-sugs-title{font-size:11px;opacity:.55;margin-bottom:8px;margin-top:14px}
.dsh-invest-card-sug{font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;cursor:pointer;color:inherit;transition:background .15s}
.dsh-invest-card-sug:hover{background:rgba(128,128,128,.12)}
.dsh-invest-card-err{font-size:12px;color:#e5484d;margin-top:8px;text-align:center}

/* ===== inputSchema 表单卡片 ===== */
.dsh-invest-form{display:flex;flex-direction:column;gap:14px}
.dsh-invest-field{display:flex;flex-direction:column;gap:6px}
.dsh-invest-flabel{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;opacity:.85}
.dsh-invest-req{color:#e5484d;font-size:11px}
.dsh-invest-fhelp{font-size:11px;opacity:.5;line-height:1.5}
.dsh-invest-input,.dsh-invest-ta{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid rgba(128,128,128,.3);font:inherit;font-size:13px;outline:none;transition:border .15s}
.dsh-invest-card.light .dsh-invest-input,.dsh-invest-card.light .dsh-invest-ta{background:#f5f5f7;color:#1d1d1f;border-color:rgba(0,0,0,.12)}
.dsh-invest-card.dark .dsh-invest-input,.dsh-invest-card.dark .dsh-invest-ta{background:#2a2a30;color:#f5f5f7;border-color:rgba(255,255,255,.14)}
.dsh-invest-input:focus,.dsh-invest-ta:focus{border-color:#0071e3}
.dsh-invest-ta{resize:none;min-height:64px;line-height:1.6}
.dsh-invest-numwrap{display:flex;align-items:center;gap:6px}
.dsh-invest-unit{font-size:12px;opacity:.55;flex-shrink:0}
.dsh-invest-opts{display:flex;flex-wrap:wrap;gap:6px}
.dsh-invest-opt{padding:6px 11px;border-radius:7px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:5px}
.dsh-invest-opt:hover{border-color:#0071e3}
.dsh-invest-opt.on{border-color:#0071e3;background:rgba(0,113,227,.12);color:#0071e3;font-weight:600}
.dsh-invest-sel{position:relative}
.dsh-invest-selbtn{width:100%;display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.dsh-invest-card.light .dsh-invest-selbtn{background:#f5f5f7}
.dsh-invest-card.dark .dsh-invest-selbtn{background:#2a2a30}
.dsh-invest-selmenu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:190px;overflow-y:auto;border-radius:8px;border:1px solid rgba(128,128,128,.25);box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px}
.dsh-invest-card.light .dsh-invest-selmenu{background:#fff}
.dsh-invest-card.dark .dsh-invest-selmenu{background:#2a2a30}
.dsh-invest-selitem{width:100%;text-align:left;padding:7px 10px;border-radius:6px;border:none;background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}
.dsh-invest-selitem:hover{background:rgba(0,113,227,.1)}
.dsh-invest-selitem.on{color:#0071e3;font-weight:600}
.dsh-invest-sp{position:relative}
.dsh-invest-spmenu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:200px;overflow-y:auto;border-radius:8px;border:1px solid rgba(128,128,128,.25);box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px}
.dsh-invest-card.light .dsh-invest-spmenu{background:#fff}
.dsh-invest-card.dark .dsh-invest-spmenu{background:#2a2a30}
.dsh-invest-spitem{width:100%;display:flex;align-items:center;gap:8px;text-align:left;padding:7px 10px;border-radius:6px;border:none;background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer}
.dsh-invest-spitem:hover{background:rgba(0,113,227,.1)}
.dsh-invest-spcode{font-size:11px;opacity:.55;margin-left:auto}
.dsh-invest-spkind{font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid rgba(128,128,128,.3);opacity:.7;flex-shrink:0}
.dsh-invest-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.dsh-invest-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:6px;background:rgba(0,113,227,.12);color:#0071e3;font-size:12px}
.dsh-invest-tagx{border:none;background:transparent;color:inherit;cursor:pointer;font-size:12px;opacity:.6;padding:0;line-height:1}
.dsh-invest-tagx:hover{opacity:1}
.dsh-invest-tip{font-size:11px;opacity:.45;margin-top:2px}
.dsh-invest-toggle{display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left}
.dsh-invest-toggle.on{border-color:#0071e3;background:rgba(0,113,227,.1);color:#0071e3}
.dsh-invest-tbox{width:15px;height:15px;border-radius:4px;border:1.5px solid rgba(128,128,128,.45);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0}
.dsh-invest-toggle.on .dsh-invest-tbox{background:#0071e3;border-color:#0071e3;color:#fff}
.dsh-invest-file{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;border-radius:8px;border:1.5px dashed rgba(128,128,128,.35);background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer;opacity:.75}
.dsh-invest-file:hover{border-color:#0071e3;opacity:1}
.dsh-invest-summary{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:11.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;max-height:130px;overflow-y:auto}
.dsh-invest-card.light .dsh-invest-summary{background:#f5f5f7;color:#3a3a3c}
.dsh-invest-card.dark .dsh-invest-summary{background:#22222a;color:#a0a0a8}
\`;

	// #region ============ 侧栏组件 ============
	function InvestSidebar({ useSessions, open, archive }) {
		const [active, setActive] = useState(() => investStore.getSnapshot());
		const [historyExpanded, setHistoryExpanded] = useState(false);
		useEffect(() => investStore.subscribe(() => setActive(investStore.getSnapshot())), []);

		const safeUseSessions = typeof useSessions === "function" ? useSessions : ((sel) => null);
		const sessionSnap = safeUseSessions((s) => s);

		useEffect(() => {
			const tag = document.createElement("style");
			tag.id = "dsh-ai-invest-sidebar-css";
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => { document.getElementById("dsh-ai-invest-sidebar-css")?.remove(); };
		}, []);

		const history = useMemo(() => {
			const snap = sessionSnap || {};
			const ids = snap.ids || [];
			return ids.map(id => snap.byId?.[id]).filter(s => s && !s.blank && s.displayTitle).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
		}, [sessionSnap]);
		const currentId = (sessionSnap || {}).current;

		// 历史对话：超过 10 条先折叠，点「展开全部」放开（与 WorkBuddy 侧栏任务列表一致）
		const HISTORY_PREVIEW = 10;
		const historyOverflow = history.length > HISTORY_PREVIEW;
		const visibleHistory = historyOverflow && !historyExpanded
			? history.slice(0, HISTORY_PREVIEW)
			: history;

		const pickExpert = (expert) => investStore.set({ activeExpert: expert.id, activeSkill: null });
		const toggleCategory = (catId) => investStore.set({ expandedCategories: { ...active.expandedCategories, [catId]: !active.expandedCategories[catId] } });
		const pickSkill = (skill) => investStore.set({ activeExpert: null, activeSkill: skill.id });

		const fmt = (ts) => {
			if (!ts) return "";
			const diff = Date.now() - ts;
			const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
			if (mins < 1) return "刚刚";
			if (mins < 60) return mins + "分钟前";
			if (hours < 24) return hours + "小时前";
			if (days < 7) return days + "天前";
			return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
		};

		return h("div", { className: "dsh-invest-root" },
			h("div", { className: "dsh-invest-scroll" },

				// —— 投研工作流 ——
				h("div", { className: "dsh-invest-group-label" }, "投研工作流"),
				EXPERTS.map(expert => {
					const isActive = active.activeExpert === expert.id;
					return h("button", {
						key: expert.id,
						className: "dsh-invest-expert" + (isActive ? " active" : ""),
						onClick: () => pickExpert(expert),
						title: expert.desc,
					},
						h("span", { className: "ico" }, expert.icon),
						h("span", { className: "nm" }, expert.name),
					);
				}),

				h("div", { className: "dsh-invest-divider" }),

				// —— 专业工具 ——
				h("div", { className: "dsh-invest-group-label" }, "专业工具"),
				SKILL_CATEGORIES.map(cat => {
					const skills = skillsOfCategory(cat.id);
					if (skills.length === 0) return null;
					const isOpen = !!active.expandedCategories[cat.id];
					return h("div", { key: cat.id },
						h("button", { className: "dsh-invest-cat", onClick: () => toggleCategory(cat.id) },
							h("span", { className: "ico" }, cat.icon),
							h("span", { className: "nm" }, cat.name),
							h("span", { className: "cnt" }, skills.length),
							h("span", { className: "arrow" }, isOpen ? "▾" : "▸"),
						),
						isOpen && h("div", { style: { display: "flex", flexDirection: "column", gap: 1 } },
							skills.map(skill => {
								const sActive = active.activeSkill === skill.id;
								const hasCard = Array.isArray(skill.inputSchema) && skill.inputSchema.length > 0;
								return h("button", {
									key: skill.id,
									className: "dsh-invest-skill" + (sActive ? " active" : ""),
									onClick: () => pickSkill(skill),
									title: skill.description + (hasCard ? "（参数卡片）" : ""),
								},
									h("span", { className: "ico" }, skill.icon),
									h("span", { className: "nm" }, skill.name),
									hasCard && h("span", { className: "dsh-invest-badge", title: "带参数卡片" }, "▤"),
								);
							})
						)
					);
				}),

				h("div", { className: "dsh-invest-divider" }),

				// —— 历史对话 ——
				h("div", { className: "dsh-invest-group-label" },
					"历史对话",
					history.length > 0 && h("span", { className: "dsh-invest-gcount" }, "(" + history.length + ")"),
				),
				history.length === 0
					? h("div", { className: "dsh-invest-empty" }, "暂无对话")
					: h("div", { className: "dsh-invest-hist" },
						h("div", { className: "dsh-invest-box" + (historyExpanded ? " open" : "") },
							visibleHistory.map(s =>
								h("div", {
									key: s.id,
									className: "dsh-invest-sess" + (s.id === currentId ? " active" : ""),
									style: { position: "relative" },
									onClick: () => { try { open?.(s.id); } catch (e) {} },
								},
									h("span", { className: "ttl" }, s.displayTitle),
									h("span", { className: "tm" }, fmt(s.updatedAt)),
									h("button", {
										className: "dsh-invest-sess-del",
										title: "归档（删除）",
										onClick: (e) => { e.stopPropagation(); try { archive?.(s.id); } catch (e2) {} },
									}, "✕"),
								)
							)
						),
						historyOverflow && h("button", {
							className: "dsh-invest-more",
							onClick: () => setHistoryExpanded(v => !v),
							title: historyExpanded ? "只显示最近 " + HISTORY_PREVIEW + " 个" : "显示全部 " + history.length + " 个对话",
						}, historyExpanded ? "收起" : "展开全部 (" + history.length + ")")
					),
			)
		);
	}

	// #region ============ inputSchema 字段渲染器 ============
	/** select：≤4 项走横排按钮，>4 项走下拉（与 WEB 端 SkillCard 规则一致）*/
	function SelectField({ field, value, onChange }) {
		const [open, setOpen] = useState(false);
		const options = field.options || [];
		const selected = options.find(o => o.value === value);
		const close = () => setOpen(false);

		if (options.length <= 4) {
			return h("div", { className: "dsh-invest-opts" },
				options.map(opt => h("button", {
					key: opt.value,
					className: "dsh-invest-opt" + (value === opt.value ? " on" : ""),
					onClick: () => onChange(opt.value),
				}, opt.label))
			);
		}

		return h("div", { className: "dsh-invest-sel" },
			h("button", { className: "dsh-invest-selbtn", onClick: () => setOpen(!open) },
				h("span", { style: { opacity: selected ? 1 : 0.45 } }, selected ? selected.label : (field.placeholder || "请选择")),
				h("span", { style: { fontSize: 9, opacity: 0.5, transform: open ? "rotate(180deg)" : "none" } }, "▼")
			),
			open && h("div", { className: "dsh-invest-selmenu" },
				options.map(opt => h("button", {
					key: opt.value,
					className: "dsh-invest-selitem" + (value === opt.value ? " on" : ""),
					onClick: () => { onChange(opt.value); close(); },
				}, opt.label))
			)
		);
	}

	function MultiSelectField({ field, value, onChange }) {
		const options = field.options || [];
		const selected = new Set(Array.isArray(value) ? value : []);
		const toggle = (v) => {
			const next = new Set(selected);
			if (next.has(v)) next.delete(v); else next.add(v);
			onChange(Array.from(next));
		};
		return h("div", { className: "dsh-invest-opts" },
			options.map(opt => h("button", {
				key: opt.value,
				className: "dsh-invest-opt" + (selected.has(opt.value) ? " on" : ""),
				onClick: () => toggle(opt.value),
			}, (selected.has(opt.value) ? "✓ " : "") + opt.label))
		);
	}

	/** stock-picker：搜索 + 候选下拉 + 已选标签；网络不可用时降级为手工输入代码 */
	function StockPickerField({ field, value, onChange, placeholder }) {
		const [q, setQ] = useState("");
		const [items, setItems] = useState([]);
		const [kind, setKind] = useState("");
		const [open, setOpen] = useState(false);
		const [offline, setOffline] = useState(false);
		const [busy, setBusy] = useState(false);
		const timerRef = useRef(0);

		const doSearch = (text) => {
			setQ(text);
			clearTimeout(timerRef.current);
			if (!text.trim()) { setItems([]); setOpen(false); return; }
			setBusy(true);
			timerRef.current = setTimeout(async () => {
				const r = await searchStockSmart(text);
				setItems(r.items || []);
				setKind(r.market || "");
				setOffline(!!r.offline);
				setOpen((r.items || []).length > 0);
				setBusy(false);
			}, 260);
		};

		const pick = (it) => { onChange({ name: it.name, code: it.code }); setQ(it.name + " (" + it.code + ")"); setOpen(false); };

		// 回车：有候选取第一条；离线时把裸代码直接当股票
		const onEnter = () => {
			if (open && items.length) { pick(items[0]); return; }
			const c = coerceCode(q);
			if (c) { onChange(c); setOpen(false); }
		};

		return h("div", { className: "dsh-invest-sp" },
			h("input", {
				className: "dsh-invest-input",
				value: q,
				onChange: (e) => doSearch(e.target.value),
				onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } },
				onBlur: () => setTimeout(() => setOpen(false), 180),
				placeholder: placeholder || "输入股票代码或公司名称，如 贵州茅台 / 600519",
			}),
			open && items.length > 0 && h("div", { className: "dsh-invest-spmenu" },
				items.map(it => h("button", {
					key: it.code + it.market,
					className: "dsh-invest-spitem",
					onMouseDown: (e) => e.preventDefault(),
					onClick: () => pick(it),
				},
					h("span", null, it.name),
					it.kind && h("span", { className: "dsh-invest-spkind" }, it.kind),
					h("span", { className: "dsh-invest-spcode" }, it.code)
				))
			),
			busy && h("div", { className: "dsh-invest-tip" }, "搜索中…"),
			offline && h("div", { className: "dsh-invest-tip" }, "联网搜索不可用，可直接输入 6 位代码（如 600519）后回车"),
			!offline && kind && !open && h("div", { className: "dsh-invest-tip" }, "市场：" + kind),
			value && h("div", { className: "dsh-invest-tags" },
				h("span", { className: "dsh-invest-tag" },
					"✓ " + value.name + " (" + value.code + ")",
					h("button", { className: "dsh-invest-tagx", onClick: () => { onChange(null); setQ(""); } }, "✕")
				)
			)
		);
	}

	/** stock-multi：DSH 扩展类型，支持多选公司（用于多股票横向对比 / 技术面批量）*/
	function StockMultiField({ field, value, onChange, placeholder }) {
		const [q, setQ] = useState("");
		const [items, setItems] = useState([]);
		const [open, setOpen] = useState(false);
		const [offline, setOffline] = useState(false);
		const [busy, setBusy] = useState(false);
		const timerRef = useRef(0);
		const list = Array.isArray(value) ? value : [];

		const doSearch = (text) => {
			setQ(text);
			clearTimeout(timerRef.current);
			if (!text.trim()) { setItems([]); setOpen(false); return; }
			setBusy(true);
			timerRef.current = setTimeout(async () => {
				const r = await searchStockSmart(text);
				setItems(r.items || []);
				setOffline(!!r.offline);
				setOpen((r.items || []).length > 0);
				setBusy(false);
			}, 260);
		};

		const add = (it) => {
			if (list.some(v => v.code === it.code)) { setQ(""); setOpen(false); return; }
			onChange(list.concat([{ name: it.name, code: it.code }]));
			setQ(""); setOpen(false); setItems([]);
		};

		const onEnter = () => {
			if (open && items.length) { add(items[0]); return; }
			const c = coerceCode(q);
			if (c && !list.some(v => v.code === c.code)) { onChange(list.concat([c])); setQ(""); setOpen(false); }
		};

		return h("div", { className: "dsh-invest-sp" },
			h("input", {
				className: "dsh-invest-input",
				value: q,
				onChange: (e) => doSearch(e.target.value),
				onKeyDown: (e) => {
					if (e.key === "Enter") { e.preventDefault(); onEnter(); }
					else if (e.key === "Backspace" && !q && list.length) { onChange(list.slice(0, -1)); }
				},
				onBlur: () => setTimeout(() => setOpen(false), 180),
				placeholder: placeholder || "输入代码或名称，回车添加（可多选）",
			}),
			open && items.length > 0 && h("div", { className: "dsh-invest-spmenu" },
				items.map(it => h("button", {
					key: it.code + it.market,
					className: "dsh-invest-spitem",
					onMouseDown: (e) => e.preventDefault(),
					onClick: () => add(it),
				},
					h("span", null, it.name),
					it.kind && h("span", { className: "dsh-invest-spkind" }, it.kind),
					h("span", { className: "dsh-invest-spcode" }, it.code)
				))
			),
			busy && h("div", { className: "dsh-invest-tip" }, "搜索中…"),
			offline && h("div", { className: "dsh-invest-tip" }, "联网搜索不可用，可直接输入 6 位代码后回车添加"),
			list.length > 0 && h("div", { className: "dsh-invest-tags" },
				list.map((v, i) => h("span", { key: v.code + i, className: "dsh-invest-tag" },
					v.name + " (" + v.code + ")",
					h("button", { className: "dsh-invest-tagx", onClick: () => onChange(list.filter((_, j) => j !== i)) }, "✕")
				))
			)
		);
	}

	/** file：DSH 无 Electron 文件对话框，降级为原生 file input（仅取文件名，内容由用户粘贴）*/
	function FileField({ field, value, onChange }) {
		const inputRef = useRef(null);
		if (value) {
			return h("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 8, border: "1px solid rgba(0,113,227,.4)", background: "rgba(0,113,227,.08)" } },
				h("span", { style: { flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "📎 " + value.name),
				h("button", { className: "dsh-invest-tagx", onClick: () => onChange(null) }, "✕")
			);
		}
		return h("div", null,
			h("input", {
				type: "file", ref: inputRef, style: { display: "none" },
				onChange: (e) => { const f = e.target.files && e.target.files[0]; if (f) onChange({ name: f.name, path: f.name }); },
			}),
			h("button", { className: "dsh-invest-file", onClick: () => inputRef.current && inputRef.current.click() },
				"📁 " + (field.placeholder || "点击选择文件"))
		);
	}

	/** 字段分发器 */
	function FieldRenderer({ field, value, onChange }) {
		const inner = (() => {
			switch (field.type) {
				case "text":
					return h("input", {
						className: "dsh-invest-input", type: "text", value: value || "",
						onChange: (e) => onChange(e.target.value), placeholder: field.placeholder,
					});
				case "textarea":
					return h("textarea", {
						className: "dsh-invest-ta", value: value || "", rows: 3,
						onChange: (e) => onChange(e.target.value), placeholder: field.placeholder,
					});
				case "number":
					return h("div", { className: "dsh-invest-numwrap" },
						h("input", {
							className: "dsh-invest-input", type: "number", value: value === undefined || value === null ? "" : value,
							min: field.min, max: field.max,
							onChange: (e) => onChange(e.target.value === "" ? "" : Number(e.target.value)),
							placeholder: field.placeholder, style: { flex: 1 },
						}),
						field.unit && h("span", { className: "dsh-invest-unit" }, field.unit)
					);
				case "select":
					return h(SelectField, { field, value, onChange });
				case "multi-select":
					return h(MultiSelectField, { field, value: value || [], onChange });
				case "stock-picker":
					return h(StockPickerField, { field, value, onChange, placeholder: field.placeholder });
				case "stock-multi":
					return h(StockMultiField, { field, value, onChange, placeholder: field.placeholder });
				case "toggle":
					return h("button", {
						className: "dsh-invest-toggle" + (value ? " on" : ""),
						onClick: () => onChange(!value),
					},
						h("span", { className: "dsh-invest-tbox" }, value ? "✓" : ""),
						h("span", null, field.helpText || "启用")
					);
				case "file":
					return h(FileField, { field, value, onChange });
				default:
					return h("input", {
						className: "dsh-invest-input", type: "text", value: value || "",
						onChange: (e) => onChange(e.target.value), placeholder: field.placeholder,
					});
			}
		})();

		return h("div", { className: "dsh-invest-field" },
			h("label", { className: "dsh-invest-flabel" },
				field.label,
				field.required && h("span", { className: "dsh-invest-req" }, "*")
			),
			inner,
			field.helpText && field.type !== "toggle" && h("div", { className: "dsh-invest-fhelp" }, field.helpText)
		);
	}

	// #region ============ 浮层卡片组件（支持 inputSchema 表单卡片）============
	function OverlayCard() {
		const [active, setActive] = useState(() => investStore.getSnapshot());
		const [query, setQuery] = useState("");
		const [form, setForm] = useState({});
		const [busy, setBusy] = useState(false);
		const [err, setErr] = useState("");
		const [dark, setDark] = useState(false);

		useEffect(() => investStore.subscribe(() => { setActive(investStore.getSnapshot()); setQuery(""); setErr(""); }), []);
		useEffect(() => {
			const update = () => setDark(!!document.body?.getAttribute("data-ds-dark-theme"));
			update();
			const mo = new MutationObserver(update);
			mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
			return () => mo.disconnect();
		}, []);

		const expert = active.activeExpert ? findExpert(active.activeExpert) : null;
		const skill = active.activeSkill ? findSkill(active.activeSkill) : null;
		// 有 inputSchema → 渲染表单卡片；否则走自由输入
		const fields = (skill && Array.isArray(skill.inputSchema) && skill.inputSchema.length) ? skill.inputSchema : null;

		// 切换技能时按 defaultValue 重置表单
		const cardKey = (active.activeExpert || "") + "|" + (active.activeSkill || "");
		const [loadedKey, setLoadedKey] = useState("");
		useEffect(() => {
			if (cardKey === loadedKey) return;
			setLoadedKey(cardKey);
			const init = {};
			if (fields) fields.forEach(f => { if (f.defaultValue !== undefined) init[f.key] = f.defaultValue; });
			setForm(init);
			setQuery(""); setErr("");
		}, [cardKey, loadedKey]);

		// dependsOn 条件显隐
		const visibleFields = useMemo(() => {
			if (!fields) return [];
			return fields.filter(f => !f.dependsOn || form[f.dependsOn.key] === f.dependsOn.value);
		}, [fields, form]);

		// 必填校验
		const allRequiredFilled = useMemo(() => {
			return visibleFields.filter(f => f.required).every(f => {
				const v = form[f.key];
				if (f.type === "multi-select" || f.type === "stock-multi") return Array.isArray(v) && v.length > 0;
				return v !== undefined && v !== "" && v !== null;
			});
		}, [visibleFields, form]);

		if (!expert && !skill) return null;

		const close = () => { investStore.set({ activeExpert: null, activeSkill: null }); setQuery(""); setErr(""); };

		// 卡片预览：拼装出的提示词（让用户确认内容）
		const preview = fields ? buildCardPrompt(skill, form, visibleFields) : "";

		const submit = async () => {
			if (busy) return;
			let content;
			if (fields) {
				if (!allRequiredFilled) return;
				content = preview;
			} else {
				content = query.trim();
				if (!content) return;
			}
			setBusy(true); setErr("");
			const result = await sendConsultation(expert, skill, content);
			setBusy(false);
			if (result.ok) close(); else setErr(result.error || "发送失败");
		};

		const theme = dark ? "dark" : "light";
		const icon = skill ? skill.icon : expert.icon;
		const title = skill ? skill.name : expert.name;
		const desc = skill ? skill.description : expert.desc;
		const tags = skill ? [] : expert.tags;
		// 输入框示例：第 0 条作 placeholder，其余作快捷按钮；专家沿用其 suggestions
		const examples = examplesFor(skill, expert);
		const suggestions = expert ? (expert.suggestions || []) : examples.slice(1);
		const sugTitle = skill ? "试试这样问" : "常见问题";
		const hint = skill
			? (fields ? \`填写参数，「\${skill.name}」将按结构化参数执行\` : \`将使用「\${skill.name}」能力引导分析，请描述具体需求\`)
			: \`描述您的需求，「\${expert.name}」将协调专业工具综合研判\`;

		return h("div", { className: "dsh-invest-overlay", onClick: close },
			h("div", { className: "dsh-invest-card " + theme, onClick: (e) => e.stopPropagation() },
				h("button", { className: "dsh-invest-card-close", onClick: close }, "✕"),
				h("div", { className: "dsh-invest-card-head" },
					h("div", { className: "dsh-invest-card-icon" }, icon),
					h("div", { className: "dsh-invest-card-title" }, title),
					h("div", { className: "dsh-invest-card-desc" }, desc),
				),
				tags.length > 0 && h("div", { className: "dsh-invest-card-tags" },
					tags.map(tg => h("span", { key: tg, className: "dsh-invest-card-tag" }, tg))
				),
				h("div", { className: "dsh-invest-card-body" },
					h("div", { className: "dsh-invest-card-hint" }, hint),

					// —— 表单卡片模式 ——
					fields
						? h("div", { className: "dsh-invest-form" },
							visibleFields.map(f => h(FieldRenderer, {
								key: f.key, field: f, value: form[f.key],
								onChange: (v) => setForm(prev => ({ ...prev, [f.key]: v })),
							}))
						)
						// —— 自由输入模式 ——
						: h("textarea", {
							className: "dsh-invest-card-input",
							value: query,
							onChange: (e) => setQuery(e.target.value),
							onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } },
							placeholder: "例如：" + examples[0] + "…",
							autoFocus: true,
						}),

					// —— 卡片内容预览（结构化提示词） ——
					fields && h("div", { className: "dsh-invest-summary" }, preview),

					h("button", {
						className: "dsh-invest-card-submit", onClick: submit,
						disabled: busy || (fields ? !allRequiredFilled : !query.trim()),
					}, busy ? "发送中…" : (fields ? "🚀 开始生成" : "开始会诊分析")),

					fields && !allRequiredFilled && h("div", { className: "dsh-invest-fhelp", style: { textAlign: "center", marginTop: 6 } },
						"还有 " + visibleFields.filter(f => f.required && (() => {
							const v = form[f.key];
							if (f.type === "multi-select" || f.type === "stock-multi") return !(Array.isArray(v) && v.length > 0);
							return v === undefined || v === "" || v === null;
						})()).length + " 项必填未完成"),

					err && h("div", { className: "dsh-invest-card-err" }, err),

					suggestions.length > 0 && h("div", null,
						h("div", { className: "dsh-invest-card-sugs-title" }, sugTitle),
						h("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
							suggestions.map((s, i) => h("button", { key: i, className: "dsh-invest-card-sug", onClick: () => setQuery(s) }, s))
						)
					),
				),
			)
		);
	}

	// #region ============ 品牌与文案（玖峰投研工作台） ============
	const BRAND = {
		name: "玖峰投研工作台",
		slogan: "让投研工作更简单",
		upstream: "DeepSeek Harness",   // 上游产品名（窗口标题里要换掉）
	};

	/** 品牌标记图（base64 内联，改图跑 生成品牌图标内联.py → 重新生成 client.js） */
	const BRAND_MARK_DATA = ${brandMarkStr};

	/** 侧边栏标题旁的标记。用图片而非 emoji；万一 data URI 被策略拦截，退回 emoji 不留空 */
	function BrandMark() {
		return h("img", {
			src: BRAND_MARK_DATA,
			alt: "",
			"aria-hidden": "true",
			style: { height: 21, width: "auto", display: "block", verticalAlign: "middle" },
			onError: function (e) {
				try {
					const el = (e && (e.currentTarget || e.target)) || null;
					if (!el || !el.parentNode) return;
					const span = document.createElement("span");
					span.textContent = "📈";
					span.style.fontSize = "22px";
					el.parentNode.replaceChild(span, el);
				} catch (err) {}
			},
		});
	}

	/**
	 * 覆盖 DSH 自带的界面文案（按 key 匹配，跨命名空间生效）。
	 * DSH 的 locale 服务只有 register（同一 ns+语言重复注册会抛错），没有覆盖入口；
	 * 但 register 存进 dicts 的是字典对象的**引用** —— 拿到它改属性即可，且不动 app 包文件，升级不丢。
	 */
	/** 模型设置页那份「面向 Harness 开发者」的内测声明正文 */
	const WELCOME_BODY = "玖峰投研工作台目前处于内测阶段，功能与数据接口都还在持续打磨。" +
		"如果使用中遇到问题，或有想要的功能，欢迎随时反馈。\\n\\n" +
		"接下来一段时间，投研工作流、专家会诊、游资研判与自动化巡检等模块会陆续增强，" +
		"界面与交互细节也会持续调整。";

	/**
	 * 覆盖表。key 一律写成完整 key；太通用的 key 用 "命名空间::key" 限定，
	 * 避免误伤别的插件里同名的 key。
	 */
	const TEXT_OVERRIDES = {
		"hero.headline": BRAND.slogan,                                          // 新会话欢迎页大标题（原「探索未至之境」）
		"hero.preview": "内测版",                                                // 原「预览版」
		"placeholder.hero": "描述你的投研需求, / 调用指令, @ 文件或对话",          // 原「描述你想要构建的内容」是编程语境
		"placeholder.default": "描述你的投研需求, / 调用指令, @ 文件或对话",       // 原「发消息或创建任务」偏工程语境
		"settings.models::welcomeTitle": "内测声明",
		"settings.models::welcomeBody": WELCOME_BODY,
	};

	/**
	 * 术语表：把界面上的通用工程词换成投研语境的说法，对本命名空间内**所有 zh 文案**
	 * 做子串替换。比逐条列 key 耐升级 —— DSH 新增的含这些词的文案会自动跟上。
	 * 精确覆盖（TEXT_OVERRIDES）在替换之后执行，优先级更高、可用来反悔个别词条。
	 */
	const TERM_MAP = {
		// 长词在前：先命中「会话工作区」，剩下的「工作区」再单独替换
		"会话工作区": "投研空间",
		"工作区": "投研空间",
	};

	/** 对单条文本做术语替换（translate 兜底路径也用这个） */
	function applyTermsToText(v) {
		if (typeof v !== "string") return v;
		const terms = Object.keys(TERM_MAP);
		let out = v;
		for (let i = 0; i < terms.length; i++) {
			const t = terms[i];
			if (out.indexOf(t) >= 0) out = out.split(t).join(TERM_MAP[t]);
		}
		return out;
	}

	/** 术语替换整份字典：返回改动的条数 */
	function applyTerms(zh) {
		let hit = 0;
		Object.keys(zh).forEach(function (k) {
			const next = applyTermsToText(zh[k]);
			if (next !== zh[k]) { zh[k] = next; hit++; }
		});
		return hit;
	}

	/** 查覆盖表：支持 "ns::key" 限定与全局 key（全局对所有命名空间生效） */
	function findOverride(ns, key) {
		const specs = Object.keys(TEXT_OVERRIDES);
		for (let i = 0; i < specs.length; i++) {
			const spec = specs[i];
			const sep = spec.indexOf("::");
			if (sep < 0) { if (spec === key) return TEXT_OVERRIDES[spec]; }
			else if (spec.slice(0, sep) === ns && spec.slice(sep + 2) === key) return TEXT_OVERRIDES[spec];
		}
		return undefined;
	}

	/** 把覆盖表写进 locale 字典；返回命中数，结构不符时返回 null（交给调用方走兜底） */
	function overrideLocaleText(locale) {
		const dicts = locale && locale.dicts;
		if (!dicts || typeof dicts.forEach !== "function") return null;
		let hit = 0;
		dicts.forEach(function (locales, ns) {
			if (!locales || typeof locales.get !== "function") return;
			const zh = locales.get("zh");
			if (!zh || typeof zh !== "object") return;
			hit += applyTerms(zh);                    // ① 术语替换（全量，投研语境）
			Object.keys(TEXT_OVERRIDES).forEach(function (spec) {
				const sep = spec.indexOf("::");
				const onlyNs = sep < 0 ? null : spec.slice(0, sep);
				const k = sep < 0 ? spec : spec.slice(sep + 2);
				if (onlyNs !== null && onlyNs !== ns) return;
				if (Object.prototype.hasOwnProperty.call(zh, k) && zh[k] !== TEXT_OVERRIDES[spec]) {
					zh[k] = TEXT_OVERRIDES[spec];
					hit++;
				}
			});
		});
		return hit;
	}

	/** 兜底：dicts 结构变了就直接包一层 translate（只拦覆盖表里的 key，其余原样透传） */
	function installTranslateFallback(locale) {
		if (!locale || typeof locale.translate !== "function") return;
		try {
			const orig = locale.translate.bind(locale);
			locale.translate = function (ns, key, params) {
				const v = findOverride(ns, key);
				return v === undefined ? applyTermsToText(orig(ns, key, params)) : v;
			};
		} catch (e) {}
	}

	/** 装文案覆盖：先试一次 → 包装 register 兜住后续注册 → 再定时重试 */
	function installTextOverrides(ctx) {
		const locale = ctx && ctx.locale;
		if (!locale) return;
		let fallbackDone = false;
		const run = function () {
			try {
				const hit = overrideLocaleText(locale);
				if (hit === null && !fallbackDone) { fallbackDone = true; installTranslateFallback(locale); }
				if (hit) locale.publish(locale.snapshot.active, false);   // 主动刷新（字典改动本身不发事件）
			} catch (e) {}
		};
		run();
		if (typeof locale.register === "function") {
			try {
				const origRegister = locale.register.bind(locale);
				locale.register = function (ns, a, b) {
					const dispose = origRegister(ns, a, b);
					run();                       // 别人注册字典后再覆盖一次
					return dispose;
				};
			} catch (e) {}
		}
		[80, 400, 1500].forEach(function (ms) { setTimeout(run, ms); });
	}

	/** 窗口标题：DSH 把 productTitle 硬编码在 ui-layout 里，这里在文档层替换（升级不丢） */
	function installTitleBrand() {
		const OLD = BRAND.upstream, NEW = BRAND.name;
		const fix = function () {
			try {
				const t = document.title;
				if (!t) { document.title = NEW; return; }        // 页面还没设标题（Windows 会用窗口 spec 的标题）→ 直接落品牌名
				if (t.indexOf(OLD) >= 0) document.title = t.split(OLD).join(NEW);
			} catch (e) {}
		};
		fix();
		try {
			const head = document.head || document.documentElement;
			if (head && typeof MutationObserver === "function") {
				new MutationObserver(fix).observe(head, { childList: true, characterData: true, subtree: true });
			}
		} catch (e) {}
		[120, 600, 2000].forEach(function (ms) { setTimeout(fix, ms); });
	}

	// #region ============ 插件主体 ============
	const name = "dsh-ai-invest-sidebar";
	const inject = ["slots", "locale", "theme", "sessions", "workspaces", "connection"];

	function apply(ctx) {
		ctx.effect(() => ctx.locale.register("ai-invest", { zh: {}, en: {} }), "dsh-ai-invest-sidebar: dictionaries");
		runtimeCtx = ctx;

		// 品牌落地：把 DSH 自带的标语/产品名换成玖峰投研工作台（运行时覆盖，不动 app 包）
		installTextOverrides(ctx);
		installTitleBrand();

		ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
			name: "sidebar.workspaces",
			id: "ai-invest-workspaces",
			priority: -1,
			locale: "ai-invest",
			inject: () => ({
				open: (sessionId) => { ctx.sessions.open(sessionId); },
				archive: (sessionId) => { archiveSessionCompat(ctx, sessionId).catch(() => {}); },
			}),
		}, InvestSidebar));

		ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.register({
			name: "sidebar.brand.mark", id: "ai-invest-brand-mark", priority: -1,
		}, BrandMark));

		ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register({
			name: "sidebar.brand.name", id: "ai-invest-brand-name", priority: -1,
		}, () => h("span", { style: { fontWeight: 600, fontSize: 16 } }, BRAND.name)));

		ctx.slots.inject("shell.overlay", () => ctx.slots.register({
			name: "shell.overlay", id: "ai-invest-card", priority: -1, label: () => BRAND.name,
		}, OverlayCard));
	}

	exports.name = name;
	exports.inject = inject;
	exports.apply = apply;
	return module.exports;
}});

//# sourceMappingURL=client.js.map
`;

writeFileSync(`${import.meta.dirname}/client/client.js`, clientJs, 'utf8');
console.log('生成完成，client.js 大小:', (clientJs.length / 1024).toFixed(1) + ' KB');
console.log('技能总数:', data.skills.length, '分类总数:', data.cats.length);
