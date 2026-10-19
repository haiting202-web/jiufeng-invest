# -*- coding: utf-8 -*-
"""build-persona-skills.py — 从源 .ts 人格文件生成 SKILL.md（批次2/3/4 能力补全）。

单一真源 = src/ 下的 .ts 人格/编排文件。本脚本只做「抽取 → 组装 → 落双副本 → 回写 skills-data.json」。
原则：人格 systemPrompt 以源文件为准逐字抽取（不手抄），编排规则（权重/冲突/汇总）是算法，
由脚本内固化转写成 prompt 指令。

用法：
  python build-persona-skills.py --dry-run     # 只报告，不写文件
  python build-persona-skills.py               # 实际写入（先备份 skills-data.json）
"""
import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime

BASE = r'dsh-ai-invest-sidebar'
# ★ 源目录：本文件会进公开仓库，不能写死本机路径。
#   本机跑时可用环境变量 AI_BUTLER_SRC 指定；未指定则按「仓库根的同级目录」推断
#   （<project>\client-software\ai-butler-desktop\src）。
SRC = os.environ.get('AI_BUTLER_SRC') or os.path.normpath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 '..', 'client-software', 'ai-butler-desktop', 'src'))

TARGETS = [
    r'%USERPROFILE%\.dsh\.agent-presets\ai-finance\skills',
    r'<仓库根>-github\agent-preset\ai-finance\skills',
]

JSON_PATH = os.path.join(BASE, 'skills-data.json')

CAT_ZH = {
    'financial-analysis': '财务分析',
    'equity-research': '权益研究',
    'investment-banking': '投资银行',
    'private-equity': '私募股权',
    'wealth-management': '财富管理',
    'fund-admin': '基金管理',
    'operations': '运营合规',
    # 'consultation': '智能研判',   # ← 2026-10-08 用户要求删除该分类，已从 skills-data.json 移除
}

# ==============================
# 抽取工具
# ==============================

def read_src(name):
    return open(os.path.join(SRC, name), encoding='utf-8').read()


def field_s(s, key):
    """抽单引号字符串字段。"""
    m = re.search(key + r"\s*:\s*'([^']*)'", s)
    return m.group(1) if m else ''


def field_n(s, key):
    m = re.search(key + r"\s*:\s*(\d+(?:\.\d+)?)", s)
    return m.group(1) if m else ''


def field_list(s, key):
    """抽 ['a','b'] 数组，返回去引号字符串列表。"""
    m = re.search(key + r"\s*:\s*\[([^\]]*)\]", s)
    if not m:
        return []
    return [x.strip().strip("'\"") for x in m.group(1).split(',') if x.strip()]


def field_tpl(s, key):
    """抽模板字符串字段 `...`（源内容不含反引号，故非贪婪到首个反引号即闭合）。"""
    m = re.search(key + r"\s*:\s*`([\s\S]*?)`", s)
    return m.group(1).rstrip() if m else ''


def field_list_dot(s, key):
    """抽多行数组 ['a','b',...]（跨行，去掉换行再拆）。"""
    m = re.search(key + r"\s*:\s*\[([\s\S]*?)\]", s)
    if not m:
        return []
    return [x.strip().strip("'\"") for x in m.group(1).replace('\n', ' ').split(',') if x.strip()]


def split_blocks(text, header):
    """按注释分节标题切块，返回 {标题行: 块}。"""
    out = {}
    parts = re.split(r'\n\s*//\s*=+\n', text)
    for p in parts[1:]:
        m = re.match(r'\s*//\s*([^\n]+)\n', p)
        if m:
            out[m.group(1).strip()] = p
    return out


def obj_blocks(text):
    """把数组体按顶层 { ... }, 切分成对象块。忽略字符串内的逗号与花括号。"""
    blocks, depth, start, in_str, q = [], 0, -1, False, ''
    i = 0
    while i < len(text):
        c = text[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == q:
                in_str = False
            i += 1
            continue
        if c in ("'", '"', '`'):
            in_str, q = True, c
            i += 1
            continue
        if c == '{':
            if depth == 0:
                start = i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start >= 0:
                blocks.append(text[start:i + 1])
                start = -1
        i += 1
    return blocks


# ==============================
# 批次2 (P0)：游资人格系统
# ==============================

def extract_traders():
    """从 trader-personas.ts 抽取 6 游资 + 2 择时 + 调度表。"""
    text = read_src(os.path.join('data', 'trader-personas.ts'))
    traders_raw = []
    timings_raw = []
    rules_raw = []

    # 切三大段
    m_t = re.search(r'export const traders[\s\S]*?=\s*\[', text)
    m_ti = re.search(r'export const timings[\s\S]*?=\s*\[', text)
    m_r = re.search(r'export const schedulingRules[\s\S]*?=\s*\[', text)

    def section(from_idx, until_pat):
        seg = text[from_idx:]
        end = re.search(until_pat, seg)
        return seg[:end.start()] if end else seg

    if m_t:
        seg = section(m_t.end(), r'\n\]\n')
        traders_raw = obj_blocks(seg)
    if m_ti:
        seg = section(m_ti.end(), r'\n\]\n')
        timings_raw = obj_blocks(seg)
    if m_r:
        seg = section(m_r.end(), r'\n\]\n')
        rules_raw = obj_blocks(seg)

    traders = []
    for b in traders_raw:
        sp = field_tpl(b, 'systemPrompt')
        if not sp:
            continue
        traders.append({
            'id': field_s(b, 'id'),
            'name': field_s(b, 'name'),
            'nickname': field_s(b, 'nickname'),
            'icon': field_s(b, 'icon'),
            'era': field_s(b, 'era'),
            'style': field_s(b, 'style'),
            'coreLabel': field_s(b, 'coreLabel'),
            'theory': field_s(b, 'theory'),
            'stopLossPercent': field_n(b, 'stopLossPercent'),
            'tags': field_list(b, 'tags'),
            'systemPrompt': sp,
        })

    timings = []
    for b in timings_raw:
        sp = field_tpl(b, 'systemPrompt')
        if not sp:
            continue
        timings.append({
            'id': field_s(b, 'id'),
            'name': field_s(b, 'name'),
            'author': field_s(b, 'author'),
            'icon': field_s(b, 'icon'),
            'coreTool': field_s(b, 'coreTool'),
            'entryLogic': field_s(b, 'entryLogic'),
            'stopLossRule': field_s(b, 'stopLossRule'),
            'tags': field_list(b, 'tags'),
            'systemPrompt': sp,
        })

    rules = []
    for b in rules_raw:
        rules.append({
            'problemType': field_s(b, 'problemType'),
            'description': field_s(b, 'description'),
            'traderIds': field_list(b, 'traderIds'),
            'timingIds': field_list(b, 'timingIds'),
            'logic': field_s(b, 'logic'),
        })

    return traders, timings, rules


# 问题类型识别关键词（与 trader-orchestrator.ts detectProblemType 一致）
PROBLEM_KEYWORDS = [
    ('trend_timing', '趋势择时（大级别方向）', '趋势/方向/大级别/背驰/中枢/关键点/最小阻力/缠论/利弗莫尔'),
    ('risk_control', '风险控制/仓位/退潮', '风险/仓位/止损/风控/退潮/空仓/减仓/回撤'),
    ('entry_exit', '龙头买卖点', '买点/卖点/进出/入场/出场/什么时候买/什么时候卖/还能追/还能拿'),
    ('low_buy', '低位埋伏/回调低吸', '低吸/回调/埋伏/抄底/低位/回踩'),
    ('sector_leader', '主线/板块/龙头识别', '主线/板块/龙头/题材/热点/最强/核心'),
    ('market_sentiment', '市场情绪判断', '情绪/赚钱效应/恐慌/贪婪/分歧/一致/周期'),
    ('comprehensive', '全面研判（默认）', '（无关键词命中时兜底）'),
]


def build_trader_skill(traders, timings, rules):
    """组装 trader-consultation SKILL.md 内容（标准四段式）。"""
    desc = (
        '游资多专家研判。输入股票代码/名称与问题，自动按问题类型调度 2-4 位顶级游资'
        '（Asking/炒股养家/92科比/陈小群/涅槃重升/著名刺客）加 0-2 套择时框架'
        '（利弗莫尔关键点/缠论），串行链式独立研判后加权汇总'
        '（保守风格权重×1.2 / 中性×1.0 / 激进×0.8），多空分歧超过 25% 触发冲突预警，'
        '输出含方向信号、综合置信度、建议仓位与风险等级的操作手册。'
        '触发词：游资、游资多专家、多专家研判、游资情绪、情绪周期、龙头战法、养家心法、分歧转一致、'
        '总龙头、龙头操作手册、缠论、缠论分析、用缠论、背驰、中枢、利弗莫尔、关键点、最小阻力、'
        '低吸、20日线、树干树枝、六层情绪。'
        '当用户需要对某只股票做游资视角的情绪周期、龙头、买卖点、择时或仓位风控研判时使用。'
    )

    # 人格档案
    persona_parts = []
    for i, t in enumerate(traders, 1):
        style_zh = {'aggressive': '激进', 'moderate': '中性', 'conservative': '保守'}[t.get('style', 'moderate')]
        head = f'#### 游资{i}：{t["name"]}（{t.get("nickname","")}）— {style_zh}风格 · 止损{t["stopLossPercent"]}%'
        meta = f'- 标签：{" / ".join(t["tags"])}'
        persona_parts.append('\n'.join([head, meta, '', t['systemPrompt']]))
    for i, tm in enumerate(timings, 1):
        head = f'#### 择时{i}：{tm["name"]}（{tm.get("author","")}）'
        meta = f'- 核心工具：{tm["coreTool"]}｜入场：{tm["entryLogic"]}｜止损：{tm["stopLossRule"]}'
        persona_parts.append('\n'.join([head, meta, '', tm['systemPrompt']]))

    # 调度计划表
    rule_rows = []
    for r in rules:
        tra = '、'.join(r['traderIds']) or '—'
        tim = '、'.join(r['timingIds']) or '—'
        rule_rows.append(f'| {r["problemType"]} | {r["description"]} | {tra} | {tim} | {r["logic"]} |')
    rule_table = '\n'.join(rule_rows)

    # 关键词表
    kw_rows = '\n'.join(f'| {pt} | {zh} | {kw} |' for pt, zh, kw in PROBLEM_KEYWORDS)
    kw_table = kw_rows

    cap = f'''你是「游资多专家研判」调度引擎。当用户对某只股票提出短线、情绪、龙头、买卖点、择时或风控类问题时，你按以下六步流程执行：识别问题类型 → 生成调度计划 → 逐位扮演被调度专家独立研判 → 解析信号 → 加权汇总与冲突裁决 → 输出操作手册。

### 一、问题类型识别

按优先级从上到下匹配用户问题中的关键词（命中即停）：

| 类型 | 中文 | 关键词 |
|------|------|--------|
{kw_table}

### 二、调度计划

命中类型后，按下表调度对应游资与择时框架：

| 类型 | 说明 | 游资 | 择时 | 调度逻辑 |
|------|------|------|------|----------|
{rule_table}

### 三、八位专家人格档案（完整 systemPrompt，逐位独立扮演）

对每位被调度的专家，你必须**完全代入其人格**，用其交易哲学、买卖点系统、仓位风控与输出格式独立给出研判，不得混用他人观点。

{"\n\n".join(persona_parts)}

### 四、串行链式研判

按调度顺序逐位扮演（先游资、后择时），每位独立输出：
1. 对当前形势的判断
2. 操作建议（含具体买卖点与仓位百分比）
3. 风险提示
并用一句话总结核心观点。每位观点须附「信号方向」（看多/看空/中性）、「置信度」（0-100）、「建议仓位」（0-100%）。

### 五、加权汇总与冲突裁决

- **风格权重**：保守风格 ×1.2、中性 ×1.0、激进 ×0.8，归一化后作为每位专家的投票权重。
- **方向信号**：看多方权重 > 0.5 → 偏多；看空方权重 > 0.5 → 偏空；否则中性。
- **冲突预警**：当看多方权重 > 0.25 且看空方权重 > 0.25 时，判定观点分歧，须输出冲突提示，并**以保守游资（涅槃重升、著名刺客）的观点为基准，降低仓位参与或等待信号明确**。
- **风险等级**：偏空且有冲突 → 极高；偏空 → 高；有冲突 → 高；偏多且置信度 > 75 → 低；中性 → 中。
- **建议仓位**：各专家建议仓位的加权平均。

### 六、操作手册输出格式

按以下 Markdown 结构输出最终结果：

1. **标的** + **研判问题** + **调度逻辑** 说明行
2. **综合裁决表**：方向信号（🟢偏多/🟡中性/🔴偏空）、综合置信度、建议仓位、风险等级、冲突提示（如有）
3. **各游资独立观点**：每位一档（图标 + 名称 + 信号 + 置信度 + 建议仓位 + 观点正文）
4. **择时框架验证**（如调度了择时）
5. **免责声明**：以上研判基于公开社区资料构建的游资人格模型，仅供学习参考，不构成任何投资建议。股市有风险，投资需谨慎。'''

    # 引导词
    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供股票代码/名称或研判问题时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **游资多专家研判** 技能\n\n'
        '请输入要研判的股票代码（如 600519）与你想解决的问题（如：情绪周期处于什么阶段 / 龙头还能不能追 / 用缠论看当前走势 / 该不该减仓），我将自动调度最匹配的游资与择时框架做多专家研判。\n'
        '```\n\n'
        '然后等待用户提供信息，再开始正式研判。若用户消息已包含足够信息，则直接开始，跳过引导环节。'
    )

    # 数据获取规范 / 输出要求（与 102 个技能同构）
    data_norm = (
        '## 数据获取规范\n\n'
        '- 涉及行情/财报/估值/新闻等数据时，**优先调用 dsh-finance-tools 提供的金融数据工具**：'
        '`search_stock`（代码/名称搜索）、`get_stock_quote`（实时行情）、`get_kline`（K线）、'
        '`get_stock_fund_flow`（资金流）、`get_market_sentiment`（市场情绪）、'
        '`get_limit_up_pool`（涨停池）、`get_dragon_tiger`（龙虎榜）、`get_sector_fund_flow`（板块资金）、'
        '`get_stock_news` / `get_company_announcements`（新闻公告）等。\n'
        '- **禁止编造数字**：连板高度、涨停家数、封单、换手、量能等结构化数据必须来自上述工具；无法获取时标注"数据暂缺"或"假设"，并说明理由。\n'
        '- `web_search`（豆包搜索）仅用于新闻、政策面、舆情等工具无法覆盖的信息，并注明来源。'
    )

    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，金融术语可保留英文缩写；关键结论加粗；多用表格呈现对比数据。\n'
        '- 每位游资/择时的独立观点须先声明其人格立场，再给结论，避免观点同质化。\n'
        '- 客观数据注明来源；无法获取的一律标注"假设"并给出取值理由。\n'
        '- 投资类结论必须附风险提示："以上为AI生成内容，不构成投资建议，市场有风险，投资须谨慎。"'
    )

    fm = (
        '---\n'
        f'name: trader-consultation\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: equity-research\n'
        '---\n\n'
    )
    title = '# 游资多专家研判（Trader Consultation）\n\n> 分类：权益研究 | 技能 id：`trader-consultation`\n\n'

    body = (fm + title + guide + '\n\n'
            + '## 能力定位\n\n' + cap + '\n\n'
            + data_norm + '\n\n'
            + output_norm + '\n')
    return body


def build_trader_json_entry(traders, timings, rules):
    """skills-data.json 的 trader-consultation 条目（prompt 用精简版，避免常驻上下文过大）。"""
    # 侧边栏注入用精简 prompt：角色 + 调度 + 人格要点（完整档案在 SKILL.md 的 DSH 原生加载路径）
    brief_trader = '；'.join(
        f'{t["name"]}({t.get("style","")}·止损{t["stopLossPercent"]}%)' for t in traders)
    brief_timing = '；'.join(f'{t["name"]}' for t in timings)
    brief_rules = '；'.join(f'{r["problemType"]}={r["logic"]}' for r in rules)

    prompt = (
        '# 游资多专家研判\n\n'
        '你是游资多专家研判调度引擎。根据用户问题类型，调度 2-4 位游资 + 0-2 套择时框架，'
        '逐位代入其人格独立研判，再按「保守×1.2/中性×1.0/激进×0.8」加权汇总，'
        '分歧超过 25% 触发冲突预警并转保守，输出综合裁决操作手册。\n\n'
        f'【游资人格】{brief_trader}\n'
        f'【择时框架】{brief_timing}\n'
        f'【调度规则】{brief_rules}\n\n'
        '每位专家须给出信号方向（看多/看空/中性）、置信度、建议仓位；最终汇总方向信号、综合置信度、'
        '建议仓位、风险等级，并附免责声明。'
    )

    return {
        'id': 'trader-consultation',
        'name': '游资多专家研判',
        'icon': '🛸',
        'category': 'equity-research',
        'description': '6大顶级游资方法论 + 2大择时框架的多专家聚合研判，自动调度、串行研判、加权汇总、冲突预警',
        'prompt': prompt,
        'inputSchema': [
            {
                'key': 'ticker',
                'label': '研判标的',
                'type': 'stock-picker',
                'required': True,
                'placeholder': '输入股票代码或公司名称',
            },
            {
                'key': 'angle',
                'label': '研判问题类型',
                'type': 'select',
                'defaultValue': 'comprehensive',
                'options': [
                    {'label': '市场情绪判断', 'value': 'market_sentiment'},
                    {'label': '主线/龙头识别', 'value': 'sector_leader'},
                    {'label': '龙头买卖点', 'value': 'entry_exit'},
                    {'label': '低位低吸', 'value': 'low_buy'},
                    {'label': '趋势择时', 'value': 'trend_timing'},
                    {'label': '风险控制/仓位', 'value': 'risk_control'},
                    {'label': '全面研判', 'value': 'comprehensive'},
                ],
            },
            {
                'key': 'question',
                'label': '具体问题',
                'type': 'textarea',
                'placeholder': '例如：这只票的游资情绪周期处于什么阶段？龙头还能不能追？该不该减仓？',
            },
        ],
    }


# ==============================
# 批次3 (P1)：会诊专家 / 12 Agent / 投资大师
# ==============================

def extract_experts():
    """从 experts.ts 抽取 6 位会诊专家（跳过 trader，已在 P0 覆盖）+ 数据纪律。"""
    text = read_src(os.path.join('data', 'experts.ts'))
    disc = re.search(r"const DATA_DISCIPLINE = `([\s\S]*?)`", text).group(1).strip()
    m = re.search(r'export const experts[\s\S]*?=\s*\[', text)
    seg = text[m.end():]
    end = re.search(r'\n\]\n', seg)
    seg = seg[:end.start()]
    experts = []
    for b in obj_blocks(seg):
        sid = field_s(b, 'id')
        if sid == 'trader':
            continue  # P0 已固化
        sp = field_tpl(b, 'systemPrompt')
        if not sp:
            continue
        sp = sp.replace('${DATA_DISCIPLINE}', disc)
        experts.append({
            'id': sid,
            'name': field_s(b, 'name'),
            'icon': field_s(b, 'icon'),
            'category': field_s(b, 'category'),
            'description': field_s(b, 'description'),
            'tags': field_list_dot(b, 'tags'),
            'skillIds': field_list_dot(b, 'skillIds'),
            'systemPrompt': sp,
        })
    return experts, disc


def extract_agents():
    """从 agents/index.ts 抽取 12 个 Agent + 文档生成规范。"""
    text = read_src(os.path.join('agents', 'index.ts'))
    doc = re.search(r"const DOCUMENT_GENERATION_RULES = `([\s\S]*?)`", text).group(1).strip()
    m = re.search(r'export const agents[\s\S]*?=\s*\[', text)
    seg = text[m.end():]
    end = re.search(r'\n\]\n', seg)
    seg = seg[:end.start()]
    agents = []
    for b in obj_blocks(seg):
        sp = field_tpl(b, 'systemPrompt')
        if not sp:
            continue
        agents.append({
            'id': field_s(b, 'id'),
            'name': field_s(b, 'name'),
            'category': field_s(b, 'category'),
            'description': field_s(b, 'description'),
            'skills': field_list_dot(b, 'skills'),
            'systemPrompt': sp,
        })
    return agents, doc


def extract_investors():
    """从 investor-personas.ts 抽取 10 位投资大师。"""
    text = read_src(os.path.join('lib', 'investor-personas.ts'))
    m = re.search(r'export const investorPersonas[\s\S]*?=\s*\[', text)
    seg = text[m.end():]
    end = re.search(r'\n\]\n', seg)
    seg = seg[:end.start()]
    personas = []
    for b in obj_blocks(seg):
        personas.append({
            'id': field_s(b, 'id'),
            'name': field_s(b, 'name'),
            'nameEn': field_s(b, 'nameEn'),
            'style': field_s(b, 'style'),
            'avatar': field_s(b, 'avatar'),
            'focus': field_list_dot(b, 'focus'),
            'rules': field_list_dot(b, 'rules'),
            'famousQuotes': field_list_dot(b, 'famousQuotes'),
            'suitableFor': field_list_dot(b, 'suitableFor'),
            'avoidFor': field_list_dot(b, 'avoidFor'),
        })
    return personas


STYLE_LABEL = {
    'value': '价值投资', 'growth': '成长投资', 'quant': '量化投资', 'macro': '宏观投资',
    'special-situation': '特殊情况投资', 'income': '收益型投资', 'turnaround': '困境反转投资',
}

EXPERT_KEYWORDS = [
    ('financial-analysis', '财务监控诊断', '估值 / DCF / 现金流 / 折现 / WACC / PE / PB / EV / EBITDA'),
    ('equity-research', '股票多空博弈', '财报 / 业绩 / 营收 / 净利 / 护城河 / 行业 / 晨会 / 评级 / 目标价'),
    ('investment-banking', '投行业务', '并购 / 收购 / 重组 / IPO / 上市 / 路演 / 发债 / 融资结构'),
    ('private-equity', '项目筛选尽调', '私募 / PE / 尽调 / 投后 / 筛选 / 单位经济 / 退出路径'),
    ('wealth-management', '资产配置规划', '理财 / 资产配置 / 退休 / 税务 / 保险 / 遗产 / 财富规划'),
    ('fund-admin', '基金对账核查', '对账 / NAV / KYC / 反洗钱 / 合规 / 资本账户 / 投资者报告'),
]


def build_expert_skill(experts, disc):
    desc = (
        '专家会诊。按用户问题关键词自动匹配最合适的 1-3 位金融专家'
        '（财务监控诊断/股票多空博弈/投行业务/项目筛选尽调/资产配置规划/基金对账核查），'
        '串行链式独立研判后汇总，输出综合会诊结论与分歧提示。'
        '触发词：专家会诊、会诊、多专家、财务诊断、财务健康、多空博弈、投行、尽调、'
        '资产配置、基金对账、综合研判。当用户提出跨领域的投研问题、需要多位专家从不同角度会诊时使用。'
    )
    expert_blocks = []
    for i, e in enumerate(experts, 1):
        head = f'#### 专家{i}：{e["name"]}'
        meta = f'- 标签：{" / ".join(e["tags"])}｜关联技能：{"、".join(e["skillIds"])}'
        expert_blocks.append('\n'.join([head, meta, '', e['systemPrompt']]))
    kw_rows = '\n'.join(f'| {cid} | {nm} | {kw} |' for cid, nm, kw in EXPERT_KEYWORDS)

    cap = f'''你是「专家会诊」调度引擎。当用户提出投研类问题、且未明确指定单一技能时，你按数据纪律，自动匹配最合适的 1-3 位金融专家，串行链式独立研判后汇总，输出会诊结论。

### 数据纪律（所有专家必须遵守）

{disc}

### 六位会诊专家（完整 systemPrompt，逐位独立扮演）

对每位被调度的专家，必须**完全代入其人格**（能力边界、分析规范、输出风格），独立给出研判。

{"\n\n".join(expert_blocks)}

### 会诊编排

- **专家匹配**：按问题关键词路由（命中即选）：

| 专家 | 中文 | 关键词 |
|------|------|--------|
{kw_rows}

- **串行链式**：被调度的专家逐个独立研判（串行调用，QPS 优先，不做并发），每人输出独立意见。
- **汇总**：合并各专家结论，给出综合评级与置信度；专家间结论冲突时标注分歧，并以更保守的结论为基准。
- **游资专项**：若问题涉及短线、情绪周期、龙头、买卖点、择时，转交「游资多专家研判」（trader-consultation 技能）处理，不在此会诊。

### 输出格式

1. **会诊结论**：综合评级（如「偏多 / 中性 / 偏空」）+ 置信度
2. **各专家独立意见**：每专家一档（图标 + 名称 + 观点）
3. **分歧提示**：如有专家意见冲突，明示差异
4. **免责声明**：AI 生成内容，不构成投资建议。'''

    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供足够信息时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **专家会诊** 技能\n\n'
        '请描述你要会诊的问题（如：这家公司的财务健康度如何 / 这个并购交易值不值得做 / 我的资产该怎么配置），我会自动匹配最合适的专家做多角度研判。\n'
        '```\n\n'
        '然后等待用户提供信息，再开始会诊。若用户消息已包含足够信息，则直接开始，跳过引导环节。'
    )
    data_norm = (
        '## 数据获取规范\n\n'
        '- 涉及行情/财报/估值/新闻等数据时，**优先调用 dsh-finance-tools 提供的金融数据工具**（search_stock / get_stock_quote / get_financial_report / get_stock_news 等）。\n'
        '- **禁止编造数字**：所有财务数据、股价、指标必须来自工具返回的 API 数据；未提供的一律标注"数据暂缺"，不得用训练数据补全或猜测。\n'
        '- 引用数据必须注明来源；新闻/公告/财报须带时间标签，超过 7 天的新闻标注"旧闻"，超过 6 个月的财报标注"过期数据"。\n'
        '- PE>500 或 <0、ROE>100%、单日涨跌>10% 等异常值需特别标注"异常，需核实"。'
    )
    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，关键结论加粗；多用表格呈现对比数据。\n'
        '- 每位专家须先声明其专业立场与能力边界，再给结论，避免观点同质化。\n'
        '- 客观数据注明来源；无法获取的一律标注"假设"并给出取值理由。\n'
        '- 投资类结论必须附风险提示："以上为AI生成内容，不构成投资建议，市场有风险，投资须谨慎。"'
    )
    fm = (
        '---\n'
        f'name: expert-consultation\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: consultation\n'
        '---\n\n'
    )
    title = '# 专家会诊（Expert Consultation）\n\n> 分类：智能研判 | 技能 id：`expert-consultation`\n\n'
    return fm + title + guide + '\n\n' + '## 能力定位\n\n' + cap + '\n\n' + data_norm + '\n\n' + output_norm + '\n'


def build_agent_skill(agents, doc):
    desc = (
        '投研工作流 Agent。内置 12 大端到端工作流（模型构建器/财报分析器/市场研究员/投行路演/估值审查器/'
        '客户会议准备/财富优化/月末结账/报表审计/KYC筛查/研究追踪/股权投资），'
        '每个 Agent 绑定关联技能清单与工作流步骤，按用户任务类型自动选型执行。'
        '触发词：投研工作流、模型构建、财报分析、市场研究、路演、估值审查、会议准备、财富优化、'
        '月末结账、报表审计、KYC筛查、研究追踪、股权投资、端到端。当用户需要按完整工作流端到端完成投研任务时使用。'
    )
    agent_blocks = []
    for i, a in enumerate(agents, 1):
        head = f'#### Agent{i}：{a["name"]}（{a["category"]}）'
        meta = f'- 关联技能：{", ".join(a["skills"])}'
        agent_blocks.append('\n'.join([head, meta, '', a['systemPrompt']]))

    cap = f'''你是「投研工作流 Agent」调度器。根据用户任务类型，选择最匹配的 Agent 工作流，按该 Agent 的步骤（拉取数据 → 调用技能 → 审计/检查 → 输出 → 提交审查）端到端执行。

### 文档输出规范

{doc}

### 十二个 Agent 工作流

对每个 Agent，其 systemPrompt 已内置工作流步骤与关联技能；执行时按步骤调用对应技能。

{"\n\n".join(agent_blocks)}

### 选型规则

- 用户提到「建模/DCF/LBO/三表」→ 模型构建器；「财报/业绩点评」→ 财报分析器；「行业/主题研究」→ 市场研究员
- 「并购/IPO/路演/交易」→ 投行路演；「估值审查/季度末」→ 估值审查器；「客户会议」→ 客户会议准备
- 「理财/再平衡/税损」→ 财富优化；「月末结账」→ 月末结账；「报表审计」→ 报表审计
- 「KYC/开户」→ KYC筛查；「事件日历/逻辑跟踪」→ 研究追踪；「私募项目/尽调」→ 股权投资

### 输出格式

1. 声明所选 Agent 工作流
2. 按工作流步骤逐步执行（标明每步调用的技能）
3. 产出该 Agent 定义的交付物
4. 末尾「提交审查」提示，暂停等待用户确认'''

    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供足够信息时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **投研工作流 Agent** 技能\n\n'
        '请描述你的任务（如：从零构建一个 DCF 模型 / 做一份财报点评 / 写一份行业研究），我会选择最匹配的工作流端到端执行。\n'
        '```\n\n'
        '然后等待用户提供信息。若用户消息已包含足够信息，则直接开始。'
    )
    data_norm = (
        '## 数据获取规范\n\n'
        '- 数据源统一走 dsh-finance-tools（search_stock / get_financial_report / get_stock_quote / get_research_reports 等）。\n'
        '- **禁止编造数字**；无法获取的一律标注"数据暂缺"或"假设"并说明理由。\n'
        '- 生成的模型/报表类交付物，关键数字必须可追溯到工具返回值。'
    )
    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，按 Agent 工作流步骤组织输出；关键结论加粗，多用表格。\n'
        '- 明确标注每步调用的技能名称与输入/输出。\n'
        '- 交付物为草稿时明示"草稿，待用户审查"，不擅自对外定稿。\n'
        '- 投资类结论必须附风险提示。'
    )
    fm = (
        '---\n'
        f'name: agent-workflows\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: consultation\n'
        '---\n\n'
    )
    title = '# 投研工作流 Agent（Agent Workflows）\n\n> 分类：智能研判 | 技能 id：`agent-workflows`\n\n'
    return fm + title + guide + '\n\n' + '## 能力定位\n\n' + cap + '\n\n' + data_norm + '\n\n' + output_norm + '\n'


def build_investor_skill(personas):
    desc = (
        '投资大师视角。内置 10 位投资大师（巴菲特/彼得·林奇/格雷厄姆/费雪/索罗斯/芒格/张磊/但斌/林园/迈克尔·伯里），'
        '按股票类型（消费/科技/金融/医药等）与用户偏好自动匹配最合适的大师视角，以其投资哲学分析标的并声明大师身份。'
        '触发词：投资大师、巴菲特、价值投资、林奇、成长股、格雷厄姆、安全边际、费雪、索罗斯、芒格、张磊、'
        '但斌、林园、伯里、大师视角、用某某大师的视角。当用户希望以某位投资大师的投资哲学分析股票时使用。'
    )
    p_blocks = []
    for p in personas:
        style = STYLE_LABEL.get(p['style'], p['style'])
        head = f'#### {p["name"]}（{p["nameEn"]}）— {style} {p["avatar"]}'
        lines = [
            head,
            f'- 关注：{" / ".join(p["focus"])}',
            f'- 规则：{"；".join(p["rules"])}',
            f'- 名言：{"；".join(p["famousQuotes"])}',
            f'- 适合：{"、".join(p["suitableFor"])}；避开：{"、".join(p["avoidFor"])}',
        ]
        p_blocks.append('\n'.join(lines))

    cap = f'''你是「投资大师」路由器。根据股票类型与用户偏好，自动选择最匹配的 1-3 位投资大师，以该大师的投资哲学分析标的，并在回答开头声明是哪位大师的视角。

### 十位投资大师档案

{"\n\n".join(p_blocks)}

### 大师匹配逻辑

- **股票类型推断**：按公司名称/行业关键词归类（茅台/五粮液/白酒→消费；腾讯/阿里/半导体→科技；银行/保险/证券→金融；恒瑞/药明/医药→医药…），无法判断默认大盘股。
- **匹配评分**：命中「适合」类型 +10，命中「避开」类型 -5，基础分 +1；取得分最高的前 3 位。
- **用户偏好优先**：若用户明确点名大师（巴菲特/价值投资、林奇/成长、索罗斯/宏观、张磊/高瓴/长期主义、但斌/核心资产、林园/垄断），直接以该大师视角分析。
- **全平局**（无实质匹配）→ 不套用任何大师，用通用基本面视角。

### 输出格式

1. 开头声明："以下分析基于 {{name}}（{{nameEn}}）的投资视角，他是一位 {{style}} 投资者，主要关注 {{focus 前3项}}。"
2. 按该大师的「关注点 + 投资规则」展开分析
3. 数据使用规则：具体数字（股价/营收/利润）必须来自 API 数据，禁止编造；定性判断可结合行业常识并标注
4. 结论 + 免责声明'''

    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供标的或偏好时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **投资大师视角** 技能\n\n'
        '请输入要分析的股票（如 600519）或指定某位大师（如"用巴菲特视角看茅台"），我会匹配最合适的大师视角展开分析。\n'
        '```\n\n'
        '然后等待用户提供信息。若用户消息已包含足够信息，则直接开始。'
    )
    data_norm = (
        '## 数据获取规范\n\n'
        '- 具体数字（股价/营收/利润/估值）必须来自 dsh-finance-tools（search_stock / get_stock_quote / get_financial_report 等），禁止编造。\n'
        '- 定性分析（护城河/竞争/商业模式）可结合行业知识，但须与 API 数据交叉验证。\n'
        '- 标注来源：（API 数据）或（行业常识）。'
    )
    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，开头必须声明大师身份与投资风格；关键结论加粗。\n'
        '- 以该大师的第一人称语气与投资哲学行文，避免教科书式套话。\n'
        '- 客观数据注明来源；投资类结论必须附风险提示。'
    )
    fm = (
        '---\n'
        f'name: investor-personas\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: consultation\n'
        '---\n\n'
    )
    title = '# 投资大师视角（Investor Personas）\n\n> 分类：智能研判 | 技能 id：`investor-personas`\n\n'
    return fm + title + guide + '\n\n' + '## 能力定位\n\n' + cap + '\n\n' + data_norm + '\n\n' + output_norm + '\n'


def build_expert_json(experts):
    """会诊技能的 skills-data.json 精简 prompt（完整档案在 SKILL.md）。"""
    brief = '；'.join(f'{e["name"]}({e["description"]})' for e in experts)
    prompt = (
        '# 专家会诊\n\n'
        '你是专家会诊调度引擎。按问题关键词匹配 1-3 位金融专家，串行链式独立研判后汇总，输出综合结论与分歧提示。\n\n'
        f'【会诊专家】{brief}\n'
        f'【匹配规则】{"；".join(f"{nm}=({kw})" for _, nm, kw in EXPERT_KEYWORDS)}\n\n'
        '每位专家须遵守数据纪律（禁止编造数字，缺失标"数据暂缺"）；结论冲突时以保守为准并标注分歧。'
    )
    return {
        'id': 'expert-consultation',
        'name': '专家会诊',
        'icon': '🧑‍⚕️',
        'category': 'consultation',
        'description': '多专家串行会诊，自动匹配 1-3 位金融专家独立研判后汇总，输出综合结论与分歧提示',
        'prompt': prompt,
        'inputSchema': [
            {'key': 'topic', 'label': '会诊问题', 'type': 'textarea', 'required': True,
             'placeholder': '例如：这家公司的财务健康度如何？这个并购交易值不值得做？'},
        ],
    }


def build_agent_json(agents):
    brief = '；'.join(f'{a["name"]}({", ".join(a["skills"])})' for a in agents)
    prompt = (
        '# 投研工作流 Agent\n\n'
        '你是投研工作流调度器。按用户任务类型选择最匹配的 Agent 工作流，端到端执行（拉数据→调用技能→审计→输出→提交审查）。\n\n'
        f'【12 Agent】{brief}\n\n'
        '执行时按所选 Agent 的步骤调用对应技能，交付物为草稿时标注"待用户审查"。'
    )
    return {
        'id': 'agent-workflows',
        'name': '投研工作流 Agent',
        'icon': '🤖',
        'category': 'consultation',
        'description': '12 大端到端投研工作流，按任务类型自动选型，内置关联技能清单与执行步骤',
        'prompt': prompt,
        'inputSchema': [
            {'key': 'task', 'label': '任务描述', 'type': 'textarea', 'required': True,
             'placeholder': '例如：从零构建一个 DCF 模型 / 写一份财报点评 / 做一份行业研究'},
        ],
    }


def build_investor_json(personas):
    brief = '；'.join(f'{p["name"]}({STYLE_LABEL.get(p["style"], p["style"])})' for p in personas)
    prompt = (
        '# 投资大师视角\n\n'
        '你是投资大师路由器。按股票类型与用户偏好匹配最合适的投资大师，以其投资哲学分析标的，开头声明大师身份。\n\n'
        f'【10 位大师】{brief}\n\n'
        '匹配：适合类型 +10 / 避开 -5 / 基础 +1 取前 3；用户点名大师时优先。具体数字必须来自 API 数据，禁止编造。'
    )
    return {
        'id': 'investor-personas',
        'name': '投资大师视角',
        'icon': '🎩',
        'category': 'consultation',
        'description': '10 位投资大师人格，按股票类型与偏好自动匹配视角，以其投资哲学分析标的',
        'prompt': prompt,
        'inputSchema': [
            {'key': 'ticker', 'label': '分析标的', 'type': 'stock-picker', 'required': True,
             'placeholder': '输入股票代码或公司名称'},
            {'key': 'master', 'label': '指定大师（可选）', 'type': 'select',
             'options': [{'label': '自动匹配', 'value': 'auto'}] + [
                 {'label': p['name'], 'value': p['id']} for p in personas]},
        ],
    }


def purge_consultation_category(dry):
    """确保 skills-data.json **不含** consultation 分类（幂等清理）。

    ★ 2026-10-08 变更：用户判定「智能研判」分类与其「专业工具」体系不符，
      要求连同其下 3 个技能（expert-consultation / agent-workflows /
      investor-personas）一并删除。此函数由原来的 ensure（新增）反转为
      purge（删除），保证即使有人手工把分类加回来，重跑本脚本也会再次清掉。
    """
    d = json.load(open(JSON_PATH, encoding='utf-8'))
    if not any(c['id'] == 'consultation' for c in d['cats']):
        print('  [skills-data.json] 无 consultation 分类（符合预期，无需处理）')
        return
    d['cats'] = [c for c in d['cats'] if c['id'] != 'consultation']
    if not dry:
        bak = JSON_PATH + f'.bak-purge-consultation-{datetime.now().strftime("%Y%m%d%H%M%S")}'
        shutil.copy2(JSON_PATH, bak)
        json.dump(d, open(JSON_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'  [备份] {bak}')
    print('  [skills-data.json] 移除分类 consultation（智能研判）')


def write_expert_prompts(experts, dry):
    """生成 expert-prompts.json，供 gen-client.mjs 专家卡注入完整 systemPrompt。"""
    path = os.path.join(BASE, 'expert-prompts.json')
    data = {e['id']: e['systemPrompt'] for e in experts}
    if not dry:
        json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'  [expert-prompts.json] {"dry" if dry else "写"} {len(data)} 位专家（{"、".join(data)}）')


def run_p1(dry):
    """P1 批次：仅维护「投研工作流」专家的 systemPrompt（expert-prompts.json）。

    ★ 2026-10-08 变更（重要）：
      本批次**不再创建** expert-consultation / agent-workflows / investor-personas
      三个技能，**也不再创建** consultation（智能研判）分类 —— 用户判定该分类
      与其「专业工具」体系不符，要求删除。被删技能的 SKILL.md 备份在
      `dsh-update-guard/skill-removed-consultation-20261008/`，勿据本脚本恢复。

    ★ 为什么 expert-prompts.json 仍然必须生成：
      它服务于侧边栏「投研工作流」组的 6 张专家卡（financial-analysis /
      equity-research / investment-banking / private-equity /
      wealth-management / fund-admin），由 gen-client.mjs 第 31 行读取并注入
      client.js，与会诊技能**无关**。删掉它会导致这 6 张卡丢掉完整人格 prompt。

    被保留但已无调用方（死代码，勿删以免牵连共享辅助函数）：
      build_expert_skill / build_agent_skill / build_investor_skill 及
      build_expert_json / build_agent_json / build_investor_json。
    """
    experts, disc = extract_experts()
    print(f'[抽取] 投研工作流专家 {len(experts)} 位 → 仅写入 expert-prompts.json')

    write_expert_prompts(experts, dry)
    purge_consultation_category(dry)
    print('\n[已下线] expert-consultation / agent-workflows / investor-personas')
    print('         （2026-10-08 删除，本脚本不再创建，也不会恢复其分类）')
    print('\n提示：下一步回测 —— python verify-skills-md.py 与 test-skills-matching.py')




# ==============================
# 批次4 (P2)：避雷针 / 数据质量自检 / 技术指标公式
# ==============================

def build_risk_scanner_skill():
    desc = (
        'A股避雷针风险扫描。对持仓或关注标的扫描三大类风险信号：股东减持预警（减持计划/减持进展/减持预披露）、'
        '限售解禁（未来 7 天大比例解禁）、风险监控（风险提示/严重异常波动/退市风险/ST 警示）。'
        '触发词：避雷、避雷针、风险扫描、减持、限售解禁、解禁、风险提示、退市风险、有没有雷、雷点。'
        '当用户想排查持仓或关注标的的减持/解禁/风险公告等"雷点"时使用。'
    )
    cap = '''你是「A股避雷针」风险扫描器。对用户指定的持仓或关注标的，扫描三大类风险信号并给出避雷结论。

### 三大风险信号

| 信号 | 说明 |
|------|------|
| **股东减持预警** | 减持计划 / 减持进展 / 减持预披露公告 |
| **限售解禁** | 未来 7 天内大比例限售股上市流通（流通股比例 ≥ 1%） |
| **风险监控** | 风险提示 / 严重异常波动 / 退市风险 / ST 警示公告 |

### 信号识别规则

- **减持关键词**：减持、股份减持、减持计划、减持股份、减持预披露、拟减持
- **风险等级判定**：标题含「严重异常波动」→ alert（最高）；含「风险提示 / 风险警示 / 退市风险」→ monitor；ST + 风险/警示 → monitor
- **减持优先级排序**：拟减持 / 减持计划 / 预披露 靠前，一般减持靠后
- **解禁筛选**：仅关注流通股解禁比例 ≥ 1% 的标的，按解禁日期由近到远排序

### 数据来源（dsh-finance-tools）

- 公告：`get_company_announcements` / `get_stock_news`（取最近 3 天公告做关键词筛）
- 解禁：`get_share_unlock`（限售解禁）/ `get_limit_up_pool` / `get_dragon_tiger` 辅助
- 无法获取时标注"数据暂缺"，禁止编造解禁比例与日期

### 输出格式

1. **减持预警**：表格（标的 / 公告摘要 / 减持比例）
2. **解禁预警**：表格（标的 / 解禁日期 / 解禁比例 / 解禁市值）
3. **风险监控**：分 alert / monitor 两档列出
4. **综合避雷建议**：给出「重点关注 / 谨慎 / 安全」评级 + 理由
5. **免责声明**'''

    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供标的时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **A股避雷针** 技能\n\n'
        '请输入要排查的股票（如 600519）或你的持仓清单，我会扫描减持、限售解禁、风险公告三大类雷点。\n'
        '```\n\n'
        '然后等待用户提供标的。若用户消息已包含标的，则直接开始扫描。'
    )
    data_norm = (
        '## 数据获取规范\n\n'
        '- 减持/解禁/风险公告必须来自 dsh-finance-tools（get_company_announcements / get_stock_news / get_share_unlock 等），禁止编造。\n'
        '- 公告须带时间标签；解禁比例与市值无法获取时标注"数据暂缺"。\n'
        '- 关键词命中即入列，不得遗漏；漏报比多报更危险。'
    )
    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，表格呈现信号清单；alert 用 🔴、monitor 用 🟠、减持用 🟡 区分严重度。\n'
        '- 每个信号注明来源（公告日期 / 数据源）。\n'
        '- 结尾必须附风险提示与免责声明。'
    )
    fm = (
        '---\n'
        f'name: risk-scanner\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: equity-research\n'
        '---\n\n'
    )
    title = '# A股避雷针（Risk Scanner）\n\n> 分类：权益研究 | 技能 id：`risk-scanner`\n\n'
    return fm + title + guide + '\n\n' + '## 能力定位\n\n' + cap + '\n\n' + data_norm + '\n\n' + output_norm + '\n'


def build_data_review_skill():
    desc = (
        '数据质量自检（HARD-GATE）。分析前自动检查行情/财务/指标数据的完整性与合理性，'
        '按阈值规则拦截异常值（股价≤0、涨跌幅>20%、财报超120天、营收同比>100%、ROE异常、毛利率异常），'
        '防止基于错误数据生成误导性分析。触发词：数据质量、数据自检、数据核查、数据校验、数据异常、'
        '数据完整、数据时效、检查数据。当用户需要核对数据质量、或分析前想先确认数据可靠时使用。'
    )
    cap = '''你是「数据质量自检」引擎（HARD-GATE）。在做任何投研分析前，先对输入数据做质量检查，防止基于错误数据生成误导性结论。

### 检查规则（阈值）

**行情数据**
| 检查项 | 阈值 | 级别 |
|--------|------|------|
| 缺行情数据 | 无数据 | 🔴 严重 |
| 股价异常 | price ≤ 0 | 🔴 严重（停牌/数据源异常） |
| 涨跌幅异常 | 绝对值 > 20% | 🟠 警告（新股/复牌） |

**财务数据**
| 检查项 | 阈值 | 级别 |
|--------|------|------|
| 缺利润表 | 无 income | 🟠 警告 |
| 财报时效 | 最新财报 > 120 天 | 🟠 警告 |
| 营收异常 | 同比绝对值变化 > 100% | 🟠 警告（并购/重组） |
| 缺资产负债表 / 现金流量表 | 无数据 | 🟠 警告 |

**财务指标**
| 检查项 | 阈值 | 级别 |
|--------|------|------|
| 营收增长异常 | < -50% 或 > 500% | 🟠 警告 |
| ROE 异常 | < -50% 或 > 100% | 🟠 警告 |
| 毛利率异常 | < 0 或 > 100% | 🟠 警告 |

### 执行流程

1. 获取数据 → 2. 逐项检查 → 3. 统计严重/警告数 → 4. 输出结论

### 结论判定

- 0 严重 + 0 警告 → ✅ 数据质量检查通过
- 0 严重 + N 警告 → ⚠️ 有 N 个警告，分析需谨慎解读
- ≥1 严重 → ❌ 有严重问题，建议修复后再分析

### 输出格式

1. 结论摘要（✅/⚠️/❌）
2. 分级列出问题（❌ 严重 + 建议 / ⚠️ 注意 + 建议）
3. 若通过，直接进入正式分析'''

    guide = (
        '## 引导词（首轮必读）\n\n'
        '当用户触发本技能但尚未提供数据或标的时，**第一轮输出必须先给出引导语**，格式为：\n\n'
        '```\n'
        '已选择 **数据质量自检** 技能\n\n'
        '请提供要核查的数据或标的（如股票代码 600519 的行情与财报数据），我会按阈值规则逐项检查数据质量。\n'
        '```\n\n'
        '然后等待用户提供数据。若用户消息已包含数据，则直接开始检查。'
    )
    data_norm = (
        '## 数据获取规范\n\n'
        '- 被检查的数据必须来自 dsh-finance-tools（get_stock_quote / get_financial_report 等）或用户提供，禁止自造。\n'
        '- 检查结论基于真实数据字段；字段缺失即按规则标记，不得用训练数据补全。\n'
        '- 阈值是硬性标准，命中即报，不得放宽。'
    )
    output_norm = (
        '## 输出要求\n\n'
        '- 使用中文，表格呈现检查项与命中情况；❌ 严重 / ⚠️ 注意 分级清晰。\n'
        '- 每条问题必须附带「建议」字段。\n'
        '- 检查通过后明确提示可进入正式分析。'
    )
    fm = (
        '---\n'
        f'name: data-review\n'
        f'description: {desc}\n'
        'agent_created: true\n'
        'version: 2.0.0\n'
        'category: operations\n'
        '---\n\n'
    )
    title = '# 数据质量自检（Data Review）\n\n> 分类：运营合规 | 技能 id：`data-review`\n\n'
    return fm + title + guide + '\n\n' + '## 能力定位\n\n' + cap + '\n\n' + data_norm + '\n\n' + output_norm + '\n'


TECH_FORMULA_BLOCK = '''### 指标计算规范（精确公式，避免手算误差）

对 K 线收盘价序列，按以下公式计算（`get_kline` 返回原始 K 线，指标值据此计算）：

**均线**
- SMA(n)：最近 n 日收盘价的简单算术平均
- EMA(n)：`EMA = α×今日收盘 + (1-α)×昨日EMA`，其中 `α = 2/(n+1)`，首个有效值用 SMA(n) 代替

**MACD（默认 12/26/9）**
- DIF = EMA(12) − EMA(26)
- DEA = EMA(9)（对 DIF 序列）
- MACD 柱 = 2 × (DIF − DEA)
- 金叉 = DIF 上穿 DEA（昨日 DIF≤DEA 且今日 DIF>DEA）；死叉反之

**RSI（默认 14 周期，Wilder 平滑）**
- 首个 RSI：`RSI = 100 − 100/(1 + 平均涨幅/平均跌幅)`（前 14 日简单平均）
- 后续：涨幅/跌幅用 Wilder 平滑 `avg = (prev×(n−1) + 今日值)/n`
- 平均跌幅为 0 时 RSI = 100

**布林带（默认 20 周期，2 倍标准差）**
- 中轨 = SMA(20)
- 上/下轨 = 中轨 ± 2 × 标准差（标准差按近 20 日收盘价对中轨的偏离计算）

**信号阈值与综合评分**
- RSI < 30 超卖（+1），> 70 超买（−1）
- 布林带宽 < 5% 收窄（变盘前兆，0）；收盘 ≥ 上轨×0.995 上轨压力（−1）；≤ 下轨×1.005 下轨支撑（+1）
- MACD 金叉 +2，死叉 −2
- 综合分 ≥ +2 偏多，≤ −2 偏空，其余中性'''


def enrich_technical_analysis(dry):
    """给现有 technical-analysis 的「能力定位」末尾追加指标计算公式块。幂等。"""
    block = TECH_FORMULA_BLOCK
    marker = '### 指标计算规范（精确公式'
    for tid in TARGETS:
        path = os.path.join(tid, 'technical-analysis', 'SKILL.md')
        if not os.path.isfile(path):
            print(f'  [缺失] {path}')
            continue
        t = open(path, encoding='utf-8').read()
        if marker in t:
            print(f'  [已存在] technical-analysis 公式块（跳过）')
            continue
        anchor = '\n## 数据获取规范'
        idx = t.find(anchor)
        if idx < 0:
            print('  [异常] 未找到「## 数据获取规范」锚点，跳过')
            continue
        new = t[:idx].rstrip() + '\n\n' + block + '\n' + t[idx:]
        if not dry:
            open(path, 'w', encoding='utf-8', newline='\n').write(new)
        print(f'  [{"dry" if dry else "写"}] technical-analysis 追加公式块（{"本地" if "Users" in tid else "GitHub"}）')


def build_risk_scanner_json():
    return {
        'id': 'risk-scanner',
        'name': 'A股避雷针',
        'icon': '🛡️',
        'category': 'equity-research',
        'description': '扫描股东减持、限售解禁、风险公告三大类雷点，输出避雷评级',
        'prompt': (
            '# A股避雷针\n\n'
            '你是A股避雷针风险扫描器。扫描三大风险信号：减持（减持/减持计划/拟减持/预披露）、'
            '限售解禁（未来7天流通比例≥1%）、风险监控（严重异常波动→alert；风险提示/退市风险/ST→monitor）。\n\n'
            '数据来自 dsh-finance-tools 的公告/解禁接口，禁止编造。输出减持/解禁/风险三表 + 综合避雷评级 + 免责声明。'
        ),
        'inputSchema': [
            {'key': 'ticker', 'label': '排查标的', 'type': 'stock-multi', 'required': True,
             'placeholder': '输入股票代码或名称，回车添加（可多选）'},
        ],
    }


def build_data_review_json():
    return {
        'id': 'data-review',
        'name': '数据质量自检',
        'icon': '🧪',
        'category': 'operations',
        'description': '分析前 HARD-GATE 数据质量检查，按阈值拦截异常值，防止基于错误数据分析',
        'prompt': (
            '# 数据质量自检\n\n'
            '你是数据质量自检引擎（HARD-GATE）。分析前检查：行情（股价≤0 严重、涨跌幅绝对值>20% 警告）、'
            '财务（财报>120天警告、营收同比绝对值变化>100%警告）、指标（营收增长<-50%或>500%、ROE<-50%或>100%、毛利率<0或>100% 警告）。\n\n'
            '输出 ✅通过 / ⚠️有警告 / ❌有严重 三档结论 + 分级问题清单 + 建议。'
        ),
        'inputSchema': [
            {'key': 'ticker', 'label': '核查标的', 'type': 'stock-picker', 'required': True,
             'placeholder': '输入股票代码或公司名称'},
        ],
    }


def run_p2(dry):
    print('[批次4] 避雷针 / 数据质量自检 / 技术指标公式')

    for name, content, entry in [
        ('risk-scanner', build_risk_scanner_skill(), build_risk_scanner_json()),
        ('data-review', build_data_review_skill(), build_data_review_json()),
    ]:
        print(f'\n[SKILL.md] {name} 全文 {len(content.encode()):,} B')
        write_skill(name, content, dry)
        update_json(entry, dry)

    enrich_technical_analysis(dry)
    print('\n提示：下一步回测 —— python verify-skills-md.py 与 test-skills-matching.py')


def write_skill(sid, content, dry):
    for tid in TARGETS:
        path = os.path.join(tid, sid, 'SKILL.md')
        if not dry:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, 'w', encoding='utf-8', newline='\n').write(content)
        print(f'  [{"dry" if dry else "写"}] {path}')


def update_json(entry, dry):
    d = json.load(open(JSON_PATH, encoding='utf-8'))
    skills = d['skills']
    idx = next((i for i, s in enumerate(skills) if s.get('id') == entry['id']), None)
    if idx is not None:
        old = skills[idx]
        skills[idx] = entry
        action = 'UPDATE'
    else:
        skills.append(entry)
        action = 'CREATE'
    if not dry:
        bak = JSON_PATH + f'.bak-persona-{datetime.now().strftime("%Y%m%d%H%M%S")}'
        shutil.copy2(JSON_PATH, bak)
        json.dump(d, open(JSON_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print(f'  [备份] {bak}')
    print(f'  [skills-data.json] {action} {entry["id"]}（共 {len(skills)} 技能）')
    return action


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--batch', default='p0', choices=['p0', 'p1', 'p2'],
                    help='p0=游资人格 p1=工作流专家prompt(会诊/Agent/大师技能已下线) p2=避雷/数据自检/技术指标')
    args = ap.parse_args()
    dry = args.dry_run

    print('=' * 78)
    print(f'build-persona-skills.py — 批次 {args.batch.upper()}（dry-run={dry}）')
    print('=' * 78)

    if args.batch == 'p0':
        traders, timings, rules = extract_traders()
        print(f'[抽取] 游资 {len(traders)} 位 / 择时 {len(timings)} 套 / 调度规则 {len(rules)} 条')
        for t in traders:
            print(f'        · {t["icon"]} {t["name"]}（{t["style"]}）prompt {len(t["systemPrompt"].encode())} B')
        for tm in timings:
            print(f'        · {tm["icon"]} {tm["name"]} prompt {len(tm["systemPrompt"].encode())} B')

        content = build_trader_skill(traders, timings, rules)
        print(f'\n[SKILL.md] trader-consultation 全文 {len(content.encode()):,} B')
        write_skill('trader-consultation', content, dry)

        entry = build_trader_json_entry(traders, timings, rules)
        update_json(entry, dry)

        print('\n提示：下一步回测 —— python verify-skills-md.py 与 test-skills-matching.py')
    elif args.batch == 'p1':
        run_p1(dry)
    elif args.batch == 'p2':
        run_p2(dry)
    else:
        print(f'批次 {args.batch} 尚未实现（本脚本当前支持 p0 游资 / p1 工作流专家prompt / p2 避雷·数据自检·技术指标）。')


if __name__ == '__main__':
    main()
