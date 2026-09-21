// build-inputschema.mjs
// 为 A股/行情类技能设计 inputSchema 卡片定义，并合入 skills-data.json
// 设计原则：
//   1. 美股已有卡片的字段结构作为骨架（ticker/years/focus 等保持同名同义，便于对齐）
//   2. A股专用选项：报告期按A股披露节奏、板块、估值锚（中债无风险利率/中国ERP/25%税率/CNY）
//   3. 财报期动态生成，避免 WEB 端那种硬编码 5 个季度过期的问题
import { readFileSync, writeFileSync } from 'node:fs';

const JSON_PATH = `${import.meta.dirname}/skills-data.json`;
const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));

// ===== 动态生成 A股报告期（从当前日期往前推 6 期）=====
function buildChinaPeriods() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const periods = [];
  // A股披露节奏：Q1(4月) 中报(8月) Q3(10月) 年报(4月次年)
  const schedule = [
    { label: '年报', month: 4, yearOffset: 0, prev: true },
    { label: 'Q1', month: 4, yearOffset: 0 },
    { label: '中报', month: 8, yearOffset: 0 },
    { label: 'Q3', month: 10, yearOffset: 0 },
  ];
  for (let back = 0; back < 3; back++) {
    const yy = y - back;
    for (let i = schedule.length - 1; i >= 0; i--) {
      const s = schedule[i];
      // 年报在次年4月披露，属于上一年
      const labelYear = s.prev ? yy - 1 : yy;
      if (back === 0 && s.month > m) continue; // 本期还没披露
      periods.push({ label: `${labelYear}${s.label}`, value: `${labelYear}${s.label}` });
    }
  }
  return periods.slice(0, 6);
}
const CHINA_PERIODS = buildChinaPeriods();

// 兜底：动态生成失败时用静态
const PERIOD_OPTIONS = CHINA_PERIODS.length
  ? CHINA_PERIODS
  : [
      { label: '2025年报', value: '2025年报' },
      { label: '2025Q3', value: '2025Q3' },
      { label: '2025中报', value: '2025中报' },
      { label: '2025Q1', value: '2025Q1' },
    ];

// ===== 12 个技能的卡片定义 =====
const SCHEMAS = {
  // ── A股 10 个 ────────────────────────────────────────────
  'china-dcf-model': [
    { key: 'ticker', label: '分析对象', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称，如 贵州茅台 / 600519' },
    { key: 'years', label: '预测期', type: 'select', options: [
      { label: '3年', value: '3' }, { label: '5年', value: '5' }, { label: '10年', value: '10' },
    ], defaultValue: '5' },
    { key: 'rfRate', label: '无风险利率', type: 'select', options: [
      { label: '中债10年期国债收益率', value: 'cn10y' },
      { label: '2.0%', value: '2.0' }, { label: '2.5%', value: '2.5' }, { label: '3.0%', value: '3.0' },
    ], defaultValue: 'cn10y', helpText: '默认取中债10年期国债到期收益率' },
    { key: 'erp', label: '中国股权风险溢价', type: 'select', options: [
      { label: '5.0%', value: '5.0' }, { label: '6.0%', value: '6.0' }, { label: '7.0%', value: '7.0' },
    ], defaultValue: '6.0' },
    { key: 'taxRate', label: '所得税率', type: 'select', options: [
      { label: '25%（法定标准）', value: '25' }, { label: '15%（高新技术企业）', value: '15' },
      { label: '20%（小型微利）', value: '20' },
    ], defaultValue: '25' },
    { key: 'terminalMethod', label: '终值方法', type: 'select', options: [
      { label: '永续增长法', value: 'perpetuity' }, { label: '退出倍数法', value: 'exit' },
    ], defaultValue: 'perpetuity' },
    { key: 'terminalGrowth', label: '永续增长率', type: 'number', unit: '%', min: 0, max: 5, dependsOn: { key: 'terminalMethod', value: 'perpetuity' }, placeholder: '如 2.5' },
    { key: 'exitMultiple', label: '退出 EV/EBITDA', type: 'number', unit: 'x', min: 1, max: 50, dependsOn: { key: 'terminalMethod', value: 'exit' }, placeholder: '如 12' },
  ],

  'china-comps-analysis': [
    { key: 'target', label: '目标公司', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'peers', label: '可比公司', type: 'text', placeholder: '如 五粮液,泸州老窖,山西汾酒；留空由AI按行业推荐' },
    { key: 'focus', label: '分析重点', type: 'select', options: [
      { label: '估值对比', value: 'valuation' }, { label: '增长分析', value: 'growth' },
      { label: '竞争定位', value: 'positioning' }, { label: '运营效率', value: 'efficiency' },
    ], defaultValue: 'valuation' },
    { key: 'context', label: '场景', type: 'select', options: [
      { label: '投资决策', value: 'invest' }, { label: '并购评估', value: 'ma' },
      { label: '行业对标', value: 'benchmark' }, { label: '业绩回顾', value: 'review' },
    ], defaultValue: 'invest' },
  ],

  'china-earnings-analysis': [
    { key: 'ticker', label: '分析对象', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'period', label: '报告期', type: 'select', required: true, options: PERIOD_OPTIONS },
    { key: 'angle', label: '分析角度', type: 'select', options: [
      { label: '全面点评', value: 'full' }, { label: '收入拆解', value: 'revenue' },
      { label: '利润拆解', value: 'profit' }, { label: '现金流质量', value: 'cashflow' },
      { label: '指引与预期更新', value: 'guidance' },
    ], defaultValue: 'full' },
  ],

  'china-earnings-preview': [
    { key: 'ticker', label: '分析对象', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'period', label: '前瞻报告期', type: 'select', options: PERIOD_OPTIONS },
    { key: 'focus', label: '关注重点', type: 'select', options: [
      { label: '全面前瞻', value: 'full' }, { label: '收入预测', value: 'revenue' },
      { label: '利润预测', value: 'profit' }, { label: '超预期概率', value: 'surprise' },
      { label: '业绩预告校验', value: 'prealert' },
    ], defaultValue: 'full' },
  ],

  'china-idea-generation': [
    { key: 'board', label: '板块', type: 'select', options: [
      { label: '全部A股', value: 'all' }, { label: '主板', value: 'main' },
      { label: '创业板', value: 'gem' }, { label: '科创板', value: 'star' },
      { label: '北交所', value: 'bse' },
    ], defaultValue: 'all' },
    { key: 'marketCap', label: '市值', type: 'select', options: [
      { label: '大盘 (>500亿)', value: 'xlarge' }, { label: '中盘 (100-500亿)', value: 'large' },
      { label: '小盘 (50-100亿)', value: 'mid' }, { label: '微盘 (<50亿)', value: 'small' },
    ], defaultValue: 'large' },
    { key: 'sector', label: '行业', type: 'text', required: true, placeholder: '如 白酒、半导体、光伏，或输入 跨行业' },
    { key: 'style', label: '投资风格', type: 'select', options: [
      { label: '价值型', value: 'value' }, { label: '成长型', value: 'growth' },
      { label: '质量型', value: 'quality' }, { label: '主题驱动', value: 'theme' },
      { label: '动量', value: 'momentum' },
    ], defaultValue: 'growth' },
    { key: 'theme', label: '主题', type: 'text', placeholder: '如 AI算力、国产替代、高股息（选填）' },
  ],

  'china-sector-overview': [
    { key: 'sector', label: '行业/板块', type: 'text', required: true, placeholder: '如 白酒、新能源车、半导体设备' },
    { key: 'depth', label: '分析深度', type: 'select', options: [
      { label: '概览 (5-10页)', value: 'brief' }, { label: '深度 (20-30页)', value: 'deep' },
    ], defaultValue: 'brief' },
    { key: 'angle', label: '分析角度', type: 'select', options: [
      { label: '中立全景', value: 'neutral' }, { label: '政策驱动', value: 'policy' },
      { label: '主题投资', value: 'thematic' },
    ], defaultValue: 'neutral' },
    { key: 'universe', label: '覆盖范围', type: 'select', options: [
      { label: '仅上市公司', value: 'listed' }, { label: '包含非上市', value: 'all' },
    ], defaultValue: 'listed' },
    { key: 'purpose', label: '用途', type: 'select', options: [
      { label: '客户报告', value: 'client' }, { label: '内部研究', value: 'internal' },
      { label: '路演材料', value: 'roadshow' }, { label: '投资机会', value: 'idea' },
    ], defaultValue: 'internal' },
  ],

  'china-initiating-coverage': [
    { key: 'ticker', label: '覆盖标的', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'task', label: '执行任务', type: 'select', options: [
      { label: '公司研究', value: 'research' }, { label: '财务建模', value: 'model' },
      { label: '估值分析', value: 'valuation' }, { label: '图表生成', value: 'charts' },
      { label: '报告组装', value: 'assemble' },
    ], defaultValue: 'research', helpText: '首次覆盖分 5 个子任务，逐个执行保证质量' },
  ],

  'china-morning-note': [
    { key: 'focus', label: '晨报重点', type: 'select', options: [
      { label: '全面晨报', value: 'full' }, { label: '隔夜外盘', value: 'overnight' },
      { label: '政策面', value: 'policy' }, { label: '资金面', value: 'flow' },
      { label: '个股异动', value: 'movers' },
    ], defaultValue: 'full' },
    { key: 'sector', label: '关注板块', type: 'text', placeholder: '如 半导体、券商（选填，留空=全市场）' },
  ],

  'china-thesis-tracker': [
    { key: 'ticker', label: '跟踪标的', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'period', label: '跟踪区间', type: 'select', options: [
      { label: '近1个月', value: '1m' }, { label: '近1个季度', value: '1q' },
      { label: '近1年', value: '1y' },
    ], defaultValue: '1q' },
    { key: 'focus', label: '跟踪重点', type: 'select', options: [
      { label: '逻辑验证', value: 'validate' }, { label: '风险扫描', value: 'risk' },
      { label: '催化剂跟踪', value: 'catalyst' },
    ], defaultValue: 'validate' },
  ],

  'china-3-statement-model': [
    { key: 'ticker', label: '建模对象', type: 'stock-picker', required: true, placeholder: '输入股票代码或公司名称' },
    { key: 'years', label: '预测年限', type: 'select', options: [
      { label: '3年', value: '3' }, { label: '5年', value: '5' },
    ], defaultValue: '3' },
    { key: 'driver', label: '建模驱动', type: 'select', options: [
      { label: '收入驱动', value: 'revenue' }, { label: '利润驱动', value: 'profit' },
      { label: '现金流驱动', value: 'cashflow' },
    ], defaultValue: 'revenue' },
  ],

  // ── 行情/对比 2 个（用户举例的场景）────────────────────────
  'technical-analysis': [
    { key: 'tickers', label: '分析标的', type: 'stock-multi', required: true, placeholder: '输入股票代码或名称，回车添加（可多选）' },
    { key: 'period', label: 'K线周期', type: 'select', options: [
      { label: '日线', value: 'daily' }, { label: '周线', value: 'weekly' },
      { label: '月线', value: 'monthly' }, { label: '60分钟', value: '60m' },
    ], defaultValue: 'daily' },
    { key: 'range', label: '回溯区间', type: 'select', options: [
      { label: '近3个月', value: '3m' }, { label: '近6个月', value: '6m' },
      { label: '近1年', value: '1y' }, { label: '近3年', value: '3y' },
    ], defaultValue: '6m' },
    { key: 'indicators', label: '技术指标', type: 'multi-select', options: [
      { label: '均线 MA', value: 'ma' }, { label: 'MACD', value: 'macd' },
      { label: 'RSI', value: 'rsi' }, { label: '布林带', value: 'boll' },
      { label: '成交量', value: 'volume' }, { label: 'KDJ', value: 'kdj' },
    ], defaultValue: ['ma', 'macd', 'volume'] },
  ],

  'stock-comparison': [
    { key: 'tickers', label: '对比标的', type: 'stock-multi', required: true, placeholder: '输入股票代码或名称，回车添加（2-6只）' },
    { key: 'dimensions', label: '对比维度', type: 'multi-select', options: [
      { label: '估值 (PE/PB/PS)', value: 'valuation' }, { label: '成长性', value: 'growth' },
      { label: '盈利能力', value: 'profitability' }, { label: '财务健康', value: 'health' },
      { label: '股价表现', value: 'performance' }, { label: '股东回报', value: 'return' },
    ], defaultValue: ['valuation', 'growth', 'profitability'] },
    { key: 'period', label: '对比报告期', type: 'select', options: PERIOD_OPTIONS },
  ],
};

// ===== 合入 skills-data.json =====
let added = 0, skipped = [];
for (const [id, schema] of Object.entries(SCHEMAS)) {
  const skill = data.skills.find(s => s.id === id);
  if (!skill) { skipped.push(id); continue; }
  skill.inputSchema = schema;
  added++;
}

writeFileSync(JSON_PATH, JSON.stringify(data), 'utf8');

// ===== 报告 =====
const withCard = data.skills.filter(s => s.inputSchema && s.inputSchema.length > 0);
console.log('=== inputSchema 合入完成 ===');
console.log('新增/更新卡片:', added, '| 未找到 skill:', skipped.length ? skipped.join(', ') : '无');
console.log('带卡片的技能总数:', withCard.length, '/ 总技能:', data.skills.length);
console.log('');
console.log('A股报告期选项（动态生成）:', PERIOD_OPTIONS.map(o => o.label).join(' / '));
console.log('');
for (const s of withCard) {
  const isCn = s.id.startsWith('china-') || s.id === 'technical-analysis' || s.id === 'stock-comparison';
  console.log(`【${s.id}】${s.icon || ''} ${s.name}  ${isCn ? '(A股/行情)' : '(美股·来自WEB)'} — ${s.inputSchema.length} 字段`);
}
