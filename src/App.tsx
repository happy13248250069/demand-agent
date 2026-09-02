/**输入示例：客户&技术别，按月/季/年，可展开到Model
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, User, Bot, Edit2, Check, X, AlertCircle, ChevronRight, ChevronDown, Loader2, BarChart3, Target, Tag, Plus, Eye, EyeOff, Activity, ArrowUpRight, ArrowDownRight, Crown, Download, Upload, Search, Settings, Filter, RefreshCcw, RefreshCw, Layers, ExternalLink, MessageSquare, Clock, PanelLeftClose, PanelLeftOpen, MoreHorizontal, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIPredictionTooltip } from './components/tooltips/AIPredictionTooltip';
import { generateAnomalyReasoning } from './services/llm-service';
import { FCSTDP_TIME, FCSTDP_MODELS } from './data/fcstdp-data';

// --- Tooltip Components ---
const ForecastFilterBar = ({ 
  data, 
  onFilterChange 
}: { 
  data: ForecastRow[], 
  onFilterChange: (filtered: ForecastRow[]) => void 
}) => {
  const [filters, setFilters] = useState({
    version: '',
    customer: '',
    size: '',
    model: '',
    resolution: '',
    refreshRate: ''
  });

  const parseResolution = (spec?: string) => spec?.split(',')[0]?.trim() || '';
  const parseRefreshRate = (spec?: string) => spec?.split(',')[1]?.trim() || '';

  const versions = Array.from(new Set(data.map(r => r.version || 'V1.0'))).filter(Boolean).sort();
  const customers = Array.from(new Set(data.map(r => r.customer))).filter(Boolean).sort();
  const sizes = Array.from(new Set(data.map(r => r.size))).filter(Boolean).sort();
  const models = Array.from(new Set(data.map(r => r.model))).filter(Boolean).sort();
  const resolutions = Array.from(new Set(data.map(r => parseResolution(r.specs)))).filter(Boolean).sort();
  const refreshRates = Array.from(new Set(data.map(r => parseRefreshRate(r.specs)))).filter(Boolean).sort();

  useEffect(() => {
    let filtered = data;
    if (filters.version) filtered = filtered.filter(r => (r.version || 'V1.0') === filters.version);
    if (filters.customer) filtered = filtered.filter(r => r.customer === filters.customer);
    if (filters.size) filtered = filtered.filter(r => r.size === filters.size);
    if (filters.model) filtered = filtered.filter(r => r.model === filters.model);
    if (filters.resolution) filtered = filtered.filter(r => parseResolution(r.specs) === filters.resolution);
    if (filters.refreshRate) filtered = filtered.filter(r => parseRefreshRate(r.specs) === filters.refreshRate);
    onFilterChange(filtered);
  }, [filters, data]);

  const FilterSelect = ({ label, options, value, onChange }: { label: string, options: string[], value: string, onChange: (v: string) => void }) => (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{label}</label>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none bg-white transition-all appearance-none min-w-[80px]"
      >
        <option value="">全部</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );

  return (
    <div className="px-4 py-2 bg-gray-50/50 border-b border-gray-100 flex flex-nowrap gap-6 items-center shadow-inner overflow-x-auto no-scrollbar">
      <div className="flex items-center gap-2 shrink-0 border-r border-gray-200 pr-4">
        <Filter size={14} className="text-blue-500" />
        <span className="text-[11px] font-bold text-gray-700 whitespace-nowrap">筛选器</span>
      </div>
      <div className="flex items-center gap-4 py-1">
        <FilterSelect label="版本" options={versions} value={filters.version} onChange={(v) => setFilters(f => ({ ...f, version: v }))} />
        <FilterSelect label="集团客户" options={customers} value={filters.customer} onChange={(v) => setFilters(f => ({ ...f, customer: v }))} />
        <FilterSelect label="尺寸" options={sizes} value={filters.size} onChange={(v) => setFilters(f => ({ ...f, size: v }))} />
        <FilterSelect label="Model" options={models} value={filters.model} onChange={(v) => setFilters(f => ({ ...f, model: v }))} />
        <FilterSelect label="分辨率" options={resolutions} value={filters.resolution} onChange={(v) => setFilters(f => ({ ...f, resolution: v }))} />
        <FilterSelect label="刷新率" options={refreshRates} value={filters.refreshRate} onChange={(v) => setFilters(f => ({ ...f, refreshRate: v }))} />
        <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>
        <button 
          onClick={() => setFilters({ version: '', customer: '', size: '', model: '', resolution: '', refreshRate: '' })}
          className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest whitespace-nowrap shrink-0 transition-colors"
        >
          重置
        </button>
      </div>
    </div>
  );
};

const AnomalyCard = ({ text }: { text: string }) => {
  const parts = text.split('\n');
  const summaryLine = parts[1] || '';
  
  const rules: { title: string; desc: string; situation: string; conclusion: string; isViolation: boolean }[] = [];
  let currentRule: any = null;
  
  for (let i = 2; i < parts.length; i++) {
    const line = parts[i];
    if (line.match(/^[①②③④⑤⑥⑦⑧⑨⑩]/)) {
      if (currentRule) rules.push(currentRule);
      currentRule = { title: line.trim(), desc: '', situation: '', conclusion: '', isViolation: false };
      // Convert "① 客户FCST变化" to "规则①：客户FCST变化"
      currentRule.title = currentRule.title.replace(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*(.*)$/, '规则$1：$2');
    } else if (line.startsWith('* 规则描述：') && currentRule) {
      currentRule.desc = line.replace('* 规则描述：', '').trim();
    } else if (line.startsWith('* 本次情况：') && currentRule) {
      currentRule.situation = line.replace('* 本次情况：', '').trim();
    } else if (line.startsWith('* 结论：') && currentRule) {
      const fullConc = line.replace('* 结论：', '').trim();
      if (fullConc.includes('违反规则')) {
        currentRule.isViolation = true;
        currentRule.conclusion = fullConc.replace('违反规则。', '').trim();
      } else {
        currentRule.conclusion = fullConc;
      }
    }
  }
  if (currentRule) rules.push(currentRule);

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="text-[14px] font-black text-gray-900 leading-none">
        规则分析
      </div>

      <div className="flex flex-col gap-2">
        {rules.map((r, idx) => (
          <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-4 flex flex-col gap-1.5">
            <div className="font-bold text-gray-900 text-[13px] flex items-center justify-between">
              <span>{r.title}</span>
              {r.isViolation && (
                <span className="text-[11px] text-red-500 font-bold bg-red-50 px-2 py-0.5 rounded leading-none">
                  违反规则
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {r.desc && (
                <div className="text-[13px] text-gray-600 leading-snug">
                  <span className="font-medium text-gray-700">描述: </span>{r.desc}
                </div>
              )}
              {r.situation && (
                <div className="text-[13px] text-gray-600 leading-snug">
                  <span className="font-medium text-gray-700">情况: </span>{r.situation}
                </div>
              )}
              {r.conclusion && (
                <div className="text-[13px] text-gray-600 leading-snug">
                  <span className="font-medium text-gray-700">结论: </span>{r.conclusion}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ExternalEventCard = () => {
  const events = [
    {
      id: 1,
      title: '小米电视宣布618大促提前启动，备货量同比增长25%',
      tag: '促销备货',
      content: '小米电视宣布今年618年中大促将提前至5月15日启动，涵盖55寸、65寸、75寸全系电视品类，预计面板备货量同比增长25%以上。',
      affectedTarget: '小米/TV BU',
      impactDirection: '正向–促销活动拉动面板采购需求',
      impactPositive: true,
      source: '企业公告',
      similarity: 0.82
    },
    {
      id: 2,
      title: 'TrendForce：2026年Q2全球电视面板价格预计上涨8-12%',
      tag: '面板涨价',
      content: '受欧洲杯及奥运会备货需求拉动，叠加上游玻璃基板及偏光片涨价传导，Q2全球电视面板均价预计环比上涨8-12%。',
      affectedTarget: '全客户/TV BU',
      impactDirection: '正向–涨价预期客户提前锁单囤货',
      impactPositive: true,
      source: 'TrendForce研报',
      similarity: 0.75
    }
  ];

  return (
    <div className="flex flex-col mt-4 border-t border-gray-200 pt-4">
      <div className="text-[14px] font-black text-gray-900 leading-none mb-3">
        外部情报解读
      </div>
      <div className="space-y-3">
        {events.map((event) => (
          <div key={event.id} className="border border-gray-100 rounded-lg p-4 bg-slate-50">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[13px] font-bold text-gray-900 flex-1 min-w-0">{event.title}</span>
              <span className="shrink-0 ml-3 px-2 py-0.5 bg-gray-200 rounded text-[11px] text-gray-700 font-medium">
                {event.tag}
              </span>
            </div>
            <p className="text-[13px] text-gray-600 leading-relaxed mb-2.5">
              原文：{event.content}
            </p>
            <div className="space-y-1.5">
              <div className="text-[13px] text-gray-600">
                <span className="font-medium text-gray-700">受影响对象：</span>{event.affectedTarget}
              </div>
              <div className="text-[13px] text-gray-600">
                <span className="font-medium text-gray-700">影响方向：</span>
                <span className={event.impactPositive ? 'text-teal-600 font-medium' : 'text-red-500 font-medium'}>
                  {event.impactDirection}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
              <span className="text-[11px] text-gray-400">
                相似度 {event.similarity}（{event.similarity >= 0.7 ? '高相关' : '中相关'}）
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${event.impactPositive ? 'bg-teal-500' : 'bg-red-400'}`}>
                  {event.id}
                </span>
                <span className="text-[11px] text-gray-500">来源:{event.source}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CellTooltipContent = ({ 
  reason, 
  tag, 
  aiSummary, 
  violatedRules,
  oldValue,
  newValue,
  isModified
}: { 
  reason?: string; 
  tag?: string; 
  aiSummary?: string; 
  violatedRules?: string[];
  oldValue?: number;
  newValue?: number;
  isModified?: boolean;
}) => {
  return (
    <div className="w-full flex flex-col gap-0">
      {/* User Edit Part */}
      {isModified && (
        <div className={`flex flex-col gap-1.5 ${aiSummary || (violatedRules && violatedRules.length > 0) ? 'pb-2 border-b border-gray-100 mb-2' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-blue-600 font-bold text-[12px]">
              <Edit2 size={13} /> 用户修改详情
            </div>
            {tag && <span className="bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-md text-[10px]">{tag}</span>}
          </div>
          {oldValue !== undefined && newValue !== undefined && oldValue !== newValue && (
            <div className="flex items-center gap-2 text-[11px] font-medium bg-blue-50/50 p-2 rounded-lg border border-blue-100 mb-1">
              <span className="text-gray-500 line-through">{oldValue.toLocaleString()}</span>
              <ArrowUpRight size={10} className="text-blue-500" />
              <span className="text-blue-700 font-bold">{newValue.toLocaleString()}</span>
              <span className="text-[10px] text-blue-500 font-normal ml-auto">
                (差异: {newValue - oldValue > 0 ? '+' : ''}{(newValue - oldValue).toLocaleString()})
              </span>
            </div>
          )}
          <p className="text-[11px] leading-tight text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100">
            {reason || '无补充理由'}
          </p>
        </div>
      )}

      {/* AI Summary Part */}
      {aiSummary && aiSummary.startsWith('异常分析:\n') ? (
        <>
          <AnomalyCard text={aiSummary} />
          <ExternalEventCard />
        </>
      ) : (
        <>
          {aiSummary && (
            <div className={`flex flex-col gap-1.5 ${violatedRules && violatedRules.length > 0 ? 'pb-2 border-b border-gray-100 mb-2' : ''}`}>
              <div className="flex items-center gap-1.5 text-green-600 font-bold text-[12px]">
                <Bot size={13} /> AI 智能分析
              </div>
              <p className="text-[11px] leading-tight text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100 whitespace-pre-wrap">
                {aiSummary}
              </p>
            </div>
          )}

          {/* Violated Rules Part */}
          {violatedRules && violatedRules.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 text-orange-500 font-bold text-[12px]">
                <AlertCircle size={13} /> 引发预警规则 ({violatedRules.length})
              </div>
              <ul className="space-y-1">
                {violatedRules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-1.5 bg-orange-50/50 p-2 rounded-lg border border-orange-100/50 text-[11px] text-gray-700">
                    <span className="text-orange-500 font-bold shrink-0 mt-0.5">▪</span>
                    <span className="leading-tight">{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};


type DataItemType = '客户FCST' | 'AI预测' | '销售FCST (ETD)' | 'ExtraSales' | '需求计划' | 'ExtraUnmet';

type MNTDataItemType =
  | '客户FCST' | 'AI预测' | '销量预测(ETA)' | '销量基线预测'
  | '销售策略1-中低风险' | '销售策略2-高风险'
  | '库存目标' | '在途库存' | '销售FCST(ETD)';

const BU_DATA_ITEMS_FCST: Record<string, string[]> = {
  'TV': ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '上版销售FCST', '销售FCST(ETD-理论值)', '销售FCST（DP调整版）', 'FCST/上版Alloca GAP', '策备库存（净）', '上版Allocation'],
  'CID': ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '上版销售FCST', '销售FCST(ETD-理论值)', '销售FCST（DP调整版）', 'FCST/上版Alloca GAP', '策备库存（净）', '上版Allocation'],
  'MNT': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '在途', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '周转库存', '策备库存'],
  'NB': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '在途', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '周转库存', '策备库存'],
  '车载': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '策备库存', '车载在途、MC在途（VMI+非VMI）', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）'],
  'MC': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '车载在途、MC在途（VMI+非VMI）', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）'],
};

const BU_DATA_ITEMS_DP: Record<string, string[]> = {
  'TV': ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '客户PSI周数模拟', '上版销售FCST', '销售FCST(ETD-理论值)', '销售FCST（DP调整版）', 'FCST/上版Alloca GAP', '策备库存（净）', '需求计划', '需求计划（理论值）', 'Extra（Supply外）', '上版供需GAP', '上版需求计划', '上版Allocation', '预期库存周数(E)', '上版Supply'],
  'CID': ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '客户PSI周数模拟', '上版销售FCST', '销售FCST(ETD-理论值)', '销售FCST（DP调整版）', 'FCST/上版Alloca GAP', '策备库存（净）', '需求计划', '需求计划（理论值）', 'Extra（Supply外）', '上版供需GAP', '上版需求计划', '上版Allocation', '预期库存周数(E)', '上版Supply'],
  'MNT': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '在途', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '周转库存', '策备库存', '需求计划', 'Extra', 'vs.上版需求计划', '上版Allocation', '预期库存周数（E）', '厂内库存', 'VMI库存理论目标周数', '在途预测', '期初在途预计到货'],
  'NB': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '在途', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '周转库存', '策备库存', '需求计划', 'Extra', 'vs.上版需求计划', '上版Allocation', '预期库存周数（E）', '厂内库存', 'VMI库存理论目标周数', '在途预测', '期初在途预计到货'],
  '车载': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '策备库存', '车载在途、MC在途（VMI+非VMI）', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '需求计划', 'Extra', 'vs.上版需求计划', '上版Supply', '预期库存周数（E）'],
  'MC': ['客户FCST', 'vs. 上版客户FCST', '上版客户RTF', 'AI预测', '销量预测（ETA）', '销量基线预测', '销售策备1-中低风险', '销售策备2-高风险', '库存目标', '车载在途、MC在途（VMI+非VMI）', '销售FCST（ETD）', 'vs.上版销售FCST', 'VMI库存周数（E）', '需求计划', '需求计划（初版建议）', 'vs.上版需求计划', '上版Supply', '预期库存周数（E）'],
};

const BU_DATA_ITEMS = BU_DATA_ITEMS_DP;

// 各模拟版本相较当前版本，在FCSTDP上具体修改了哪些单元格（demo mock，用于"经营结果模拟对比"底部快速入口跳转后的高亮展示）
const SIMULATION_VERSION_OVERRIDES: Record<string, { model: string; dataItem: string; weekKey: string; value: number }[]> = {
  'P260329-04-001': [
    { model: 'ST3151A07-5', dataItem: '客户FCST', weekKey: 'wk35', value: 68000 },
    { model: 'ST645AD12-1', dataItem: '客户FCST', weekKey: 'wk37', value: 5200 },
    { model: 'ST4251D02-1', dataItem: '客户FCST', weekKey: 'wk38', value: 12400 },
  ],
  'P260329-04-002': [
    { model: 'ST3151A07-5', dataItem: '客户FCST', weekKey: 'wk37', value: 71500 },
    { model: 'ST425AD02-7', dataItem: '客户FCST', weekKey: 'wk38', value: 9300 },
    { model: 'ST746AD09-1', dataItem: '客户FCST', weekKey: 'wk35', value: 15600 },
  ],
  'P260329-04-003': [
    { model: 'ST645AD12-1', dataItem: '客户FCST', weekKey: 'wk35', value: 42800 },
    { model: 'ST4251D02-1', dataItem: '客户FCST', weekKey: 'wk37', value: 8900 },
    { model: 'ST3151A07-5', dataItem: '客户FCST', weekKey: 'wk38', value: 61200 },
  ],
};

interface ForecastRow {
  id: string;
  customer: string;
  version?: string;
  tech?: string;
  size: string;
  specs?: string;
  model?: string;
  shippingLocation?: string;
  item: DataItemType | MNTDataItemType | string;
  values: Record<string, number>;
  prevValues?: Record<string, number>;
  isAnomaly: Record<string, boolean>;
  reasons: Record<string, string>;
  tags: Record<string, string>;
  aiSummaries?: Record<string, string>;
  violatedRules?: Record<string, string[]>;
  isAIPrediction?: Record<string, boolean>;
  specialRuleData?: Record<string, { rule: string; situation: string; tag: string; feedback: string }>;
  // MNT-specific fields
  resolution?: string;
  refreshRate?: string;
  productId?: string;
  level?: number;
  buType?: 'TV' | 'MNT';
}

interface EditReason {
  rowId: string;
  columnKey: string;
  oldValue: number;
  newValue: number;
  reason: string;
  timestamp: number;
}

interface RuleDetail {
  name: string;
  threshold: string;
  bu: string;
  productLine: string;
  status: boolean;
  triggerCount3m: number;
  triggerCount6m: number;
  lastModified: string;
}

interface TriggerRecord {
  customer: string;
  model: string;
  count3m: number;
  count6m: number;
}

interface RuleExplanationData {
  ruleList: RuleDetail[];
  summary: {
    topCustomers: { name: string; count: number }[];
    topProducts: { name: string; count: number }[];
  };
  historyTable: TriggerRecord[];
  aiAnalysis: {
    explanation: string;
    evaluation: {
      accuracy: string;
      details: string;
    };
    suggestion: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  type: 'text' | 'table' | 'table-readonly' | 'change-table' | 'rules-table' | 'validation-results' | 'sales-comparison-table' | 'rule-detail-table' | 'external-info' | 'rule-explanation' | 'dp-table' | 'dp-table-readonly' | 'mnt-table' | 'nb-table' | 'simulation-ask' | 'version-select' | 'simulation-loading' | 'simulation-result' | 'import-confirm' | 'import-result' | 'validation-ask' | 'data-item-select' | 'retrospective' | 'customer-fcst-raw' | 'forecast-view' | 'crm-page-list';
  data?: any;
  groupingType?: 'customer-size' | 'tech' | 'customer-tech';
  buType?: 'TV' | 'CID' | 'MNT' | 'NB' | '车载' | 'MC';
  filterCustomer?: string;
  filterDataItems?: string[];
  simVersions?: string[];
  simulationVersion?: string;
}

interface ValidationRule {
  id: string;
  name: string;
  passed: boolean;
  failCount?: number;
}

type AnomalyBU = 'TV' | 'CID' | 'MNT' | 'NB' | '车载' | 'MC';
type AnomalyScene = '客户FCST分析' | '销售FCST分析' | 'DP分析';

interface ThresholdInput {
  id: string;
  label: string;
  prefix: string;
  suffix: string;
  defaultValue: number;
}

interface ThresholdGroup {
  title: string;
  hint?: string;
  required?: boolean;
  preHint?: string;
  conditions?: { title: string; inputs: ThresholdInput[] }[];
  inputs?: ThresholdInput[];
}

interface RuleDrawerConfig {
  ruleKey: string;
  title: string;
  fixedRules?: string[];
  thresholds?: ThresholdGroup[];
}

interface AnomalyRuleDefinition {
  id: string;
  name: string;
  applicableBUs: AnomalyBU[];
  dimTV: string;
  dimIT: string;
  dimMC: string;
  timeGranularity: string;
  parameterSummary: string;
  scenes: AnomalyScene[];
  drawerConfig: RuleDrawerConfig;
}

interface AnomalyRuleRow {
  id: string;
  ruleId: string;
  bu: AnomalyBU;
  isEnabled: boolean;
  name: string;
  dimension: string;
  timeGranularity: string;
  parameterSummary: string;
  scenes: AnomalyScene[];
}

interface DrawerEditState {
  isOpen: boolean;
  ruleId: string | null;
  bu: AnomalyBU | null;
  dimension: string | null;
  timeGranularity: string | null;
}

interface ExternalInfo {
  id: string;
  impactType: '正面影响' | '负面影响' | '正面/负面影响';
  title: string;
  matchRate: number;
  impactSize: string;
  impactBU: string;
  impactCustomer: string;
  contentSummary: string;
  agentAnalysis: string;
}

const BU_ALL: AnomalyBU[] = ['TV', 'CID', 'MNT', 'NB', '车载', 'MC'];

const BU_TAG_STYLES: Record<AnomalyBU, { bg: string; text: string }> = {
  'TV': { bg: 'bg-blue-50', text: 'text-blue-600' },
  'CID': { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  'MNT': { bg: 'bg-green-50', text: 'text-green-600' },
  'NB': { bg: 'bg-teal-50', text: 'text-teal-600' },
  '车载': { bg: 'bg-red-50', text: 'text-red-600' },
  'MC': { bg: 'bg-orange-50', text: 'text-orange-600' },
};

const ANOMALY_RULE_DEFINITIONS: AnomalyRuleDefinition[] = [
  {
    id: 'fcst-change', name: '客户FCST变化识别', applicableBUs: BU_ALL,
    dimTV: '客户+尺寸', dimIT: '客户+技术别', dimMC: '客户+技术别+尺寸',
    timeGranularity: '周+月+季度', parameterSummary: '月5%，季10%',
    scenes: ['客户FCST分析'],
    drawerConfig: {
      ruleKey: 'fcst-change', title: '客户FCST变化识别',
      fixedRules: ['锁定期内变更均触发高风险预警，提示销售介入确认需求（此规则不可修改）'],
      thresholds: [{
        title: '锁定期外变化幅度阈值', required: true, hint: '超出阈值范围的变化将触发异常预警',
        inputs: [
          { id: 'fcst-monthly', label: '月度阈值', prefix: '±', suffix: '%', defaultValue: 5 },
          { id: 'fcst-quarterly', label: '季度阈值', prefix: '±', suffix: '%', defaultValue: 10 },
        ]
      }]
    }
  },
  {
    id: 'lifecycle', name: '产品生命周期验证', applicableBUs: BU_ALL,
    dimTV: 'Model', dimIT: 'Model', dimMC: 'Model',
    timeGranularity: '月', parameterSummary: '—',
    scenes: ['客户FCST分析', '销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'lifecycle', title: '产品生命周期状态验证',
      fixedRules: [
        'EOP后仍有客户FCST提报，自动触发高呆滞风险预警，提示销售核查是否错报（此规则不可修改）',
        '量产产品M+6内无任何需求，自动触发产品EOL风险预警（此规则不可修改）',
        'GA前有客户FCST提报，自动触发提前需求异常预警，提示销售核查是否提前导入（此规则不可修改）'
      ],
    }
  },
  {
    id: 'supply-demand', name: '需求供应对比', applicableBUs: BU_ALL,
    dimTV: '客户+尺寸', dimIT: '客户+技术别', dimMC: '客户+技术别',
    timeGranularity: '月', parameterSummary: '偏差±10%',
    scenes: ['客户FCST分析', '销售FCST分析'],
    drawerConfig: {
      ruleKey: 'supply-demand', title: '需求供应对比',
      thresholds: [{
        title: '供需偏差比例阈值', required: true, hint: '偏差比例 = (客户FCST - Supply/Allocation) / Supply/Allocation',
        inputs: [{ id: 'sd-deviation', label: '偏差阈值', prefix: '±', suffix: '%', defaultValue: 10 }]
      }]
    }
  },
  {
    id: 'target', name: '销售目标达成对比', applicableBUs: BU_ALL,
    dimTV: '应用别+面板厂', dimIT: '应用别+面板厂', dimMC: '应用别+面板厂',
    timeGranularity: '月+季度', parameterSummary: '达成率≤95%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'target', title: '销售目标达成对比',
      thresholds: [{
        title: '目标达成率预警阈值', required: true, hint: '月/季度目标达成率低于此值时触发预警',
        inputs: [{ id: 'target-lower', label: '达成率下限', prefix: '≤', suffix: '%', defaultValue: 95 }]
      }]
    }
  },
  {
    id: 'sales-fcst-change', name: '销售FCST变化识别', applicableBUs: BU_ALL,
    dimTV: '客户+尺寸', dimIT: '客户+技术别', dimMC: '客户+技术别',
    timeGranularity: '月+季度', parameterSummary: '变化幅度±10%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'sales-fcst-change', title: '销售FCST变化识别',
      fixedRules: ['锁定期（21-45天）内变更均触发预警提醒（此规则不可修改）'],
      thresholds: [{
        title: '锁定期外变化幅度阈值', required: true, hint: '本版销售FCST相比上版变化超过此值触发预警',
        inputs: [{ id: 'sales-change', label: '变化幅度', prefix: '±', suffix: '%', defaultValue: 10 }]
      }]
    }
  },
  {
    id: 'sales-vs-customer', name: '销售FCST vs 客户FCST', applicableBUs: BU_ALL,
    dimTV: '客户+尺寸', dimIT: '客户+技术别', dimMC: '客户+技术别',
    timeGranularity: '周+月+季度', parameterSummary: '偏差±10%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'sales-vs-customer', title: '销售FCST vs 客户FCST',
      thresholds: [{
        title: '偏差比例阈值', required: true, hint: '差异比例 = (销售FCST - 客户FCST) / 客户FCST',
        inputs: [
          { id: 'svc-deviation', label: '偏差阈值', prefix: '±', suffix: '%', defaultValue: 10 },
        ]
      }]
    }
  },
  {
    id: 'strategy', name: '策分偏差分析', applicableBUs: ['TV'],
    dimTV: '客户+面板厂+尺寸', dimIT: '客户+面板厂+尺寸', dimMC: '客户+面板厂+尺寸',
    timeGranularity: '季度', parameterSummary: '≤90%或≥110%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'strategy', title: '策分偏差分析',
      thresholds: [{
        title: '策分执行率阈值', required: true, hint: '策分执行率 = 季度销售预测总量 / 季度策分量',
        inputs: [
          { id: 'strat-lower', label: '达成不足（下限）', prefix: '≤', suffix: '%', defaultValue: 90 },
          { id: 'strat-upper', label: '超卖风险（上限）', prefix: '≥', suffix: '%', defaultValue: 110 },
        ]
      }]
    }
  },
  {
    id: 'history-trend', name: '历史同期趋势偏差', applicableBUs: BU_ALL,
    dimTV: '客户+尺寸+技术别', dimIT: '客户+面板厂+技术别', dimMC: '客户+面板厂+技术别',
    timeGranularity: '月', parameterSummary: 'Y-1&Y-2同比≥±30%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'history-trend', title: '历史同期趋势偏差',
      thresholds: [{
        title: '同比偏差触发条件', required: true,
        preHint: '需同时满足以下两个条件才触发预警（AND关系）',
        hint: '本年预测需同时大幅偏离过去两年实际出货才触发',
        conditions: [
          { title: '条件 1', inputs: [{ id: 'hist-y1', label: 'Y-1 同比变化', prefix: '≥ ±', suffix: '%', defaultValue: 30 }] },
          { title: '条件 2', inputs: [{ id: 'hist-y2', label: 'Y-2 同比变化', prefix: '≥ ±', suffix: '%', defaultValue: 30 }] },
        ]
      }]
    }
  },
  {
    id: 'key-product', name: '重点产品达成分析', applicableBUs: BU_ALL,
    dimTV: '客户+产品类别', dimIT: '客户+产品类别', dimMC: '客户+产品类别',
    timeGranularity: '年+半年+月', parameterSummary: '达成率≤90%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'key-product', title: '重点产品达成分析',
      thresholds: [{
        title: 'KPI产品达成率阈值', required: true, hint: '达成率 = (YTD销售达成 + 未来预测) / KPI产品年度目标',
        inputs: [{ id: 'kp-lower', label: '达成率下限', prefix: '≤', suffix: '%', defaultValue: 90 }]
      }]
    }
  },
  {
    id: 'dp-vs-dp', name: '本版DP VS 上版DP', applicableBUs: BU_ALL,
    dimTV: '客户+面板厂+尺寸', dimIT: '客户+面板厂+技术别+尺寸', dimMC: '客户+面板厂+技术别+尺寸',
    timeGranularity: '月+季度', parameterSummary: '变化率±10%',
    scenes: ['DP分析'],
    drawerConfig: {
      ruleKey: 'dp-vs-dp', title: '本版DP VS 上版DP',
      thresholds: [{
        title: 'DP版本变化率阈值', required: true, hint: '变化率 = (本版DP - 上版DP) / 上版DP',
        inputs: [{ id: 'dp-change', label: '变化率', prefix: '±', suffix: '%', defaultValue: 10 }]
      }]
    }
  },
  {
    id: 'dp-vs-supply', name: '本版DP VS Supply', applicableBUs: BU_ALL,
    dimTV: '客户+面板厂+尺寸', dimIT: '客户+面板厂+技术别', dimMC: '客户+面板厂+尺寸',
    timeGranularity: '月+季度', parameterSummary: '变化率±10%',
    scenes: ['DP分析'],
    drawerConfig: {
      ruleKey: 'dp-vs-supply', title: '本版DP VS Supply/Allocation',
      thresholds: [{
        title: '供应偏差率阈值', required: true, hint: '变化率 = (本版DP - 上版Supply/Allocation) / 上版Supply/Allocation',
        inputs: [{ id: 'dps-change', label: '变化率', prefix: '±', suffix: '%', defaultValue: 10 }]
      }]
    }
  },
  {
    id: 'dp-vs-bprp', name: '本版DP VS 供应BP/RP', applicableBUs: BU_ALL,
    dimTV: '面板厂（大板总量）', dimIT: '面板厂（大板总量）', dimMC: '面板厂（大板总量）',
    timeGranularity: '月', parameterSummary: '偏差率±5%',
    scenes: ['DP分析'],
    drawerConfig: {
      ruleKey: 'dp-vs-bprp', title: '本版DP VS 供应BP/RP',
      thresholds: [{
        title: '大板BP/RP偏差率阈值', required: true, hint: '大板BP/RP偏差率 = (大板需求总量 - 供应BP/RP) / 供应BP/RP',
        inputs: [{ id: 'bprp-dev', label: '偏差率', prefix: '±', suffix: '%', defaultValue: 5 }]
      }]
    }
  },
  {
    id: 'avg-size', name: '平均尺寸变化', applicableBUs: ['TV'],
    dimTV: '尺寸', dimIT: '尺寸', dimMC: '尺寸',
    timeGranularity: '月', parameterSummary: '小尺寸占比>30%',
    scenes: ['DP分析'],
    drawerConfig: {
      ruleKey: 'avg-size', title: '平均尺寸变化',
      fixedRules: [
        '小尺寸定义：43寸及以下（此分界线不可修改）',
        '触发条件1：M+1月预测平均尺寸比Y-1年同期变小（YoY偏差 < 0），且43寸以下占比同比扩大（此规则不可修改）',
        '触发条件3：M+1月平均尺寸连续小于历史两年同期：Y-1年平均尺寸YoY偏差 ≤ 0 且 Y-2年平均尺寸YoY偏差 ≤ 0（此规则不可修改）',
      ],
      thresholds: [{
        title: '小尺寸大板占比阈值', required: true,
        preHint: '触发条件2：小尺寸占比过高',
        hint: 'M+1月预测中43寸以下大板占比超过此值触发预警',
        inputs: [{ id: 'size-upper', label: '占比上限', prefix: '>', suffix: '%', defaultValue: 30 }]
      }]
    }
  },
  {
    id: 'shipment-form', name: '出货形态分析', applicableBUs: ['MNT', 'NB', '车载'],
    dimTV: '出货形态', dimIT: '出货形态', dimMC: '出货形态',
    timeGranularity: '年+半年+月', parameterSummary: '占比偏离目标值',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'shipment-form', title: '出货形态分析',
      thresholds: [{
        title: '各出货形态目标占比', required: true, hint: '实际占比偏离BP目标时触发预警',
        inputs: [
          { id: 'ship-oc', label: 'OC 目标占比', prefix: '>', suffix: '%', defaultValue: 40 },
          { id: 'ship-lcm', label: 'LCM 目标占比', prefix: '>', suffix: '%', defaultValue: 35 },
          { id: 'ship-tpm', label: 'TPM 目标占比', prefix: '>', suffix: '%', defaultValue: 25 },
        ]
      }]
    }
  },
  {
    id: 'market-share', name: '市场份额分析', applicableBUs: ['MNT', 'NB', 'MC', '车载'],
    dimTV: '客户+技术别', dimIT: '客户+技术别', dimMC: '客户+技术别',
    timeGranularity: '月', parameterSummary: '达成率≤80%',
    scenes: ['销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'market-share', title: '市场份额分析',
      thresholds: [{
        title: '月度达成率阈值', required: true, hint: '达成率 = 推算本版市场份额% / 市场份额目标%',
        inputs: [{ id: 'ms-lower', label: '达成率下限', prefix: '≤', suffix: '%', defaultValue: 80 }]
      }]
    }
  },
  {
    id: 'material-auth', name: '物料授权情况检查', applicableBUs: ['MC', '车载'],
    dimTV: '客户+Model', dimIT: '客户+Model', dimMC: '客户+Model',
    timeGranularity: '月', parameterSummary: '—',
    scenes: ['客户FCST分析', '销售FCST分析', 'DP分析'],
    drawerConfig: {
      ruleKey: 'material-auth', title: '物料授权情况检查',
      fixedRules: ['逐月累加客户FCST，当累加值超过剩余可用授权量时，从该月起触发预警并标红（此规则不可修改）'],
    }
  },
];

// --- Components ---

const SearchSelect = ({ 
  label, 
  options, 
  value, 
  onChange, 
  placeholder 
}: { 
  label: string; 
  options: string[]; 
  value: string; 
  onChange: (val: string) => void; 
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative mb-3" ref={dropdownRef}>
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs flex items-center justify-between cursor-pointer hover:border-blue-400 transition-colors"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] max-h-60 overflow-hidden flex flex-col"
          >
            <div className="p-2 border-b border-gray-100 flex items-center gap-2">
              <Search size={14} className="text-gray-400" />
              <input 
                autoFocus
                type="text" 
                className="flex-1 text-xs outline-none bg-transparent" 
                placeholder="搜索..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(opt => (
                  <div 
                    key={opt}
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`px-3 py-2 text-xs hover:bg-blue-50 cursor-pointer transition-colors ${value === opt ? 'bg-blue-50 text-blue-600 font-bold' : 'text-gray-700'}`}
                  >
                    {opt}
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-xs text-center text-gray-400 italic">未找到匹配项</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AddDataModal = ({
  isOpen,
  onClose,
  onAdd
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (newData: any) => void;
}) => {
  const [formData, setFormData] = useState({
    bu: 'TV',
    customerGroup: '',
    productId: '',
    domain: '',
    modelName: '',
    extVersion: '',
    productIdCode: '',
    sapFactory: '',
    vmiLocation: ''
  });

  const buOptions = ['TV', 'CID', 'MNT', 'NB', '车载', 'MC'];
  const customerGroups = ['TCL品牌集团_TV', '小米集团', '华为集团', 'OPPO集团', '三星电子'];
  const productIds = ['PROD-1001', 'PROD-2022', 'PROD-3045', 'PROD-4098', 'PROD-5120'];
  const modelNames = ['ST975AD04-1', 'ST975AD05-2', 'ST975AD02-8', 'STB451D01-1', 'ST3151B07-1', 'ST4251B05-2', 'ST5461D12-4'];
  const extVersions = ['1.0', '2.1', '2.2', '2.3', '2.4', '2.5'];
  const sapFactories = ['T1', 'T2', 'T3', 'T6', 'T9'];

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-800">产品与客户Mapping关系 - 新增</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block"><span className="text-red-500">*</span> BU</label>
              <select
                value={formData.bu}
                onChange={(e) => setFormData(prev => ({ ...prev, bu: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                {buOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block"><span className="text-red-500">*</span> 集团客户名称</label>
              <select
                value={formData.customerGroup}
                onChange={(e) => setFormData(prev => ({ ...prev, customerGroup: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {customerGroups.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">产品ID</label>
              <select
                value={formData.productId}
                onChange={(e) => setFormData(prev => ({ ...prev, productId: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {productIds.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">领域</label>
              <input
                type="text"
                placeholder="请输入"
                value={formData.domain}
                onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block"><span className="text-red-500">*</span> Model Name</label>
              <select
                value={formData.modelName}
                onChange={(e) => setFormData(prev => ({ ...prev, modelName: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {modelNames.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block"><span className="text-red-500">*</span> 对外版本号</label>
              <select
                value={formData.extVersion}
                onChange={(e) => setFormData(prev => ({ ...prev, extVersion: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {extVersions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Product ID</label>
              <select
                value={formData.productIdCode}
                onChange={(e) => setFormData(prev => ({ ...prev, productIdCode: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {productIds.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">SAP工厂</label>
              <select
                value={formData.sapFactory}
                onChange={(e) => setFormData(prev => ({ ...prev, sapFactory: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none"
              >
                <option value="">请选择</option>
                {sapFactories.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div className="w-1/2 pr-3">
            <label className="text-xs text-gray-500 mb-1.5 block">VMI库位</label>
            <input
              type="text"
              placeholder="请输入"
              value={formData.vmiLocation}
              onChange={(e) => setFormData(prev => ({ ...prev, vmiLocation: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            关闭
          </button>
          <button
            onClick={() => onAdd(formData)}
            disabled={!formData.customerGroup || !formData.modelName || !formData.extVersion}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            提交
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

// --- Mock Data ---

const MONTHS = [
  { name: 'M2601', weeks: ['WK2\n260101-03', 'WK3\n260104-10', 'WK4\n260111-17', 'WK5\n260118-24', 'WK6\n260125-31'] },
  { name: 'M2602', weeks: ['WK7\n260201-07', 'WK8\n260208-14', 'WK9\n260215-21', 'WK10\n260222-28'] },
  { name: 'M2603', weeks: ['WK11\n260301-07', 'WK12\n260308-14', 'WK13\n260315-21', 'WK14\n260322-28', 'WK15\n260329-31'] },
  { name: 'M2604', weeks: ['-'] },
  { name: 'M2605', weeks: ['-'] },
  { name: 'M2606', weeks: ['-'] },
];

const AGGREGATES = ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', '全年'];

const generateInitialData = (bu?: string): ForecastRow[] => {
  const customers = [
    { name: '小米', sizes: ['55寸', '65寸', '75寸'] },
    { name: '三星电子', sizes: ['55寸', '65寸', '75寸', '85寸'] },
    { name: 'LG电子', sizes: ['55寸', '65寸', '75寸'] },
    { name: '海信', sizes: ['55寸', '65寸', '75寸', '85寸'] },
    { name: '索尼', sizes: ['55寸', '65寸', '75寸'] },
    { name: 'TCL电子', sizes: ['55寸', '65寸', '75寸', '85寸'] },
  ];

  const rows: ForecastRow[] = [];
  const buItems = bu ? (BU_DATA_ITEMS_DP[bu] || BU_DATA_ITEMS_DP['TV']) : BU_DATA_ITEMS_DP['TV'];
  const items: string[] = buItems;
  const models = ['Model A V1.1', 'Model B V1.1', 'Model C V1.1'];
  const techs: Record<string, string> = {
    'Model A V1.1': 'LTPS',
    'Model B V1.1': 'VA',
    'Model C V1.1': 'HFS',
    'Model D V1.1': 'IPS', // In case more models added
    'Model E V1.1': 'LTPS'
  };
  const mockSpecs: Record<string, string> = {
    '55寸': '3840 × 2160, 120 Hz, DCI-P3 90%, 400nit',
    '35寸': '2560 × 1080, 144 Hz, sRGB 99%, 300nit',
    '43寸': '3840 × 2160, 60 Hz, sRGB 100%, 350nit',
    '65寸': '3840 × 2160, 144 Hz, DCI-P3 95%, 500nit',
    '75寸': '7680 × 4320, 120 Hz, DCI-P3 98%, 600nit',
    '85寸': '7680 × 4320, 144 Hz, DCI-P3 100%, 800nit',
    '50寸': '3840 × 2160, 60 Hz, NTSC 72%, 300nit',
    'Model A V1.1': '2560 × 1440, 165 Hz, DCI-P3 95%, 350nit',
    'Model B V1.1': '1920 × 1080, 240 Hz, sRGB 100%, 400nit',
    'Model C V1.1': '3840 × 2160, 144 Hz, DCI-P3 98%, 450nit',
    'Model D V1.1': '2560 × 1440, 144 Hz, sRGB 99%, 300nit',
    'Model E V1.1': '3840 × 2160, 120 Hz, DCI-P3 90%, 400nit'
  };
  const countries = ['美国', '墨西哥', '加拿大', '巴西', '德国', '日本', '中国'];

  customers.forEach((c) => {
    c.sizes.forEach((s) => {
      const sizeLocation = countries[Math.floor(Math.random() * countries.length)];
      // 1. Generate Aggregate Row for the Size
      items.forEach((item) => {
        const values: Record<string, number> = {};
        const prevValues: Record<string, number> = {};
        const isAnomaly: Record<string, boolean> = {};
        const reasons: Record<string, string> = {};
        const tags: Record<string, string> = {};
        const aiSummaries: Record<string, string> = {};
        const violatedRules: Record<string, string[]> = {};
        const isAIPrediction: Record<string, boolean> = {};

        MONTHS.forEach((m) => {
          m.weeks.forEach((w) => {
            const key = `${m.name}-${w}`;
            if (item === 'AI预测') { isAIPrediction[key] = true; }
            const baseValue = c.name === '三星电子' ? 400 : c.name === 'LG电子' ? 350 : c.name === '海信' ? 300 : c.name === 'TCL电子' ? 300 : 200;
            let val = baseValue;
            let prevVal = baseValue;

            const isWK2 = w === 'WK2\n260101-03';
            const isWK3 = w === 'WK3\n260104-10';
            const isWK4 = w === 'WK4\n260111-17';
            const isWK5 = w === 'WK5\n260118-24';

            if ((item as string) === 'ExtraSales') {
              val = isWK3 ? Math.floor(baseValue * 0.2) : 0;
            } else if (isWK3) {
              val = baseValue + Math.floor(baseValue * 0.25);
              if (item === '需求计划') val = Math.floor(baseValue * 0.8);
              if (item === 'ExtraUnmet') val = Math.floor(baseValue * 0.15);
            } else if (m.name === 'M2604' || m.name === 'M2605' || m.name === 'M2606') {
              val = baseValue * 4;
              prevVal = val;
            }

            // === 小米 55寸 WK3: 规则1(锁定期FCST变化) + 规则3(供需缺口) ===
            if (c.name === '小米' && item === '客户FCST' && s === '55寸' && isWK3) {
              val = 800; prevVal = 500;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发2 条规则\n① 客户FCST变化\n* 规则描述：锁定期（Week 2-4）内 FCST 与上一版本相比，任何变化均视为异常。\n* 本次情况：上一版本 500 件 → 本周版本 800 件，变动 +60%。\n* 结论：违反规则。客户在锁定期内大幅上调需求，可能与618备货相关。\n② 供需缺口规则\n* 规则描述：客户FCST超出供应能力的幅度不得超过10%。\n* 本次情况：本周客户 FCST 800 件，供应上限 600 件，超出 33%。\n* 结论：违反规则。当前产能无法满足客户申报量。";
              violatedRules[key] = [
                "规则1：锁定期内FCST+300（+60%），远超阈值。",
                "规则3：供应上限600，客户需求800，超出33%。"
              ];
            }

            // === 小米 65寸 WK4: 规则2(产品生命周期EOP) ===
            if (c.name === '小米' && item === '客户FCST' && s === '65寸' && isWK4) {
              val = 250; prevVal = 250;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 产品生命周期校验\n* 规则描述：处于EOP（停产）阶段的产品，不应有新增FCST。\n* 本次情况：小米 65寸 Model B V1.1 已于 2026-01-15 进入EOP状态，但本周仍申报 250 件。\n* 结论：违反规则。EOP产品不应有新增预测，需与客户确认是否为遗留订单。";
              violatedRules[key] = [
                "规则2：产品已EOP（2026-01-15），不应有FCST=250。"
              ];
            }

            // === 小米 75寸 WK3: 规则4(目标达成不足) + 规则6(历史趋势偏离) ===
            if (c.name === '小米' && item === '客户FCST' && s === '75寸' && isWK3) {
              val = 120; prevVal = 380;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发2 条规则\n① 销售目标达成\n* 规则描述：累积销售+未来预测/年度目标<90%为异常。\n* 本次情况：75寸年度目标达成率仅65%，缺口35%。\n* 结论：违反规则。年度目标达成严重滞后。\n② 历史趋势偏离\n* 规则描述：当前FCST与去年同期对比偏离超过30%视为异常。\n* 本次情况：去年同期 350 件，本周 120 件，偏离 -66%。\n* 结论：违反规则。远低于历史同期水平。";
              violatedRules[key] = [
                "规则4：年度目标达成率65%，低于90%预警线。",
                "规则6：历史同期350，当前120，偏离-66%。"
              ];
            }

            // === 小米 55寸 WK5: 规则5(销售FCST vs 客户FCST偏差) ===
            if (c.name === '小米' && item === '客户FCST' && s === '55寸' && isWK5) {
              val = 600; prevVal = 580;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST与客户FCST偏差\n* 规则描述：销售FCST与客户FCST偏差超过10%视为异常。\n* 本次情况：客户FCST 600件，销售FCST 350件，偏差-42%。\n* 结论：违反规则。销售预测大幅低于客户申报，可能存在沟通断层或销售对618备货持保守态度。";
              violatedRules[key] = [
                "规则5：销售FCST 350 vs 客户FCST 600，偏差-42%。"
              ];
            }

            // === 小米 65寸 WK5: 规则7(重点产品达成) ===
            if (c.name === '小米' && item === '客户FCST' && s === '65寸' && isWK5) {
              val = 450; prevVal = 300;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 重点产品达成分析\n* 规则描述：KPI重点产品累积达成+未来预测/年度目标<90%为异常。\n* 本次情况：小米65寸为华星重点战略产品，当前达成率仅78%，距年度目标缺口22%。\n* 结论：违反规则。需加大65寸面板出货力度以完成年度KPI。";
              violatedRules[key] = [
                "规则7：重点产品65寸达成率78%，低于90%目标。"
              ];
            }

            // ========== 销售FCST异常数据（小米）==========

            // 规则5: 销售FCST变化识别 — 55寸WK4 锁定期内销售FCST大幅上调+75%
            if (c.name === '小米' && item === '销售FCST (ETD)' && s === '55寸' && isWK4) {
              val = 350; prevVal = 200;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST变化识别\n* 规则描述：最新版本销售FCST与上一版本相比，月度变化超过20%视为异常。\n* 本次情况：上一版本 200 件 -> 本周版本 350 件，变动 +75%。\n* 结论：违反规则。销售在锁定期内大幅上调预测，需确认是否有客户紧急加单依据。";
              violatedRules[key] = ["规则5：销售FCST月度变化+75%，远超20%阈值。"];
            }

            // 规则6: 销售FCST vs 客户FCST — 65寸WK3 偏差-62%
            if (c.name === '小米' && item === '销售FCST (ETD)' && s === '65寸' && isWK3) {
              val = 100; prevVal = 100;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST vs 客户FCST\n* 规则描述：销售FCST与客户FCST偏差超过10%视为异常。\n* 本次情况：客户FCST 260件，销售FCST 100件，偏差 -62%。\n* 结论：违反规则。销售预测大幅低于客户申报，销售可能对客户需求持保守态度或未及时同步客户最新需求。";
              violatedRules[key] = ["规则6：销售FCST 100 vs 客户FCST 260，偏差-62%。"];
            }

            // 规则4: 销售目标达成对比 — 75寸WK4 达成率仅40%
            if (c.name === '小米' && item === '销售FCST (ETD)' && s === '75寸' && isWK4) {
              val = 60; prevVal = 60;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售目标达成对比\n* 规则描述：销售FCST累积量 vs BP/RP目标，差距超过20%视为异常。\n* 本次情况：75寸Q2 BP目标 1200件，当前销售FCST累积仅 480件，达成率40%。\n* 结论：违反规则。销售预测远低于经营目标，75寸存在严重欠量风险。";
              violatedRules[key] = ["规则4：销售FCST累积480 vs BP目标1200，达成率40%。"];
            }

            // 规则8: 历史同期趋势偏差 — 55寸WK5 远超去年同期+91%
            if (c.name === '小米' && item === '销售FCST (ETD)' && s === '55寸' && isWK5) {
              val = 420; prevVal = 400;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 历史同期趋势偏差\n* 规则描述：销售FCST与去年同期实际出货对比，偏离超过30%视为异常。\n* 本次情况：去年同期实际出货 220 件，本周销售FCST 420 件，偏离 +91%。\n* 结论：违反规则。销售预测远超历史同期水平，需确认是否有618备货等合理支撑。";
              violatedRules[key] = ["规则8：去年同期出货220，当前销售FCST 420，偏离+91%。"];
            }

            // 规则9: 重点产品达成分析 — 75寸WK5 KPI产品预测不足
            if (c.name === '小米' && item === '销售FCST (ETD)' && s === '75寸' && isWK5) {
              val = 80; prevVal = 80;
              isAnomaly[key] = true;
              aiSummaries[key] = "异常分析:\n触发1 条规则\n① 重点产品达成分析\n* 规则描述：KPI重点产品累积销售FCST+未来预测/年度目标<90%为异常。\n* 本次情况：小米75寸为华星重点产品，销售FCST累积达成率仅52%，距年度目标缺口48%。\n* 结论：违反规则。销售预测严重不足，需与销售团队沟通是否低估了市场需求。";
              violatedRules[key] = ["规则9：重点产品75寸销售FCST达成率52%，低于90%。"];
            }

            values[key] = val;
            prevValues[key] = prevVal;
          });
        });

        rows.push({
          id: `${c.name}-${s}-Total-${item}`,
          customer: c.name,
          version: 'P260329-04-002',
          tech: 'N/A',
          size: s,
          specs: mockSpecs[s] || '-',
          item,
          shippingLocation: sizeLocation,
          values,
          prevValues,
          isAnomaly,
          reasons,
          tags,
          aiSummaries,
          violatedRules,
          isAIPrediction,
        });
      });

      // 2. Generate Model-level Rows
      models.forEach(model => {
        const modelLocation = countries[Math.floor(Math.random() * countries.length)];
        items.forEach((item) => {
          const values: Record<string, number> = {};
          const prevValues: Record<string, number> = {};
          const isAnomaly: Record<string, boolean> = {};
          const reasons: Record<string, string> = {};
          const tags: Record<string, string> = {};
          const aiSummaries: Record<string, string> = {};
          const violatedRules: Record<string, string[]> = {};
          const isAIPrediction: Record<string, boolean> = {};
          
          MONTHS.forEach((m) => {
            m.weeks.forEach((w) => {
              const key = `${m.name}-${w}`;
              if (item === 'AI预测') { isAIPrediction[key] = true; }
              const modelBase = Math.floor((c.name === '三星电子' ? 400 : c.name === 'LG电子' ? 350 : c.name === '海信' ? 300 : c.name === 'TCL电子' ? 300 : 200) / 3);
              let val = modelBase;
              let prevVal = modelBase;

              const isWK3 = w === 'WK3\n260104-10';
              const isWK4 = w === 'WK4\n260111-17';
              const isWK5 = w === 'WK5\n260118-24';

              if ((item as string) === 'ExtraSales') {
                val = 0;
              } else if (m.name === 'M2604' || m.name === 'M2605' || m.name === 'M2606') {
                val = modelBase * 4;
                prevVal = val;
              }

              // Model行异常数据 - 小米 (与Total行对应)
              if (c.name === '小米' && item === '客户FCST') {
                // 55寸 WK3: 规则1+3
                if (s === '55寸' && isWK3) {
                  val = Math.floor(800 / 3); prevVal = Math.floor(500 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发2 条规则\n① 客户FCST变化\n* 规则描述：锁定期（Week 2-4）内 FCST 与上一版本相比，任何变化均视为异常。\n* 本次情况：上一版本 167 件 → 本周版本 267 件，变动 +60%。\n* 结论：违反规则。客户在锁定期内大幅上调需求。\n② 供需缺口规则\n* 规则描述：客户FCST超出供应能力的幅度不得超过10%。\n* 本次情况：本周客户 FCST 267 件，供应上限 200 件，超出 33%。\n* 结论：违反规则。当前产能无法满足客户申报量。";
                  violatedRules[key] = ["规则1：锁定期内FCST+60%。", "规则3：超供应33%。"];
                }
                // 65寸 WK4: 规则2(EOP)
                if (s === '65寸' && isWK4) {
                  val = Math.floor(250 / 3); prevVal = Math.floor(250 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 产品生命周期校验\n* 规则描述：处于EOP阶段的产品，不应有新增FCST。\n* 本次情况：该Model已于2026-01-15进入EOP状态，但仍有FCST。\n* 结论：违反规则。EOP产品不应有新增预测。";
                  violatedRules[key] = ["规则2：产品已EOP，不应有FCST。"];
                }
                // 75寸 WK3: 规则4+6
                if (s === '75寸' && isWK3) {
                  val = Math.floor(120 / 3); prevVal = Math.floor(380 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发2 条规则\n① 销售目标达成\n* 规则描述：累积销售+未来预测/年度目标<90%为异常。\n* 本次情况：达成率仅65%。\n* 结论：违反规则。\n② 历史趋势偏离\n* 规则描述：偏离超过30%视为异常。\n* 本次情况：偏离-66%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则4：达成率65%。", "规则6：历史偏离-66%。"];
                }
                // 55寸 WK5: 规则5
                if (s === '55寸' && isWK5) {
                  val = Math.floor(600 / 3); prevVal = Math.floor(580 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST与客户FCST偏差\n* 规则描述：偏差超过10%视为异常。\n* 本次情况：客户FCST 200件，销售FCST 117件，偏差-42%。\n* 结论：违反规则。销售预测大幅低于客户申报。";
                  violatedRules[key] = ["规则5：销售vs客户FCST偏差-42%。"];
                }
                // 65寸 WK5: 规则7
                if (s === '65寸' && isWK5) {
                  val = Math.floor(450 / 3); prevVal = Math.floor(300 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 重点产品达成分析\n* 规则描述：KPI重点产品达成率<90%为异常。\n* 本次情况：65寸达成率仅78%。\n* 结论：违反规则。需加大出货力度。";
                  violatedRules[key] = ["规则7：重点产品达成率78%。"];
                }
              }

              // Model行 销售FCST异常 - 小米
              if (c.name === '小米' && item === '销售FCST (ETD)') {
                if (s === '55寸' && isWK4) {
                  val = Math.floor(350 / 3); prevVal = Math.floor(200 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST变化识别\n* 规则描述：月度变化超过20%视为异常。\n* 本次情况：变动 +75%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则5：销售FCST变化+75%。"];
                }
                if (s === '65寸' && isWK3) {
                  val = Math.floor(100 / 3); prevVal = Math.floor(100 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售FCST vs 客户FCST\n* 规则描述：偏差超过10%视为异常。\n* 本次情况：偏差-62%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则6：偏差-62%。"];
                }
                if (s === '75寸' && isWK4) {
                  val = Math.floor(60 / 3); prevVal = Math.floor(60 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 销售目标达成对比\n* 规则描述：差距超过20%视为异常。\n* 本次情况：达成率40%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则4：达成率40%。"];
                }
                if (s === '55寸' && isWK5) {
                  val = Math.floor(420 / 3); prevVal = Math.floor(400 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 历史同期趋势偏差\n* 规则描述：偏离超过30%视为异常。\n* 本次情况：偏离+91%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则8：偏离+91%。"];
                }
                if (s === '75寸' && isWK5) {
                  val = Math.floor(80 / 3); prevVal = Math.floor(80 / 3);
                  isAnomaly[key] = true;
                  aiSummaries[key] = "异常分析:\n触发1 条规则\n① 重点产品达成分析\n* 规则描述：达成率<90%为异常。\n* 本次情况：达成率52%。\n* 结论：违反规则。";
                  violatedRules[key] = ["规则9：达成率52%。"];
                }
              }

              values[key] = val;
              prevValues[key] = prevVal;
            });
          });

          rows.push({
            id: `${c.name}-${s}-${model}-${item}`,
            customer: c.name,
            version: 'P260329-04-002',
            tech: techs[model] || 'LTPS',
            size: s,
            specs: mockSpecs[model] || '-',
            model,
            shippingLocation: modelLocation,
            item,
            values,
            prevValues,
            isAnomaly,
            reasons,
            tags,
            aiSummaries,
            violatedRules,
            isAIPrediction,
            specialRuleData: (()=>{
              const data: Record<string, { rule: string; situation: string; tag: string; feedback: string }> = {};
              MONTHS.forEach(m => {
                m.weeks.forEach(w => {
                  const key = `${m.name}-${w}`;
                  if (c.name === '小米' && s === '55寸' && model === 'Model A V1.1' && item === '销售FCST (ETD)' && w === 'WK4\n260111-17') {
                    data[key] = {
                      rule: '规则①：销售FCST vs 客户FCST',
                      situation: '销售fcst33 → 客户fcst66，变动 -50%。',
                      tag: '策略性调整 - 客户确认虚高',
                      feedback: '与客户采购经理电话确认，对方表示上周提交的66件为系统误操作，实际需求仅33件，剩余部分为重复录入，已要求客户下次注意。'
                    };
                  }
                });
              });
              return data;
            })()
          });
        });
      });
    });
  });

  return rows;
};

const MNT_CUSTOMERS = [
  { name: 'Dell', sizeResolutions: [{ size: '27寸', resolution: '2560×1440' }, { size: '32寸', resolution: '3840×2160' }] },
  { name: 'HP', sizeResolutions: [{ size: '24寸', resolution: '1920×1080' }, { size: '27寸', resolution: '2560×1440' }] },
  { name: '联想', sizeResolutions: [{ size: '24寸', resolution: '1920×1080' }, { size: '27寸', resolution: '2560×1440' }, { size: '34寸', resolution: '3440×1440' }] },
  { name: '华硕', sizeResolutions: [{ size: '27寸', resolution: '2560×1440' }, { size: '32寸', resolution: '3840×2160' }] },
  { name: 'AOC', sizeResolutions: [{ size: '24寸', resolution: '1920×1080' }, { size: '27寸', resolution: '2560×1440' }] },
];

const MNT_REFRESH_RATES_MAP: Record<string, string[]> = {
  '1920×1080': ['60Hz', '75Hz', '144Hz'],
  '2560×1440': ['75Hz', '144Hz', '165Hz'],
  '3840×2160': ['60Hz', '144Hz'],
  '3440×1440': ['100Hz', '144Hz', '165Hz'],
};

const MNT_PRODUCTS_MAP: Record<string, string[]> = {
  '60Hz': ['MNT-P01', 'MNT-P02'],
  '75Hz': ['MNT-P03', 'MNT-P04'],
  '100Hz': ['MNT-P05', 'MNT-P06'],
  '144Hz': ['MNT-P07', 'MNT-P08'],
  '165Hz': ['MNT-P09', 'MNT-P10'],
  '240Hz': ['MNT-P11', 'MNT-P12'],
};

const MNT_ITEMS: MNTDataItemType[] = [
  '客户FCST', 'AI预测', '销量预测(ETA)', '销量基线预测',
  '销售策略1-中低风险', '销售策略2-高风险',
  '库存目标', '在途库存', '销售FCST(ETD)'
];

const generateMNTData = (): ForecastRow[] => {
  const rows: ForecastRow[] = [];

  MNT_CUSTOMERS.forEach((c) => {
    c.sizeResolutions.forEach(({ size, resolution }) => {
      const refreshRates = MNT_REFRESH_RATES_MAP[resolution] || ['60Hz', '144Hz'];

      // Level 1: 尺寸-分辨率 aggregate rows
      MNT_ITEMS.forEach((item) => {
        const values: Record<string, number> = {};
        const prevValues: Record<string, number> = {};
        MONTHS.forEach((m) => {
          m.weeks.forEach((w) => {
            const key = `${m.name}-${w}`;
            const base = c.name === 'Dell' ? 200 : c.name === 'HP' ? 180 : 120;
            values[key] = base + Math.floor(Math.random() * 60);
            prevValues[key] = values[key] + Math.floor(Math.random() * 20) - 10;
          });
        });
        rows.push({
          id: `MNT-${c.name}-${size}-${resolution}-L1-${item}`,
          customer: c.name,
          size: `${size}-${resolution}`,
          resolution,
          item,
          values,
          prevValues,
          isAnomaly: {},
          reasons: {},
          tags: {},
          level: 1,
          buType: 'MNT',
        });
      });

      // Level 2: 刷新率 aggregate rows
      refreshRates.forEach((rate) => {
        MNT_ITEMS.forEach((item) => {
          const values: Record<string, number> = {};
          const prevValues: Record<string, number> = {};
          MONTHS.forEach((m) => {
            m.weeks.forEach((w) => {
              const key = `${m.name}-${w}`;
              const base = c.name === 'Dell' ? 100 : c.name === 'HP' ? 90 : 60;
              values[key] = base + Math.floor(Math.random() * 40);
              prevValues[key] = values[key] + Math.floor(Math.random() * 10) - 5;
            });
          });
          rows.push({
            id: `MNT-${c.name}-${size}-${resolution}-${rate}-L2-${item}`,
            customer: c.name,
            size: `${size}-${resolution}`,
            resolution,
            refreshRate: rate,
            item,
            values,
            prevValues,
            isAnomaly: {},
            reasons: {},
            tags: {},
            level: 2,
            buType: 'MNT',
          });
        });

        // Level 3: productID rows
        const products = MNT_PRODUCTS_MAP[rate] || ['MNT-P99'];
        products.forEach((pid) => {
          MNT_ITEMS.forEach((item) => {
            const values: Record<string, number> = {};
            const prevValues: Record<string, number> = {};
            MONTHS.forEach((m) => {
              m.weeks.forEach((w) => {
                const key = `${m.name}-${w}`;
                const base = c.name === 'Dell' ? 50 : c.name === 'HP' ? 45 : 30;
                values[key] = base + Math.floor(Math.random() * 20);
                prevValues[key] = values[key] + Math.floor(Math.random() * 6) - 3;
              });
            });
            rows.push({
              id: `MNT-${c.name}-${size}-${resolution}-${rate}-${pid}-L3-${item}`,
              customer: c.name,
              size: `${size}-${resolution}`,
              resolution,
              refreshRate: rate,
              productId: pid,
              item,
              values,
              prevValues,
              isAnomaly: {},
              reasons: {},
              tags: {},
              level: 3,
              buType: 'MNT',
            });
          });
        });
      });
    });
  });

  return rows;
};

const generateNBData = (): ForecastRow[] => {
  const customers = [
    { name: 'Dell', techs: ['VA', 'HFS'] },
    { name: 'HP', techs: ['VA', 'HFS'] },
    { name: '联想', techs: ['VA', 'HFS'] },
    { name: '华硕', techs: ['VA'] },
  ];
  const models: Record<string, string[]> = {
    'VA': ['VA-Model A', 'VA-Model B'],
    'HFS': ['HFS-Model A', 'HFS-Model B'],
  };
  const items: DataItemType[] = ['客户FCST', 'AI预测', '销售FCST (ETD)', 'ExtraSales', '需求计划', 'ExtraUnmet'];
  const rows: ForecastRow[] = [];

  customers.forEach(c => {
    c.techs.forEach(tech => {
      items.forEach(item => {
        const values: Record<string, number> = {};
        const prevValues: Record<string, number> = {};
        const isAnomaly: Record<string, boolean> = {};
        const baseValue = c.name === 'Dell' ? 300 : c.name === 'HP' ? 250 : c.name === '联想' ? 200 : 150;
        MONTHS.forEach(m => {
          m.weeks.forEach(w => {
            const key = `${m.name}-${w}`;
            const val = (item as string) === 'ExtraSales' ? 0 : (m.name === 'M2604' || m.name === 'M2605' || m.name === 'M2606') ? baseValue * 4 : baseValue + Math.floor(Math.random() * 50);
            values[key] = val;
            prevValues[key] = val;
          });
        });
        rows.push({
          id: `NB-${c.name}-${tech}-Total-${item}`,
          customer: c.name,
          version: 'P260329-04-002',
          tech,
          size: tech,
          specs: tech === 'VA' ? 'VA Panel, 60Hz, sRGB 99%' : 'HFS Panel, 144Hz, DCI-P3 95%',
          item,
          values, prevValues, isAnomaly, reasons: {}, tags: {},
        });
      });
      models[tech]?.forEach(model => {
        items.forEach(item => {
          const values: Record<string, number> = {};
          const prevValues: Record<string, number> = {};
          const isAnomaly: Record<string, boolean> = {};
          const baseValue = Math.floor((c.name === 'Dell' ? 300 : c.name === 'HP' ? 250 : c.name === '联想' ? 200 : 150) / 2);
          MONTHS.forEach(m => {
            m.weeks.forEach(w => {
              const key = `${m.name}-${w}`;
              const val = (item as string) === 'ExtraSales' ? 0 : (m.name === 'M2604' || m.name === 'M2605' || m.name === 'M2606') ? baseValue * 4 : baseValue + Math.floor(Math.random() * 30);
              values[key] = val;
              prevValues[key] = val;
            });
          });
          rows.push({
            id: `NB-${c.name}-${tech}-${model}-${item}`,
            customer: c.name,
            version: 'P260329-04-002',
            tech,
            size: tech,
            model,
            specs: tech === 'VA' ? 'VA Panel, 60Hz' : 'HFS Panel, 144Hz',
            item,
            values, prevValues, isAnomaly, reasons: {}, tags: {},
          });
        });
      });
    });
  });
  return rows;
};

// --- Components ---

// AIPredictionTooltip imported from ./components/tooltips/AIPredictionTooltip

const StrategyAdjustmentTooltip = ({ rule, situation, tag, feedback }: { rule: string, situation: string, tag: string, feedback: string }) => (
  <div className="flex flex-col gap-5 w-[420px] p-2">
    <div className="text-[16px] font-black text-gray-900 border-b border-gray-100 pb-2.5 flex items-center gap-2">
      <div className="w-1.5 h-5 bg-gray-900 rounded-sm" />
      规则分析
    </div>
    
    <div className="flex flex-col gap-5">
      {/* Rule Section */}
      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] font-bold text-gray-800">{rule}</div>
        <div className="text-[11px] text-gray-600 leading-relaxed bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
          <div><span className="font-semibold text-gray-700">描述：</span>销售FCST与客户FCST相比偏差超过10%。</div>
          <div className="mt-1"><span className="font-semibold text-gray-700">情况：</span>{situation}</div>
        </div>
      </div>

      {/* Structured Tag Section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 bg-[#ed6c00] rounded-sm" />
          <div className="text-[13px] font-bold text-gray-800">结构化标签</div>
        </div>
        <div className="bg-[#fff7ed] border border-[#ffedd5] rounded-lg p-3.5 text-[12px] text-[#9a3412] font-bold">
          {tag}
        </div>
      </div>

      {/* Sales Feedback Section */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 bg-[#0052d9] rounded-sm" />
          <div className="text-[13px] font-bold text-gray-800">销售反馈</div>
        </div>
        <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-lg p-3.5 text-[12px] text-[#1e40af] leading-relaxed">
          {feedback}
        </div>
      </div>
    </div>
  </div>
);

const llmReasoningCache = new Map<string, string>();

const EditableCell = ({ 
  value, 
  isEditable, 
  isAnomaly, 
  reason,
  tag,
  aiSummary,
  violatedRules,
  isAIPrediction,
  aiPredictionSimple,
  onSave,
  startRowId,
  startColumnKey,
  specialRuleData,
  oldValue,
  allowModificationMarker
}: { 
  value: number; 
  isEditable: boolean; 
  isAnomaly?: boolean;
  reason?: string;
  tag?: string;
  aiSummary?: string;
  violatedRules?: string[];
  isAIPrediction?: boolean;
  aiPredictionSimple?: boolean;
  onSave: (val: number, reason?: string, tag?: string) => void;
  startRowId?: string;
  startColumnKey?: string;
  specialRuleData?: { rule: string; situation: string; tag: string; feedback: string };
  oldValue?: number;
  allowModificationMarker?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());
  const [llmReasoning, setLlmReasoning] = useState<string>('');
  const [isLoadingLlm, setIsLoadingLlm] = useState(false);
  const [isAiPopupLoading, setIsAiPopupLoading] = useState(false);

  // AI预测值解读弹窗：打开时先显示 3 秒 loading，再展示解读内容
  useEffect(() => {
    if (showPopup && isAIPrediction) {
      setIsAiPopupLoading(true);
      const timer = setTimeout(() => setIsAiPopupLoading(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showPopup, isAIPrediction]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditable) {
      setIsEditing(true);
      setTempValue(value.toString());
      setShowPopup(false);
    }
  };

  const hasAnomalyPopup = !!(aiSummary && aiSummary.startsWith('异常分析:\n'));

  const handleClick = (e: React.MouseEvent) => {
    if (specialRuleData || isAIPrediction || (isAnomaly && hasAnomalyPopup)) {
      e.stopPropagation();
      setShowPopup(!showPopup);
    } else if (isEditable) {
      handleDoubleClick(e);
    }
  };

  const handleSave = () => {
    if (tempValue === value.toString()) {
      setIsEditing(false);
      return;
    }
    onSave(Number(tempValue));
    setIsEditing(false);
  };

  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = () => setShowPopup(false);
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPopup]);

  useEffect(() => {
    if (showPopup && hasAnomalyPopup && !llmReasoning && !isLoadingLlm) {
      const cacheKey = `${startRowId}-${startColumnKey}`;
      const cached = llmReasoningCache.get(cacheKey);
      if (cached) {
        setLlmReasoning(cached);
        return;
      }
      setIsLoadingLlm(true);
      const externalInfos = [
        { title: '小米电视宣布618大促提前启动，备货量同比增长25%', content: '小米电视宣布今年618年中大促将提前至5月15日启动，涵盖55寸、65寸、75寸全系电视品类，预计面板备货量同比增长25%以上。', source: '企业公告' },
        { title: 'TrendForce：2026年Q2全球电视面板价格预计上涨8-12%', content: '受欧洲杯及奥运会备货需求拉动，叠加上游玻璃基板及偏光片涨价传导，Q2全球电视面板均价预计环比上涨8-12%。', source: 'TrendForce研报' },
      ];
      generateAnomalyReasoning(
        startRowId?.split('-')[0] || '客户',
        startRowId?.split('-')[1] || '',
        startColumnKey || '',
        startRowId || '',
        value,
        oldValue || value,
        violatedRules || [],
        aiSummary || '',
        externalInfos
      ).then(text => {
        setLlmReasoning(text);
        setIsLoadingLlm(false);
        llmReasoningCache.set(cacheKey, text);
      }).catch(() => {
        setIsLoadingLlm(false);
      });
    }
  }, [showPopup, hasAnomalyPopup]);

  if (isEditing) {
    return (
      <div className="relative z-50">
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="number"
            className="w-16 px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onBlur={handleSave}
          />
          <button onClick={handleSave} className="text-green-600 hover:text-green-700">
            <Check size={14} />
          </button>
        </div>
      </div>
    );
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (!isEditable) return;
    const text = e.clipboardData.getData('text');
    const rows = text.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // If it's a single value, allow the standard flow or just save it
    if (rows.length === 1 && !rows[0].includes('\t')) {
      const val = Number(rows[0]);
      if (!isNaN(val)) {
        onSave(val, '批量粘贴导入', '系统同步');
      }
      return;
    }

    // Emit event for parent to handle multi-cell paste
    const event = new CustomEvent('batch-paste', { 
      detail: { text, startRowId, startColumnKey } 
    });
    window.dispatchEvent(event);
  };

  const isModified = allowModificationMarker && oldValue !== undefined && value !== oldValue;

  return (
    <div 
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onPaste={handlePaste}
      className={`
        relative group w-full h-full flex items-center justify-center px-2 py-1 cursor-pointer transition-colors
        ${isEditable ? 'hover:bg-blue-50 text-blue-600' : 'bg-gray-100 text-black'}
        ${isAnomaly && !reason && !specialRuleData && !isModified ? 'bg-red-100 text-red-600 font-bold' : ''}
      `}
    >
      {value.toLocaleString()}

      {/* Special Popup */}
      {showPopup && specialRuleData && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-5 bg-white rounded-2xl shadow-[0_10px_60px_-10px_rgba(0,0,0,0.5)] z-[10000] text-left border border-gray-200 cursor-default animate-in fade-in zoom-in duration-200 min-w-max">
           <StrategyAdjustmentTooltip {...specialRuleData} />
           <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-b-[10px] border-b-white border-x-[10px] border-x-transparent" />
        </div>
      )}
      
      {/* Modification Marker (Corner Triangle Orange in Top Right) */}
      {isModified && (
        <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-t-orange-500 border-l-[8px] border-l-transparent" />
      )}

      {/* AI预测值解读弹窗 (click-triggered, 全屏模态) */}
      {showPopup && isAIPrediction && createPortal(
        <div
          onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-[0_20px_80px_-10px_rgba(0,0,0,0.5)] border border-gray-200 w-[560px] max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <span className="text-[16px] font-black text-gray-900">AI预测值解读</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {isAiPopupLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 size={28} className="animate-spin text-blue-500" />
                  <span className="text-sm text-gray-500">数据加载中，请稍候…</span>
                </div>
              ) : (
                <AIPredictionTooltip simple={aiPredictionSimple} />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 异常归因弹窗 (click-triggered, with DeepSeek reasoning) */}
      {showPopup && hasAnomalyPopup && !specialRuleData && !isAIPrediction && createPortal(
        <div
          onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-[0_20px_80px_-10px_rgba(0,0,0,0.5)] border border-gray-200 w-[620px] max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <span className="text-[16px] font-black text-gray-900">AI异常归因</span>
              <button
                onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5">
              {/* 异常推理 (DeepSeek) */}
              <div>
                <div className="text-[14px] font-bold text-gray-800 mb-2">异常推理</div>
                {isLoadingLlm ? (
                  <div className="flex items-center gap-2 text-[13px] text-gray-500 bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <Loader2 size={14} className="animate-spin" />
                    AI正在分析异常原因...
                  </div>
                ) : (
                  <ul className="text-[13px] text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-2.5 list-none">
                    {llmReasoning.split('\n').filter(l => l.trim()).map((line, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-blue-500 shrink-0 mt-0.5 text-[14px]">•</span>
                        <span>{line.replace(/^[•·\-]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 规则分析 + 外部情报 */}
              <CellTooltipContent
                reason={reason}
                tag={tag}
                aiSummary={aiSummary}
                violatedRules={violatedRules}
                oldValue={oldValue}
                newValue={value}
                isModified={isModified}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 普通修改 Tooltip (hover, 非异常非AI预测) */}
      {!isAIPrediction && !showPopup && !hasAnomalyPopup && isModified && (
        <div className="absolute hidden group-hover:block top-full right-0 mt-2 p-5 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] z-[9999] text-left border border-gray-200 cursor-default min-w-[300px]">
          <CellTooltipContent
            reason={reason}
            tag={tag}
            oldValue={oldValue}
            newValue={value}
            isModified={isModified}
          />
        </div>
      )}
    </div>
  );
};

const ForecastChangeTable = ({ 
  data, 
  groupingType = 'customer-size' 
}: { 
  data: ForecastRow[], 
  groupingType?: 'customer-size' | 'tech' | 'customer-tech'
}) => {
  const [tableFilteredData, setTableFilteredData] = useState(data);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleRowsCount, setVisibleRowsCount] = useState(3);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());

  useEffect(() => {
    const defaultCols = [
      groupingType === 'tech' ? 'techModel' : (groupingType === 'customer-tech' ? 'customer' : 'customer'),
      groupingType === 'tech' ? null : (groupingType === 'customer-tech' ? 'tech' : 'sizeModel'),
      'dataItem',
      ...MONTHS.map(m => m.name),
      ...AGGREGATES
    ].filter(Boolean) as string[];
    setVisibleColumns(new Set(defaultCols));
  }, [groupingType]);

  const allColumns = [
    groupingType === 'tech' ? { id: 'techModel', label: '技术别 / Model' } : { id: 'customer', label: '集团客户名称' },
    ...(groupingType === 'tech' ? [] : [
      groupingType === 'customer-tech' ? { id: 'tech', label: '技术别' } : { id: 'sizeModel', label: '尺寸 / Model' }
    ]),
    { id: 'dataItem', label: '数据项' },
    ...MONTHS.map(m => ({ id: m.name, label: m.name })),
    ...AGGREGATES.map(a => ({ id: a, label: a }))
  ];

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumns);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleColumns(next);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsColumnSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleGroup = (primary: string, secondary: string) => {
    const key = `${primary}-${secondary}`;
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  // Filter only '客户FCST' (or items that make sense for change)
  const filteredData = tableFilteredData.filter(row => row.item === '客户FCST');

  // Group data by Customer and Size OR Tech
  const groupedData: Record<string, Record<string, { total: ForecastRow[], models: Record<string, ForecastRow[]> }>> = {};
  
  if (groupingType === 'customer-size') {
    filteredData.forEach(row => {
      if (!groupedData[row.customer]) groupedData[row.customer] = {};
      if (!groupedData[row.customer][row.size]) {
        groupedData[row.customer][row.size] = { total: [], models: {} };
      }
      if (!row.model) {
        groupedData[row.customer][row.size].total.push(row);
      } else {
        if (!groupedData[row.customer][row.size].models[row.model]) {
          groupedData[row.customer][row.size].models[row.model] = [];
        }
        groupedData[row.customer][row.size].models[row.model].push(row);
      }
    });
  } else if (groupingType === 'customer-tech') {
    // Customer + Tech grouping (No expansion)
    filteredData.forEach(row => {
      const t = row.tech || 'N/A';
      if (!groupedData[row.customer]) groupedData[row.customer] = {};
      if (!groupedData[row.customer][t]) {
        groupedData[row.customer][t] = { total: [], models: {} };
      }
      
      if (groupedData[row.customer][t].total.length === 0) {
        groupedData[row.customer][t].total.push({
           ...row,
           id: `agg-${row.customer}-${t}`,
           size: '聚合',
           model: undefined,
           values: { ...row.values },
           prevValues: row.prevValues ? { ...row.prevValues } : undefined,
           isAnomaly: row.isAnomaly ? { ...row.isAnomaly } : undefined
        });
      } else {
        const aggRow = groupedData[row.customer][t].total[0];
        Object.keys(row.values).forEach(k => {
          aggRow.values[k] = (aggRow.values[k] || 0) + (row.values[k] || 0);
        });
        if (row.prevValues && aggRow.prevValues) {
          Object.keys(row.prevValues).forEach(k => {
            aggRow.prevValues![k] = (aggRow.prevValues![k] || 0) + (row.prevValues![k] || 0);
          });
        }
      }
    });
  } else {
    // Tech grouping
    const techAgg: Record<string, Record<string, ForecastRow>> = {}; 

    filteredData.forEach(row => {
      if (!row.tech || row.tech === 'N/A' || !row.model) return;
      const t = row.tech;
      const m = row.model;

      if (!techAgg[t]) techAgg[t] = {};
      
      if (!techAgg[t][m]) {
        techAgg[t][m] = {
           ...row,
           id: `change-agg-${t}-${m}`,
           customer: '聚合',
           size: '汇总',
           values: { ...row.values },
           prevValues: row.prevValues ? { ...row.prevValues } : undefined,
           isAnomaly: row.isAnomaly ? { ...row.isAnomaly } : undefined
        };
      } else {
        const tr = techAgg[t][m];
        Object.keys(row.values).forEach(k => {
          tr.values[k] = (tr.values[k] || 0) + (row.values[k] || 0);
        });
        if (row.prevValues && tr.prevValues) {
          Object.keys(row.prevValues).forEach(k => {
            tr.prevValues![k] = (tr.prevValues![k] || 0) + (row.prevValues![k] || 0);
          });
        }
      }
    });

    const techKeys = ['LTPS', 'VA', 'HFS', 'IPS'];

    techKeys.forEach(tech => {
      const modelsForTech = techAgg[tech] || {};
      const modelNames = Object.keys(modelsForTech);
      
      const p = tech;
      const s = '汇总';
      
      if (!groupedData[p]) groupedData[p] = {};
      groupedData[p][s] = { total: [], models: {} };
      
      const synthRow: ForecastRow = {
         id: `change-synth-${tech}-客户FCST`,
         customer: '聚合',
         tech: tech,
         size: '汇总',
         item: '客户FCST',
         values: {},
         prevValues: {},
         isAnomaly: {},
         reasons: {},
         tags: {}
      };
      
      modelNames.forEach(m => {
        const mRow = modelsForTech[m];
        if (!groupedData[p][s].models[m]) groupedData[p][s].models[m] = [];
        groupedData[p][s].models[m].push(mRow);
        
        Object.keys(mRow.values).forEach(k => {
           synthRow.values[k] = (synthRow.values[k] || 0) + mRow.values[k];
        });
        if (mRow.prevValues) {
          Object.keys(mRow.prevValues).forEach(k => {
            synthRow.prevValues![k] = (synthRow.prevValues![k] || 0) + mRow.prevValues![k];
          });
        }
      });
      
      groupedData[p][s].total.push(synthRow);
    });
  }

  const primaryGroupNames = Object.keys(groupedData);
  const secondaryGroups: { primary: string, secondary: string }[] = [];
  primaryGroupNames.forEach(p => {
    Object.keys(groupedData[p]).forEach(s => {
      secondaryGroups.push({ primary: p, secondary: s });
    });
  });

  const handleLoadMore = () => {
    setVisibleRowsCount(prev => Math.min(prev + 3, secondaryGroups.length));
  };

  const ChangeCell = ({ 
    value, 
    prevValue, 
    aiSummary, 
    violatedRules,
    isAnomaly
  }: { 
    value: number, 
    prevValue: number, 
    aiSummary?: string, 
    violatedRules?: string[],
    isAnomaly?: boolean
  }) => {
    const diff = value - prevValue;
    const hasChange = diff !== 0;
    const diffText = diff > 0 ? `+${diff}` : `${diff}`;
    const diffColor = diff > 0 ? 'text-green-600' : 'text-red-600';

    // Background color logic:
    // 1. If anomaly: light red/orange (bg-red-100 or bg-orange-100)
    // 2. Otherwise: default background
    const bgColor = isAnomaly ? 'bg-red-100' : 'hover:bg-gray-50';

    return (
      <div className={`relative group w-full h-full flex flex-col items-center justify-center py-1 cursor-pointer transition-colors ${bgColor}`}>
        <span className="text-black font-medium">{value}</span>
        {hasChange && (
          <span className={`text-[10px] font-bold ${diffColor}`}>{diffText}</span>
        )}

        {/* AI Tooltip for ChangeCell */}
        {(aiSummary || (violatedRules && violatedRules.length > 0)) && (
          <div className="absolute hidden group-hover:block top-full right-0 mt-2 p-5 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.3)] z-[9999] text-left border border-gray-200 cursor-default">
            <CellTooltipContent 
              aiSummary={aiSummary}
              violatedRules={violatedRules}
            />
            {/* Tooltip Arrow */}
            <div className="absolute bottom-full right-4 w-0 h-0 border-b-[8px] border-b-white border-x-[8px] border-x-transparent" />
            <div className="absolute bottom-full right-4 w-0 h-0 border-b-[9px] border-b-gray-200 border-x-[9px] border-x-transparent -z-10 -ml-[1px]" />
          </div>
        )}
      </div>
    );
  };

  const [isWeekVisible, setIsWeekVisible] = useState(true);

  const getMonthTotal = (row: ForecastRow, monthName: string) => {
    const month = MONTHS.find(m => m.name === monthName);
    if (!month) return { val: 0, prevVal: 0 };
    
    let totalVal = 0;
    let totalPrevVal = 0;
    
    month.weeks.forEach(w => {
      const key = `${monthName}-${w}`;
      totalVal += row.values[key] || 0;
      totalPrevVal += row.prevValues?.[key] ?? row.values[key] ?? 0;
    });
    
    return { val: totalVal, prevVal: totalPrevVal };
  };

  return (
    <div className="flex flex-col w-full max-w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="bg-blue-50/50 p-3 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2">
            <AlertCircle size={16} /> 本周客户FCST及其变化
          </h3>
          <p className="text-xs text-gray-600 mt-1">
            ● 触发原因：基于"客户FCST变换识别"规则，锁定期为3周，锁定期内任何变更即异常，锁定期外周度变化阈值15%、月度阈值5%、季度阈值10%。超出上述条件即判定为异常。<br/>
            {groupingType === 'tech' ? (
              <>
                ● 变化幅度：LTPS的预测总量增加30kpcs，VA减少20kpcs，变化集中在ModelAV1.1（+20）、Model BV1.1（-30）。<br/>
                ● 异常总结：共发现 3 条异常预测，集中在HFS的ModelAV1.1（6月存在20%的大幅波动）和IPS的ModelBV1.1（第4月预测较同期偏低82%），建议重点关注。
              </>
            ) : (
              <>
                ● 变化幅度：55寸增加30kpcs，25寸减少20kpcs，变化集中在华为（+20）、小米（-30）。<br/>
                ● 异常总结：共发现 3 条异常预测，集中在 ModelA 的 客户A（6月存在20%的大幅波动）和 客户C（第4月客户下单较同期偏低82%），建议重点关注。
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="导出数据"
          >
            <Download size={16} />
          </button>

          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)}
              className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
              title="表格设置"
            >
              <Settings size={16} />
            </button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2"
                >
                  <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                  <div className="max-h-60 overflow-y-auto">
                    {allColumns.map(col => (
                      <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                        <input 
                          type="checkbox" 
                          checked={visibleColumns.has(col.id)} 
                          onChange={() => toggleColumn(col.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                        />
                        <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                      </label>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setIsWeekVisible(!isWeekVisible)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors shadow-sm"
          >
            {isWeekVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            {isWeekVisible ? '缩起周维度' : '展开周维度'}
          </button>
        </div>
      </div>
      <ForecastFilterBar data={data} onFilterChange={setTableFilteredData} />
      <div className="overflow-x-auto" ref={scrollContainerRef}>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {groupingType === 'tech' ? (
                visibleColumns.has('techModel') && <th rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-2 min-w-[150px] bg-gray-50">技术别 / Model</th>
              ) : (
                <>
                  {visibleColumns.has('customer') && <th rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-2 min-w-[80px] bg-gray-50">集团客户名称</th>}
                  {groupingType === 'customer-tech' ? (
                    visibleColumns.has('tech') && <th rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-2 min-w-[100px] bg-gray-50">技术别</th>
                  ) : (
                    visibleColumns.has('sizeModel') && <th rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-2 min-w-[100px] bg-gray-50">尺寸 / Model</th>
                  )}
                </>
              )}
              {visibleColumns.has('dataItem') && <th rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-2 min-w-[120px] bg-gray-50">数据项</th>}
              
              {isWeekVisible && MONTHS.map(m => {
                const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                if (!hasWeeks || !visibleColumns.has(m.name)) return null;
                return (
                  <th key={m.name} colSpan={m.weeks.length} className="border border-gray-200 p-1 bg-blue-50 text-blue-700 font-bold">
                    {m.name}
                  </th>
                );
              })}

              {MONTHS.map(m => {
                const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                if (!hasWeeks || !visibleColumns.has(m.name)) return null;
                return (
                  <th key={`${m.name}-total-head`} rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-1 bg-blue-50/50 text-blue-800 font-bold min-w-[80px]">
                    {m.name} 汇总
                  </th>
                );
              })}

              {MONTHS.map(m => {
                const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                if (hasWeeks || !visibleColumns.has(m.name)) return null;
                return (
                  <th key={m.name} rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-1 bg-blue-50 text-blue-700 font-bold min-w-[80px]">
                    {m.name}
                  </th>
                );
              })}

              {AGGREGATES.map(a => (
                visibleColumns.has(a) && (
                  <th key={a} rowSpan={isWeekVisible ? 2 : 1} className="border border-gray-200 p-1 bg-blue-50 text-blue-700 font-bold min-w-[80px]">
                    {a}
                  </th>
                )
              ))}
            </tr>
            {isWeekVisible && (
              <tr>
                {MONTHS.flatMap(m => {
                  const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                  if (!hasWeeks || !visibleColumns.has(m.name)) return [];
                  
                  return m.weeks.map(w => (
                    <th key={`${m.name}-${w}`} className="border border-gray-200 p-1 min-w-[80px] font-medium text-gray-600 whitespace-pre-line leading-tight">
                      {w}
                    </th>
                  ));
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {secondaryGroups.slice(0, visibleRowsCount).map((group) => {
              const { primary: p, secondary: s } = group;
              const { total, models } = groupedData[p][s];
              const isExpanded = expandedGroups.has(`${p}-${s}`);
              const modelNames = Object.keys(models);
              
              const rows = [];
              
              total.forEach((row, idx) => {
                const isFirstInRowGroup = idx === 0;
                // In tech mode, we don't rowspan across expanded models, we just show tech on total row
                const techRowSpan = groupingType === 'tech' ? 1 : (groupingType === 'customer-tech' ? 1 : (1 + (isExpanded ? modelNames.length : 0)));
                
                rows.push(
                  <tr key={row.id} className={`${isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50'} transition-colors`}>
                    {groupingType === 'tech' ? (
                      visibleColumns.has('techModel') && (
                        <td className="border border-gray-200 p-2 font-bold text-gray-800 bg-white">
                          <div className="flex items-center justify-between gap-2">
                            <span>{p}</span>
                            <button 
                              onClick={() => toggleGroup(p, s)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-blue-600"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </div>
                        </td>
                      )
                    ) : (
                      <>
                        {isFirstInRowGroup && visibleColumns.has('customer') && (
                          <td rowSpan={techRowSpan} className="border border-gray-200 p-2 font-bold text-center bg-white align-top">
                            {p}
                          </td>
                        )}
                        {isFirstInRowGroup && (
                          groupingType === 'customer-tech' ? (
                            visibleColumns.has('tech') && (
                              <td className="border border-gray-200 p-2 bg-white font-bold text-gray-700">
                                {s}
                              </td>
                            )
                          ) : (
                            visibleColumns.has('sizeModel') && (
                              <td className="border border-gray-200 p-2 bg-white">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-gray-700">{s}</span>
                                  <button 
                                    onClick={() => toggleGroup(p, s)}
                                    className="p-1 hover:bg-gray-100 rounded transition-colors text-blue-600"
                                  >
                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                </div>
                              </td>
                            )
                          )
                        )}
                      </>
                    )}
                    {visibleColumns.has('dataItem') && (
                      <td className="border border-gray-200 p-2 font-medium text-black whitespace-pre-line">
                        {row.item === '客户FCST' ? '客户FCST\nvs.\n上版' : row.item}
                      </td>
                    )}
                    
                    {isWeekVisible && MONTHS.flatMap((m, mIdx) => {
                      const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                      if (!hasWeeks || !visibleColumns.has(m.name)) return [];
                      
                      return m.weeks.map((w, wIdx) => {
                        const key = `${m.name}-${w}`;
                        const isFirstWeek = mIdx === 0 && wIdx === 0;
                        return (
                          <td key={key} className={`border border-gray-200 p-0 h-10 ${isFirstWeek ? 'bg-gray-100' : ''}`}>
                            <ChangeCell 
                              value={row.values[key]} 
                              prevValue={isFirstWeek ? row.values[key] : (row.prevValues?.[key] ?? row.values[key])} 
                              aiSummary={row.aiSummaries?.[key]}
                              violatedRules={row.violatedRules?.[key]}
                              isAnomaly={row.isAnomaly?.[key]}
                            />
                          </td>
                        );
                      });
                    })}

                    {MONTHS.map(m => {
                      const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                      if (!hasWeeks || !visibleColumns.has(m.name)) return null;
                      
                      const { val, prevVal } = getMonthTotal(row, m.name);
                      return (
                        <td key={`${m.name}-total`} className="border border-gray-200 p-0 h-10 bg-blue-50/10">
                          <ChangeCell value={val} prevValue={prevVal} />
                        </td>
                      );
                    })}

                    {MONTHS.map(m => {
                      const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                      if (hasWeeks || !visibleColumns.has(m.name)) return null;
                      
                      const key = `${m.name}--`;
                      return (
                        <td key={key} className="border border-gray-200 p-0 h-10 bg-blue-50/10">
                          <ChangeCell 
                            value={row.values[key]} 
                            prevValue={row.prevValues?.[key] ?? row.values[key]} 
                            aiSummary={row.aiSummaries?.[key]}
                            violatedRules={row.violatedRules?.[key]}
                            isAnomaly={row.isAnomaly?.[key]}
                          />
                        </td>
                      );
                    })}

                    {AGGREGATES.map(a => {
                      if (!visibleColumns.has(a)) return null;
                      // Mock aggregate values for demo
                      let val = 0;
                      let prevVal = 0;
                      if (a === 'Q1') { val = 1050; prevVal = p === '小米' ? (s === '55寸' ? 1030 : 990) : 1050; }
                      else if (a === 'Q2') { val = 2250; prevVal = 2250; }
                      else if (a === 'H1') { val = 3300; prevVal = p === '小米' ? (s === '55寸' ? 3280 : 3240) : 3300; }
                      else if (a === '全年') { val = 3300; prevVal = p === '小米' ? (s === '55寸' ? 3280 : 3240) : 3300; }
                      else if (['Q3', 'Q4', 'H2'].includes(a)) { val = 0; prevVal = 0; }

                      if (p === '华为') {
                        if (a === 'Q1') { val = 3600; prevVal = 3600; }
                        else if (a === 'Q2') { val = 7200; prevVal = 7200; }
                        else if (a === 'H1' || a === '全年') { val = 10800; prevVal = 10800; }
                      }

                      return (
                        <td key={a} className="border border-gray-200 p-0 h-10 bg-gray-50/30">
                          <ChangeCell 
                            value={val} 
                            prevValue={prevVal} 
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              });

              if (isExpanded) {
                modelNames.forEach(modelName => {
                  const modelRows = models[modelName];
                  const modelRowSpan = modelRows.length;
                  
                  modelRows.forEach((row, idx) => {
                    const isFirstInModel = idx === 0;
                    rows.push(
                      <tr key={row.id} className="bg-white hover:bg-gray-50 transition-colors">
                        {groupingType === 'tech' ? (
                          visibleColumns.has('techModel') && isFirstInModel && (
                            <td rowSpan={modelRowSpan} className="border border-gray-200 p-2 pl-8 bg-gray-50/50 italic text-gray-600">
                              <div className="flex items-center gap-1">
                                <ChevronRight size={10} className="text-gray-300" />
                                {modelName}
                              </div>
                            </td>
                          )
                        ) : (
                          visibleColumns.has('sizeModel') && isFirstInModel && (
                            <td rowSpan={modelRowSpan} className="border border-gray-200 p-2 pl-6 bg-gray-50/50 italic text-gray-500">
                              <div className="flex items-center gap-1">
                                <ChevronRight size={10} className="text-gray-300" />
                                {modelName}
                              </div>
                            </td>
                          )
                        )}
                        {visibleColumns.has('dataItem') && (
                          <td className="border border-gray-200 p-2 font-medium text-black">
                            {row.item}
                          </td>
                        )}
                        
                        {isWeekVisible && MONTHS.flatMap((m, mIdx) => {
                          const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                          if (!hasWeeks || !visibleColumns.has(m.name)) return [];
                          
                          return m.weeks.map((w, wIdx) => {
                            const key = `${m.name}-${w}`;
                            const isFirstWeek = mIdx === 0 && wIdx === 0;
                            return (
                              <td key={key} className={`border border-gray-200 p-0 h-10 ${isFirstWeek ? 'bg-gray-100' : ''}`}>
                                <ChangeCell 
                                  value={row.values[key]} 
                                  prevValue={isFirstWeek ? row.values[key] : (row.prevValues?.[key] ?? row.values[key])} 
                                  aiSummary={row.aiSummaries?.[key]}
                                  violatedRules={row.violatedRules?.[key]}
                                  isAnomaly={row.isAnomaly?.[key]}
                                />
                              </td>
                            );
                          });
                        })}

                        {MONTHS.map(m => {
                          const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                          if (!hasWeeks || !visibleColumns.has(m.name)) return null;
                          
                          const { val, prevVal } = getMonthTotal(row, m.name);
                          return (
                            <td key={`${m.name}-total`} className="border border-gray-200 p-0 h-10 bg-blue-50/10">
                              <ChangeCell value={val} prevValue={prevVal} />
                            </td>
                          );
                        })}

                        {MONTHS.map(m => {
                          const hasWeeks = m.weeks.length > 1 || m.weeks[0] !== '-';
                          if (hasWeeks || !visibleColumns.has(m.name)) return null;
                          
                          const key = `${m.name}--`;
                          return (
                            <td key={key} className="border border-gray-200 p-0 h-10 bg-blue-50/10">
                              <ChangeCell 
                                value={row.values[key]} 
                                prevValue={row.prevValues?.[key] ?? row.values[key]} 
                                aiSummary={row.aiSummaries?.[key]}
                                violatedRules={row.violatedRules?.[key]}
                                isAnomaly={row.isAnomaly?.[key]}
                              />
                            </td>
                          );
                        })}

                        {AGGREGATES.map(a => {
                          if (!visibleColumns.has(a)) return null;
                          // Mock aggregate values for demo
                          let val = 0;
                          let prevVal = 0;
                          if (a === 'Q1') { val = 400; prevVal = 400; }
                          else if (a === 'Q2') { val = 800; prevVal = 800; }
                          else if (a === 'H1' || a === '全年') { val = 1200; prevVal = 1200; }
                          return (
                            <td key={a} className="border border-gray-200 p-0 h-10 bg-gray-50/30">
                              <ChangeCell 
                                value={val} 
                                prevValue={prevVal} 
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                });
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>
      
      <div className="p-4 flex justify-between items-center bg-gray-50 border-t border-gray-200">
        {visibleRowsCount < secondaryGroups.length ? (
          <button 
            onClick={handleLoadMore}
            className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-all"
          >
            加载更多 <ChevronDown size={16} />
          </button>
        ) : (
          <span className="text-gray-400 text-[10px] uppercase tracking-widest">已加载全部数据</span>
        )}
      </div>
    </div>
  );
};

const DPAdjustmentTable = ({ data: initialData, onAction, columnLabel = '尺寸/model', title = '本周DP' }: { data: ForecastRow[], onAction?: (text: string) => void, columnLabel?: string, title?: string }) => {
  const [data, setData] = useState(initialData);
  const [filteredData, setFilteredData] = useState(initialData);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [itemsToValidate, setItemsToValidate] = useState<{ rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[]>([]);

  const handleDownload = () => {
    // Generate CSV for DP and Sales FCST
    const targetItems = ['销售FCST (ETD)', '需求计划'];
    const filteredCSVData = filteredData.filter(r => targetItems.includes(r.item));
    
    const weeks = MONTHS.flatMap(m => m.weeks.map(w => `${m.name}-${w}`));
    const headers = ['集团客户', '尺寸', 'Model', '数据项', ...weeks];
    const csvContent = [
      headers.join(','),
      ...filteredCSVData.map(row => [
        row.customer,
        row.size,
        row.model || '',
        row.item,
        ...weeks.map(k => row.values[k] || 0)
      ].join(','))
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `DP_SalesFCST_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmitClick = () => {
    const changes: { rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[] = [];
    
    data.forEach(row => {
      const initialRow = initialData.find(r => r.id === row.id);
      if (!initialRow) return;
      Object.keys(row.values).forEach(key => {
        const newVal = row.values[key];
        const oldVal = initialRow.values[key];
        if (newVal !== oldVal) {
          changes.push({
            rowId: row.id,
            key,
            oldVal,
            newVal,
            customer: row.customer,
            size: row.size,
            model: row.model,
            item: row.item
          });
        }
      });
    });

    if (changes.length === 0) {
      onAction?.('提交');
      return;
    }

    const top3 = changes
      .sort((a, b) => Math.abs(b.newVal - b.oldVal) - Math.abs(a.newVal - a.oldVal))
      .slice(0, 3);

    setItemsToValidate(top3);
    setIsBatchModalOpen(true);
  };

  const handleBatchConfirm = (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => {
    setIsBatchModalOpen(false);
    onAction?.('提交');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Simulate parsing
      onAction?.(`已成功导入文件: ${file.name}，正在同步数据...`);
      // In a real app, we would parse CSV and update state
    }
  };

  const toggleGroup = (customer: string, size: string) => {
    const key = `${customer}-${size}`;
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const handleValueChange = (rowId: string, weekKey: string, newValue: number) => {
    setData(prevData => prevData.map(row => {
      if (row.id === rowId) {
        return {
          ...row,
          values: { ...row.values, [weekKey]: newValue }
        };
      }
      return row;
    }));
  };

  const handleBatchPaste = (e: any) => {
    const { text, startRowId, startColumnKey } = e.detail;
    // Check if startRowId belongs to this table's data
    if (!data.some(r => r.id === startRowId)) return;

    const rows = text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
    const weekKeys = MONTHS.flatMap(m => m.weeks.map(w => `${m.name}-${w}`));
    const startColIndex = weekKeys.indexOf(startColumnKey);
    
    if (startColIndex === -1) return;

    setData(prevData => {
      const nextData = [...prevData];
      const startRowIndex = nextData.findIndex(r => r.id === startRowId);
      
      if (startRowIndex === -1) return prevData;

      rows.forEach((rowText: string, rIdx: number) => {
        const targetRowIndex = startRowIndex + rIdx;
        if (targetRowIndex >= nextData.length) return;

        const targetRow = nextData[targetRowIndex];
        // Only paste into editable items
        if (!isEditable(targetRow.item) || !targetRow.model) return;

        const cells = rowText.split('\t');
        cells.forEach((cellVal: string, cIdx: number) => {
          const targetColIndex = startColIndex + cIdx;
          if (targetColIndex >= weekKeys.length) return;

          const weekKey = weekKeys[targetColIndex];
          const val = Number(cellVal.replace(/,/g, ''));
          if (!isNaN(val)) {
            targetRow.values = { ...targetRow.values, [weekKey]: val };
          }
        });
      });
      
      return nextData;
    });
  };

  useEffect(() => {
    window.addEventListener('batch-paste', handleBatchPaste);
    return () => window.removeEventListener('batch-paste', handleBatchPaste);
  }, [data]);

  // Group data by Customer and Size
  const groupedData: Record<string, Record<string, { totalRows: ForecastRow[], models: Record<string, ForecastRow[]> }>> = {};
  filteredData.forEach(row => {
    if (!groupedData[row.customer]) groupedData[row.customer] = {};
    if (!groupedData[row.customer][row.size]) {
      groupedData[row.customer][row.size] = { totalRows: [], models: {} };
    }
    if (!row.model) {
      groupedData[row.customer][row.size].totalRows.push(row);
    } else {
      if (!groupedData[row.customer][row.size].models[row.model]) {
        groupedData[row.customer][row.size].models[row.model] = [];
      }
      groupedData[row.customer][row.size].models[row.model].push(row);
    }
  });

  const allCustomers = Object.keys(groupedData);
  const visibleCustomers = allCustomers.slice(0, visibleCustomerCount);
  
  const sizeGroups: { customer: string, size: string }[] = [];
  visibleCustomers.forEach(c => {
    Object.keys(groupedData[c]).forEach(s => {
      sizeGroups.push({ customer: c, size: s });
    });
  });

  // Items order as per screenshot
  const displayItems: DataItemType[] = [
    '客户FCST',
    'AI预测',
    '销售FCST (ETD)',
    'ExtraSales',
    '需求计划',
    'ExtraUnmet'
  ];

  const isEditable = (item: string) => {
    return ['销售FCST (ETD)', 'ExtraSales', '需求计划', 'ExtraUnmet'].includes(item);
  };

  return (
    <div className="flex flex-col w-full max-w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
      <div className="p-4 border-b border-gray-100 bg-[#f8faff] flex justify-between items-center">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
            accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="导入数据"
          >
            <Upload size={16} />
          </button>
          <button 
            onClick={handleDownload}
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="下载数据"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <ForecastFilterBar data={data} onFilterChange={setFilteredData} />
      <div className="overflow-x-auto" ref={scrollContainerRef}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-[#f8faff] sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[70px] font-bold text-gray-700 bg-[#f8faff]">集团客户名称</th>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[80px] font-bold text-gray-700 bg-[#f8faff]">{columnLabel}</th>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[150px] font-bold text-gray-700 bg-[#f8faff]">规格描述</th>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[110px] font-bold text-gray-700 bg-[#f8faff]">数据项</th>
              {MONTHS.map(m => (
                <th key={m.name} colSpan={m.weeks.length} className="border border-gray-200 p-1 text-blue-700 font-bold bg-[#eef4ff]">
                  {m.name}
                </th>
              ))}
            </tr>
            <tr>
              {MONTHS.flatMap(m => m.weeks.map(w => (
                <th key={`${m.name}-${w}`} className="border border-gray-200 p-1 min-w-[75px] font-medium text-gray-600 bg-white">
                  {w}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {sizeGroups.map((group) => {
              const { customer, size } = group;
              const { totalRows, models } = groupedData[customer][size];
              const isExpanded = expandedGroups.has(`${customer}-${size}`);
              const modelNames = Object.keys(models);
              
              const tableRows: React.ReactNode[] = [];
              
              // 1. Total (Size level) rows
              displayItems.forEach((item, itemIdx) => {
                const rowData = totalRows.find(r => r.item === item);
                if (!rowData) return;

                const rowSpanForCustomer = displayItems.length + (isExpanded ? modelNames.length * displayItems.length : 0);

                tableRows.push(
                  <tr key={rowData.id} className="hover:bg-gray-50 transition-colors">
                    {itemIdx === 0 && (
                      <td rowSpan={rowSpanForCustomer} className="border border-gray-200 p-2 font-bold text-center bg-white align-middle text-sm min-w-[70px]">
                        {customer}
                      </td>
                    )}
                    {itemIdx === 0 && (
                      <td className="border border-gray-200 p-2 bg-white align-top min-w-[100px]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-gray-700">{size}</span>
                          <button 
                            onClick={() => toggleGroup(customer, size)}
                            className="p-0.5 hover:bg-gray-100 rounded text-blue-600 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </td>
                    )}
                    {itemIdx === 0 && (
                      <td className="border border-gray-200 p-2 bg-white align-top min-w-[150px] text-gray-500 font-medium">
                        {rowData.specs}
                      </td>
                    )}
                    {itemIdx > 0 && <td className="border border-gray-200 bg-white"></td>}
                    {itemIdx > 0 && <td className="border border-gray-200 bg-white"></td>}
                    <td className={`border border-gray-200 p-2 font-medium ${isEditable(item) ? 'text-blue-700' : 'text-gray-900'} bg-white`}>
                      {item}
                    </td>
                    {MONTHS.flatMap(m => m.weeks.map(w => {
                      const key = `${m.name}-${w}`;
                      const cellIsAnomaly = rowData.isAnomaly?.[key];
                      const cellAiSummary = rowData.aiSummaries?.[key];
                      const cellViolatedRules = rowData.violatedRules?.[key];
                      const hasAnomalyContent = !!(cellAiSummary && cellAiSummary.startsWith('异常分析:\n'));
                      const cellIsAIPrediction = !!rowData.isAIPrediction?.[key];
                      return (
                        <td key={key} className="border border-gray-200 p-0 h-9">
                          {(cellIsAnomaly && hasAnomalyContent) || cellIsAIPrediction ? (
                            <EditableCell
                              value={rowData.values[key] || 0}
                              isEditable={false}
                              isAnomaly={cellIsAnomaly}
                              isAIPrediction={cellIsAIPrediction}
                              aiSummary={cellAiSummary}
                              violatedRules={cellViolatedRules}
                              onSave={() => {}}
                              oldValue={rowData.prevValues?.[key]}
                              startRowId={rowData.id}
                              startColumnKey={key}
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center font-medium relative group cursor-default ${
                              cellIsAnomaly ? 'bg-red-100 text-red-600 font-bold' : 'bg-gray-50/50 text-gray-500'
                            }`}>
                              {(rowData.values[key] || 0).toLocaleString()}
                            </div>
                          )}
                        </td>
                      );
                    }))}
                  </tr>
                );
              });

              // 2. Model Rows if expanded
              if (isExpanded) {
                modelNames.forEach(modelName => {
                  displayItems.forEach((item, itemIdx) => {
                    const rowData = models[modelName].find(r => r.item === item);
                    if (!rowData) return;

                    tableRows.push(
                      <tr key={rowData.id} className="bg-gray-50/30 hover:bg-blue-50/20 transition-colors border-l-2 border-l-blue-200">
                        {itemIdx === 0 && (
                          <>
                            <td className="border border-gray-200 p-2 bg-gray-50/50 align-top min-w-[100px]">
                              <div className="flex items-center gap-1 text-gray-600 italic font-medium pl-2">
                                <ChevronRight size={10} className="text-gray-400" />
                                {modelName}
                              </div>
                            </td>
                            <td className="border border-gray-200 p-2 bg-gray-50/50 align-top min-w-[150px] text-gray-400 italic">
                              {rowData.specs}
                            </td>
                          </>
                        )}
                        {itemIdx > 0 && (
                          <>
                            <td className="border border-gray-200 bg-gray-50/50"></td>
                            <td className="border border-gray-200 bg-gray-50/50"></td>
                          </>
                        )}
                        <td className={`border border-gray-200 p-2 font-medium ${isEditable(item) ? 'text-blue-600' : 'text-gray-400'} pl-4`}>
                          {item}
                        </td>
                        {MONTHS.flatMap(m => m.weeks.map(w => {
                          const key = `${m.name}-${w}`;
                          const canEdit = isEditable(item);
                          return (
                            <td key={key} className={`border border-gray-200 p-0 h-8 ${!canEdit ? 'bg-gray-100/30 text-gray-400' : 'bg-white/50'}`}>
                              {canEdit ? (
                                <EditableCell
                                  value={rowData.values[key] || 0}
                                  isEditable={true}
                                  onSave={(val) => handleValueChange(rowData.id, key, val)}
                                  startRowId={rowData.id}
                                  startColumnKey={key}
                                  isAnomaly={rowData.isAnomaly?.[key]}
                                  isAIPrediction={rowData.item === 'AI预测'}
                                  specialRuleData={rowData.specialRuleData?.[key]}
                                  allowModificationMarker={rowData.item === '销售FCST (ETD)' || rowData.item === 'ExtraSales'}
                                />
                              ) : (
                                <EditableCell
                                  value={rowData.values[key] || 0}
                                  isEditable={false}
                                  isAIPrediction={!!rowData.isAIPrediction?.[key]}
                                  isAnomaly={rowData.isAnomaly?.[key]}
                                  aiSummary={rowData.aiSummaries?.[key]}
                                  violatedRules={rowData.violatedRules?.[key]}
                                  onSave={() => {}}
                                  oldValue={rowData.prevValues?.[key]}
                                  startRowId={rowData.id}
                                  startColumnKey={key}
                                />
                              )}
                            </td>
                          );
                        }))}
                      </tr>
                    );
                  });
                });
              }

              return tableRows;
            })}
          </tbody>
        </table>
      </div>
      
      {/* Load More Customers */}
      {visibleCustomerCount < allCustomers.length && (
        <div className="p-3 bg-white border-x border-gray-200 flex justify-center">
          <button 
            onClick={() => setVisibleCustomerCount(prev => prev + 1)}
            className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 transition-all"
          >
            加载更多客户 <ChevronDown size={14} />
          </button>
        </div>
      )}
      
      {/* Footer Buttons */}
      <div className="p-4 flex gap-4 justify-end bg-gray-50 border-t border-gray-200">
        <button 
          onClick={() => onAction?.('创建模拟版本')}
          className="px-6 py-2 bg-white border border-blue-200 rounded-lg text-sm font-bold text-blue-700 hover:bg-blue-50 transition-all shadow-sm active:scale-95"
        >
          创建模拟版本
        </button>
        <button 
          onClick={handleSubmitClick}
          className="px-6 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-md active:scale-95"
        >
          提交
        </button>
        <button 
          onClick={() => onAction?.('发布')}
          className="px-6 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-md active:scale-95"
        >
          发布
        </button>
      </div>

      <BatchReasonModal 
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        items={itemsToValidate}
        onConfirm={handleBatchConfirm}
      />
    </div>
  );
};

const MNTForecastTable = ({ data: initialData, onAction }: { data: ForecastRow[], onAction?: (text: string) => void }) => {
  const [data, setData] = useState(initialData);
  const [expandedLevel1, setExpandedLevel1] = useState<Set<string>>(new Set());
  const [expandedLevel2, setExpandedLevel2] = useState<Set<string>>(new Set());
  const [visibleCustomerCount, setVisibleCustomerCount] = useState(2);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const numItems = MNT_ITEMS.length;

  const isMNTEditable = (item: string) =>
    ['销量基线预测', '销售策略1-中低风险', '销售策略2-高风险', '库存目标'].includes(item);

  const toggleLevel1 = (key: string) => {
    const next = new Set(expandedLevel1);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedLevel1(next);
  };

  const toggleLevel2 = (key: string) => {
    const next = new Set(expandedLevel2);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedLevel2(next);
  };

  const handleValueChange = (rowId: string, weekKey: string, newValue: number) => {
    setData(prev => prev.map(row => row.id === rowId ? { ...row, values: { ...row.values, [weekKey]: newValue } } : row));
  };

  const customers: string[] = Array.from(new Set(data.filter(r => r.level === 1).map(r => r.customer)));
  const visibleCustomers = customers.slice(0, visibleCustomerCount);

  const getSizeResolutions = (customer: string): string[] =>
    Array.from(new Set(data.filter(r => r.level === 1 && r.customer === customer).map(r => r.size)));

  const getRefreshRates = (customer: string, sizeRes: string): string[] =>
    Array.from(new Set(data.filter(r => r.level === 2 && r.customer === customer && r.size === sizeRes).map(r => r.refreshRate!)));

  const getProductIds = (customer: string, sizeRes: string, refreshRate: string): string[] =>
    Array.from(new Set(data.filter(r => r.level === 3 && r.customer === customer && r.size === sizeRes && r.refreshRate === refreshRate).map(r => r.productId!)));

  // Count total visible rows for a customer (for column 1 rowSpan)
  const getCustomerRowCount = (customer: string): number => {
    const sizeResolutions = getSizeResolutions(customer);
    let count = 0;
    sizeResolutions.forEach(sr => {
      count += numItems; // L1
      const l1Key = `${customer}-${sr}`;
      if (expandedLevel1.has(l1Key)) {
        const rates = getRefreshRates(customer, sr);
        rates.forEach(rate => {
          count += numItems; // L2
          const l2Key = `${customer}-${sr}-${rate}`;
          if (expandedLevel2.has(l2Key)) {
            count += getProductIds(customer, sr, rate).length * numItems; // L3
          }
        });
      }
    });
    return count;
  };

  return (
    <div className="flex flex-col w-full max-w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm mt-4">
      <div className="p-4 border-b border-gray-100 bg-[#f0f7ff] flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Layers size={16} className="text-blue-600" />
            MNT BU — 本周销售FCST
          </h3>
          <p className="text-[10px] text-gray-500 mt-1">维度：集团客户名称 → 尺寸-分辨率 → 刷新率 → ProductID</p>
        </div>
        <div className="flex gap-2">
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="下载数据">
            <Download size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto" ref={scrollContainerRef}>
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-[#f8faff] sticky top-0 z-20">
            <tr>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[80px] font-bold text-gray-700 bg-[#f8faff]">集团客户名称</th>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[160px] font-bold text-gray-700 bg-[#f8faff]">尺寸-分辨率</th>
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[130px] font-bold text-gray-700 bg-[#f8faff]">数据项</th>
              {MONTHS.map(m => (
                <th key={m.name} colSpan={m.weeks.length} className="border border-gray-200 p-1 text-blue-700 font-bold bg-[#eef4ff]">
                  {m.name}
                </th>
              ))}
            </tr>
            <tr>
              {MONTHS.flatMap(m => m.weeks.map(w => (
                <th key={`${m.name}-${w}`} className="border border-gray-200 p-1 min-w-[75px] font-medium text-gray-600 bg-white whitespace-pre-line text-[10px]">
                  {w}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.map((customer) => {
              const sizeResolutions = getSizeResolutions(customer);
              const customerRowCount = getCustomerRowCount(customer);
              const tableRows: React.ReactNode[] = [];
              let isFirstRowOfCustomer = true;

              sizeResolutions.forEach((sizeRes) => {
                const l1Key = `${customer}-${sizeRes}`;
                const isL1Expanded = expandedLevel1.has(l1Key);
                const l1Rows = data.filter(r => r.level === 1 && r.customer === customer && r.size === sizeRes);

                // Level 1 rows: each item gets its own row, column 2 shows "尺寸-分辨率" with rowSpan=numItems
                MNT_ITEMS.forEach((item, itemIdx) => {
                  const rowData = l1Rows.find(r => r.item === item);
                  if (!rowData) return;

                  tableRows.push(
                    <tr key={rowData.id} className="hover:bg-gray-50 transition-colors">
                      {isFirstRowOfCustomer && (
                        <td rowSpan={customerRowCount} className="border border-gray-200 p-2 font-bold text-center bg-white align-middle text-sm min-w-[80px]">
                          {customer}
                        </td>
                      )}
                      {itemIdx === 0 && (
                        <td rowSpan={numItems} className="border border-gray-200 p-2 bg-white align-middle min-w-[160px]">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-gray-700 text-[11px]">{sizeRes}</span>
                            <button
                              onClick={() => toggleLevel1(l1Key)}
                              className="p-0.5 hover:bg-gray-100 rounded text-blue-600 transition-colors"
                            >
                              {isL1Expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                      <td className={`border border-gray-200 p-2 font-medium ${isMNTEditable(item) ? 'text-blue-700' : 'text-gray-900'}`}>
                        {item}
                      </td>
                      {MONTHS.flatMap(m => m.weeks.map(w => {
                        const key = `${m.name}-${w}`;
                        return (
                          <td key={key} className="border border-gray-200 p-0 h-9 text-center">
                            <div className="w-full h-full flex items-center justify-center font-medium text-gray-700">
                              {rowData.values[key] || 0}
                            </div>
                          </td>
                        );
                      }))}
                    </tr>
                  );
                  if (isFirstRowOfCustomer) isFirstRowOfCustomer = false;
                });

                // Level 2: 刷新率 rows (if expanded)
                if (isL1Expanded) {
                  const refreshRates = getRefreshRates(customer, sizeRes);

                  refreshRates.forEach((rate) => {
                    const l2Key = `${customer}-${sizeRes}-${rate}`;
                    const isL2Expanded = expandedLevel2.has(l2Key);
                    const l2Rows = data.filter(r => r.level === 2 && r.customer === customer && r.size === sizeRes && r.refreshRate === rate);

                    MNT_ITEMS.forEach((item, itemIdx) => {
                      const rowData = l2Rows.find(r => r.item === item);
                      if (!rowData) return;

                      tableRows.push(
                        <tr key={rowData.id} className="bg-blue-50/30 hover:bg-blue-50/50 transition-colors">
                          {itemIdx === 0 && (
                            <td rowSpan={numItems} className="border border-gray-200 p-2 bg-blue-50/20 align-middle min-w-[160px]">
                              <div className="flex items-center justify-between gap-1 pl-4">
                                <span className="font-medium text-blue-700 text-[11px]">⤷ {rate}</span>
                                <button
                                  onClick={() => toggleLevel2(l2Key)}
                                  className="p-0.5 hover:bg-blue-100 rounded text-blue-600 transition-colors"
                                >
                                  {isL2Expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              </div>
                            </td>
                          )}
                          <td className={`border border-gray-200 p-2 font-medium ${isMNTEditable(item) ? 'text-blue-600' : 'text-gray-600'}`}>
                            {item}
                          </td>
                          {MONTHS.flatMap(m => m.weeks.map(w => {
                            const key = `${m.name}-${w}`;
                            return (
                              <td key={key} className="border border-gray-200 p-0 h-8 text-center bg-blue-50/10">
                                <div className="w-full h-full flex items-center justify-center font-medium text-gray-600">
                                  {rowData.values[key] || 0}
                                </div>
                              </td>
                            );
                          }))}
                        </tr>
                      );
                    });

                    // Level 3: productID rows (if expanded)
                    if (isL2Expanded) {
                      const productIds = getProductIds(customer, sizeRes, rate);

                      productIds.forEach((pid) => {
                        const l3Rows = data.filter(r => r.level === 3 && r.customer === customer && r.size === sizeRes && r.refreshRate === rate && r.productId === pid);

                        MNT_ITEMS.forEach((item, itemIdx) => {
                          const rowData = l3Rows.find(r => r.item === item);
                          if (!rowData) return;
                          const canEdit = isMNTEditable(item);

                          tableRows.push(
                            <tr key={rowData.id} className="bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors">
                              {itemIdx === 0 && (
                                <td rowSpan={numItems} className="border border-gray-200 p-2 bg-indigo-50/10 align-middle min-w-[160px]">
                                  <div className="flex items-center gap-1 pl-8">
                                    <ChevronRight size={10} className="text-indigo-300" />
                                    <span className="font-medium text-indigo-600 text-[10px]">{pid}</span>
                                  </div>
                                </td>
                              )}
                              <td className={`border border-gray-200 p-2 font-medium ${canEdit ? 'text-indigo-600' : 'text-gray-400'}`}>
                                {item}
                              </td>
                              {MONTHS.flatMap(m => m.weeks.map(w => {
                                const key = `${m.name}-${w}`;
                                return (
                                  <td key={key} className={`border border-gray-200 p-0 h-8 ${canEdit ? 'bg-white' : 'bg-gray-50/30'}`}>
                                    {canEdit ? (
                                      <EditableCell
                                        value={rowData.values[key] || 0}
                                        isEditable={true}
                                        onSave={(val) => handleValueChange(rowData.id, key, val)}
                                        startRowId={rowData.id}
                                        startColumnKey={key}
                                        allowModificationMarker={true}
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center font-medium text-gray-400">
                                        {rowData.values[key] || 0}
                                      </div>
                                    )}
                                  </td>
                                );
                              }))}
                            </tr>
                          );
                        });
                      });
                    }
                  });
                }
              });

              return <React.Fragment key={customer}>{tableRows}</React.Fragment>;
            })}
          </tbody>
        </table>
      </div>

      {visibleCustomerCount < customers.length && (
        <div className="p-3 bg-white border-t border-gray-200 flex justify-center">
          <button
            onClick={() => setVisibleCustomerCount(prev => prev + 1)}
            className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 transition-all"
          >
            加载更多客户 <ChevronDown size={14} />
          </button>
        </div>
      )}

      <div className="p-4 flex gap-4 justify-end bg-gray-50 border-t border-gray-200">
        <button
          onClick={() => onAction?.('提交修改')}
          className="px-6 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-md active:scale-95"
        >
          提交
        </button>
        <button
          onClick={() => onAction?.('发布')}
          className="px-6 py-2 bg-indigo-600 rounded-lg text-sm font-bold text-white hover:bg-indigo-700 transition-all shadow-md active:scale-95"
        >
          发布
        </button>
      </div>
    </div>
  );
};

const SalesTargetComparisonTable = ({ buType }: { buType: AnomalyBU }) => {
  const [monthsCollapsed, setMonthsCollapsed] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const appFamily = (buType === 'TV' || buType === 'CID') ? 'TV' : (buType === 'MNT' || buType === 'NB') ? 'IT' : 'MC';
  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };

  // 时间范围 M+6 by 月/季度：当前为 2026年8月，M+6 覆盖 2608~2702 共7个月
  // 按自然季度分组插入季度小计列；26Q3/27Q1 落在窗口边界，小计仅汇总窗口内可用的月份（2个月），26Q4 为完整季度（3个月）
  const MONTHS = [
    { key: '2608', quarter: '26Q3' },
    { key: '2609', quarter: '26Q3' },
    { key: '2610', quarter: '26Q4' },
    { key: '2611', quarter: '26Q4' },
    { key: '2612', quarter: '26Q4' },
    { key: '2701', quarter: '27Q1' },
    { key: '2702', quarter: '27Q1' },
  ];

  const periodHeaders: { label: string; isMonth: boolean; monthIndexes: number[] }[] = [];
  {
    let cursor = 0;
    while (cursor < MONTHS.length) {
      const q = MONTHS[cursor].quarter;
      const idxs: number[] = [];
      while (cursor < MONTHS.length && MONTHS[cursor].quarter === q) {
        periodHeaders.push({ label: MONTHS[cursor].key, isMonth: true, monthIndexes: [cursor] });
        idxs.push(cursor);
        cursor++;
      }
      periodHeaders.push({ label: q, isMonth: false, monthIndexes: idxs });
    }
  }

  const sumByIndexes = (arr: number[], indexes: number[]) => indexes.reduce((s, i) => s + arr[i], 0);

  const allColumns = [
    { id: 'app', label: '应用别' },
    { id: 'panel', label: '面板厂' },
    { id: 'dataItem', label: '数据项' },
    ...periodHeaders.map(h => ({ id: h.label, label: h.label }))
  ];

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumns);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleColumns(next);
  };

  // 每个应用别+面板厂分组下拆成 3 行：销量预测(ETA)、销量计划BP/RP、达成率与缺口
  // 达成率 = 销量预测 / 销量计划BP/RP；缺口绝对值 = 销量预测 - 销量计划BP/RP；阈值：达成率 ≤ 95% 触发预警（红色高亮）
  const groupedData = [
    {
      app: 'TV',
      panel: '京东方',
      forecast: [380, 430, 360, 400, 410, 390, 400],
      target: [400, 400, 400, 400, 400, 400, 400],
    },
    {
      app: 'TV',
      panel: 'TCL华星',
      forecast: [300, 280, 260, 300, 300, 300, 300],
      target: [300, 300, 300, 300, 300, 300, 300],
    },
    {
      app: 'IT',
      panel: '京东方',
      forecast: [150, 140, 130, 150, 150, 150, 150],
      target: [150, 150, 150, 150, 150, 150, 150],
    },
    {
      app: 'IT',
      panel: 'TCL华星',
      forecast: [220, 200, 190, 220, 220, 220, 220],
      target: [220, 220, 220, 220, 220, 220, 220],
    },
    {
      app: 'MC',
      panel: '京东方',
      forecast: [90, 100, 85, 95, 95, 95, 95],
      target: [100, 100, 100, 100, 100, 100, 100],
    },
    {
      app: 'MC',
      panel: 'TCL华星',
      forecast: [120, 110, 100, 120, 120, 120, 120],
      target: [120, 120, 120, 120, 120, 120, 120],
    },
  ].filter(g => g.app === appFamily);

  const RATE_THRESHOLD = 95;

  const renderValueCell = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">
      {val}
    </td>
  );

  const renderRateCell = (key: string, forecastVal: number, targetVal: number) => {
    const rate = targetVal === 0 ? 100 : Math.round((forecastVal / targetVal) * 100);
    const gap = forecastVal - targetVal;
    const isBelowThreshold = rate <= RATE_THRESHOLD;
    return (
      <td
        key={key}
        className={`border border-gray-200 p-2 text-center ${isBelowThreshold ? 'bg-red-50' : ''}`}
      >
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${isBelowThreshold ? 'text-red-600' : 'text-gray-900'}`}>{rate}%</span>
          <span className={`text-[10px] font-bold ${isBelowThreshold ? 'text-red-500' : 'text-gray-400'}`}>
            {gap > 0 ? `+${gap}` : gap}
          </span>
        </div>
      </td>
    );
  };

  const visiblePeriodIndexes = periodHeaders
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => (!monthsCollapsed || !h.isMonth) && visibleColumns.has(h.label));

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-600" />
          销售目标达成对比
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)}
              className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
              title="表格设置"
            >
              <Settings size={16} />
            </button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  {/* Backdrop to close */}
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2"
                  >
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input
                            type="checkbox"
                            checked={visibleColumns.has(col.id)}
                            onChange={() => toggleColumn(col.id)}
                            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="导出当前数据"
          >
            <Download size={16} />
          </button>
          <button
            onClick={() => setMonthsCollapsed(!monthsCollapsed)}
            className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1"
          >
            {monthsCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
            {monthsCollapsed ? '展开月度' : '仅看季度'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('app') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">应用别</th>}
              {visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[90px]">面板厂</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {visiblePeriodIndexes.map(({ h, i }) => (
                <th key={i} className={`border border-gray-200 p-1 font-bold min-w-[80px] ${h.isMonth ? 'bg-white text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                {/* 销量预测(ETA) */}
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('app') && (
                    <td rowSpan={3} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.app}</td>
                  )}
                  {visibleColumns.has('panel') && (
                    <td rowSpan={3} className="border border-gray-200 p-2 text-center font-medium text-gray-700 align-middle">{PANEL_CODE[group.panel] ?? group.panel}</td>
                  )}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">销量预测(ETA)</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValueCell(`f-${i}`, sumByIndexes(group.forecast, h.monthIndexes)))}
                </tr>
                {/* 销量计划BP/RP */}
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">销量计划BP/RP</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValueCell(`t-${i}`, sumByIndexes(group.target, h.monthIndexes)))}
                </tr>
                {/* 达成率 / 缺口 */}
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率 / 缺口</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRateCell(`r-${i}`, sumByIndexes(group.forecast, h.monthIndexes), sumByIndexes(group.target, h.monthIndexes)))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        达成率 ≤ {RATE_THRESHOLD}% 高亮预警
      </div>
    </div>
  );
};

// --- 规则详情通用小工具（各组件自包含使用，不抽共享引擎） ---
const ruleDim = (buType: AnomalyBU, dimTV: string, dimIT: string, dimMC: string) =>
  (buType === 'TV' || buType === 'CID') ? dimTV : (buType === 'MNT' || buType === 'NB') ? dimIT : dimMC;

// 近期周维度展示列：WK31~WK49共19个真实周，按月分组+月度小计（WK36/WK40跨月拆成两列），锚点2026-08-23（当周WK35第一天）
const NEAR_TERM_WEEK_COLUMNS = [
  { key: 'wk31', label: 'WK31', sub: '260801-01' }, { key: 'wk32', label: 'WK32', sub: '260802-08' },
  { key: 'wk33', label: 'WK33', sub: '260809-15' }, { key: 'wk34', label: 'WK34', sub: '260816-22' },
  { key: 'wk35', label: 'WK35', sub: '260823-29' },
  { key: 'wk36a', label: 'WK36', sub: '260830-31' }, { key: 'm2608', label: 'M26-08', sub: '' }, { key: 'wk36b', label: 'WK36', sub: '260901-05' },
  { key: 'wk37', label: 'WK37', sub: '260906-12' }, { key: 'wk38', label: 'WK38', sub: '260913-19' }, { key: 'wk39', label: 'WK39', sub: '260920-26' },
  { key: 'wk40a', label: 'WK40', sub: '260927-30' }, { key: 'm2609', label: 'M26-09', sub: '' }, { key: 'wk40b', label: 'WK40', sub: '261001-03' },
  { key: 'wk41', label: 'WK41', sub: '261004-10' }, { key: 'wk42', label: 'WK42', sub: '261011-17' },
  { key: 'wk43', label: 'WK43', sub: '261018-24' }, { key: 'wk44', label: 'WK44', sub: '261025-31' }, { key: 'm2610', label: 'M26-10', sub: '' },
  { key: 'wk45', label: 'WK45', sub: '261101-07' }, { key: 'wk46', label: 'WK46', sub: '261108-14' }, { key: 'wk47', label: 'WK47', sub: '261115-21' },
  { key: 'wk48', label: 'WK48', sub: '261122-28' }, { key: 'wk49', label: 'WK49', sub: '261129-30' }, { key: 'm2611', label: 'M26-11', sub: '' },
];
// 与NEAR_TERM_WEEK_COLUMNS一一对应；仅WK35及跨月拆出的WK36两列标记锁定期（当前+下一周锁定惯例），月小计列恒为false
const NEAR_TERM_LOCKED = [
  false, false, false, false,
  true,
  true, false, true,
  false, false, false,
  false, false, false,
  false, false,
  false, false, false,
  false, false, false, false, false, false,
];
// 19个真实周值(WK31~WK49) -> 25个展示列的值：WK36按2/7、5/7天数比例拆分(8月30-31共2天/9月1-5共5天)，WK40按4/7、3/7拆分(9月27-30共4天/10月1-3共3天)，月小计=该月内展示列之和
const expandWeeksToColumns = (weeks: number[]) => {
  const [w31, w32, w33, w34, w35, w36, w37, w38, w39, w40, w41, w42, w43, w44, w45, w46, w47, w48, w49] = weeks;
  const wk36a = Math.round(w36 * 2 / 7);
  const wk36b = w36 - wk36a;
  const wk40a = Math.round(w40 * 4 / 7);
  const wk40b = w40 - wk40a;
  const m2608 = w31 + w32 + w33 + w34 + w35 + wk36a;
  const m2609 = wk36b + w37 + w38 + w39 + wk40a;
  const m2610 = wk40b + w41 + w42 + w43 + w44;
  const m2611 = w45 + w46 + w47 + w48 + w49;
  return [
    w31, w32, w33, w34, w35,
    wk36a, m2608, wk36b,
    w37, w38, w39,
    wk40a, m2609, wk40b,
    w41, w42, w43, w44, m2610,
    w45, w46, w47, w48, w49, m2611,
  ];
};

// 客户FCST变化识别：客户+尺寸(TV) / 客户+技术别(IT) / 客户+技术别+尺寸(MC)
const CustomerFcstChangeTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);

  const isTVFamily = buType === 'TV' || buType === 'CID';
  const isITFamily = buType === 'MNT' || buType === 'NB';
  const dimLabel = isTVFamily ? '尺寸' : isITFamily ? '技术别' : '技术别+尺寸';

  const MONTHS = ['2612', '2701', '2702'];

  const groupedData = isTVFamily ? [
    {
      customer: '小米集团_TV', dim: '55寸',
      weekCur: [420,420,420,420,420,415,400,390,405,405,405,405,405,405,405,405,405,405,405], weekPrev: [400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400],
      monthCur: [400, 410, 405], monthPrev: [400, 400, 400],
      models: [
        { name: 'Model A', weekCur: [180,180,180,180,180,175,170,165,175,175,175,175,175,175,175,175,175,175,175], weekPrev: [170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170], monthCur: [170, 175, 172], monthPrev: [170, 170, 170] },
      ]
    },
    {
      customer: '华为集团_TV', dim: '35寸',
      weekCur: [150,150,150,150,150,148,130,128,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150],
      monthCur: [150, 130, 128], monthPrev: [150, 150, 150],
      models: [
        { name: 'Model C', weekCur: [150,150,150,150,150,148,130,128,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [150, 130, 128], monthPrev: [150, 150, 150] },
      ]
    },
  ] : isITFamily ? [
    {
      customer: '华硕集团_IT', dim: 'IPS',
      weekCur: [260,260,260,260,260,255,240,235,245,245,245,245,245,245,245,245,245,245,245], weekPrev: [250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250],
      monthCur: [250, 245, 240], monthPrev: [250, 250, 250],
      models: [
        { name: 'Model P', weekCur: [130,130,130,130,130,128,120,118,122,122,122,122,122,122,122,122,122,122,122], weekPrev: [125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125], monthCur: [125, 122, 120], monthPrev: [125, 125, 125] },
      ]
    },
    {
      customer: '联想集团_IT', dim: 'TN',
      weekCur: [140,140,140,140,140,138,118,115,120,120,120,120,120,120,120,120,120,120,120], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140],
      monthCur: [140, 118, 115], monthPrev: [140, 140, 140],
      models: [
        { name: 'Model Q', weekCur: [140,140,140,140,140,138,118,115,120,120,120,120,120,120,120,120,120,120,120], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [140, 118, 115], monthPrev: [140, 140, 140] },
      ]
    },
  ] : [
    {
      customer: '比亚迪集团_MC', dim: 'OLED 12.3寸',
      weekCur: [95,95,95,95,95,93,88,86,90,90,90,90,90,90,90,90,90,90,90], weekPrev: [90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90],
      monthCur: [90, 88, 86], monthPrev: [90, 90, 90],
      models: [
        { name: 'Model V', weekCur: [95,95,95,95,95,93,88,86,90,90,90,90,90,90,90,90,90,90,90], weekPrev: [90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90], monthCur: [90, 88, 86], monthPrev: [90, 90, 90] },
      ]
    },
    {
      customer: '蔚来集团_MC', dim: 'LCD 10.25寸',
      weekCur: [60,60,60,60,60,58,50,48,52,52,52,52,52,52,52,52,52,52,52], weekPrev: [60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60],
      monthCur: [60, 50, 48], monthPrev: [60, 60, 60],
      models: [
        { name: 'Model W', weekCur: [60,60,60,60,60,58,50,48,52,52,52,52,52,52,52,52,52,52,52], weekPrev: [60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60], monthCur: [60, 50, 48], monthPrev: [60, 60, 60] },
      ]
    },
  ];
  const MONTHLY_TH = 5;

  const allColumns = [
    { id: 'customer', label: '集团客户名称' },
    { id: 'dim', label: `${dimLabel} / Model` },
    { id: 'dataItem', label: '数据项' },
    ...NEAR_TERM_WEEK_COLUMNS.map(c => ({ id: c.key, label: c.label })),
    ...MONTHS.map(m => ({ id: m, label: m })),
  ];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumns);
    if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); }
    setVisibleColumns(next);
  };
  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedGroups(next);
  };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );

  const renderChange = (key: string, cur: number, prev: number, threshold: number, locked: boolean) => {
    const diff = cur - prev;
    const pct = prev === 0 ? 0 : Math.round((diff / prev) * 1000) / 10;
    const over = Math.abs(pct) >= threshold;
    const hi = locked || over;
    const bg = locked ? 'bg-amber-50' : over ? 'bg-red-50' : '';
    const fg = locked ? 'text-amber-600' : over ? 'text-red-600' : 'text-gray-900';
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${bg}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${fg}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${hi ? (locked ? 'text-amber-500' : 'text-red-500') : 'text-gray-400'}`}>
            {diff > 0 ? `+${diff}` : diff}{locked ? ' 锁定期' : ''}
          </span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          客户FCST变化识别
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置">
              <Settings size={16} />
            </button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据">
            <Download size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('dim') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[110px]">{dimLabel} / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && (
                <th key={col.key} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${col.label.startsWith('M') ? 'bg-blue-50 text-blue-700' : NEAR_TERM_LOCKED[i] ? 'bg-amber-50 text-amber-700' : 'bg-white text-gray-600'}`}>
                  <div>{col.label}</div>
                  {col.sub && <div className="text-[10px] font-normal opacity-70">{col.sub}</div>}
                </th>
              ))}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const gKey = `${group.customer}-${group.dim}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              const weekCurCols = expandWeeksToColumns(group.weekCur);
              const weekPrevCols = expandWeeksToColumns(group.weekPrev);
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('dim') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.dim}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本期FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wv-${i}`, weekCurCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mv-${i}`, group.monthCur[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">上期FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wp-${i}`, weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mp-${i}`, group.monthPrev[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">变化量 / 变化幅度</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`wc-${i}`, weekCurCols[i], weekPrevCols[i], MONTHLY_TH, col.label.startsWith('M') ? false : NEAR_TERM_LOCKED[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mc-${i}`, group.monthCur[i], group.monthPrev[i], MONTHLY_TH, false))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => {
                    const mWeekCurCols = expandWeeksToColumns(model.weekCur);
                    const mWeekPrevCols = expandWeeksToColumns(model.weekPrev);
                    return (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dim') && (
                          <td rowSpan={modelRows} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle">
                            <div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div>
                          </td>
                        )}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">本期FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwv-${i}`, mWeekCurCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmv-${i}`, model.monthCur[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">上期FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwp-${i}`, mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmp-${i}`, model.monthPrev[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">变化量 / 变化幅度</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`mwc-${i}`, mWeekCurCols[i], mWeekPrevCols[i], MONTHLY_TH, col.label.startsWith('M') ? false : NEAR_TERM_LOCKED[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mmc-${i}`, model.monthCur[i], model.monthPrev[i], MONTHLY_TH, false))}
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block"></span>锁定期（21-45天）内变更，固定触发预警</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>锁定期外：变化幅度≥±{MONTHLY_TH}% 高亮</span>
      </div>
    </div>
  );
};

// 销售FCST变化识别：客户+尺寸(TV) / 客户+技术别(IT/MC)
const SalesFcstChangeTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const dimLabel = isTVFamily ? '尺寸' : '技术别';
  const MONTHS = ['2612', '2701', '2702'];
  const CHANGE_TH = 10;

  const groupedData = isTVFamily ? [
    { customer: '小米集团_TV', dim: '55寸', weekCur: [400,400,400,400,400,405,395,380,390,390,390,390,390,390,390,390,390,390,390], weekPrev: [400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400], monthCur: [400, 395, 380], monthPrev: [400, 400, 400],
      models: [{ name: 'Model A', weekCur: [180,180,180,180,180,182,178,170,175,175,175,175,175,175,175,175,175,175,175], weekPrev: [180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180], monthCur: [180, 178, 170], monthPrev: [180, 180, 180] }] },
    { customer: '华为集团_TV', dim: '35寸', weekCur: [150,150,150,150,150,148,130,128,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [150, 130, 128], monthPrev: [150, 150, 150],
      models: [{ name: 'Model C', weekCur: [150,150,150,150,150,148,130,128,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [150, 130, 128], monthPrev: [150, 150, 150] }] },
  ] : [
    { customer: '华硕集团_IT', dim: 'IPS', weekCur: [250,250,250,250,250,252,240,235,242,242,242,242,242,242,242,242,242,242,242], weekPrev: [250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250], monthCur: [250, 240, 235], monthPrev: [250, 250, 250],
      models: [{ name: 'Model P', weekCur: [125,125,125,125,125,126,120,118,121,121,121,121,121,121,121,121,121,121,121], weekPrev: [125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125], monthCur: [125, 120, 118], monthPrev: [125, 125, 125] }] },
    { customer: '联想集团_IT', dim: 'TN', weekCur: [140,140,140,140,140,138,118,115,120,120,120,120,120,120,120,120,120,120,120], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [140, 118, 115], monthPrev: [140, 140, 140],
      models: [{ name: 'Model Q', weekCur: [140,140,140,140,140,138,118,115,120,120,120,120,120,120,120,120,120,120,120], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [140, 118, 115], monthPrev: [140, 140, 140] }] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'dim', label: `${dimLabel} / Model` }, { id: 'dataItem', label: '数据项' },
    ...NEAR_TERM_WEEK_COLUMNS.map(c => ({ id: c.key, label: c.label })), ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const toggleGroup = (key: string) => { const next = new Set(expandedGroups); next.has(key) ? next.delete(key) : next.add(key); setExpandedGroups(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderChange = (key: string, cur: number, prev: number, locked: boolean) => {
    const diff = cur - prev;
    const pct = prev === 0 ? 0 : Math.round((diff / prev) * 1000) / 10;
    const over = Math.abs(pct) >= CHANGE_TH;
    const bg = locked || over ? 'bg-red-50' : '';
    const fg = locked || over ? 'text-red-600' : 'text-gray-900';
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${bg}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${fg}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${locked || over ? 'text-red-500' : 'text-gray-400'}`}>{diff > 0 ? `+${diff}` : diff}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Activity size={18} className="text-blue-600" />销售FCST变化识别</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('dim') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[110px]">{dimLabel} / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && (
                <th key={col.key} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${col.label.startsWith('M') ? 'bg-blue-50 text-blue-700' : NEAR_TERM_LOCKED[i] ? 'bg-red-50 text-red-700' : 'bg-white text-gray-600'}`}>
                  <div>{col.label}</div>
                  {col.sub && <div className="text-[10px] font-normal opacity-70">{col.sub}</div>}
                </th>
              ))}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const gKey = `${group.customer}-${group.dim}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              const weekCurCols = expandWeeksToColumns(group.weekCur);
              const weekPrevCols = expandWeeksToColumns(group.weekPrev);
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('dim') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.dim}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本版销售FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wv-${i}`, weekCurCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mv-${i}`, group.monthCur[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">上版销售FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wp-${i}`, weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mp-${i}`, group.monthPrev[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">变化量 / 变化幅度</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`wc-${i}`, weekCurCols[i], weekPrevCols[i], col.label.startsWith('M') ? false : NEAR_TERM_LOCKED[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mc-${i}`, group.monthCur[i], group.monthPrev[i], false))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => {
                    const mWeekCurCols = expandWeeksToColumns(model.weekCur);
                    const mWeekPrevCols = expandWeeksToColumns(model.weekPrev);
                    return (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dim') && <td rowSpan={modelRows} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle"><div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div></td>}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">本版销售FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwv-${i}`, mWeekCurCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmv-${i}`, model.monthCur[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">上版销售FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwp-${i}`, mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmp-${i}`, model.monthPrev[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">变化量 / 变化幅度</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`mwc-${i}`, mWeekCurCols[i], mWeekPrevCols[i], col.label.startsWith('M') ? false : NEAR_TERM_LOCKED[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mmc-${i}`, model.monthCur[i], model.monthPrev[i], false))}
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>锁定期（21-45天）内变更，或锁定期外变化幅度≥±{CHANGE_TH}%，均高亮触发预警</span>
      </div>
    </div>
  );
};

// 销售FCST vs 客户FCST：客户+尺寸(TV) / 客户+技术别(IT/MC)
const SalesVsCustomerFcstTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const dimLabel = isTVFamily ? '尺寸' : '技术别';
  const MONTHS = ['2612', '2701', '2702'];
  const DEV_TH = 10;

  const groupedData = isTVFamily ? [
    { customer: '小米集团_TV', dim: '55寸', weekSales: [420,420,420,420,420,415,400,405,410,410,410,410,410,410,410,410,410,410,410], weekCust: [400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400], monthSales: [420, 400, 405], monthCust: [400, 400, 400],
      models: [{ name: 'Model A', weekSales: [190,190,190,190,190,188,180,182,185,185,185,185,185,185,185,185,185,185,185], weekCust: [180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180], monthSales: [190, 180, 182], monthCust: [180, 180, 180] }] },
    { customer: '华为集团_TV', dim: '35寸', weekSales: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekCust: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthSales: [130, 132, 130], monthCust: [150, 150, 150],
      models: [{ name: 'Model C', weekSales: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekCust: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthSales: [130, 132, 130], monthCust: [150, 150, 150] }] },
  ] : [
    { customer: '华硕集团_IT', dim: 'IPS', weekSales: [270,270,270,270,270,268,260,262,265,265,265,265,265,265,265,265,265,265,265], weekCust: [250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250], monthSales: [270, 260, 262], monthCust: [250, 250, 250],
      models: [{ name: 'Model P', weekSales: [135,135,135,135,135,134,130,131,132,132,132,132,132,132,132,132,132,132,132], weekCust: [125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125], monthSales: [135, 130, 131], monthCust: [125, 125, 125] }] },
    { customer: '联想集团_IT', dim: 'TN', weekSales: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekCust: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthSales: [118, 120, 118], monthCust: [140, 140, 140],
      models: [{ name: 'Model Q', weekSales: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekCust: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthSales: [118, 120, 118], monthCust: [140, 140, 140] }] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'dim', label: `${dimLabel} / Model` }, { id: 'dataItem', label: '数据项' },
    ...NEAR_TERM_WEEK_COLUMNS.map(c => ({ id: c.key, label: c.label })), ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const toggleGroup = (key: string) => { const next = new Set(expandedGroups); next.has(key) ? next.delete(key) : next.add(key); setExpandedGroups(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderDeviation = (key: string, sales: number, cust: number) => {
    const diff = sales - cust;
    const pct = cust === 0 ? 0 : Math.round((diff / cust) * 1000) / 10;
    const over = pct >= DEV_TH || pct <= -DEV_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{diff > 0 ? `+${diff}` : diff}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers size={18} className="text-blue-600" />销售FCST vs 客户FCST</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('dim') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[110px]">{dimLabel} / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && (
                <th key={col.key} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${col.label.startsWith('M') ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-600'}`}>
                  <div>{col.label}</div>
                  {col.sub && <div className="text-[10px] font-normal opacity-70">{col.sub}</div>}
                </th>
              ))}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const gKey = `${group.customer}-${group.dim}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              const weekSalesCols = expandWeeksToColumns(group.weekSales);
              const weekCustCols = expandWeeksToColumns(group.weekCust);
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('dim') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.dim}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">销售FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`sw-${i}`, weekSalesCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`sm-${i}`, group.monthSales[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">客户FCST</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`cw-${i}`, weekCustCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`cm-${i}`, group.monthCust[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">差异量 / 差异比例</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderDeviation(`dw-${i}`, weekSalesCols[i], weekCustCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderDeviation(`dm-${i}`, group.monthSales[i], group.monthCust[i]))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => {
                    const mWeekSalesCols = expandWeeksToColumns(model.weekSales);
                    const mWeekCustCols = expandWeeksToColumns(model.weekCust);
                    return (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dim') && <td rowSpan={modelRows} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle"><div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div></td>}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">销售FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`msw-${i}`, mWeekSalesCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`msm-${i}`, model.monthSales[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">客户FCST</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mcw-${i}`, mWeekCustCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mcm-${i}`, model.monthCust[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">差异量 / 差异比例</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderDeviation(`mdw-${i}`, mWeekSalesCols[i], mWeekCustCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderDeviation(`mdm-${i}`, model.monthSales[i], model.monthCust[i]))}
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        差异比例 ≥ +{DEV_TH}% 或 ≤ -{DEV_TH}% 高亮预警
      </div>
    </div>
  );
};

// 需求供应对比：客户+尺寸(TV) / 客户+技术别(IT/MC)；供应口径 TV/IT=Supply/Allocation，MC=Supply
const SupplyDemandCompareTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const isITFamily = buType === 'MNT' || buType === 'NB';
  const dimLabel = isTVFamily ? '尺寸' : '技术别';
  const supplyLabel = (isTVFamily || isITFamily) ? 'Supply/Allocation' : 'Supply';
  const MONTHS = ['2608', '2609', '2610'];
  const DEV_TH = 10;

  const groupedData = isTVFamily ? [
    { customer: '小米集团_TV', dim: '55寸', cust: [400, 410, 420], supply: [400, 400, 400],
      models: [{ name: 'Model A', cust: [180, 185, 190], supply: [180, 180, 180] }] },
    { customer: '华为集团_TV', dim: '35寸', cust: [150, 130, 128], supply: [150, 150, 150],
      models: [{ name: 'Model C', cust: [150, 130, 128], supply: [150, 150, 150] }] },
  ] : isITFamily ? [
    { customer: '华硕集团_IT', dim: 'IPS', cust: [250, 245, 260], supply: [250, 250, 250],
      models: [{ name: 'Model P', cust: [125, 122, 130], supply: [125, 125, 125] }] },
    { customer: '联想集团_IT', dim: 'TN', cust: [140, 118, 115], supply: [140, 140, 140],
      models: [{ name: 'Model Q', cust: [140, 118, 115], supply: [140, 140, 140] }] },
  ] : [
    { customer: '比亚迪集团_MC', dim: 'OLED', cust: [90, 88, 96], supply: [90, 90, 90],
      models: [{ name: 'Model V', cust: [90, 88, 96], supply: [90, 90, 90] }] },
    { customer: '蔚来集团_MC', dim: 'LCD', cust: [60, 50, 48], supply: [60, 60, 60],
      models: [{ name: 'Model W', cust: [60, 50, 48], supply: [60, 60, 60] }] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'dim', label: `${dimLabel} / Model` }, { id: 'dataItem', label: '数据项' }, ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const toggleGroup = (key: string) => { const next = new Set(expandedGroups); next.has(key) ? next.delete(key) : next.add(key); setExpandedGroups(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderDeviation = (key: string, cust: number, supply: number) => {
    const diff = cust - supply;
    const pct = supply === 0 ? 0 : Math.round((diff / supply) * 1000) / 10;
    const over = Math.abs(pct) >= DEV_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{diff > 0 ? `+${diff}` : diff}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Target size={18} className="text-blue-600" />需求供应对比</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('dim') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[110px]">{dimLabel} / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const gKey = `${group.customer}-${group.dim}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('dim') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.dim}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">客户FCST</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`c-${i}`, group.cust[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">{supplyLabel}</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`s-${i}`, group.supply[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">偏差量 / 偏差比例</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderDeviation(`d-${i}`, group.cust[i], group.supply[i]))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dim') && <td rowSpan={3} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle"><div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div></td>}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">客户FCST</td>}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mc-${i}`, model.cust[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">{supplyLabel}</td>}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`ms-${i}`, model.supply[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">偏差量 / 偏差比例</td>}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderDeviation(`md-${i}`, model.cust[i], model.supply[i]))}
                      </tr>
                    </React.Fragment>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        偏差比例 ≥ ±{DEV_TH}% 高亮预警
      </div>
    </div>
  );
};

// 本版DP VS 上版DP：客户+面板厂+尺寸(TV) / 客户+面板厂+技术别+尺寸(IT/MC)——面板厂+尺寸(技术别)合并展示在第二列
const DpVsDpTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };
  const MONTHS = ['2612', '2701', '2702'];
  const CHANGE_TH = 10;

  const groupedData = isTVFamily ? [
    { customer: '小米集团_TV', panel: '京东方', size: '55寸', weekCur: [420,420,420,420,420,415,400,405,410,410,410,410,410,410,410,410,410,410,410], weekPrev: [400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400], monthCur: [420, 400, 405], monthPrev: [400, 400, 400],
      models: [{ name: 'Model A', weekCur: [190,190,190,190,190,188,180,182,185,185,185,185,185,185,185,185,185,185,185], weekPrev: [180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180], monthCur: [190, 180, 182], monthPrev: [180, 180, 180] }] },
    { customer: '华为集团_TV', panel: 'TCL华星', size: '35寸', weekCur: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [130, 132, 130], monthPrev: [150, 150, 150],
      models: [{ name: 'Model C', weekCur: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [130, 132, 130], monthPrev: [150, 150, 150] }] },
  ] : [
    { customer: '华硕集团_IT', panel: '京东方', tech: 'IPS', size: '15.6"', weekCur: [270,270,270,270,270,268,260,262,265,265,265,265,265,265,265,265,265,265,265], weekPrev: [250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250], monthCur: [270, 260, 262], monthPrev: [250, 250, 250],
      models: [{ name: 'Model P', weekCur: [135,135,135,135,135,134,130,131,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125], monthCur: [135, 130, 131], monthPrev: [125, 125, 125] }] },
    { customer: '联想集团_IT', panel: 'TCL华星', tech: 'TN', size: '14"', weekCur: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [118, 120, 118], monthPrev: [140, 140, 140],
      models: [{ name: 'Model Q', weekCur: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [118, 120, 118], monthPrev: [140, 140, 140] }] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'panel', label: '面板厂' },
    ...(!isTVFamily ? [{ id: 'tech', label: '技术别' }] : []),
    { id: 'size', label: '尺寸 / Model' }, { id: 'dataItem', label: '数据项' },
    ...NEAR_TERM_WEEK_COLUMNS.map(c => ({ id: c.key, label: c.label })), ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const toggleGroup = (key: string) => { const next = new Set(expandedGroups); next.has(key) ? next.delete(key) : next.add(key); setExpandedGroups(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderChange = (key: string, cur: number, prev: number) => {
    const diff = cur - prev;
    const pct = prev === 0 ? 0 : Math.round((diff / prev) * 1000) / 10;
    const over = Math.abs(pct) >= CHANGE_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{diff > 0 ? `+${diff}` : diff}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers size={18} className="text-blue-600" />本版DP VS 上版DP</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">面板厂</th>}
              {!isTVFamily && visibleColumns.has('tech') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">技术别</th>}
              {visibleColumns.has('size') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">尺寸 / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && (
                <th key={col.key} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${col.label.startsWith('M') ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-600'}`}>
                  <div>{col.label}</div>
                  {col.sub && <div className="text-[10px] font-normal opacity-70">{col.sub}</div>}
                </th>
              ))}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group: any, gIdx) => {
              const gKey = `${group.customer}-${group.panel}-${group.size}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              const fullRowSpan = groupRows + (isExpanded ? group.models.length * modelRows : 0);
              const weekCurCols = expandWeeksToColumns(group.weekCur);
              const weekPrevCols = expandWeeksToColumns(group.weekPrev);
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={fullRowSpan} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('panel') && <td rowSpan={fullRowSpan} className="border border-gray-200 p-2 text-center font-medium text-gray-700 align-middle">{PANEL_CODE[group.panel] ?? group.panel}</td>}
                    {!isTVFamily && visibleColumns.has('tech') && <td rowSpan={fullRowSpan} className="border border-gray-200 p-2 text-center font-medium text-gray-700 align-middle">{group.tech}</td>}
                    {visibleColumns.has('size') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.size}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本版DP</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wv-${i}`, weekCurCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mv-${i}`, group.monthCur[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">上版DP</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wp-${i}`, weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mp-${i}`, group.monthPrev[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">变化量 / 变化率</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`wc-${i}`, weekCurCols[i], weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mc-${i}`, group.monthCur[i], group.monthPrev[i]))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => {
                    const mWeekCurCols = expandWeeksToColumns(model.weekCur);
                    const mWeekPrevCols = expandWeeksToColumns(model.weekPrev);
                    return (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('size') && <td rowSpan={modelRows} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle"><div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div></td>}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">本版DP</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwv-${i}`, mWeekCurCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmv-${i}`, model.monthCur[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">上版DP</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwp-${i}`, mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmp-${i}`, model.monthPrev[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">变化量 / 变化率</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`mwc-${i}`, mWeekCurCols[i], mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mmc-${i}`, model.monthCur[i], model.monthPrev[i]))}
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        变化率 ≥ ±{CHANGE_TH}% 高亮预警
      </div>
    </div>
  );
};

// 本版DP VS Supply/Allocation：TV=面板厂+尺寸，IT=面板厂+技术别，MC=面板厂+尺寸(仅Supply)
const DpVsSupplyTable = ({ buType }: { buType: AnomalyBU }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const isITFamily = buType === 'MNT' || buType === 'NB';
  const sizeLabel = isTVFamily ? '尺寸' : '技术别';
  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };
  const supplyLabel = (isTVFamily || isITFamily) ? '上版Supply/Allocation' : '上版Supply';
  const MONTHS = ['2612', '2701', '2702'];
  const CHANGE_TH = 10;

  const groupedData = isTVFamily ? [
    { customer: '小米集团_TV', panel: '京东方', size: '55寸', weekCur: [420,420,420,420,420,415,400,405,410,410,410,410,410,410,410,410,410,410,410], weekPrev: [400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400,400], monthCur: [420, 400, 405], monthPrev: [400, 400, 400],
      models: [{ name: 'Model A', weekCur: [190,190,190,190,190,188,180,182,185,185,185,185,185,185,185,185,185,185,185], weekPrev: [180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180,180], monthCur: [190, 180, 182], monthPrev: [180, 180, 180] }] },
    { customer: '华为集团_TV', panel: 'TCL华星', size: '35寸', weekCur: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [130, 132, 130], monthPrev: [150, 150, 150],
      models: [{ name: 'Model C', weekCur: [130,130,130,130,130,128,132,130,128,128,128,128,128,128,128,128,128,128,128], weekPrev: [150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150], monthCur: [130, 132, 130], monthPrev: [150, 150, 150] }] },
  ] : isITFamily ? [
    { customer: '华硕集团_IT', panel: '京东方', size: 'IPS', weekCur: [270,270,270,270,270,268,260,262,265,265,265,265,265,265,265,265,265,265,265], weekPrev: [250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250,250], monthCur: [270, 260, 262], monthPrev: [250, 250, 250],
      models: [{ name: 'Model P', weekCur: [135,135,135,135,135,134,130,131,132,132,132,132,132,132,132,132,132,132,132], weekPrev: [125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125,125], monthCur: [135, 130, 131], monthPrev: [125, 125, 125] }] },
    { customer: '联想集团_IT', panel: 'TCL华星', size: 'TN', weekCur: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [118, 120, 118], monthPrev: [140, 140, 140],
      models: [{ name: 'Model Q', weekCur: [118,118,118,118,118,116,120,118,116,116,116,116,116,116,116,116,116,116,116], weekPrev: [140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140,140], monthCur: [118, 120, 118], monthPrev: [140, 140, 140] }] },
  ] : [
    { customer: '比亚迪集团_MC', panel: '京东方', size: 'OLED', weekCur: [95,95,95,95,95,93,88,90,92,92,92,92,92,92,92,92,92,92,92], weekPrev: [90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90], monthCur: [95, 88, 90], monthPrev: [90, 90, 90],
      models: [{ name: 'Model V', weekCur: [95,95,95,95,95,93,88,90,92,92,92,92,92,92,92,92,92,92,92], weekPrev: [90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90,90], monthCur: [95, 88, 90], monthPrev: [90, 90, 90] }] },
    { customer: '蔚来集团_MC', panel: 'TCL华星', size: 'LCD', weekCur: [50,50,50,50,50,48,52,50,48,48,48,48,48,48,48,48,48,48,48], weekPrev: [60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60], monthCur: [50, 52, 50], monthPrev: [60, 60, 60],
      models: [{ name: 'Model W', weekCur: [50,50,50,50,50,48,52,50,48,48,48,48,48,48,48,48,48,48,48], weekPrev: [60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60], monthCur: [50, 52, 50], monthPrev: [60, 60, 60] }] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'panel', label: '面板厂' }, { id: 'size', label: `${sizeLabel} / Model` }, { id: 'dataItem', label: '数据项' },
    ...NEAR_TERM_WEEK_COLUMNS.map(c => ({ id: c.key, label: c.label })), ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const toggleGroup = (key: string) => { const next = new Set(expandedGroups); next.has(key) ? next.delete(key) : next.add(key); setExpandedGroups(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderChange = (key: string, cur: number, prev: number) => {
    const diff = cur - prev;
    const pct = prev === 0 ? 0 : Math.round((diff / prev) * 1000) / 10;
    const over = Math.abs(pct) >= CHANGE_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{diff > 0 ? `+${diff}` : diff}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers size={18} className="text-blue-600" />本版DP VS Supply/Allocation</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">面板厂</th>}
              {visibleColumns.has('size') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">{sizeLabel} / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && (
                <th key={col.key} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${col.label.startsWith('M') ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-600'}`}>
                  <div>{col.label}</div>
                  {col.sub && <div className="text-[10px] font-normal opacity-70">{col.sub}</div>}
                </th>
              ))}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const gKey = `${group.customer}-${group.panel}-${group.size}`;
              const isExpanded = expandedGroups.has(gKey);
              const groupRows = 3, modelRows = 3;
              const weekCurCols = expandWeeksToColumns(group.weekCur);
              const weekPrevCols = expandWeeksToColumns(group.weekPrev);
              return (
                <React.Fragment key={gIdx}>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('panel') && <td rowSpan={groupRows + (isExpanded ? group.models.length * modelRows : 0)} className="border border-gray-200 p-2 text-center font-medium text-gray-700 align-middle">{PANEL_CODE[group.panel] ?? group.panel}</td>}
                    {visibleColumns.has('size') && (
                      <td rowSpan={groupRows} className="border border-gray-200 p-2 align-middle">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.size}</span>
                          <button onClick={() => toggleGroup(gKey)} className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600">{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本版DP</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wv-${i}`, weekCurCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mv-${i}`, group.monthCur[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">{supplyLabel}</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`wp-${i}`, weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mp-${i}`, group.monthPrev[i]))}
                  </tr>
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">变化量 / 变化率</td>}
                    {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`wc-${i}`, weekCurCols[i], weekPrevCols[i]))}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mc-${i}`, group.monthCur[i], group.monthPrev[i]))}
                  </tr>
                  {isExpanded && group.models.map((model, mIdx) => {
                    const mWeekCurCols = expandWeeksToColumns(model.weekCur);
                    const mWeekPrevCols = expandWeeksToColumns(model.weekPrev);
                    return (
                    <React.Fragment key={mIdx}>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('size') && <td rowSpan={modelRows} className="border border-gray-200 p-2 text-blue-600 font-medium pl-6 align-middle"><div className="flex items-center gap-1"><ChevronRight size={10} className="text-gray-300" />{model.name}</div></td>}
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">本版DP</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwv-${i}`, mWeekCurCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmv-${i}`, model.monthCur[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-400">{supplyLabel}</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderValue(`mwp-${i}`, mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`mmp-${i}`, model.monthPrev[i]))}
                      </tr>
                      <tr className="bg-white hover:bg-gray-50 transition-colors">
                        {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">变化量 / 变化率</td>}
                        {NEAR_TERM_WEEK_COLUMNS.map((col, i) => visibleColumns.has(col.key) && renderChange(`mwc-${i}`, mWeekCurCols[i], mWeekPrevCols[i]))}
                        {MONTHS.map((m, i) => visibleColumns.has(m) && renderChange(`mmc-${i}`, model.monthCur[i], model.monthPrev[i]))}
                      </tr>
                    </React.Fragment>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        变化率 ≥ ±{CHANGE_TH}% 高亮预警
      </div>
    </div>
  );
};

// 策分偏差分析：仅TV，客户+面板厂+尺寸，季度轴(26Q3/26Q4/27Q1)
const StrategyDeviationTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const QUARTERS = ['26Q3', '26Q4', '27Q1'];
  const LOWER_TH = 90;
  const UPPER_TH = 110;
  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };

  const groupedData = [
    { customer: '小米集团_TV', panel: '京东方', size: '55寸', sales: [1150, 1200, 1180], strategy: [1200, 1200, 1200] },
    { customer: '小米集团_TV', panel: 'TCL华星', size: '65寸', sales: [900, 1000, 950], strategy: [1000, 1000, 1000] },
    { customer: '华为集团_TV', panel: '京东方', size: '35寸', sales: [780, 700, 720], strategy: [700, 700, 700] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'panel', label: '面板厂' }, { id: 'size', label: '尺寸' }, { id: 'dataItem', label: '数据项' },
    ...QUARTERS.map(q => ({ id: q, label: q }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderRate = (key: string, sales: number, strategy: number) => {
    const rate = strategy === 0 ? 100 : Math.round((sales / strategy) * 100);
    const gap = sales - strategy;
    const over = rate <= LOWER_TH || rate >= UPPER_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{rate}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{gap > 0 ? `+${gap}` : gap}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Target size={18} className="text-blue-600" />策分偏差分析</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">面板厂</th>}
              {visibleColumns.has('size') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">尺寸</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {QUARTERS.map(q => visibleColumns.has(q) && <th key={q} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-blue-50 text-blue-700">{q}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('customer') && <td rowSpan={3} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                  {visibleColumns.has('panel') && <td rowSpan={3} className="border border-gray-200 p-2 text-center align-middle font-bold text-gray-700">{PANEL_CODE[group.panel] ?? group.panel}</td>}
                  {visibleColumns.has('size') && <td rowSpan={3} className="border border-gray-200 p-2 text-center align-middle font-bold text-gray-700">{group.size}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">销售FCST总量</td>}
                  {QUARTERS.map((q, i) => visibleColumns.has(q) && renderValue(`s-${i}`, group.sales[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">策分量</td>}
                  {QUARTERS.map((q, i) => visibleColumns.has(q) && renderValue(`t-${i}`, group.strategy[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">偏差量 / 策分执行率</td>}
                  {QUARTERS.map((q, i) => visibleColumns.has(q) && renderRate(`r-${i}`, group.sales[i], group.strategy[i]))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        策分执行率 ≤{LOWER_TH}%（达成不足）或 ≥{UPPER_TH}%（超卖风险）高亮预警
      </div>
    </div>
  );
};

// 重点产品达成分析：客户+产品类别，当年(2026)月度+半年小计+全年小计
const KeyProductAchievementTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [monthsCollapsed, setMonthsCollapsed] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const isITFamily = buType === 'MNT' || buType === 'NB';
  const MONTHS = ['2601', '2602', '2603', '2604', '2605', '2606', '2607', '2608', '2609', '2610', '2611', '2612'];
  const RATE_TH = 90;

  const periodHeaders: { label: string; isMonth: boolean; monthIndexes: number[] }[] = [];
  MONTHS.forEach((m, i) => {
    periodHeaders.push({ label: m, isMonth: true, monthIndexes: [i] });
    if (i === 5) periodHeaders.push({ label: 'H1小计', isMonth: false, monthIndexes: [0, 1, 2, 3, 4, 5] });
    if (i === 11) {
      periodHeaders.push({ label: 'H2小计', isMonth: false, monthIndexes: [6, 7, 8, 9, 10, 11] });
      periodHeaders.push({ label: '全年小计', isMonth: false, monthIndexes: MONTHS.map((_, idx) => idx) });
    }
  });
  const sumByIndexes = (arr: number[], indexes: number[]) => indexes.reduce((s, i) => s + arr[i], 0);

  // TV/CID：98寸重点产品，达成率有4种算法口径（出货/营收 × FCST/DP），KPI为统一分母
  const tvGroupedData = [
    { customer: '小米集团_TV', category: '98"',
      kpi: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
      shipFcst: [95, 96, 94, 98, 97, 99, 100, 101, 102, 100, 98, 97],
      shipDp: [92, 90, 88, 93, 95, 94, 96, 97, 95, 94, 92, 90],
      revFcst: [98, 97, 96, 99, 100, 101, 102, 103, 104, 102, 100, 99],
      revDp: [85, 83, 80, 86, 88, 87, 89, 90, 88, 86, 84, 82] },
    { customer: '华为集团_TV', category: '98"',
      kpi: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
      shipFcst: [88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 77],
      shipDp: [85, 84, 83, 82, 81, 80, 79, 78, 77, 76, 75, 74],
      revFcst: [92, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80],
      revDp: [80, 78, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67] },
  ];

  // 2608之后为未来月份，实际口径为"YTD达成+未来预测"合并后的单行月度值
  const CUTOFF_IDX = MONTHS.indexOf('2608');
  const groupedData = isITFamily
    ? [
        { customer: '华硕集团_IT', category: '重点产品', actual: [80, 82, 78, 85, 88, 90, 92, 95, 96, 94, 90, 88], annualTarget: 1100 },
        { customer: '联想集团_IT', category: '重点产品', actual: [60, 58, 62, 65, 63, 60, 58, 55, 54, 52, 50, 48], annualTarget: 850 },
      ]
    : [
        { customer: '比亚迪集团_MC', category: '重点产品', actual: [80, 82, 78, 85, 88, 90, 92, 95, 96, 94, 90, 88], annualTarget: 1100 },
        { customer: '蔚来集团_MC', category: '重点产品', actual: [60, 58, 62, 65, 63, 60, 58, 55, 54, 52, 50, 48], annualTarget: 850 },
      ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'category', label: '产品类别' }, { id: 'dataItem', label: '数据项' },
    ...periodHeaders.map(h => ({ id: h.label, label: h.label }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const visiblePeriodIndexes = periodHeaders.map((h, i) => ({ h, i })).filter(({ h }) => (!monthsCollapsed || !h.isMonth) && visibleColumns.has(h.label));

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderRate = (key: string, actualSum: number, targetSum: number) => {
    const rate = targetSum === 0 ? 100 : Math.round((actualSum / targetSum) * 100);
    const gap = actualSum - targetSum;
    const over = rate <= RATE_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{rate}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{gap > 0 ? `+${gap}` : gap}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Crown size={18} className="text-blue-600" />重点产品达成分析</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
          <button onClick={() => setMonthsCollapsed(!monthsCollapsed)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1">
            {monthsCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
            {monthsCollapsed ? '展开月度' : '仅看半年/全年'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('category') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[120px]">产品类别</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">数据项</th>}
              {visiblePeriodIndexes.map(({ h, i }) => (
                <th key={i} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${h.isMonth ? 'bg-white text-gray-600' : 'bg-blue-50 text-blue-700'}`}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isTVFamily ? tvGroupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('customer') && <td rowSpan={9} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                  {visibleColumns.has('category') && <td rowSpan={9} className="border border-gray-200 p-2 align-middle font-bold text-gray-700">{group.category}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">KPI</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`kpi-${i}`, sumByIndexes(group.kpi, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">出货+FCST</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`sf-${i}`, sumByIndexes(group.shipFcst, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">出货+DP</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`sd-${i}`, sumByIndexes(group.shipDp, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">营收+FCST</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`rf-${i}`, sumByIndexes(group.revFcst, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">营收+DP</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`rd-${i}`, sumByIndexes(group.revDp, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率(出货+FCST)</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRate(`rsf-${i}`, sumByIndexes(group.shipFcst, h.monthIndexes), sumByIndexes(group.kpi, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率(出货+DP)</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRate(`rsd-${i}`, sumByIndexes(group.shipDp, h.monthIndexes), sumByIndexes(group.kpi, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率(营收+FCST)</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRate(`rrf-${i}`, sumByIndexes(group.revFcst, h.monthIndexes), sumByIndexes(group.kpi, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率(营收+DP)</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRate(`rrd-${i}`, sumByIndexes(group.revDp, h.monthIndexes), sumByIndexes(group.kpi, h.monthIndexes)))}
                </tr>
              </React.Fragment>
            )) : groupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('customer') && <td rowSpan={4} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                  {visibleColumns.has('category') && <td rowSpan={4} className="border border-gray-200 p-2 align-middle font-bold text-gray-700">{group.category}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">YTD达成</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`a-${i}`, sumByIndexes(group.actual, h.monthIndexes.filter(idx => idx < CUTOFF_IDX))))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">M+6预测</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`af-${i}`, sumByIndexes(group.actual, h.monthIndexes.filter(idx => idx >= CUTOFF_IDX))))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">年度目标（按比例折算）</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`t-${i}`, Math.round(group.annualTarget * h.monthIndexes.length / 12)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">缺口 / 达成率</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderRate(`r-${i}`, sumByIndexes(group.actual, h.monthIndexes), Math.round(group.annualTarget * h.monthIndexes.length / 12)))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        达成率 ≤{RATE_TH}% 高亮预警
      </div>
    </div>
  );
};

// 本版DP VS 供应BP/RP：面板厂大板总量，M+6月度(2608-2702)，无季度
const DpVsBprpTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const MONTHS = ['2608', '2609', '2610', '2611', '2612', '2701', '2702'];
  const DEV_TH = 5;
  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };

  const groupedData = [
    { panel: '京东方', demand: [4200, 4300, 4250, 4100, 4150, 4200, 4180], bprp: [4300, 4300, 4300, 4300, 4300, 4300, 4300] },
    { panel: 'TCL华星', demand: [3600, 3550, 3700, 3650, 3600, 3600, 3620], bprp: [3600, 3600, 3600, 3600, 3600, 3600, 3600] },
    { panel: '惠科', demand: [1800, 1750, 1900, 1850, 1800, 1780, 1800], bprp: [1800, 1800, 1800, 1800, 1800, 1800, 1800] },
  ];

  const allColumns = [{ id: 'panel', label: '面板厂' }, { id: 'dataItem', label: '数据项' }, ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderDeviation = (key: string, demand: number, bprp: number) => {
    const gap = demand - bprp;
    const pct = bprp === 0 ? 0 : Math.round((gap / bprp) * 1000) / 10;
    const over = Math.abs(pct) >= DEV_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{gap > 0 ? `+${gap}` : gap}</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers size={18} className="text-blue-600" />本版DP VS 供应BP/RP</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[100px]">面板厂</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">数据项</th>}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('panel') && <td rowSpan={3} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{PANEL_CODE[group.panel] ?? group.panel}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">大板需求总量</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`d-${i}`, group.demand[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">供应计划BP/RP</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`b-${i}`, group.bprp[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">大板GAP / 偏差率</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderDeviation(`g-${i}`, group.demand[i], group.bprp[i]))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        偏差率 ≥ ±{DEV_TH}% 高亮预警
      </div>
    </div>
  );
};

// 市场份额分析：客户+技术别，M+3月度(2608-2610)
const MarketShareTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const MONTHS = ['2608', '2609', '2610'];
  const RATE_TH = 80;
  const techLabel = '技术别';

  const groupedData = [
    { customer: '苹果集团_MC', tech: 'LTPS', target: [18, 18, 18], actual: [16.5, 15.8, 14.2] },
    { customer: '三星集团_MC', tech: 'OLED', target: [12, 12, 12], actual: [11.8, 11.5, 11.9] },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'tech', label: techLabel }, { id: 'dataItem', label: '数据项' }, ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };

  const renderPct = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}%</td>
  );
  const renderRate = (key: string, actual: number, target: number) => {
    const rate = target === 0 ? 100 : Math.round((actual / target) * 100);
    const gap = Math.round((actual - target) * 10) / 10;
    const over = rate <= RATE_TH;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{rate}%</span>
          <span className={`text-[10px] font-bold ${over ? 'text-red-500' : 'text-gray-400'}`}>{gap > 0 ? `+${gap}` : gap}pt</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Activity size={18} className="text-blue-600" />市场份额分析</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('tech') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">{techLabel}</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">数据项</th>}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('customer') && <td rowSpan={3} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                  {visibleColumns.has('tech') && <td rowSpan={3} className="border border-gray-200 p-2 align-middle font-bold text-gray-700">{group.tech}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">市场份额目标</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderPct(`t-${i}`, group.target[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">推算本版市场份额</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderPct(`a-${i}`, group.actual[i]))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">达成率</td>}
                  {MONTHS.map((m, i) => visibleColumns.has(m) && renderRate(`r-${i}`, group.actual[i], group.target[i]))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        达成率 ≤{RATE_TH}% 高亮预警
      </div>
    </div>
  );
};

// 出货形态分析：仅MNT/NB/车载，出货形态(OC/LCM/TPM)单维度，当年月度+半年+全年
const ShipmentFormTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [monthsCollapsed, setMonthsCollapsed] = useState(false);
  const MONTHS = ['2601', '2602', '2603', '2604', '2605', '2606', '2607', '2608', '2609', '2610', '2611', '2612'];

  const periodHeaders: { label: string; isMonth: boolean; monthIndexes: number[] }[] = [];
  MONTHS.forEach((m, i) => {
    periodHeaders.push({ label: m, isMonth: true, monthIndexes: [i] });
    if (i === 5) periodHeaders.push({ label: 'H1小计', isMonth: false, monthIndexes: [0, 1, 2, 3, 4, 5] });
    if (i === 11) {
      periodHeaders.push({ label: 'H2小计', isMonth: false, monthIndexes: [6, 7, 8, 9, 10, 11] });
      periodHeaders.push({ label: '全年小计', isMonth: false, monthIndexes: MONTHS.map((_, idx) => idx) });
    }
  });
  const sumByIndexes = (arr: number[], indexes: number[]) => indexes.reduce((s, i) => s + arr[i], 0);

  const forms = [
    { form: 'OC', shipment: [180, 175, 190, 185, 180, 178, 182, 188, 190, 186, 182, 180], targetPct: 40 },
    { form: 'LCM', shipment: [160, 158, 150, 155, 160, 162, 158, 150, 148, 152, 155, 158], targetPct: 35 },
    { form: 'TPM', shipment: [100, 98, 105, 102, 100, 95, 90, 88, 85, 84, 82, 80], targetPct: 25 },
  ];
  const bprpTotal = [440, 431, 445, 442, 440, 435, 430, 426, 423, 422, 419, 418]; // BP/RP总出货量（占比计算分母）
  const CUTOFF_IDX = MONTHS.indexOf('2608');

  const allColumns = [{ id: 'form', label: '出货形态' }, { id: 'dataItem', label: '数据项' }, ...periodHeaders.map(h => ({ id: h.label, label: h.label }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const visiblePeriodIndexes = periodHeaders.map((h, i) => ({ h, i })).filter(({ h }) => (!monthsCollapsed || !h.isMonth) && visibleColumns.has(h.label));

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const renderPctCell = (key: string, shipSum: number, totalSum: number, targetPct: number) => {
    const pct = totalSum === 0 ? 0 : Math.round((shipSum / totalSum) * 1000) / 10;
    const over = pct < targetPct;
    return (
      <td key={key} className={`border border-gray-200 p-2 text-center ${over ? 'bg-red-50' : ''}`}>
        <div className="flex flex-col items-center justify-center">
          <span className={`font-bold ${over ? 'text-red-600' : 'text-gray-900'}`}>{pct}%</span>
        </div>
      </td>
    );
  };

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Tag size={18} className="text-blue-600" />出货形态分析</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
          <button onClick={() => setMonthsCollapsed(!monthsCollapsed)} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1">
            {monthsCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
            {monthsCollapsed ? '展开月度' : '仅看半年/全年'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('form') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">出货形态</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">数据项</th>}
              {visiblePeriodIndexes.map(({ h, i }) => (
                <th key={i} className={`border border-gray-200 p-1 font-bold min-w-[70px] ${h.isMonth ? 'bg-white text-gray-600' : 'bg-blue-50 text-blue-700'}`}>{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {forms.map((f, gIdx) => (
              <React.Fragment key={gIdx}>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('form') && <td rowSpan={4} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{f.form}</td>}
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">YTD量</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`s-${i}`, sumByIndexes(f.shipment, h.monthIndexes.filter(idx => idx < CUTOFF_IDX))))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">M+6预测</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`sf-${i}`, sumByIndexes(f.shipment, h.monthIndexes.filter(idx => idx >= CUTOFF_IDX))))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">BP/RP总量</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderValue(`bp-${i}`, sumByIndexes(bprpTotal, h.monthIndexes)))}
                </tr>
                <tr className="hover:bg-gray-50 transition-colors">
                  {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700">占比 vs BP/RP总量</td>}
                  {visiblePeriodIndexes.map(({ h, i }) => renderPctCell(`p-${i}`, sumByIndexes(f.shipment, h.monthIndexes), sumByIndexes(bprpTotal, h.monthIndexes), f.targetPct))}
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        各形态占比低于目标占比（OC&gt;40% / LCM&gt;35% / TPM&gt;25%）高亮预警
      </div>
    </div>
  );
};

// 物料授权情况检查：仅MC/车载，客户+Model，M+6月度(2608-2702)，逐月累加FCST，超授权后持续标红
const MaterialAuthTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const MONTHS = ['2608', '2609', '2610', '2611', '2612', '2701', '2702'];
  const fmt = (n: number) => n.toLocaleString();

  const materialsTemplate = [
    { name: 'Panel', authorized: 2800, shipped: 300 },
    { name: 'IC', authorized: 3100, shipped: 300 },
    { name: 'BTB连接器', authorized: 3100, shipped: 300 },
    { name: '背光成品', authorized: 1200, shipped: 300 },
    { name: 'CG成品', authorized: 1500, shipped: 300 },
    { name: 'FPC成品', authorized: 2500, shipped: 300 },
    { name: 'OCA成品', authorized: 600, shipped: 300 },
    { name: 'POL成品', authorized: 5600, shipped: 300 },
    { name: '模组成品', authorized: 1100, shipped: 300 },
  ];

  const groupedData = [
    { customer: '比亚迪集团_MC', model: 'ModelA', fcst: [100, 120, 150, 130, 140, 160, 150], materials: materialsTemplate },
    { customer: '蔚来集团_MC', model: 'ModelB', fcst: [60, 65, 70, 60, 55, 60, 65], materials: materialsTemplate.map(m => ({ ...m, authorized: Math.round(m.authorized * 0.6) })) },
  ];

  const allColumns = [{ id: 'customer', label: '集团客户名称' }, { id: 'model', label: 'Model' }, { id: 'item', label: '物料名称 / 数据项' }, { id: 'authorized', label: '汇总授权量' }, { id: 'shipped', label: '已出货量' }, ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };
  const visibleMonths = MONTHS.filter(m => visibleColumns.has(m));

  const renderPlainCell = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center font-medium text-gray-900">{fmt(val)}</td>
  );

  const renderRemainCell = (key: string, val: number) => (
    <td key={key} className={`border border-gray-200 p-2 text-center font-bold ${val < 0 ? 'bg-red-50 text-red-600' : 'text-gray-900'}`}>
      {val >= 0 ? `+${fmt(val)}` : fmt(val)}
    </td>
  );

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><AlertCircle size={18} className="text-blue-600" />物料授权情况检查</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th rowSpan={2} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('model') && <th rowSpan={2} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[90px]">Model</th>}
              {visibleColumns.has('item') && <th rowSpan={2} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">物料名称 / 数据项</th>}
              {visibleColumns.has('authorized') && <th rowSpan={2} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[90px]">汇总授权量</th>}
              {visibleColumns.has('shipped') && <th rowSpan={2} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[90px]">已出货量</th>}
              {visibleMonths.length > 0 && <th colSpan={visibleMonths.length} className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700">M+6 剩余可用授权量（KPCS）</th>}
            </tr>
            <tr>
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[80px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              let cumulative = 0;
              const cumArr: number[] = [];
              group.fcst.forEach(v => { cumulative += v; cumArr.push(cumulative); });
              const totalRows = 2 + group.materials.length;
              return (
                <React.Fragment key={gIdx}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('customer') && <td rowSpan={totalRows} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {visibleColumns.has('model') && <td rowSpan={totalRows} className="border border-gray-200 p-2 text-center align-middle font-bold text-gray-700">{group.model}</td>}
                    {visibleColumns.has('item') && <td className="border border-gray-200 p-2 text-gray-600">客户 Fcst</td>}
                    {visibleColumns.has('authorized') && <td className="border border-gray-200 p-2 text-center text-gray-400">—</td>}
                    {visibleColumns.has('shipped') && <td className="border border-gray-200 p-2 text-center text-gray-400">—</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderPlainCell(`f-${gIdx}-${i}`, group.fcst[i]))}
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('item') && <td className="border border-gray-200 p-2 text-gray-600">累计客户 Fcst（逐月累加）</td>}
                    {visibleColumns.has('authorized') && <td className="border border-gray-200 p-2 text-center text-gray-400">—</td>}
                    {visibleColumns.has('shipped') && <td className="border border-gray-200 p-2 text-center text-gray-400">—</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderPlainCell(`c-${gIdx}-${i}`, cumArr[i]))}
                  </tr>
                  {group.materials.map((mat, mIdx) => (
                    <tr key={mIdx} className="hover:bg-gray-50 transition-colors">
                      {visibleColumns.has('item') && <td className="border border-gray-200 p-2 text-gray-700 font-medium">{mat.name}</td>}
                      {visibleColumns.has('authorized') && <td className="border border-gray-200 p-2 text-center text-gray-700">{fmt(mat.authorized)}</td>}
                      {visibleColumns.has('shipped') && <td className="border border-gray-200 p-2 text-center text-gray-700">{fmt(mat.shipped)}</td>}
                      {MONTHS.map((m, i) => visibleColumns.has(m) && renderRemainCell(`r-${gIdx}-${mIdx}-${i}`, mat.authorized - mat.shipped - cumArr[i]))}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        物料剩余可用授权量（汇总授权量 - 已出货量 - 累计客户Fcst）为负数时标红
      </div>
    </div>
  );
};

// 历史同期趋势偏差：TV可切换客户/尺寸/技术别单维度；IT/MC固定客户+面板厂+技术别，近8个月(2601-2608)
const HistoryTrendTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const isTVFamily = buType === 'TV' || buType === 'CID';
  const [dimMode, setDimMode] = useState<'customer' | 'size' | 'tech'>('customer');
  const MONTHS = ['2601', '2602', '2603', '2604', '2605', '2606', '2607', '2608'];
  const YOY_TH = 30;

  const tvDataByMode: Record<'customer' | 'size' | 'tech', { label: string; cur: number[]; y1: number[]; y2: number[] }[]> = {
    customer: [
      { label: '小米集团_TV', cur: [420, 415, 430, 440, 450, 460, 470, 480], y1: [420, 415, 430, 440, 340, 460, 470, 480], y2: [420, 415, 430, 440, 320, 460, 470, 480] },
      { label: '华为集团_TV', cur: [150, 148, 145, 140, 135, 130, 125, 120], y1: [150, 148, 145, 140, 135, 130, 125, 175], y2: [150, 148, 145, 140, 135, 130, 125, 180] },
    ],
    size: [
      { label: '55寸', cur: [420, 415, 430, 440, 450, 460, 470, 480], y1: [420, 415, 430, 440, 340, 460, 470, 480], y2: [420, 415, 430, 440, 320, 460, 470, 480] },
      { label: '65寸', cur: [150, 148, 145, 140, 135, 130, 125, 120], y1: [150, 148, 145, 140, 135, 130, 125, 175], y2: [150, 148, 145, 140, 135, 130, 125, 180] },
    ],
    tech: [
      { label: 'OLED', cur: [420, 415, 430, 440, 450, 460, 470, 480], y1: [420, 415, 430, 440, 340, 460, 470, 480], y2: [420, 415, 430, 440, 320, 460, 470, 480] },
      { label: 'LCD', cur: [150, 148, 145, 140, 135, 130, 125, 120], y1: [150, 148, 145, 140, 135, 130, 125, 175], y2: [150, 148, 145, 140, 135, 130, 125, 180] },
    ],
  };
  const dimLabels: Record<'customer' | 'size' | 'tech', string> = { customer: '集团客户名称', size: '尺寸', tech: '技术别' };

  const PANEL_CODE: Record<string, string> = { '京东方': 't1', 'TCL华星': 't2', '惠科': 't3' };
  const itMcData = [
    { customer: '华硕集团_IT', panel: '京东方', tech: 'IPS', cur: [270, 268, 265, 260, 255, 250, 245, 180], y1: [270, 268, 265, 260, 255, 250, 245, 270], y2: [270, 268, 265, 260, 255, 250, 245, 280] },
    { customer: '联想集团_IT', panel: 'TCL华星', tech: 'TN', cur: [118, 116, 120, 118, 116, 155, 150, 148], y1: [118, 116, 120, 118, 116, 110, 150, 148], y2: [118, 116, 120, 118, 116, 108, 150, 148] },
  ];

  const groupedData = isTVFamily
    ? tvDataByMode[dimMode].map(g => ({ key: g.label, dim: g.label, cur: g.cur, y1: g.y1, y2: g.y2 }))
    : itMcData.map(g => ({ key: g.customer, customer: g.customer, panel: g.panel, tech: g.tech, cur: g.cur, y1: g.y1, y2: g.y2 }));

  const allColumns = [
    ...(isTVFamily ? [{ id: 'dim', label: dimLabels[dimMode] }] : [{ id: 'customer', label: '集团客户名称' }, { id: 'panel', label: '面板厂' }, { id: 'tech', label: '技术别' }]),
    { id: 'dataItem', label: '数据项' },
    ...MONTHS.map(m => ({ id: m, label: m })),
  ];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };

  const renderValue = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}</td>
  );
  const computePct = (cur: number, base: number) => base === 0 ? 0 : Math.round((cur - base) / base * 1000) / 10;
  const renderYoy = (key: string, pct: number, highlight: boolean) => (
    <td key={key} className={`border border-gray-200 p-2 text-center ${highlight ? 'bg-red-50' : ''}`}>
      <span className={`font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{pct > 0 ? `+${pct}` : pct}%</span>
    </td>
  );

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Clock size={18} className="text-blue-600" />历史同期趋势偏差</h3>
        <div className="flex items-center gap-2">
          {isTVFamily && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              {(['customer', 'size', 'tech'] as const).map(m => (
                <button key={m} onClick={() => setDimMode(m)} className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${dimMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{dimLabels[m]}</button>
              ))}
            </div>
          )}
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {!isTVFamily && visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[90px]">集团客户名称</th>}
              {isTVFamily && visibleColumns.has('dim') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[130px]">{dimLabels[dimMode]}</th>}
              {!isTVFamily && visibleColumns.has('panel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[70px]">面板厂</th>}
              {!isTVFamily && visibleColumns.has('tech') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[100px]">技术别</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[140px]">数据项</th>}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[75px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group: any, gIdx) => {
              const yoy1 = MONTHS.map((_, i) => computePct(group.cur[i], group.y1[i]));
              const yoy2 = MONTHS.map((_, i) => computePct(group.cur[i], group.y2[i]));
              const hi = MONTHS.map((_, i) => {
                const over1 = Math.abs(yoy1[i]) >= YOY_TH;
                const over2 = Math.abs(yoy2[i]) >= YOY_TH;
                const sameSign = (yoy1[i] >= 0 && yoy2[i] >= 0) || (yoy1[i] <= 0 && yoy2[i] <= 0);
                return over1 && over2 && sameSign;
              });
              return (
                <React.Fragment key={gIdx}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {!isTVFamily && visibleColumns.has('customer') && <td rowSpan={5} className="border border-gray-200 p-2 text-center font-bold text-gray-800 align-middle">{group.customer}</td>}
                    {isTVFamily && visibleColumns.has('dim') && <td rowSpan={5} className="border border-gray-200 p-2 align-middle font-bold text-gray-700">{group.dim}</td>}
                    {!isTVFamily && visibleColumns.has('panel') && <td rowSpan={5} className="border border-gray-200 p-2 text-center font-medium text-gray-700 align-middle">{PANEL_CODE[group.panel] ?? group.panel}</td>}
                    {!isTVFamily && visibleColumns.has('tech') && <td rowSpan={5} className="border border-gray-200 p-2 align-middle font-bold text-gray-700">{group.tech}</td>}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本年FCST</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`c-${i}`, group.cur[i]))}
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-1同期实际出货</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`y1-${i}`, group.y1[i]))}
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-2同期实际出货</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderValue(`y2-${i}`, group.y2[i]))}
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700">与Y-1同比幅度</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderYoy(`d1-${i}`, yoy1[i], hi[i]))}
                  </tr>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700">与Y-2同比幅度</td>}
                    {MONTHS.map((m, i) => visibleColumns.has(m) && renderYoy(`d2-${i}`, yoy2[i], hi[i]))}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        与Y-1、Y-2同比幅度方向一致且绝对值均≥{YOY_TH}%时高亮预警
      </div>
    </div>
  );
};

// 平均尺寸变化：仅TV，无分组维度（大盘统计），近8个月(2601-2608)
const AvgSizeChangeTable = ({ buType }: { buType: AnomalyBU }) => {
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const MONTHS = ['2601', '2602', '2603', '2604', '2605', '2606', '2607', '2608'];

  const avgSize = [64.2, 64.0, 63.8, 63.5, 63.0, 62.5, 62.0, 61.5];
  const avgY1 = [63.0, 63.2, 63.4, 63.5, 63.6, 63.8, 64.0, 64.2];
  const avgY2 = [61.0, 61.2, 61.4, 61.6, 61.8, 62.0, 62.2, 62.4];
  const pct43 = [18, 19, 20, 22, 29, 32, 35, 38];
  const pctY1 = [20, 20, 21, 22, 23, 24, 25, 26];
  const pctY2 = [16, 16, 17, 17, 18, 18, 19, 19];

  const dev1 = MONTHS.map((_, i) => Math.round((avgSize[i] - avgY1[i]) * 10) / 10);
  const dev2 = MONTHS.map((_, i) => Math.round((avgSize[i] - avgY2[i]) * 10) / 10);
  const conds = MONTHS.map((_, i) => ({
    a: dev1[i] < 0 && pct43[i] > pctY1[i],
    b: pct43[i] > 30,
    c: dev1[i] <= 0 && dev2[i] <= 0,
  }));

  const allColumns = [{ id: 'dataItem', label: '数据项' }, ...MONTHS.map(m => ({ id: m, label: m }))];
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(allColumns.map(c => c.id)));
  const toggleColumn = (id: string) => { const next = new Set(visibleColumns); if (next.has(id)) { if (next.size > 1) next.delete(id); } else { next.add(id); } setVisibleColumns(next); };

  const renderInch = (key: string, val: number) => (
    <td key={key} className="border border-gray-200 p-2 text-center text-gray-900 font-medium">{val}"</td>
  );
  const renderPct = (key: string, val: number, hi: boolean) => (
    <td key={key} className={`border border-gray-200 p-2 text-center ${hi ? 'bg-red-50' : ''}`}>
      <span className={`font-bold ${hi ? 'text-red-600' : 'text-gray-900'}`}>{val}%</span>
    </td>
  );
  const renderDev = (key: string, val: number, flagged: boolean) => (
    <td key={key} className={`border border-gray-200 p-2 text-center ${flagged ? 'bg-red-50' : ''}`}>
      <span className={`font-bold ${flagged ? 'text-red-600' : 'text-gray-900'}`}>{val > 0 ? `+${val}` : val}"</span>
    </td>
  );

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><RefreshCcw size={18} className="text-blue-600" />平均尺寸变化</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)} className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="表格设置"><Settings size={16} /></button>
            <AnimatePresence>
              {isColumnSettingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsColumnSettingsOpen(false)}></div>
                  <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-[100] p-2">
                    <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">选择显示字段</p>
                    <div className="max-h-60 overflow-y-auto relative z-50">
                      {allColumns.map(col => (
                        <label key={col.id} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                          <input type="checkbox" checked={visibleColumns.has(col.id)} onChange={() => toggleColumn(col.id)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" />
                          <span className={`text-[11px] font-medium transition-colors ${visibleColumns.has(col.id) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[150px]">数据项</th>}
              {MONTHS.map(m => visibleColumns.has(m) && <th key={m} className="border border-gray-200 p-1 font-bold min-w-[75px] bg-white text-gray-600">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">本版平均尺寸</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderInch(`s-${i}`, avgSize[i]))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-1同期平均尺寸</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderInch(`y1-${i}`, avgY1[i]))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-2同期平均尺寸</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderInch(`y2-${i}`, avgY2[i]))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700">与Y-1偏差</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderDev(`d1-${i}`, dev1[i], conds[i].a || conds[i].c))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700">与Y-2偏差</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderDev(`d2-${i}`, dev2[i], conds[i].c))}
            </tr>
            <tr className="border-t-2 border-gray-200">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600 bg-gray-50/50">本版43寸以下占比</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderPct(`p-${i}`, pct43[i], conds[i].a || conds[i].b))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-1同期占比</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderPct(`py1-${i}`, pctY1[i], false))}
            </tr>
            <tr className="hover:bg-gray-50 transition-colors">
              {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 text-gray-600">Y-2同期占比</td>}
              {MONTHS.map((m, i) => visibleColumns.has(m) && renderPct(`py2-${i}`, pctY2[i], false))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex flex-col gap-1 text-[11px] text-gray-500">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>满足以下任一条件即高亮预警：</div>
        <div className="pl-5">① Y-1偏差&lt;0 且当期43寸以下占比&gt;Y-1同期占比　　② 43寸以下占比&gt;30%　　③ Y-1、Y-2偏差均≤0</div>
      </div>
    </div>
  );
};

// 产品生命周期状态验证：Model级清单，非阈值网格，示例演示三类固定触发规则
const LifecycleExceptionTable = ({ buType }: { buType: AnomalyBU }) => {
  const stageBadge: Record<string, string> = {
    'GA前': 'bg-blue-50 text-blue-700 border-blue-200',
    'GA后': 'bg-green-50 text-green-700 border-green-200',
    'EOL': 'bg-gray-100 text-gray-600 border-gray-300',
  };
  const MONTHS = ['2608', '2609', '2610', '2611', '2612', '2701', '2702'];
  const rows = [
    { model: 'Model X', extVersion: 'V2.0', stage: 'EOL', rule: 'EOP后仍有客户FCST',
      ruleText: 'EOP后仍有客户FCST提报，自动触发高呆滞风险预警，提示销售核查是否错报',
      fcst: [0, 0, 120, 80, 60, 40, 20], hitIndexes: [2, 3, 4, 5, 6] },
    { model: 'Model Z', extVersion: 'V3.1', stage: 'GA后', rule: '量产产品M+6内无任何需求',
      ruleText: '量产产品M+6内无任何需求，自动触发产品EOL风险预警',
      fcst: [0, 0, 0, 0, 0, 0, 0], hitIndexes: [0, 1, 2, 3, 4, 5, 6] },
    { model: 'Model Y', extVersion: 'V1.0', stage: 'GA前', rule: 'GA前有客户FCST提报',
      ruleText: 'GA前有客户FCST提报，自动触发提前需求异常预警，提示销售核查是否提前导入',
      fcst: [50, 30, 0, 0, 0, 0, 0], hitIndexes: [0, 1] },
  ];

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Filter size={18} className="text-blue-600" />产品生命周期状态验证</h3>
        <button className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90" title="导出当前数据"><Download size={16} /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[100px]">Model</th>
              <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">对外版次</th>
              <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[100px]">生命周期阶段</th>
              <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[160px]">触发规则</th>
              {MONTHS.map(m => <th key={m} className="border border-gray-200 p-1 font-bold min-w-[60px] bg-blue-50 text-blue-700">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="border border-gray-200 p-2 font-bold text-gray-800">{r.model}</td>
                <td className="border border-gray-200 p-2 text-center text-gray-600">{r.extVersion}</td>
                <td className="border border-gray-200 p-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${stageBadge[r.stage]}`}>{r.stage}</span>
                </td>
                <td className="border border-gray-200 p-2">
                  <div className="font-bold text-red-600">{r.rule}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{r.ruleText}</div>
                </td>
                {r.fcst.map((v, mi) => {
                  const hit = r.hitIndexes.includes(mi);
                  return (
                    <td key={mi} className={`border border-gray-200 p-2 text-center font-medium ${hit ? 'bg-red-50 text-red-600 font-bold' : 'text-gray-900'}`}>{v}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px] text-gray-500">
        <span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block"></span>
        证据数据为该Model的M+6月度客户FCST；红色高亮为触发规则的月份（呆滞：EOP后仍非零的月份；GA后EOL：M+6内全部为0；GA前：GA前仍有FCST的月份）
      </div>
    </div>
  );
};

const RULE_DETAIL_COMPONENTS: Record<string, React.ComponentType<{ buType: AnomalyBU }>> = {
  'fcst-change': CustomerFcstChangeTable,
  'sales-fcst-change': SalesFcstChangeTable,
  'sales-vs-customer': SalesVsCustomerFcstTable,
  'supply-demand': SupplyDemandCompareTable,
  'dp-vs-dp': DpVsDpTable,
  'dp-vs-supply': DpVsSupplyTable,
  'strategy': StrategyDeviationTable,
  'key-product': KeyProductAchievementTable,
  'dp-vs-bprp': DpVsBprpTable,
  'market-share': MarketShareTable,
  'shipment-form': ShipmentFormTable,
  'material-auth': MaterialAuthTable,
  'history-trend': HistoryTrendTable,
  'avg-size': AvgSizeChangeTable,
  'lifecycle': LifecycleExceptionTable,
};

const ValidationResults = ({ rules, onAction }: { rules: ValidationRule[], onAction: (text: string) => void }) => {
  const handleAction = (rule: ValidationRule) => {
    if (rule.name === '销售目标达成对比') {
      onAction('查看销售目标达成对比');
    } else {
      onAction(`查看规则详情:${rule.name}`);
    }
  };

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700 w-20">是否通过</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">校验规则名称</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700 w-16"></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr 
              key={rule.id}
              className={`transition-colors border-b border-gray-200 ${rule.passed ? 'bg-green-50 hover:bg-green-100' : 'bg-red-50 hover:bg-red-100'}`}
            >
              <td className="border-r border-gray-200 p-2 text-center font-bold">
                {rule.passed ? (
                  <div className="flex justify-center">
                    <div className="w-5 h-5 rounded bg-white border border-gray-300 flex items-center justify-center text-gray-800">
                      <Check size={14} strokeWidth={3} />
                    </div>
                  </div>
                ) : (
                  <span className="text-gray-800">（{rule.failCount || 10}）</span>
                )}
              </td>
              <td className="border-r border-gray-200 p-2 text-gray-800 font-medium">
                {rule.name}
              </td>
              <td className="p-2 text-center">
                <button 
                  onClick={() => handleAction(rule)}
                  className="text-gray-800 hover:underline font-medium"
                >
                  详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const RuleExplanationView = ({ data }: { data: RuleExplanationData }) => {
  return (
    <div className="w-full space-y-6">
      {/* 1. Rule List */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-3 bg-gray-50 border-b border-gray-200">
          <h4 className="text-xs font-bold text-gray-700 flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-600" />
            规则列表
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">规则名称</th>
                <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">阈值</th>
                <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">适用BU</th>
                <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">适用产品线</th>
                <th className="border border-gray-200 p-2 text-center font-bold text-gray-600">启用状态</th>
                <th className="border border-gray-200 p-2 text-center font-bold text-gray-600">近3月/6月触发次数</th>
                <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">最后修改时间</th>
              </tr>
            </thead>
            <tbody>
              {data.ruleList.map((rule, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="border border-gray-200 p-2 text-gray-800 font-medium">{rule.name}</td>
                  <td className="border border-gray-200 p-2 text-gray-700">{rule.threshold}</td>
                  <td className="border border-gray-200 p-2 text-gray-700">{rule.bu}</td>
                  <td className="border border-gray-200 p-2 text-gray-700">{rule.productLine}</td>
                  <td className="border border-gray-200 p-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${rule.status ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {rule.status ? '已启用' : '未启用'}
                    </span>
                  </td>
                  <td className="border border-gray-200 p-2 text-center text-gray-700">
                    {rule.triggerCount3m} / {rule.triggerCount6m}
                  </td>
                  <td className="border border-gray-200 p-2 text-gray-500">{rule.lastModified}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Historical Trigger Record Summary */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
            <h5 className="text-[11px] font-bold text-blue-800 mb-2 flex items-center gap-1.5">
              <User size={12} /> 主要触发客户及次数
            </h5>
            <div className="flex flex-wrap gap-2">
              {data.summary.topCustomers.map((c, i) => (
                <div key={i} className="bg-white px-2 py-1 rounded-lg border border-blue-100 shadow-sm flex items-center gap-2">
                  <span className="text-[11px] text-gray-700">{c.name}</span>
                  <span className="text-[11px] font-bold text-blue-600">{c.count}次</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
            <h5 className="text-[11px] font-bold text-indigo-800 mb-2 flex items-center gap-1.5">
              <BarChart3 size={12} /> 主要触发产品及次数
            </h5>
            <div className="flex flex-wrap gap-2">
              {data.summary.topProducts.map((p, i) => (
                <div key={i} className="bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-sm flex items-center gap-2">
                  <span className="text-[11px] text-gray-700">{p.name}</span>
                  <span className="text-[11px] font-bold text-indigo-600">{p.count}次</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-200">
            <h4 className="text-xs font-bold text-gray-700 flex items-center gap-2">
              <BarChart3 size={14} className="text-blue-600" />
              触发记录表格
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">客户</th>
                  <th className="border border-gray-200 p-2 text-left font-bold text-gray-600">Model</th>
                  <th className="border border-gray-200 p-2 text-center font-bold text-gray-600">近3月触发次数</th>
                  <th className="border border-gray-200 p-2 text-center font-bold text-gray-600">近6月触发次数</th>
                </tr>
              </thead>
              <tbody>
                {data.historyTable.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border border-gray-200 p-2 text-gray-800">{row.customer}</td>
                    <td className="border border-gray-200 p-2 text-gray-700">{row.model}</td>
                    <td className="border border-gray-200 p-2 text-center text-gray-700 font-medium">{row.count3m}</td>
                    <td className="border border-gray-200 p-2 text-center text-gray-700 font-medium">{row.count6m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const ExternalInfoCards = ({ info }: { info: ExternalInfo[] }) => {
  return (
    <div className="space-y-4 w-full">
      {info.map((item) => (
        <div key={item.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-sm font-bold ${
                item.impactType === '正面影响' ? 'text-green-600' : 
                item.impactType === '负面影响' ? 'text-red-600' : 'text-blue-600'
              }`}>
                {item.impactType}
              </span>
              <h3 className="text-sm font-bold text-gray-900">{item.title}</h3>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-gray-500">
                <Target size={14} className="text-gray-400" />
                <span>匹配度</span>
                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">
                  {item.matchRate}%
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                <Tag size={14} className="text-gray-400" />
                <div className="flex items-center gap-1">
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-l-md font-medium border-r border-blue-100">影响尺寸</span>
                  <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-r-md border border-l-0 border-gray-100">{item.impactSize}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-l-md font-medium border-r border-blue-100">影响BU</span>
                  <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-r-md border border-l-0 border-gray-100">{item.impactBU}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-l-md font-medium border-r border-blue-100">影响客户</span>
                  <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-r-md border border-l-0 border-gray-100">{item.impactCustomer}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs leading-relaxed text-gray-700">
                <span className="font-bold text-gray-900 mr-2">内容总结:</span>
                {item.contentSummary}
              </p>
            </div>
            <div className="pt-4 border-t border-gray-50">
              <p className="text-xs leading-relaxed text-gray-700">
                <span className="font-bold text-gray-900 mr-2">Agent分析:</span>
                {item.agentAnalysis}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const SimulationVersionSelectView = ({ onConfirm, onNavigateToDP }: { onConfirm: (versions: string[]) => void, onNavigateToDP?: () => void }) => {
  const versions = [
    { id: 'P260329-04-001', date: '2026-03-30' },
    { id: 'P260329-04-002', date: '2026-03-31' },
    { id: 'P260329-04-003', date: '2026-03-15' },
  ];
  const [selected, setSelected] = useState<Set<string>>(new Set(['P260329-04-002', 'P260329-04-003']));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">选择要对比的版本</h3>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">当前：P260329-04-001</p>
      </div>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gray-100">
          <tr>
            <th className="border border-gray-200 p-2 text-center w-12">选择</th>
            <th className="border border-gray-200 p-2 text-left">版本号</th>
            <th className="border border-gray-200 p-2 text-left">创建时间</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(v => (
            <tr key={v.id} className="hover:bg-blue-50 transition-colors">
              <td className="border border-gray-200 p-2 text-center">
                <input 
                  type="checkbox" 
                  checked={selected.has(v.id)} 
                  onChange={() => toggle(v.id)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </td>
              <td 
                className="border border-gray-200 p-2 font-mono text-blue-600 font-bold cursor-pointer hover:underline"
                onClick={() => onNavigateToDP?.()}
              >
                {v.id}
              </td>
              <td className="border border-gray-200 p-2 text-gray-500">{v.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
        <button 
          onClick={() => onConfirm(Array.from(selected))}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-md active:scale-95 transition-all"
        >
          确认对比
        </button>
      </div>
    </div>
  );
};

const SimulationLoadingView = () => {
  return (
    <div className="bg-white border border-gray-100 px-4 py-2.5 rounded-2xl shadow-sm inline-flex items-center gap-2">
      <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
      <span className="text-xs text-gray-500">模拟经营计算中，预计需要约 1 分钟，请稍候…</span>
    </div>
  );
};

const SimulationResultView = ({ onCheckVersion, selectedVersions }: { onCheckVersion?: (version: string) => void, selectedVersions?: string[] }) => {
  const [isBPModalOpen, setIsBPModalOpen] = useState(false);

  // Data based on user request analysis
  const data = [
    { bu: 'TV', metric: 'VS 供应BP', v1: 150, v2: -850, v3: 2100 },
    { bu: 'TV', metric: '收入', v1: -34000, v2: 56700, v3: -12800 },
    { bu: 'TV', metric: '利润', v1: 3200, v2: -4700, v3: 1500 },
    { bu: 'TV', metric: 'KPI产品', v1: -3, v2: 8, v3: -1 },
    { bu: 'TV', metric: '成品库存', v1: 450, v2: -120, v3: 780 },
    { bu: 'MNT', metric: '净收入', v1: -28300, v2: 52100, v3: -9500 },
    { bu: 'MNT', metric: '重点产品', v1: 15, v2: -5, v3: 4 },
    { bu: 'MNT', metric: '库存', v1: 1250, v2: -340, v3: 680 },
    { bu: '车载', metric: '销量BP/RP', v1: -18, v2: 25, v3: -7 },
    { bu: '车载', metric: '供应BP/RP', v1: 10, v2: -9, v3: 22 },
  ];
  const buGroups = [{ name: 'TV', span: 5 }, { name: 'MNT', span: 3 }, { name: '车载', span: 2 }];

  return (
    <div className="w-full bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="p-4 border-b border-gray-100 bg-[#f8faff] flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          经营结果模拟对比
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">应用别</th>
              <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">指标</th>
              <th className="border border-gray-200 p-2 text-center font-bold text-gray-700 bg-blue-50/50">P260329-04-001 (当前)</th>
              <th className="border border-gray-200 p-2 text-center font-bold text-gray-700 bg-yellow-50/30">
                <div className="flex flex-col items-center gap-1">
                  <Crown size={14} className="text-yellow-600" />
                  <span>P260329-04-002</span>
                </div>
              </th>
              <th className="border border-gray-200 p-2 text-center font-bold text-gray-700">P260329-04-003</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const isVSBP = row.metric === 'VS 供应BP';
              const buGroup = buGroups.find(g => g.name === row.bu);
              const isFirstInGroup = idx === 0 || data[idx - 1].bu !== row.bu;
              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  {isFirstInGroup && (
                    <td rowSpan={buGroup?.span} className="border border-gray-200 p-2 font-bold text-gray-700 text-center bg-white align-middle">{row.bu}</td>
                  )}
                  <td className="border border-gray-200 p-2 font-medium text-gray-700 bg-gray-50/30">{row.metric}</td>
                  <td className={`border border-gray-200 p-2 text-right font-bold ${row.v1 > 0 ? 'text-green-600' : row.v1 < 0 ? 'text-red-600' : ''}`}>
                    {isVSBP ? (
                      <button onClick={() => setIsBPModalOpen(true)} className="hover:underline hover:text-blue-600 cursor-pointer">
                        {row.v1 > 0 ? `+${row.v1}` : row.v1}
                      </button>
                    ) : (
                      row.v1 > 0 ? `+${row.v1}` : row.v1
                    )}
                  </td>
                  <td className={`border border-gray-200 p-2 text-right font-bold bg-blue-50/30 ${row.v2 > 0 ? 'text-green-600' : row.v2 < 0 ? 'text-red-600' : ''}`}>
                    {isVSBP ? (
                      <button onClick={() => setIsBPModalOpen(true)} className="hover:underline hover:text-blue-600 cursor-pointer">
                        {row.v2 > 0 ? `+${row.v2}` : row.v2}
                      </button>
                    ) : (
                      row.v2 > 0 ? `+${row.v2}` : row.v2
                    )}
                  </td>
                  <td className={`border border-gray-200 p-2 text-right font-bold ${row.v3 > 0 ? 'text-green-600' : row.v3 < 0 ? 'text-red-600' : ''}`}>
                    {isVSBP ? (
                      <button onClick={() => setIsBPModalOpen(true)} className="hover:underline hover:text-blue-600 cursor-pointer">
                        {row.v3 > 0 ? `+${row.v3}` : row.v3}
                      </button>
                    ) : (
                      row.v3 > 0 ? `+${row.v3}` : row.v3
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="p-5 space-y-6 bg-white text-xs border-t border-gray-100 overflow-y-auto max-h-[400px]">
        {/* Best Version Section */}
        <section className="p-4 bg-green-50 rounded-xl border border-green-100">
          <div className="flex items-center gap-2 text-green-700 font-bold mb-3">
            <Check className="p-0.5 bg-green-600 text-white rounded-full" size={16} />
            最佳版本：版本002（P260329-04-002）
          </div>
          <div className="space-y-2 text-green-900 leading-relaxed font-medium">
            <div className="flex gap-2">
              <span className="text-green-600">•</span>
              <span>拥有唯一正向且高额的收入和净收入，这是企业生存的核心。</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">•</span>
              <span>成功去库存（成品库存、库存均为负），释放现金流。</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">•</span>
              <span>销量BP/RP远超计划，KPI产品表现优异，市场竞争力强。</span>
            </div>
            <div className="flex gap-2">
              <span className="text-green-600">•</span>
              <span>虽然利润为负且产能不足，但这些属于可改进的运营问题。相比之下，版本001和003的致命伤是收入和净收入为负，意味着业务本身无法造血，长期不可持续。</span>
            </div>
          </div>
        </section>

        {/* Detailed Analysis Section */}
        <div className="space-y-5">
           <h4 className="font-bold text-gray-900 border-l-4 border-blue-500 pl-2">版本优缺点分析</h4>
           
           {/* Version 001 */}
           <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
             <div className="font-bold text-gray-800 mb-2">版本001 (P260329-04-001)</div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-green-600 font-bold mb-1 flex items-center gap-1"><ArrowUpRight size={14}/> 优点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-gray-600">
                    <li>产能、利润、重点产品、供应BP/RP 均为正向。</li>
                    <li>利润为正（+3200），有一定的盈利基础。</li>
                  </ul>
                </div>
                <div>
                  <div className="text-red-600 font-bold mb-1 flex items-center gap-1"><ArrowDownRight size={14}/> 缺点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-gray-600">
                    <li>收入和净收入大幅为负，严重拖累财务健康。</li>
                    <li>KPI产品未达标；库存积压严重，占用资金。</li>
                  </ul>
                </div>
             </div>
             <div className="mt-3 pt-2 border-t border-gray-200 text-gray-700 italic">
               <span className="font-bold">综合评价:</span> 生产端表现不错，但市场销售和财务结果很差，库存风险高。
             </div>
           </div>

           {/* Version 002 */}
           <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200">
             <div className="font-bold text-blue-900 mb-2">版本002 (P260329-04-002)</div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-green-600 font-bold mb-1 flex items-center gap-1"><ArrowUpRight size={14}/> 优点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-blue-800/80">
                    <li>收入和净收入大幅正向，财务表现最好。</li>
                    <li>KPI产品远超目标；成功去库存，资金释放。</li>
                  </ul>
                </div>
                <div>
                  <div className="text-red-600 font-bold mb-1 flex items-center gap-1"><ArrowDownRight size={14}/> 缺点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-blue-800/80">
                    <li>产能为负，可能面临生产能力不足。</li>
                    <li>增收不增利，成本或费用过高；核心产品表现不佳。</li>
                  </ul>
                </div>
             </div>
             <div className="mt-3 pt-2 border-t border-blue-100 text-blue-900 italic">
               <span className="font-bold">综合评价:</span> 财务和销售端非常亮眼，库存健康，但盈利能力和核心产品需要改进，产能瓶颈明显。
             </div>
           </div>

           {/* Version 003 */}
           <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
             <div className="font-bold text-gray-800 mb-2">版本003 (P260329-04-003)</div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-green-600 font-bold mb-1 flex items-center gap-1"><ArrowUpRight size={14}/> 优点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-gray-600">
                    <li>产能最高，生产和供应能力最强。</li>
                    <li>利润为正，重点产品也优于版本002。</li>
                  </ul>
                </div>
                <div>
                  <div className="text-red-600 font-bold mb-1 flex items-center gap-1"><ArrowDownRight size={14}/> 缺点:</div>
                  <ul className="list-disc pl-4 space-y-1 text-gray-600">
                    <li>收入和净收入大幅为负，财务状况差。</li>
                    <li>库存积压严重；实际销量不及预期。</li>
                  </ul>
                </div>
             </div>
             <div className="mt-3 pt-2 border-t border-gray-200 text-gray-700 italic">
               <span className="font-bold">综合评价:</span> 生产和供应能力突出，但市场销售失败，库存积压导致资金效率低，财务亏损。
             </div>
           </div>
        </div>
      </div>

      {onCheckVersion && selectedVersions && selectedVersions.length > 0 && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap justify-start gap-2">
          {selectedVersions.map(version => (
            <button
              key={version}
              onClick={() => onCheckVersion(version)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-xl text-[13px] font-medium text-[#4a5568] hover:bg-gray-50 transition-all active:scale-95 group"
            >
              <RefreshCcw size={16} className="text-[#718096] group-hover:rotate-180 transition-transform duration-500" />
              查看{version}
            </button>
          ))}
        </div>
      )}

      {/* VS 供应BP Details Modal */}
      <AnimatePresence>
        {isBPModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col border border-gray-200"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Activity size={18} className="text-blue-600" />
                  VS 供应BP - 详细对比
                </h2>
                <button onClick={() => setIsBPModalOpen(false)} className="p-1.5 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm rounded-lg transition-all text-gray-500 hover:text-gray-800 active:scale-95">
                  <X size={16} />
                </button>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full border-collapse text-[11px] text-center whitespace-nowrap">
                  <thead>
                    <tr>
                      <th className="border-b border-r border-gray-200 p-2.5 font-bold text-gray-500 bg-gray-50/80 tracking-wider">应用别</th>
                      <th className="border-b border-r border-gray-200 p-2.5 font-bold text-gray-500 bg-gray-50/80 tracking-wider">面板厂</th>
                      <th className="border-b border-r border-gray-200 p-2.5 font-bold text-gray-700 bg-blue-50/30">
                        模拟版本 <span className="text-[9px] text-gray-400 font-normal ml-1">(版本号)</span>
                      </th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2601</th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2602</th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2603</th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2604</th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2605</th>
                      <th className="border-b border-gray-200 p-2.5 font-bold text-gray-600 bg-gray-50/30">M2606</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-semibold text-gray-800 bg-white align-top">TV</td>
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-medium text-gray-600 bg-white align-top">t1</td>
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-001</td>
                      <td className="border-b border-gray-200 p-2.5 font-bold text-orange-600 bg-orange-50/80 group-hover:bg-orange-100 transition-colors">+100</td>
                      <td className="border-b border-gray-200 p-2.5 font-bold text-red-600 bg-red-50/80 group-hover:bg-red-100 transition-colors">-320</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>
                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-002</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>
                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-003</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>

                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-semibold text-gray-800 bg-white align-top">CID</td>
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-medium text-gray-600 bg-white align-top">t2</td>
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-001</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>
                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-002</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>
                    <tr className="hover:bg-gray-50/50 transition-colors group">
                      <td className="border-b border-r border-gray-200 p-2.5 font-medium text-gray-700 bg-white group-hover:bg-blue-50/10">P260329-04-003</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                      <td className="border-b border-gray-200 p-2.5 text-gray-400 bg-white group-hover:bg-blue-50/5">0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const BatchReasonModal = ({ 
  isOpen, 
  onClose, 
  items, 
  onConfirm 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  items: { rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[];
  onConfirm: (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => void;
}) => {
  const [data, setData] = useState<{ rowId: string; key: string; reason: string; tag: string }[]>([]);
  const [tags, setTags] = useState(['提前备货', '延迟提货', '客户库存水位调整', '终端促销', '市场趋势变化', '竞品影响']);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagText, setEditingTagText] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagText, setNewTagText] = useState('');

  useEffect(() => {
    if (isOpen) {
      setData(items.map(item => ({ rowId: item.rowId, key: item.key, reason: '', tag: '' })));
      setManageTagsOpen(false);
      setEditingTagIndex(null);
      setIsAddingTag(false);
    }
  }, [isOpen, items]);

  if (!isOpen) return null;

  const handleUpdate = (idx: number, field: 'reason' | 'tag', value: string) => {
    const next = [...data];
    next[idx] = { ...next[idx], [field]: value };
    setData(next);
  };

  const isComplete = data.every(d => d.tag.length > 0 && d.reason.length > 0);

  const handleDeleteTag = (idx: number) => {
    const tagToDelete = tags[idx];
    setTags(tags.filter((_, i) => i !== idx));
    setData(data.map(d => d.tag === tagToDelete ? { ...d, tag: '' } : d));
  };

  const handleSaveEditTag = (idx: number) => {
    if (!editingTagText.trim()) return;
    const nextTags = [...tags];
    const oldTag = nextTags[idx];
    nextTags[idx] = editingTagText.trim();
    setTags(nextTags);
    setEditingTagIndex(null);
    setData(data.map(d => d.tag === oldTag ? { ...d, tag: nextTags[idx] } : d));
  };
  
  const handleAddNewTag = () => {
    if (!newTagText.trim()) {
      setIsAddingTag(false);
      return;
    }
    setTags([...tags, newTagText.trim()]);
    setNewTagText('');
    setIsAddingTag(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div>
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Edit2 className="text-blue-600" size={24} />
              {manageTagsOpen ? '管理结构化标签' : '修改原因确认'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {manageTagsOpen ? '在此新增、编辑或删除结构化标签，这些标签将用于归类所有的修改原因。' : '系统识别到以下变动较大的数据项，请补充修改理由及标签。'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!manageTagsOpen && (
              <button 
                onClick={() => setManageTagsOpen(true)} 
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Settings size={14} />
                管理标签库
              </button>
            )}
            {manageTagsOpen && (
              <button 
                onClick={() => setManageTagsOpen(false)} 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex items-center shadow-sm"
              >
                返回原因确认
              </button>
            )}
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {manageTagsOpen ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Tag size={18} className="text-blue-500"/> 当前标签库</h3>
                <button 
                  onClick={() => setIsAddingTag(true)} 
                  className="text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1 transition-colors"
                >
                  <Plus size={14} /> 新增标签
                </button>
              </div>
              
              <div className="flex flex-col gap-3">
                {tags.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 group transition-colors">
                    {editingTagIndex === idx ? (
                      <input 
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-sm border border-blue-400 rounded outline-none focus:ring-2 focus:ring-blue-100"
                        value={editingTagText}
                        onChange={e => setEditingTagText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEditTag(idx)}
                        onBlur={() => handleSaveEditTag(idx)}
                      />
                    ) : (
                      <span className="text-sm font-medium text-gray-700">{t}</span>
                    )}
                    
                    <div className="flex gap-2">
                      {editingTagIndex !== idx && (
                        <>
                          <button onClick={() => { setEditingTagIndex(idx); setEditingTagText(t); }} className="p-1.5 text-gray-400 hover:text-blue-600 rounded bg-white border border-gray-200 shadow-sm transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteTag(idx)} className="p-1.5 text-gray-400 hover:text-red-600 rounded bg-white border border-gray-200 shadow-sm transition-colors">
                            <X size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                
                {isAddingTag && (
                  <div className="flex items-center justify-between p-3 border border-blue-200 rounded-lg bg-blue-50">
                    <input 
                      autoFocus
                      placeholder="输入新标签名称..."
                      className="flex-1 px-3 py-1.5 text-sm border border-blue-400 rounded outline-none focus:ring-2 focus:ring-blue-100"
                      value={newTagText}
                      onChange={e => setNewTagText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddNewTag()}
                      onBlur={handleAddNewTag}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
          {items.map((item, idx) => {
            const diff = item.newVal - item.oldVal;
            const diffPercent = ((diff / (item.oldVal || 1)) * 100).toFixed(1);
            
            return (
              <div key={`${item.rowId}-${item.key}`} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 leading-tight">
                        {item.customer} · {item.size} {item.model ? `(${item.model})` : ''}
                      </h3>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
                        {item.item} · {item.key}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">变动幅度</p>
                      <div className={`text-sm font-black flex items-center gap-1 justify-end ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {Math.abs(diff)} ({diffPercent}%)
                      </div>
                    </div>
                    <div className="text-right border-l pl-4 border-gray-200">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">数值对比</p>
                      <p className="text-sm font-medium">
                        <span className="text-gray-400 line-through">{item.oldVal}</span>
                        <ChevronRight size={12} className="inline mx-1 text-gray-300" />
                        <span className="text-blue-600 font-bold">{item.newVal}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">结构化标签 <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-2">
                      {tags.map(t => (
                        <button
                          key={t}
                          onClick={() => handleUpdate(idx, 'tag', t)}
                          className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                            data[idx]?.tag === t 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-md transform scale-105' 
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">修改理由 <span className="text-red-500">*</span></label>
                    <textarea 
                      className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                      rows={2}
                      placeholder="请输入详细的修改原因..."
                      value={data[idx]?.reason || ''}
                      onChange={(e) => handleUpdate(idx, 'reason', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
        {!manageTagsOpen ? (
          <>
            <p className="text-xs text-gray-500 flex items-center gap-2">
              <AlertCircle size={14} className="text-orange-500" />
              勾选所有标签和理由后方可提交
            </p>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-100 transition-all"
              >
                继续修改数据
              </button>
              <button 
                onClick={() => onConfirm(data)}
                disabled={!isComplete}
                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:grayscale"
              >
                确认并提交
              </button>
            </div>
          </>
        ) : (
          <div className="flex justify-end w-full">
            <button 
              onClick={() => setManageTagsOpen(false)}
              className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg active:scale-95"
            >
              完成管理
            </button>
          </div>
        )}
      </div>
    </motion.div>
    </div>
  );
};

const ForecastTable = ({
  data,
  onUpdate,
  onUpdateAttribute,
  onBatchUpdateReasons,
  onBatchUpdateValues,
  onSubmit,
  onValidate,
  onPublish,
  onSimulate,
  groupingType = 'customer-size',
  filterCustomer,
  filterDataItems,
  buType: tableBuType = 'TV',
  mode = 'fcst',
  simulationVersion
}: {
  data: ForecastRow[],
  onUpdate: (rowId: string, key: string, newVal: number, reason?: string, tag?: string) => void,
  onUpdateAttribute?: (rowId: string, field: string, value: string) => void,
  onBatchUpdateReasons?: (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => void,
  onBatchUpdateValues?: (updates: { rowId: string; key: string; newVal: number }[]) => void,
  onSubmit: () => void,
  onValidate?: () => void,
  onPublish?: () => void,
  onSimulate?: () => void,
  groupingType?: 'customer-size' | 'tech' | 'customer-tech',
  filterCustomer?: string,
  filterDataItems?: string[],
  buType?: string,
  mode?: 'fcst' | 'dp',
  simulationVersion?: string
}) => {
  const dataItemsSource = mode === 'dp' ? BU_DATA_ITEMS_DP : BU_DATA_ITEMS_FCST;
  const dataItems = dataItemsSource[tableBuType] || dataItemsSource['TV'];

  const [filteredData, setFilteredData] = useState(data);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleRowsCount, setVisibleRowsCount] = useState(3);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [visibleDataItems, setVisibleDataItems] = useState<Set<string>>(new Set(dataItems.slice(0, 4)));
  const [isDataItemFilterOpen, setIsDataItemFilterOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationInputValue, setLocationInputValue] = useState('');
  const [colMode, setColMode] = useState(false);
  const [isLayoutSettingsOpen, setIsLayoutSettingsOpen] = useState(false);
  const [isPlanObjSettingsOpen, setIsPlanObjSettingsOpen] = useState(false);
  const [filterCustomerGroup, setFilterCustomerGroup] = useState<string[]>([]);
  const [filterCustomerShort, setFilterCustomerShort] = useState<string[]>([]);
  const [filterModelName, setFilterModelName] = useState<string[]>([]);
  const [filterSearchCustomerGroup, setFilterSearchCustomerGroup] = useState('');
  const [filterSearchCustomerShort, setFilterSearchCustomerShort] = useState('');
  const [filterSearchModelName, setFilterSearchModelName] = useState('');
  const [filterDropdownOpen, setFilterDropdownOpen] = useState<string | null>(null);

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [itemsToValidate, setItemsToValidate] = useState<{ rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[]>([]);

  const EXTEND_FIELD_OPTIONS = ['版本号', 'SBU', 'BU', '技术别', '应用领域', 'Model Name', '尺寸', '机种名称', 'VRR', 'DLG', '刷新率', '分辨率', '对外版次', 'Product ID', 'LGModel', 'LGProductId', '面板产地', '交付地点', '发货地点', '模组厂', '出货形态', 'Touch形态', '长宽比', 'Model Name工作状态', '前Sub-model', 'EOP计划时间', 'EOP实际时间', '集团号', '客户名称', 'approval时间-计划年月', 'approval时间-实际年月', 'CB料号', '销售处', '搭配比例', '客户简称', '需求类型', '客户分类', '客户等级', '销售组'];
  const DEFAULT_FIELDS = new Set(['版本号', 'Model Name', '对外版次', '尺寸', '集团号', '客户名称']);
  // 只有这 6 个字段在 mock 数据（FCSTDP_MODELS）里有真实值，其余字段仅作展示、不可勾选
  const DATA_BACKED_FIELD_KEY: Record<string, 'version' | 'model' | 'extVersion' | 'size' | 'groupId' | 'customer'> = {
    '版本号': 'version', 'Model Name': 'model', '对外版次': 'extVersion', '尺寸': 'size', '集团号': 'groupId', '客户名称': 'customer',
  };
  const [extendedColumns, setExtendedColumns] = useState<Set<string>>(new Set(DEFAULT_FIELDS));

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());

  // ===== 布局管理 / 计划对象管理：预设与当前应用状态 =====
  const [savedLayouts, setSavedLayouts] = useState<{ name: string; columnFields: string[]; dataRows: string[]; editable?: boolean }[]>(() => [
    { name: 'MNT默认布局', columnFields: Array.from(DEFAULT_FIELDS), dataRows: dataItems.slice(0, 4) },
    { name: 'NB默认布局', columnFields: Array.from(DEFAULT_FIELDS), dataRows: dataItems.slice(0, 4) },
    { name: 'IT SBU默认布局', columnFields: Array.from(DEFAULT_FIELDS), dataRows: dataItems.slice(0, 4) },
  ]);
  const [savedPlanObjects, setSavedPlanObjects] = useState<{ name: string; timeType: '周' | '月' | '季'; dimensions: string[] }[]>(() => [
    { name: '明细（不分组）', timeType: '周', dimensions: [] },
    { name: 'Model+尺寸+周', timeType: '周', dimensions: ['Model Name', '尺寸'] },
    { name: '尺寸+周', timeType: '周', dimensions: ['尺寸'] },
  ]);
  const [activeLayoutName, setActiveLayoutName] = useState('MNT默认布局');
  const [activePlanObjName, setActivePlanObjName] = useState('明细（不分组）');
  const [layoutModalView, setLayoutModalView] = useState<'list' | 'create'>('list');
  const [planObjModalView, setPlanObjModalView] = useState<'list' | 'create'>('list');
  const [editingLayoutName, setEditingLayoutName] = useState<string | null>(null);
  const [editingPlanObjName, setEditingPlanObjName] = useState<string | null>(null);
  const [formLayoutName, setFormLayoutName] = useState('');
  const [formLayoutColumnFields, setFormLayoutColumnFields] = useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [formLayoutDataRows, setFormLayoutDataRows] = useState<Set<string>>(new Set(dataItems));
  const [formPlanObjName, setFormPlanObjName] = useState('');
  const [formPlanObjTimeType, setFormPlanObjTimeType] = useState<'周' | '月' | '季'>('周');
  const [formPlanObjDimensions, setFormPlanObjDimensions] = useState<Set<string>>(new Set());

  // 计划对象里勾选的分组维度（空 = 不分组，走明细逻辑）；时间粒度
  const groupByDimensions = useMemo(
    () => savedPlanObjects.find(p => p.name === activePlanObjName)?.dimensions ?? [],
    [savedPlanObjects, activePlanObjName]
  );
  const timeGranularity = useMemo(
    () => savedPlanObjects.find(p => p.name === activePlanObjName)?.timeType ?? '周',
    [savedPlanObjects, activePlanObjName]
  );

  const openCreateLayoutForm = () => {
    setEditingLayoutName(null);
    setFormLayoutName('');
    setFormLayoutColumnFields(new Set(DEFAULT_FIELDS));
    setFormLayoutDataRows(new Set(dataItems));
    setLayoutModalView('create');
  };
  const openEditLayoutForm = (name: string) => {
    const preset = savedLayouts.find(l => l.name === name);
    if (!preset) return;
    setEditingLayoutName(name);
    setFormLayoutName(preset.name);
    setFormLayoutColumnFields(new Set(preset.columnFields));
    setFormLayoutDataRows(new Set(preset.dataRows));
    setLayoutModalView('create');
  };
  const applyLayout = (name: string) => {
    const preset = savedLayouts.find(l => l.name === name);
    if (!preset) return;
    setExtendedColumns(new Set(preset.columnFields));
    setVisibleDataItems(new Set(preset.dataRows));
    setActiveLayoutName(name);
  };
  const saveLayoutForm = () => {
    if (!formLayoutName.trim()) return;
    const next = { name: formLayoutName.trim(), columnFields: Array.from(formLayoutColumnFields), dataRows: Array.from(formLayoutDataRows), editable: true };
    setSavedLayouts(prev => {
      const idx = prev.findIndex(l => l.name === editingLayoutName);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = next; return copy; }
      return [...prev, next];
    });
    setExtendedColumns(new Set(next.columnFields));
    setVisibleDataItems(new Set(next.dataRows));
    setActiveLayoutName(next.name);
    setLayoutModalView('list');
  };

  const openCreatePlanObjForm = () => {
    setEditingPlanObjName(null);
    setFormPlanObjName('');
    setFormPlanObjTimeType('周');
    setFormPlanObjDimensions(new Set());
    setPlanObjModalView('create');
  };
  const openEditPlanObjForm = (name: string) => {
    const preset = savedPlanObjects.find(p => p.name === name);
    if (!preset) return;
    setEditingPlanObjName(name);
    setFormPlanObjName(preset.name);
    setFormPlanObjTimeType(preset.timeType);
    setFormPlanObjDimensions(new Set(preset.dimensions));
    setPlanObjModalView('create');
  };
  const applyPlanObj = (name: string) => {
    if (!savedPlanObjects.find(p => p.name === name)) return;
    setActivePlanObjName(name);
  };
  const savePlanObjForm = () => {
    if (!formPlanObjName.trim()) return;
    const next = { name: formPlanObjName.trim(), timeType: formPlanObjTimeType, dimensions: Array.from(formPlanObjDimensions) };
    setSavedPlanObjects(prev => {
      const idx = prev.findIndex(p => p.name === editingPlanObjName);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = next; return copy; }
      return [...prev, next];
    });
    setActivePlanObjName(next.name);
    setPlanObjModalView('list');
  };

  useEffect(() => {
    const defaultCols = [
      groupingType === 'tech' ? 'techModel' : 'customer',
      groupingType === 'tech' ? null : 'sizeModel',
      'specs',
      'shippingLocation',
      'dataItem',
      ...MONTHS.map(m => m.name)
    ].filter(Boolean) as string[];
    setVisibleColumns(new Set(defaultCols));
  }, [groupingType]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const dataItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsColumnSettingsOpen(false);
      }
      if (dataItemRef.current && !dataItemRef.current.contains(event.target as Node)) {
        setIsDataItemFilterOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmitClick = () => {
    // 1. Identify all changes
    const changes: { rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[] = [];
    
    data.forEach(row => {
      if (!row.prevValues) return;
      Object.keys(row.values).forEach(key => {
        const newVal = row.values[key];
        const oldVal = row.prevValues?.[key] ?? newVal;
        if (newVal !== oldVal) {
          changes.push({
            rowId: row.id,
            key,
            oldVal,
            newVal,
            customer: row.customer,
            size: row.size,
            model: row.model,
            item: row.item
          });
        }
      });
    });

    if (changes.length === 0) {
      onSubmit();
      return;
    }

    // 2. Filter top 3 by absolute difference
    const top3 = changes
      .sort((a, b) => Math.abs(b.newVal - b.oldVal) - Math.abs(a.newVal - a.oldVal))
      .slice(0, 3);

    setItemsToValidate(top3);
    setIsBatchModalOpen(true);
  };

  const handleBatchConfirm = (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => {
    onBatchUpdateReasons?.(reasons);
    setIsBatchModalOpen(false);
    onSubmit();
  };

  const handleLocationSave = (id: string | null) => {
    if (onUpdateAttribute && id) {
      onUpdateAttribute(id, 'shippingLocation', locationInputValue);
    }
    setEditingLocationId(null);
  };

  const allColumns = [
    groupingType === 'tech' ? { id: 'techModel', label: '技术别 / Model' } : { id: 'customer', label: '集团客户名称' },
    ...(groupingType === 'tech' ? [] : [
      groupingType === 'customer-tech' ? { id: 'tech', label: '技术别' } : { id: 'sizeModel', label: '尺寸 / Model' }
    ]),
    { id: 'specs', label: '规格描述' },
    { id: 'shippingLocation', label: '收货地' },
    { id: 'dataItem', label: '数据项' },
    ...MONTHS.map(m => ({ id: m.name, label: m.name }))
  ];

  const allDataItems: string[] = dataItems.slice(0, 6);

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumns);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleColumns(next);
  };

  const toggleDataItem = (item: string) => {
    const next = new Set(visibleDataItems);
    if (next.has(item)) {
      if (next.size > 1) next.delete(item);
    } else {
      next.add(item);
    }
    setVisibleDataItems(next);
  };

  const displayItems = Array.from(visibleDataItems);

  const toggleGroup = (primary: string, secondary: string) => {
    const key = `${primary}-${secondary}`;
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  // Group data by Customer and Size OR Tech
  const groupedData: Record<string, Record<string, { total: ForecastRow[], models: Record<string, ForecastRow[]> }>> = {};
  
  if (groupingType === 'customer-size') {
    filteredData.forEach(row => {
      if (!groupedData[row.customer]) groupedData[row.customer] = {};
      if (!groupedData[row.customer][row.size]) {
        groupedData[row.customer][row.size] = { total: [], models: {} };
      }
      if (!row.model) {
        groupedData[row.customer][row.size].total.push(row);
      } else {
        if (!groupedData[row.customer][row.size].models[row.model]) {
          groupedData[row.customer][row.size].models[row.model] = [];
        }
        groupedData[row.customer][row.size].models[row.model].push(row);
      }
    });
  } else if (groupingType === 'customer-tech') {
    // Customer + Tech grouping (No expansion)
    filteredData.forEach(row => {
      const t = row.tech || 'N/A';
      if (!groupedData[row.customer]) groupedData[row.customer] = {};
      if (!groupedData[row.customer][t]) {
        groupedData[row.customer][t] = { total: [], models: {} };
      }
      
      const existingRow = groupedData[row.customer][t].total.find(r => r.item === row.item);
      if (!existingRow) {
        groupedData[row.customer][t].total.push({
           ...row,
           id: `agg-${row.customer}-${t}-${row.item}`,
           size: '聚合',
           model: undefined,
           values: { ...row.values },
           isAnomaly: row.isAnomaly ? { ...row.isAnomaly } : { ...row.values }, // simplified
        });
      } else {
        Object.keys(row.values).forEach(k => {
          existingRow.values[k] = (existingRow.values[k] || 0) + (row.values[k] || 0);
        });
      }
    });
  } else {
    // Tech grouping
    const techAgg: Record<string, Record<string, Record<string, ForecastRow>>> = {}; 

    filteredData.forEach(row => {
      if (!row.tech || row.tech === 'N/A' || !row.model) return;
      const t = row.tech;
      const m = row.model;
      const i = row.item;

      if (!techAgg[t]) techAgg[t] = {};
      if (!techAgg[t][m]) techAgg[t][m] = {};
      
      if (!techAgg[t][m][i]) {
        techAgg[t][m][i] = {
           ...row,
           id: `agg-${t}-${m}-${i}`,
           customer: '聚合',
           size: '汇总',
           values: { ...row.values },
           isAnomaly: row.isAnomaly ? { ...row.isAnomaly } : undefined,
           reasons: row.reasons ? { ...row.reasons } : undefined,
           tags: row.tags ? { ...row.tags } : undefined,
        };
      } else {
        const tr = techAgg[t][m][i];
        Object.keys(row.values).forEach(k => {
          tr.values[k] = (tr.values[k] || 0) + (row.values[k] || 0);
        });
      }
    });

    const techKeys = ['LTPS', 'VA', 'HFS', 'IPS'];

    techKeys.forEach(tech => {
      const modelsForTech = techAgg[tech] || {};
      const modelNames = Object.keys(modelsForTech);
      
      const p = tech;
      const s = '汇总';
      
      if (!groupedData[p]) groupedData[p] = {};
      groupedData[p][s] = { total: [], models: {} };
      
      allDataItems.forEach(item => {
        const synthRow: ForecastRow = {
           id: `synth-${tech}-${item}`,
           customer: '聚合',
           tech: tech,
           size: '汇总',
           item: item,
           values: {},
           isAnomaly: {},
           reasons: {},
           tags: {},
        };
        
        let hasData = false;
        modelNames.forEach(m => {
          const mRow = modelsForTech[m][item];
          if (mRow) {
            hasData = true;
            if (!groupedData[p][s].models[m]) groupedData[p][s].models[m] = [];
            groupedData[p][s].models[m].push(mRow);
            
            Object.keys(mRow.values).forEach(k => {
               synthRow.values[k] = (synthRow.values[k] || 0) + mRow.values[k];
            });
          }
        });
        
        // We push synthRow even if hasData is false so that rows align correctly and empty grids show up.
        groupedData[p][s].total.push(synthRow);
      });
    });
  }

  const primaryGroupNames = Object.keys(groupedData);
  const secondaryGroups: { primary: string, secondary: string }[] = [];
  primaryGroupNames.forEach(p => {
    Object.keys(groupedData[p]).forEach(s => {
      secondaryGroups.push({ primary: p, secondary: s });
    });
  });

  const handleLoadMore = () => {
    setVisibleRowsCount(prev => Math.min(prev + 3, secondaryGroups.length));
  };

  useEffect(() => {
    const handleBatchPaste = (e: any) => {
      const { text, startRowId, startColumnKey } = e.detail;
      if (!data.some(r => r.id === startRowId)) return;

      const renderedRows: ForecastRow[] = [];
      const currentDisplayItems = Array.from(visibleDataItems);
      secondaryGroups.slice(0, visibleRowsCount).forEach(group => {
        const { primary: p, secondary: s } = group;
        const { total, models } = groupedData[p][s];
        total.filter(r => currentDisplayItems.includes(r.item)).forEach(r => renderedRows.push(r));
        const isExpanded = expandedGroups.has(`${p}-${s}`);
        if (isExpanded) {
          Object.keys(models).forEach(modelName => {
            models[modelName].filter(r => currentDisplayItems.includes(r.item)).forEach(r => renderedRows.push(r));
          });
        }
      });

      const startRowIndex = renderedRows.findIndex(r => r.id === startRowId);
      if (startRowIndex === -1) return;

      const rowsText = text.split(/\r?\n/).filter((line: string) => line.trim() !== '');
      const weekKeys = MONTHS.flatMap(m => m.weeks.map(w => `${m.name}-${w}`));
      const startColIndex = weekKeys.indexOf(startColumnKey);
      if (startColIndex === -1) return;

      const updates: {rowId: string, key: string, newVal: number}[] = [];

      rowsText.forEach((rowText: string, rIdx: number) => {
        const targetRowIndex = startRowIndex + rIdx;
        if (targetRowIndex >= renderedRows.length) return;

        const targetRow = renderedRows[targetRowIndex];
        const isEditable = targetRow.item === '销售FCST (ETD)' || targetRow.item === 'ExtraSales';
        if (!isEditable) return;

        const cellsText = rowText.split('\t');
        cellsText.forEach((cellVal: string, cIdx: number) => {
          const targetColIndex = startColIndex + cIdx;
          if (targetColIndex >= weekKeys.length) return;

          const weekKey = weekKeys[targetColIndex];
          const val = Number(cellVal.replace(/,/g, ''));
          if (!isNaN(val)) {
            updates.push({rowId: targetRow.id, key: weekKey, newVal: val});
          }
        });
      });

      if (updates.length > 0) {
        onBatchUpdateValues?.(updates);
      }
    };

    window.addEventListener('batch-paste', handleBatchPaste);
    return () => window.removeEventListener('batch-paste', handleBatchPaste);
  });

  const [mergeMode, setMergeMode] = useState(false);
  const [sumMode, setSumMode] = useState(false);
  const [anomalyModalOpen, setAnomalyModalOpen] = useState(false);
  const [anomalyModalData, setAnomalyModalData] = useState<{ model: string; dataItem: string; week: string; value: number } | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [anomalyTotalFilter, setAnomalyTotalFilter] = useState(false);
  const [anomalyKeyFilter, setAnomalyKeyFilter] = useState(false);
  const [aiPredictionModalOpen, setAiPredictionModalOpen] = useState(false);
  const [aiPredictionLoading, setAiPredictionLoading] = useState(false);
  const [hideWeekCols, setHideWeekCols] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; weekKey: string; weekLabel: string; weekSub: string; size: string } | null>(null);
  const [deliveryModal, setDeliveryModal] = useState<{ weekLabel: string; weekSub: string; size: string; monthTotal: number } | null>(null);
  const [deliveryValues, setDeliveryValues] = useState<number[]>([100, 80, 90, 100, 80, 90, 65]);

  // 异常演示：定位到 P260816-22 版本的真实小米集团_TV Model 与当期周（WK32~WK34）
  const anomalyCells = new Set([
    'ST3151A07-5_客户FCST_wk32',
    'ST3151A07-5_客户FCST_wk33',
    'ST425AD02-7_客户FCST_wk33',
    'ST645AD12-1_客户FCST_wk34',
    'ST645AD12-1_销售FCST(ETD)_wk33',
    'ST746AD09-1_销售FCST(ETD)_wk32',
    'ST4251D02-1_客户FCST_wk32',
    'ST4251D02-1_客户FCST_wk33',
  ]);
  // 重点产品（KPI 战略 Model）
  const keyModels = new Set(['ST3151A07-5', 'ST645AD12-1', 'ST4251D02-1']);
  const anomalyTotalCount = anomalyCells.size;
  const anomalyKeyCount = Array.from(anomalyCells).filter(k => keyModels.has(k.split('_')[0])).length;

  // 模拟版本数据：该版本相较当前版本修改过的单元格 → 覆盖值，用于跳转后黄色底色标记
  const simOverrideMap = useMemo(() => {
    const map = new Map<string, number>();
    if (simulationVersion) {
      (SIMULATION_VERSION_OVERRIDES[simulationVersion] ?? []).forEach(o => {
        map.set(`${o.model}_${o.dataItem}_${o.weekKey}`, o.value);
      });
    }
    return map;
  }, [simulationVersion]);

  // 时间轴与列结构来自 P260816-22 真实数据
  const weekCols = FCSTDP_TIME;

  const months = Array.from(new Set(weekCols.map(c => c.month))).map(mid => ({
    id: mid,
    label: mid,
    cols: weekCols.filter(c => c.month === mid),
  }));

  const flatRows = useMemo(() => {
    const rows: { version: string; model: string; extVersion: string; size: string; groupId: string; customer: string; dataItem: string; values: number[] }[] = [];

    FCSTDP_MODELS.forEach(m => {
      dataItems.forEach(item => {
        const arr = m.v[item] || [];
        const values = weekCols.map((_col, idx) => arr[idx] ?? 0);
        rows.push({
          version: m.version, model: m.model, extVersion: m.extVersion,
          size: m.size, groupId: m.groupId, customer: m.customer,
          dataItem: item, values,
        });
      });
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tableBuType]);

  const displayRows = useMemo(() => {
    let filtered = flatRows;
    if (filterCustomer) {
      filtered = filtered.filter(r => r.customer.includes(filterCustomer));
    }
    if (filterDataItems && filterDataItems.length > 0) {
      filtered = filtered.filter(r => filterDataItems.includes(r.dataItem));
    } else {
      filtered = filtered.filter(r => visibleDataItems.has(r.dataItem));
    }
    if (anomalyTotalFilter) {
      const anomalyModelItems = new Set<string>();
      anomalyCells.forEach(key => {
        const parts = key.split('_');
        anomalyModelItems.add(`${parts[0]}_${parts[1]}`);
      });
      filtered = filtered.filter(r => anomalyModelItems.has(`${r.model}_${r.dataItem}`));
    }
    if (anomalyKeyFilter) {
      const anomalyModelItems = new Set<string>();
      anomalyCells.forEach(key => {
        const parts = key.split('_');
        if (keyModels.has(parts[0])) anomalyModelItems.add(`${parts[0]}_${parts[1]}`);
      });
      filtered = filtered.filter(r => anomalyModelItems.has(`${r.model}_${r.dataItem}`));
    }
    return filtered;
  }, [flatRows, filterCustomer, filterDataItems, anomalyTotalFilter, anomalyKeyFilter, visibleDataItems]);

  const activeDataItems: string[] = filterDataItems && filterDataItems.length > 0 ? filterDataItems : Array.from(visibleDataItems);

  // ===== 按计划对象所选维度分组汇总（空数组 = 不分组，走上面的明细 displayRows）=====
  const groupedRows = useMemo(() => {
    if (groupByDimensions.length === 0) return null;
    const map = new Map<string, { dims: Record<string, string>; dataItem: string; values: number[] }>();
    FCSTDP_MODELS.forEach(m => {
      activeDataItems.forEach(item => {
        const arr = m.v[item] || [];
        const values = weekCols.map((_col, idx) => arr[idx] ?? 0);
        const dims: Record<string, string> = {};
        groupByDimensions.forEach(f => { dims[f] = (m as any)[DATA_BACKED_FIELD_KEY[f]] ?? ''; });
        const key = groupByDimensions.map(f => dims[f]).join('__') + '__' + item;
        let entry = map.get(key);
        if (!entry) { entry = { dims, dataItem: item, values: new Array(weekCols.length).fill(0) }; map.set(key, entry); }
        values.forEach((v, idx) => { entry!.values[idx] += v; });
      });
    });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupByDimensions, activeDataItems, weekCols, mode, tableBuType]);

  const activeRows: { dims?: Record<string, string>; version?: string; model?: string; extVersion?: string; size?: string; groupId?: string; customer?: string; dataItem: string; values: number[] }[] =
    groupedRows ?? displayRows;
  const rowGroupKey = (r: typeof activeRows[number]) => (groupedRows ? groupByDimensions.map(f => r.dims![f]).join('|') : r.model!);
  const baseColumnFields = groupByDimensions.length > 0 ? groupByDimensions : EXTEND_FIELD_OPTIONS.filter(f => extendedColumns.has(f));
  const getBaseCellValue = (r: typeof activeRows[number], field: string): string => {
    if (groupedRows) return r.dims?.[field] ?? '';
    const key = DATA_BACKED_FIELD_KEY[field];
    return key ? ((r as any)[key] ?? '') : '';
  };

  // ===== 时间粒度：周 / 月 / 季 =====
  const isQuarterView = timeGranularity === '季';
  const effectiveHideWeek = hideWeekCols || timeGranularity === '月';
  const visibleWeekCols = effectiveHideWeek ? weekCols.filter(c => c.isMonthTotal) : weekCols;
  const visibleMonths = months.map(m => ({ ...m, cols: m.cols.filter(c => !effectiveHideWeek || c.isMonthTotal) })).filter(m => m.cols.length > 0);
  const quarterCols = useMemo(() => {
    const monthCols = weekCols.filter(c => c.isMonthTotal && c.key !== 'total');
    const map = new Map<string, { key: string; label: string; monthKeys: string[] }>();
    monthCols.forEach(c => {
      const yy = c.month.slice(0, 2);
      const mm = parseInt(c.month.slice(2), 10) || 0;
      const q = mm <= 3 ? 1 : mm <= 6 ? 2 : mm <= 9 ? 3 : 4;
      const qKey = `${yy}Q${q}`;
      if (!map.has(qKey)) map.set(qKey, { key: qKey, label: `${yy}年Q${q}`, monthKeys: [] });
      map.get(qKey)!.monthKeys.push(c.key);
    });
    return Array.from(map.values());
  }, [weekCols]);
  const quarterColIndices = useMemo(
    () => quarterCols.map(q => ({ ...q, indices: q.monthKeys.map(k => weekCols.findIndex(c => c.key === k)).filter(i => i >= 0) })),
    [quarterCols, weekCols]
  );
  const getQuarterValue = (values: number[], indices: number[]) => indices.reduce((sum, i) => sum + (values[i] ?? 0), 0);

  const ToggleSwitch = ({ label, active, onToggle: onTgl }: { label: string; active: boolean; onToggle: () => void }) => (
    <button
      onClick={onTgl}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
    >
      {active && <span className="text-[10px]">取消</span>}
      {!active && <span className="w-2 h-2 rounded-full border border-gray-400 inline-block"></span>}
      {label}
      {active && <span className="w-4 h-4 bg-white rounded-full inline-flex items-center justify-center"><Check size={10} className="text-blue-600" /></span>}
    </button>
  );

  return (
    <div className="flex flex-col w-full max-w-full bg-white rounded-xl border border-gray-200 shadow-sm relative z-0">
      {/* Anomaly Stats */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
        <button
          onClick={() => { setAnomalyTotalFilter(!anomalyTotalFilter); if (!anomalyTotalFilter) setAnomalyKeyFilter(false); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${anomalyTotalFilter ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
        >
          <AlertCircle size={14} className={anomalyTotalFilter ? 'text-red-500' : 'text-gray-400'} />
          异常总数
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${anomalyTotalFilter ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'}`}>{anomalyTotalCount}</span>
        </button>
        <button
          onClick={() => { setAnomalyKeyFilter(!anomalyKeyFilter); if (!anomalyKeyFilter) setAnomalyTotalFilter(false); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${anomalyKeyFilter ? 'bg-orange-50 border border-orange-300 text-orange-700' : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'}`}
        >
          <Target size={14} className={anomalyKeyFilter ? 'text-orange-500' : 'text-gray-400'} />
          重点产品异常
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${anomalyKeyFilter ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-700'}`}>{anomalyKeyCount}</span>
        </button>
        {(anomalyTotalFilter || anomalyKeyFilter) && (
          <span className="text-[10px] text-gray-400 ml-2">已筛选异常数据，再次点击取消</span>
        )}
      </div>

      {/* Top Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600 font-medium">布局:</span>
          <select
            value={activeLayoutName}
            onChange={e => applyLayout(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[100px]"
          >
            {savedLayouts.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
          <button onClick={() => { setLayoutModalView('list'); setIsLayoutSettingsOpen(true); }} className="p-1 text-gray-400 hover:text-gray-600"><Settings size={14} /></button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600 font-medium">计划对象:</span>
          <select
            value={activePlanObjName}
            onChange={e => applyPlanObj(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[80px]"
          >
            {savedPlanObjects.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <button onClick={() => { setPlanObjModalView('list'); setIsPlanObjSettingsOpen(true); }} className="p-1 text-gray-400 hover:text-gray-600"><Settings size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <ToggleSwitch label="列" active={colMode} onToggle={() => setColMode(!colMode)} />
          <ToggleSwitch label="合并" active={mergeMode} onToggle={() => { setMergeMode(!mergeMode); if (!mergeMode) setSumMode(false); }} />
          <ToggleSwitch label={sumMode ? '非合计' : '合计'} active={sumMode} onToggle={() => { setSumMode(!sumMode); if (!sumMode) setMergeMode(false); }} />
          <ToggleSwitch label="缩起周维度" active={hideWeekCols} onToggle={() => setHideWeekCols(!hideWeekCols)} />
        </div>
        <button
          onClick={() => { setIsColumnSettingsOpen(!isColumnSettingsOpen); setIsDataItemFilterOpen(false); }}
          className={`px-2.5 py-1 text-xs border rounded font-medium transition-colors ${isColumnSettingsOpen ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-500 text-blue-600 hover:bg-blue-50'}`}
        >扩展字段</button>
        <button
          onClick={() => { setIsDataItemFilterOpen(!isDataItemFilterOpen); setIsColumnSettingsOpen(false); }}
          className={`px-2.5 py-1 text-xs border rounded font-medium transition-colors ${isDataItemFilterOpen ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-500 text-blue-600 hover:bg-blue-50'}`}
        >扩展数据项</button>
        <span className="px-3 py-1 text-xs bg-orange-500 text-white rounded font-bold">数量单位为pcs</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Plus size={14} /> 新增
          </button>
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded font-bold"
            >...</button>
            {moreMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[120px] z-50">
                {['日志', '重置', '展开', '搜索', '发布记录'].map(item => (
                  <button
                    key={item}
                    onClick={() => setMoreMenuOpen(false)}
                    className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >{item}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 扩展字段面板 */}
      {isColumnSettingsOpen && (
        <div className="px-4 py-2.5 border-b border-gray-200 bg-blue-50/30" ref={settingsRef}>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700 transition-colors">
              <Check size={11} />
              <span className="font-medium">全选</span>
              <input type="checkbox" className="hidden" checked={extendedColumns.size === EXTEND_FIELD_OPTIONS.length} onChange={() => {
                if (extendedColumns.size === EXTEND_FIELD_OPTIONS.length) {
                  setExtendedColumns(new Set(EXTEND_FIELD_OPTIONS.slice(0, 6)));
                } else {
                  setExtendedColumns(new Set(EXTEND_FIELD_OPTIONS));
                }
              }} />
            </label>
            <button
              onClick={() => setExtendedColumns(new Set(EXTEND_FIELD_OPTIONS.slice(0, 6)))}
              className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <X size={11} />清空
            </button>
            {EXTEND_FIELD_OPTIONS.map(field => (
              <button
                key={field}
                onClick={() => {
                  const next = new Set(extendedColumns);
                  if (next.has(field)) { if (next.size > 1) next.delete(field); }
                  else { next.add(field); }
                  setExtendedColumns(next);
                }}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${extendedColumns.has(field) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
              >
                {field}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 扩展数据项面板 */}
      {isDataItemFilterOpen && (
        <div className="px-4 py-2.5 border-b border-gray-200 bg-blue-50/30" ref={dataItemRef}>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-700 transition-colors">
              <Check size={11} />
              <span className="font-medium">全选</span>
              <input type="checkbox" className="hidden" checked={visibleDataItems.size === dataItems.length} onChange={() => {
                if (visibleDataItems.size === dataItems.length) {
                  setVisibleDataItems(new Set(dataItems.slice(0, 4)));
                } else {
                  setVisibleDataItems(new Set(dataItems));
                }
              }} />
            </label>
            <button
              onClick={() => setVisibleDataItems(new Set(dataItems.slice(0, 4)))}
              className="flex items-center gap-0.5 px-2 py-0.5 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <X size={11} />清空
            </button>
            {dataItems.map(item => (
              <button
                key={item}
                onClick={() => toggleDataItem(item)}
                className={`px-2 py-0.5 text-xs rounded border transition-colors ${visibleDataItems.has(item) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter Row */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-200 bg-gray-50/50 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">BU:</span>
          <select className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-[80px] font-medium">
            <option>TV</option>
            <option>CID</option>
            <option>MNT</option>
            <option>NB</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">版本：</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs">
            <span className="font-medium">P260726-01</span>
            <button className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
          </div>
        </div>
        {/* 客户集团名称 - 多选搜索 */}
        <div className="flex items-center gap-1.5 relative">
          <span className="text-xs text-gray-600">客户集团名称</span>
          <div className="relative">
            <div
              onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'customerGroup' ? null : 'customerGroup')}
              className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs min-w-[120px] cursor-pointer hover:border-blue-400"
            >
              {filterCustomerGroup.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {filterCustomerGroup.map(v => (
                    <span key={v} className="bg-blue-100 text-blue-700 px-1 rounded flex items-center gap-0.5">
                      {v}<button onClick={(e) => { e.stopPropagation(); setFilterCustomerGroup(prev => prev.filter(x => x !== v)); }} className="hover:text-red-500"><X size={9} /></button>
                    </span>
                  ))}
                </div>
              ) : <span className="text-gray-400">请选择</span>}
            </div>
            {filterDropdownOpen === 'customerGroup' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-[180px] p-2">
                <input
                  type="text"
                  value={filterSearchCustomerGroup}
                  onChange={e => setFilterSearchCustomerGroup(e.target.value)}
                  placeholder="搜索..."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1"
                  autoFocus
                />
                <div className="max-h-32 overflow-y-auto">
                  {['小米集团_TV', '三星电子', 'TCL集团', '创维集团', '海信集团'].filter(x => x.includes(filterSearchCustomerGroup)).map(opt => (
                    <label key={opt} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer text-xs">
                      <input type="checkbox" checked={filterCustomerGroup.includes(opt)} onChange={() => setFilterCustomerGroup(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])} className="w-3 h-3 rounded" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* 客户简称 - 多选搜索 */}
        <div className="flex items-center gap-1.5 relative">
          <span className="text-xs text-gray-600">客户简称</span>
          <div className="relative">
            <div
              onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'customerShort' ? null : 'customerShort')}
              className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs min-w-[80px] cursor-pointer hover:border-blue-400"
            >
              {filterCustomerShort.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {filterCustomerShort.map(v => (
                    <span key={v} className="bg-blue-100 text-blue-700 px-1 rounded flex items-center gap-0.5">
                      {v}<button onClick={(e) => { e.stopPropagation(); setFilterCustomerShort(prev => prev.filter(x => x !== v)); }} className="hover:text-red-500"><X size={9} /></button>
                    </span>
                  ))}
                </div>
              ) : <span className="text-gray-400">请输入</span>}
            </div>
            {filterDropdownOpen === 'customerShort' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-[160px] p-2">
                <input
                  type="text"
                  value={filterSearchCustomerShort}
                  onChange={e => setFilterSearchCustomerShort(e.target.value)}
                  placeholder="搜索..."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1"
                  autoFocus
                />
                <div className="max-h-32 overflow-y-auto">
                  {['小米', '三星', 'TCL', '创维', '海信'].filter(x => x.includes(filterSearchCustomerShort)).map(opt => (
                    <label key={opt} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer text-xs">
                      <input type="checkbox" checked={filterCustomerShort.includes(opt)} onChange={() => setFilterCustomerShort(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])} className="w-3 h-3 rounded" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* Model Name - 多选搜索 */}
        <div className="flex items-center gap-1.5 relative">
          <span className="text-xs text-gray-600">Model Name</span>
          <div className="relative">
            <div
              onClick={() => setFilterDropdownOpen(filterDropdownOpen === 'modelName' ? null : 'modelName')}
              className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs min-w-[120px] cursor-pointer hover:border-blue-400"
            >
              {filterModelName.length > 0 ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {filterModelName.map(v => (
                    <span key={v} className="bg-blue-100 text-blue-700 px-1 rounded flex items-center gap-0.5">
                      {v}<button onClick={(e) => { e.stopPropagation(); setFilterModelName(prev => prev.filter(x => x !== v)); }} className="hover:text-red-500"><X size={9} /></button>
                    </span>
                  ))}
                </div>
              ) : <span className="text-gray-400">请输入</span>}
            </div>
            {filterDropdownOpen === 'modelName' && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 w-[180px] p-2">
                <input
                  type="text"
                  value={filterSearchModelName}
                  onChange={e => setFilterSearchModelName(e.target.value)}
                  placeholder="搜索..."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 mb-1"
                  autoFocus
                />
                <div className="max-h-32 overflow-y-auto">
                  {['ST5461D13-6', 'ST4251D02-1', 'ST5502F01-7', 'MNB601LS1-4', 'MNC207QS1-1'].filter(x => x.includes(filterSearchModelName)).map(opt => (
                    <label key={opt} className="flex items-center gap-2 px-1 py-1 hover:bg-gray-50 rounded cursor-pointer text-xs">
                      <input type="checkbox" checked={filterModelName.includes(opt)} onChange={() => setFilterModelName(prev => prev.includes(opt) ? prev.filter(x => x !== opt) : [...prev, opt])} className="w-3 h-3 rounded" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">技术别</span>
          <input type="text" placeholder="请输入" className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white w-[80px]" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[600px]" ref={scrollContainerRef}>
        <table className="w-full border-collapse text-xs min-w-[1400px]">
          <thead className="bg-gray-50 sticky top-0 z-40">
            {/* 维度列 + 月份分组行 */}
            <tr className="border-b border-gray-200">
              {baseColumnFields.map(field => (
                <th key={field} rowSpan={isQuarterView ? 1 : 2} className={`px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[100px] whitespace-nowrap ${groupedRows ? 'bg-green-50/60' : DEFAULT_FIELDS.has(field) ? 'bg-gray-50' : 'bg-blue-50/50'}`}>
                  <div className={`flex items-center gap-1 ${groupedRows ? 'text-green-700' : DEFAULT_FIELDS.has(field) ? '' : 'text-blue-700'}`}>{field} <ChevronDown size={10} className="text-gray-400" /></div>
                </th>
              ))}
              <th rowSpan={isQuarterView ? 1 : 2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[120px] bg-gray-50">
                <div className="flex items-center gap-1">数据项 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>
              {isQuarterView
                ? quarterColIndices.map(q => (
                  <th key={q.key} className="px-2 py-1.5 text-center font-bold text-gray-700 border-r border-gray-200 min-w-[85px] bg-gray-50">{q.label}</th>
                ))
                : visibleMonths.map(m => (
                  <th key={m.id} colSpan={m.cols.length} className="px-1 py-1.5 text-center font-bold text-gray-700 border-r border-gray-200 bg-gray-50">
                    {m.label}
                  </th>
                ))}
              {sumMode && (
                <th rowSpan={isQuarterView ? 1 : 2} className="sticky right-0 z-30 relative px-3 py-2 text-center font-medium text-gray-700 bg-gray-50 min-w-[60px]">
                  <span className="pointer-events-none absolute inset-0 border-l border-gray-300 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.2)]" />
                  合计
                </th>
              )}
            </tr>
            {!isQuarterView && (
              <tr className="border-b border-gray-200">
                {visibleWeekCols.map(col => (
                  <th key={col.key} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 min-w-[85px] ${col.highlight ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-700'}`}>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="font-bold">{col.label}</span>
                      <ChevronDown size={9} className="text-gray-400" />
                    </div>
                    {col.sub && <div className="text-[10px] text-gray-400 font-normal">{col.sub}</div>}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {activeRows.map((row, rowIdx) => {
              const isFirstOfModel = rowIdx === 0 || rowGroupKey(activeRows[rowIdx - 1]) !== rowGroupKey(row);
              const modelRowCount = activeDataItems.length;
              const rowSum = row.values.reduce((a, b) => a + b, 0);
              return (
                <tr key={rowIdx} className="group border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  {!mergeMode && baseColumnFields.map(field => (
                    <td key={field} className="px-3 py-2 text-gray-700 border-r border-gray-200 whitespace-nowrap">{getBaseCellValue(row, field) || '　'}</td>
                  ))}
                  {mergeMode && isFirstOfModel && baseColumnFields.map(field => (
                    <td key={field} rowSpan={modelRowCount} className="px-3 py-2 text-gray-700 border-r border-gray-200 align-middle whitespace-nowrap">{getBaseCellValue(row, field) || '　'}</td>
                  ))}
                  <td className={`px-3 py-2 border-r border-gray-200 font-medium ${row.dataItem === '销售FCST(ETD)' ? 'text-orange-500' : 'text-gray-800'}`}>
                    {row.dataItem}
                  </td>
                  {isQuarterView
                    ? quarterColIndices.map(q => {
                      const val = getQuarterValue(row.values, q.indices);
                      return (
                        <td key={q.key} className="px-2 py-2 text-right border-r border-gray-200 tabular-nums text-gray-700">
                          {val}
                        </td>
                      );
                    })
                    : visibleWeekCols.map((col) => {
                      const vIdx = weekCols.indexOf(col);
                      const val = row.values[vIdx];
                      const cellKey = row.model ? `${row.model}_${row.dataItem}_${col.key}` : '';
                      const isAnomaly = !groupedRows && anomalyCells.has(cellKey);
                      const isAiRow = row.dataItem === 'AI预测' && val > 0;
                      const simOverrideVal = !groupedRows ? simOverrideMap.get(cellKey) : undefined;
                      const isSimOverride = simOverrideVal !== undefined;
                      const displayVal = isSimOverride ? simOverrideVal : val;
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-2 text-right border-r border-gray-200 tabular-nums ${isAnomaly ? 'bg-red-100 text-red-700 font-bold cursor-pointer hover:bg-red-200 transition-colors' : isSimOverride ? 'bg-yellow-200 text-gray-800 font-bold' : isAiRow ? 'text-blue-600 cursor-pointer hover:bg-blue-50 transition-colors' : `text-gray-700 ${col.highlight ? 'bg-orange-50/50' : ''}`}`}
                          title={isSimOverride ? `模拟版本 ${simulationVersion} 修改：${val} → ${simOverrideVal}` : undefined}
                          onClick={isAnomaly ? () => { setAnomalyModalData({ model: row.model!, dataItem: row.dataItem, week: col.label, value: val }); setAnomalyModalOpen(true); } : isAiRow ? () => { setAiPredictionLoading(true); setAiPredictionModalOpen(true); setTimeout(() => setAiPredictionLoading(false), 3000); } : undefined}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (!groupedRows && row.dataItem === '销售FCST(ETD)') {
                              setContextMenu({ x: e.clientX, y: e.clientY, weekKey: col.key, weekLabel: col.label, weekSub: col.sub || '', size: row.size || '' });
                            }
                          }}
                        >
                          {displayVal}
                        </td>
                      );
                    })}
                  {sumMode && (
                    <td className="sticky right-0 z-10 relative px-2 py-2 text-right tabular-nums text-gray-700 font-medium bg-white group-hover:bg-gray-50">
                      <span className="pointer-events-none absolute inset-0 border-l border-gray-200 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]" />
                      {rowSum}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 flex justify-between items-center bg-gray-50 border-t border-gray-200">
        <span className="text-[10px] text-gray-400">宽度调整：120</span>
        <div className="flex gap-2">
          {onSimulate && (
            <button
              onClick={onSimulate}
              className="bg-white border border-blue-200 text-blue-700 px-5 py-2 rounded-lg font-bold hover:bg-blue-50 transition-all shadow-sm active:scale-95"
            >
              创建模拟版本
            </button>
          )}
          {onValidate && (
            <button
              onClick={onValidate}
              className="bg-white border border-blue-600 text-blue-600 px-6 py-2 rounded-lg font-bold hover:bg-blue-50 transition-all shadow-md active:scale-95"
            >
              执行校验
            </button>
          )}
          <button
            onClick={handleSubmitClick}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95"
          >
            保存
          </button>
          <button
            onClick={() => setPublishModalOpen(true)}
            className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition-all shadow-md active:scale-95"
          >
            发布
          </button>
        </div>
      </div>

      <BatchReasonModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        items={itemsToValidate}
        onConfirm={handleBatchConfirm}
      />

      <AddDataModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={(newData) => {
          setIsAddModalOpen(false);
        }}
      />

      {/* 布局管理弹窗 */}
      {isLayoutSettingsOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setIsLayoutSettingsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><span>🎨</span>布局管理</h3>
              <button onClick={() => setIsLayoutSettingsOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
            </div>

            {layoutModalView === 'list' && (
              <>
                <div className="px-6 pb-2">
                  <button onClick={openCreateLayoutForm} className="flex items-center gap-2 px-5 py-2.5 border border-blue-400 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-50 transition-colors">
                    <Plus size={14} /> 新建布局
                  </button>
                </div>
                <div className="px-6 py-3 space-y-3 max-h-[400px] overflow-y-auto">
                  {savedLayouts.map((layout) => (
                    <div
                      key={layout.name}
                      onClick={() => { applyLayout(layout.name); setIsLayoutSettingsOpen(false); }}
                      className={`px-4 py-3.5 rounded-xl border transition-all cursor-pointer ${layout.name === activeLayoutName ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-gray-900">{layout.name}</span>
                          {!layout.editable && <span className="ml-2 text-xs text-gray-400">预设</span>}
                        </div>
                        {layout.editable && (
                          <button onClick={(e) => { e.stopPropagation(); openEditLayoutForm(layout.name); }} className="text-orange-400 hover:text-orange-600 transition-colors">✏️</button>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{layout.columnFields.length}列-{layout.dataRows.length}行</div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 flex justify-end">
                  <button onClick={() => setIsLayoutSettingsOpen(false)} className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">关 闭</button>
                </div>
              </>
            )}

            {layoutModalView === 'create' && (
              <>
                <div className="px-6 pb-3">
                  <label className="text-xs text-gray-600 font-medium">名称</label>
                  <input
                    type="text"
                    value={formLayoutName}
                    onChange={e => setFormLayoutName(e.target.value)}
                    placeholder="请输入布局名称"
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="px-6 py-3 max-h-[400px] overflow-y-auto space-y-4">
                  <div>
                    <div className="text-xs text-gray-600 font-medium mb-2">列字段</div>
                    <label className="flex items-center gap-2 text-xs text-gray-700 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={EXTEND_FIELD_OPTIONS.every(f => !DATA_BACKED_FIELD_KEY[f] || formLayoutColumnFields.has(f))}
                        onChange={() => {
                          const allSelected = EXTEND_FIELD_OPTIONS.every(f => !DATA_BACKED_FIELD_KEY[f] || formLayoutColumnFields.has(f));
                          setFormLayoutColumnFields(allSelected ? new Set() : new Set(Object.keys(DATA_BACKED_FIELD_KEY)));
                        }}
                        className="w-3.5 h-3.5"
                      />
                      全选
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {EXTEND_FIELD_OPTIONS.map(field => {
                        const disabled = !DATA_BACKED_FIELD_KEY[field];
                        return (
                          <label key={field} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${disabled ? 'text-gray-400 border-gray-100 bg-gray-50 cursor-not-allowed' : 'text-gray-700 border-gray-200 hover:border-blue-300 cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={formLayoutColumnFields.has(field)}
                              onChange={() => setFormLayoutColumnFields(prev => {
                                const next = new Set(prev);
                                if (next.has(field)) next.delete(field); else next.add(field);
                                return next;
                              })}
                              className="w-3.5 h-3.5"
                            />
                            {field}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 font-medium mb-2">数据行</div>
                    <label className="flex items-center gap-2 text-xs text-gray-700 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formLayoutDataRows.size === dataItems.length}
                        onChange={() => setFormLayoutDataRows(formLayoutDataRows.size === dataItems.length ? new Set() : new Set(dataItems))}
                        className="w-3.5 h-3.5"
                      />
                      全选
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {dataItems.map(item => (
                        <label key={item} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:border-blue-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formLayoutDataRows.has(item)}
                            onChange={() => setFormLayoutDataRows(prev => {
                              const next = new Set(prev);
                              if (next.has(item)) next.delete(item); else next.add(item);
                              return next;
                            })}
                            className="w-3.5 h-3.5"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2">
                  <button onClick={() => setLayoutModalView('list')} className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">返 回</button>
                  <button
                    onClick={saveLayoutForm}
                    disabled={!formLayoutName.trim()}
                    className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >保 存</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* 计划对象管理弹窗 */}
      {isPlanObjSettingsOpen && createPortal(
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setIsPlanObjSettingsOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><span>🎨</span>计划对象管理</h3>
              <button onClick={() => setIsPlanObjSettingsOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><X size={18} /></button>
            </div>

            {planObjModalView === 'list' && (
              <>
                <div className="px-6 pb-2">
                  <button onClick={openCreatePlanObjForm} className="flex items-center gap-2 px-5 py-2.5 border border-blue-400 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-50 transition-colors">
                    <Plus size={14} /> 新建计划对象
                  </button>
                </div>
                <div className="px-6 py-3 space-y-3 max-h-[400px] overflow-y-auto">
                  {savedPlanObjects.map((obj) => (
                    <div
                      key={obj.name}
                      onClick={() => { applyPlanObj(obj.name); setIsPlanObjSettingsOpen(false); }}
                      className={`px-4 py-3.5 rounded-xl border transition-all cursor-pointer ${obj.name === activePlanObjName ? 'border-blue-300 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-gray-900">{obj.name}</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openEditPlanObjForm(obj.name); }} className="text-orange-400 hover:text-orange-600 transition-colors">✏️</button>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {obj.dimensions.length > 0 ? obj.dimensions.join('+') : '明细'}・按{obj.timeType}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 flex justify-end">
                  <button onClick={() => setIsPlanObjSettingsOpen(false)} className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">关 闭</button>
                </div>
              </>
            )}

            {planObjModalView === 'create' && (
              <>
                <div className="px-6 pb-3">
                  <label className="text-xs text-gray-600 font-medium">名称</label>
                  <input
                    type="text"
                    value={formPlanObjName}
                    onChange={e => setFormPlanObjName(e.target.value)}
                    placeholder="请输入计划对象名称"
                    className="mt-1 w-full text-sm border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div className="px-6 pb-3">
                  <div className="text-xs text-gray-600 font-medium mb-2">时间类型</div>
                  <div className="flex items-center gap-4">
                    {(['周', '月', '季'] as const).map(t => (
                      <label key={t} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                        <input type="radio" checked={formPlanObjTimeType === t} onChange={() => setFormPlanObjTimeType(t)} className="w-3.5 h-3.5" />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="px-6 py-3 max-h-[340px] overflow-y-auto">
                  <div className="text-xs text-gray-600 font-medium mb-2">数据行（分组维度）</div>
                  <div className="grid grid-cols-3 gap-2">
                    {EXTEND_FIELD_OPTIONS.map(field => {
                      const disabled = !DATA_BACKED_FIELD_KEY[field];
                      return (
                        <label key={field} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${disabled ? 'text-gray-400 border-gray-100 bg-gray-50 cursor-not-allowed' : 'text-gray-700 border-gray-200 hover:border-blue-300 cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={formPlanObjDimensions.has(field)}
                            onChange={() => setFormPlanObjDimensions(prev => {
                              const next = new Set(prev);
                              if (next.has(field)) next.delete(field); else next.add(field);
                              return next;
                            })}
                            className="w-3.5 h-3.5"
                          />
                          {field}
                        </label>
                      );
                    })}
                    <label className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed">
                      <input type="checkbox" checked disabled className="w-3.5 h-3.5" />
                      数据项
                    </label>
                  </div>
                </div>
                <div className="px-6 py-4 flex justify-end gap-2">
                  <button onClick={() => setPlanObjModalView('list')} className="px-6 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">返 回</button>
                  <button
                    onClick={savePlanObjForm}
                    disabled={!formPlanObjName.trim()}
                    className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >保 存</button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* AI异常归因弹窗 */}
      {anomalyModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">AI异常归因</h2>
              <button onClick={() => setAnomalyModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* 异常推理 */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4">异常推理</h3>
                <div className="bg-gray-50 rounded-xl p-5 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-800 mt-2 shrink-0"></span>
                    <p className="text-sm text-gray-700">归因：65寸Model B已EOP但仍报250件，疑似客户系统未同步产品状态或有尾货清仓需求</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-800 mt-2 shrink-0"></span>
                    <p className="text-sm text-gray-700">判断：存疑——EOP产品不应有新增预测，需人工确认</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-800 mt-2 shrink-0"></span>
                    <p className="text-sm text-gray-700">建议：联系小米对口PM确认是否为遗留订单转移或系统录入错误</p>
                  </div>
                </div>
              </div>

              {/* 规则分析 */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4">规则分析</h3>
                <div className="bg-gray-50 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-gray-800">规则①：产品生命周期校验</p>
                    <span className="text-xs font-bold text-red-500 px-2 py-0.5 bg-red-50 rounded">违反规则</span>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    <p>描述: 处于EOP（停产）阶段的产品，不应有新增FCST。</p>
                    <p>情况: 小米 65寸 Model B V1.1 已于 2026-01-15 进入EOP状态，但本周仍申报 250 件。</p>
                    <p>结论: EOP产品不应有新增预测，需与客户确认是否为遗留订单。</p>
                  </div>
                </div>
              </div>

              {/* 外部情报解读 */}
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4">外部情报解读</h3>
                <div className="bg-gray-50 rounded-xl p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-gray-800">小米电视宣布618大促提前启动，备货量同比增长25%</p>
                      <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-600 rounded font-medium shrink-0 ml-2">促销备货</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">原文：小米电视宣布今年618年中大促将提前至5月15日启动，涵盖55寸、65寸、75寸全系电视品类，预计面板备货量同比增长25%以上。</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">受影响对象：</span>小米/TV BU</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">影响方向：</span><span className="text-blue-600 underline">正向–促销活动拉动面板采购需求</span></p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs text-gray-500">相似度 0.82（高相关）</span>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">1</span>
                        <span className="text-xs text-gray-500">来源:企业公告</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-gray-800">TrendForce：2026年Q2全球电视面板价格预计上涨8-12%</p>
                      <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-600 rounded font-medium shrink-0 ml-2">面板涨价</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">原文：据TrendForce集邦咨询研究，受上游材料成本上涨及产能调控影响，2026年Q2全球电视面板价格预计上涨8-12%，其中大尺寸（65寸以上）涨幅更为显著。</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">受影响对象：</span>全尺寸TV面板</p>
                    <p className="text-sm text-gray-700"><span className="font-medium">影响方向：</span><span className="text-blue-600 underline">正向–涨价预期促使客户提前备货</span></p>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs text-gray-500">相似度 0.75（中高相关）</span>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">2</span>
                        <span className="text-xs text-gray-500">来源:行业研报</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* AI预测值解读弹窗 */}
      {aiPredictionModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">AI预测值解读</h2>
              <button onClick={() => setAiPredictionModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {aiPredictionLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
                <Loader2 size={28} className="animate-spin text-blue-500" />
                <span className="text-sm text-gray-500">数据加载中，请稍候…</span>
              </div>
            ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Final Prediction */}
              <div className="bg-blue-50 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">AI最终预测值</span>
                  <span className="text-2xl font-black text-blue-700">12,540 pcs</span>
                </div>
                <p className="text-xs text-gray-500 mb-4">ML模型基于客户最新FCST和历史趋势预测为10,000 pcs，叠加外部事件修正+25.4%后得出最终值。</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-[10px] text-gray-500 mb-1">ML预测值</div>
                    <div className="text-base font-bold text-gray-800">10,000</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-[10px] text-gray-500 mb-1">外部事件修正</div>
                    <div className="text-base font-bold text-green-600">+25.4%</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <div className="text-[10px] text-gray-500 mb-1">供应上限</div>
                    <div className="text-base font-bold text-gray-800">15,000</div>
                  </div>
                </div>
              </div>

              {/* ML Detail */}
              <div className="border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ChevronDown size={16} className="text-blue-600" />
                    <span className="text-sm font-bold text-gray-800">ML预测详情</span>
                  </div>
                  <span className="text-xs text-gray-500">预测值 10,000 | MAPE 8.2%</span>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-2 px-1">
                    <span>特征</span>
                    <span>对预测的贡献</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { name: '客户FCST', value: '+1,200 pcs', color: 'text-blue-700' },
                      { name: '异常标签（销售FCST异常）', value: '-800 pcs', color: 'text-red-600' },
                      { name: '历史发货基线', value: '+400 pcs', color: 'text-blue-700' },
                      { name: '产品生命周期（成长期）', value: '+150 pcs', color: 'text-blue-700' },
                      { name: '季节性因子', value: '+50 pcs', color: 'text-blue-700' },
                    ].map(f => (
                      <div key={f.name} className="flex items-center justify-between px-1 py-1.5">
                        <span className="text-sm text-gray-700">{f.name}</span>
                        <span className={`text-sm font-medium ${f.color}`}>{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* External Events */}
              <div className="border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ChevronDown size={16} className="text-blue-600" />
                    <span className="text-sm font-bold text-gray-800">外部事件修正</span>
                  </div>
                  <span className="text-xs text-gray-500">累计 +25.4%（2个事件）</span>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">下游品牌618备货需求增加</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">正向</span>
                      </div>
                      <span className="text-sm font-bold text-green-600">+30.2%</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">涨价预期可能导致客户提前囤货，存在真实需求放大的可能性。</p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>影响力 +0.7 | 相关性 0.8 | 相似度 0.6 | 衰减 0.9</span>
                      <span className="text-blue-500 cursor-pointer">查看原文</span>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">面板价格短期波动回调</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">负向</span>
                      </div>
                      <span className="text-sm font-bold text-red-600">-4.8%</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-2">短期价格回调可能抑制部分投机性采购，对稳定需求影响有限。</p>
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                      <span>影响力 -0.3 | 相关性 0.6 | 相似度 0.4 | 衰减 0.67</span>
                      <span className="text-blue-500 cursor-pointer">查看原文</span>
                    </div>
                  </div>
                  <div className="text-right text-sm font-medium text-gray-700">
                    累计修正：<span className="text-green-600 font-bold">+25.4%</span>
                  </div>
                </div>
              </div>
            </div>
            )}
          </motion.div>
        </div>,
        document.body
      )}

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div className="fixed inset-0 z-[99998]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}>
          <div
            className="absolute bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              onClick={() => {
                const sub = contextMenu.weekSub;
                const monthTotal = 600;
                setDeliveryModal({ weekLabel: contextMenu.weekLabel, weekSub: sub, size: contextMenu.size, monthTotal });
                setDeliveryValues([100, 80, 90, 100, 80, 90, 65]);
                setContextMenu(null);
              }}
            >
              特殊交期
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 特殊交期弹窗 */}
      {deliveryModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
          >
            <div className="p-6">
              <p className="text-sm text-gray-800 mb-4">
                特殊交期编辑 · <span className="text-green-600 font-bold">{deliveryModal.size}寸</span> · {deliveryModal.weekLabel} ({deliveryModal.weekSub}) · 月总量: <span className="font-bold">{deliveryModal.monthTotal}</span>
              </p>
              <div className="grid grid-cols-7 gap-3 mb-4">
                {(() => {
                  const parts = deliveryModal.weekSub.split('-');
                  const startMonth = parseInt(parts[0].slice(2, 4));
                  const startDay = parseInt(parts[0].slice(4, 6));
                  const days: string[] = [];
                  for (let i = 0; i < 7; i++) {
                    days.push(`${startMonth}/${startDay + i}`);
                  }
                  return days.map((day, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <span className="text-xs text-gray-500">{day}</span>
                      <input
                        type="number"
                        value={deliveryValues[i]}
                        onChange={(e) => {
                          const newVals = [...deliveryValues];
                          newVals[i] = Number(e.target.value) || 0;
                          setDeliveryValues(newVals);
                        }}
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-center text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  ));
                })()}
              </div>
              <p className="text-sm mb-4">
                合计: <span className="font-bold text-blue-600">{deliveryValues.reduce((a, b) => a + b, 0)}</span> / 月总量: {deliveryModal.monthTotal}
                {deliveryValues.reduce((a, b) => a + b, 0) === deliveryModal.monthTotal && (
                  <span className="text-green-600 ml-2">✓ 校验通过</span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeliveryModal(null)}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  确定
                </button>
                <button
                  onClick={() => setDeliveryModal(null)}
                  className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* 发布确认弹窗 */}
      {publishModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
          >
            <h3 className="text-lg font-bold text-gray-900 mb-3">确认发布</h3>
            <p className="text-sm text-gray-600 mb-6">确认发布版本 <span className="font-bold text-gray-800">P260726-01</span>？发布后数据将对下游可见，此操作不可撤回。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPublishModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => { setPublishModalOpen(false); onPublish?.(); }}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-all active:scale-95"
              >
                确认发布
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
};

const AnomalyRulesTable = ({ rows, onToggle, onEdit, defaultBU }: { rows: AnomalyRuleRow[], onToggle: (rowId: string) => void, onEdit: (ruleId: string, bu: AnomalyBU, dimension: string, time: string) => void, defaultBU?: string }) => {
  const [filterBU, setFilterBU] = useState<string>(defaultBU || '');
  const [filterScene, setFilterScene] = useState<string>('');

  useEffect(() => {
    if (defaultBU) setFilterBU(defaultBU);
  }, [defaultBU]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (filterBU && row.bu !== filterBU) return false;
      if (filterScene && !row.scenes.includes(filterScene as AnomalyScene)) return false;
      return true;
    });
  }, [rows, filterBU, filterScene]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-3">
        <select value={filterBU} onChange={e => setFilterBU(e.target.value)} className="h-8 px-3 border border-gray-200 rounded-md text-xs bg-white text-gray-700 outline-none focus:border-blue-500">
          <option value="">全部BU</option>
          {BU_ALL.map(bu => <option key={bu} value={bu}>{bu}</option>)}
        </select>
        <select value={filterScene} onChange={e => setFilterScene(e.target.value)} className="h-8 px-3 border border-gray-200 rounded-md text-xs bg-white text-gray-700 outline-none focus:border-blue-500">
          <option value="">全部场景</option>
          <option value="客户FCST分析">客户FCST分析</option>
          <option value="销售FCST分析">销售FCST分析</option>
          <option value="DP分析">DP分析</option>
        </select>
        <span className="text-[11px] text-gray-400">显示 {filteredRows.length} / {rows.length} 条</span>
      </div>
      <div className="w-full overflow-x-auto bg-white rounded-xl shadow-sm border border-gray-100">
        <table className="w-full text-xs border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50/80">
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:50}}>启用</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:150}}>规则名称</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:160}}>维度</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:90}}>时间粒度</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:140}}>场景</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:130}}>规则特有参数</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:70}}>适用BU</th>
              <th className="p-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-b border-gray-100" style={{width:50}}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, idx) => {
              const isGroupFirst = idx === 0 || filteredRows[idx - 1].ruleId !== row.ruleId;
              const buStyle = BU_TAG_STYLES[row.bu];
              return (
                <tr key={row.id} className={`hover:bg-blue-50/30 transition-colors ${isGroupFirst ? 'border-t border-gray-200' : ''}`}>
                  <td className="p-2.5 border-b border-gray-50">
                    <button
                      onClick={() => onToggle(row.id)}
                      className={`relative w-9 h-5 rounded-full transition-colors ${row.isEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${row.isEnabled ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </td>
                  <td className="p-2.5 border-b border-gray-50 text-gray-800">{row.name}</td>
                  <td className="p-2.5 border-b border-gray-50 text-gray-700">{row.dimension}</td>
                  <td className="p-2.5 border-b border-gray-50 text-gray-700">{row.timeGranularity}</td>
                  <td className="p-2.5 border-b border-gray-50">
                    <div className="flex flex-wrap gap-1">
                      {row.scenes.map(s => (
                        <span key={s} className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] whitespace-nowrap">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2.5 border-b border-gray-50 text-gray-600">{row.parameterSummary}</td>
                  <td className="p-2.5 border-b border-gray-50">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${buStyle.bg} ${buStyle.text}`}>{row.bu}</span>
                  </td>
                  <td className="p-2.5 border-b border-gray-50">
                    <button onClick={() => onEdit(row.ruleId, row.bu, row.dimension, row.timeGranularity)} className="text-blue-600 hover:text-blue-500 font-medium text-xs">修改</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const RuleEditDrawer = ({ isOpen, ruleId, bu, dimension, timeGranularity, onClose, onSave }: {
  isOpen: boolean; ruleId: string | null; bu: AnomalyBU | null; dimension: string | null; timeGranularity: string | null;
  onClose: () => void; onSave: (ruleId: string, values: Record<string, number>) => void;
}) => {
  const [thresholdValues, setThresholdValues] = useState<Record<string, number>>({});
  const definition = ANOMALY_RULE_DEFINITIONS.find(d => d.id === ruleId);

  useEffect(() => {
    if (definition) {
      const defaults: Record<string, number> = {};
      definition.drawerConfig.thresholds?.forEach(group => {
        group.inputs?.forEach(inp => { defaults[inp.id] = inp.defaultValue; });
        group.conditions?.forEach(cond => { cond.inputs.forEach(inp => { defaults[inp.id] = inp.defaultValue; }); });
      });
      setThresholdValues(defaults);
    }
  }, [ruleId]);

  if (!isOpen || !definition) return null;

  const { drawerConfig } = definition;

  const renderThresholdRow = (input: ThresholdInput) => (
    <div key={input.id} className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
      <span className="text-[13px] text-gray-700 w-[120px] shrink-0 font-medium">{input.label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] text-gray-500">{input.prefix}</span>
        <input
          type="number"
          value={thresholdValues[input.id] ?? input.defaultValue}
          onChange={e => setThresholdValues(prev => ({ ...prev, [input.id]: Number(e.target.value) }))}
          className="w-[80px] h-9 border border-gray-200 rounded-md px-3 text-sm text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all"
        />
        <span className="text-[13px] text-gray-500">{input.suffix}</span>
      </div>
    </div>
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-[100]" onClick={onClose}
      />
      <motion.div
        initial={{ x: 560 }} animate={{ x: 0 }} exit={{ x: 560 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 w-[560px] h-full bg-white z-[200] flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.1)]"
      >
        <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{drawerConfig.title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          <div className="mb-6">
            <div className="text-sm font-semibold text-gray-800 mb-3">规则信息</div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 space-y-2">
              <div className="flex"><span className="w-20 text-[13px] text-gray-400 shrink-0">适用BU</span><span className="text-[13px] text-gray-700">{bu}</span></div>
              <div className="flex"><span className="w-20 text-[13px] text-gray-400 shrink-0">对比维度</span><span className="text-[13px] text-gray-700">{dimension}</span></div>
              <div className="flex"><span className="w-20 text-[13px] text-gray-400 shrink-0">时间粒度</span><span className="text-[13px] text-gray-700">{timeGranularity}</span></div>
            </div>
          </div>

          {drawerConfig.fixedRules && drawerConfig.fixedRules.length > 0 && (
            <>
              <div className="h-px bg-gray-100 my-6" />
              <div className="mb-6">
                <div className="text-sm font-semibold text-gray-800 mb-3">固定规则</div>
                {drawerConfig.fixedRules.map((text, i) => (
                  <div key={i} className="p-3 bg-gray-50 rounded-md border-l-[3px] border-gray-300 mb-2.5 text-[13px] text-gray-600 leading-relaxed">{text}</div>
                ))}
              </div>
            </>
          )}

          {drawerConfig.thresholds && drawerConfig.thresholds.length > 0 && (
            <>
              <div className="h-px bg-gray-100 my-6" />
              <div>
                <div className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  阈值配置
                  <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">可修改</span>
                </div>
                {drawerConfig.thresholds.map((group, gi) => (
                  <div key={gi} className="mb-5">
                    <label className="block text-[13px] text-gray-600 font-medium mb-2">
                      {group.title}{group.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {group.preHint && <p className="text-xs text-gray-400 mb-3">{group.preHint}</p>}
                    {group.inputs && group.inputs.map(renderThresholdRow)}
                    {group.conditions && group.conditions.map((cond, ci) => (
                      <div key={ci}>
                        {ci > 0 && <div className="flex items-center justify-center my-2 text-blue-600 text-xs font-medium">AND</div>}
                        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 mb-2">
                          <div className="text-xs text-gray-400 mb-2 font-medium">{cond.title}</div>
                          {cond.inputs.map(renderThresholdRow)}
                        </div>
                      </div>
                    ))}
                    {group.hint && <p className="text-xs text-gray-400 mt-2">{group.hint}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-7 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="h-9 px-5 rounded-md text-sm text-gray-600 bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 transition-all">取消</button>
          <button onClick={() => { if (ruleId) onSave(ruleId, thresholdValues); }} className="h-9 px-5 rounded-md text-sm text-white bg-blue-600 hover:bg-blue-700 transition-all font-medium">保存</button>
        </div>
      </motion.div>
    </>
  );
};

const DataItemSelectCard = ({ onSelect }: { onSelect: (items: string[]) => void }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(['客户FCST', '销售FCST (ETD)', '需求计划']));
  const dataItems = ['客户FCST', 'AI预测', '销售FCST (ETD)', '需求计划', 'ExtraSales', 'ExtraUnmet'];

  const toggle = (item: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mt-3 shadow-sm">
      <p className="text-sm font-medium text-gray-700 mb-3">请选择您想查看的数据项：</p>
      <div className="flex flex-wrap gap-2 mb-4">
        {dataItems.map(item => (
          <button
            key={item}
            onClick={() => toggle(item)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              selected.has(item)
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        onClick={() => onSelect(Array.from(selected))}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all"
      >
        确认查看
      </button>
    </div>
  );
};

const RetrospectiveReport = () => {
  const detailData = [
    { customer: '三星电子', model: 'MDL-A7200', dp: '32万台', ai: '28万台', actual: '18万台', salesDeviation: '+77.8%', salesAccuracy: '42%', sales3m: '38%', aiDeviation: '+55.6%', aiAccuracy: '44%', ai3m: '40%', fva: '调整无效', category: '需人工介入' },
    { customer: '小米', model: 'MDL-C5500', dp: '8万台', ai: '10万台', actual: '14万台', salesDeviation: '-42.9%', salesAccuracy: '57%', sales3m: '52%', aiDeviation: '-28.6%', aiAccuracy: '71%', ai3m: '65%', fva: '调整无效', category: '需人工介入' },
    { customer: 'LG电子', model: 'MDL-B3100', dp: '18万台', ai: '15万台', actual: '12万台', salesDeviation: '+50.0%', salesAccuracy: '55%', sales3m: '50%', aiDeviation: '+25.0%', aiAccuracy: '75%', ai3m: '70%', fva: '调整无效', category: 'ML自动' },
    { customer: '海信', model: 'MDL-D8800', dp: '6万台', ai: '7万台', actual: '9万台', salesDeviation: '-33.3%', salesAccuracy: '65%', sales3m: '60%', aiDeviation: '-22.2%', aiAccuracy: '78%', ai3m: '72%', fva: '调整无效', category: 'ML自动' },
    { customer: 'TCL电子', model: 'MDL-E1200', dp: '5万台', ai: '4万台', actual: '3.5万台', salesDeviation: '+42.9%', salesAccuracy: '60%', sales3m: '55%', aiDeviation: '+14.3%', aiAccuracy: '86%', ai3m: '80%', fva: '调整有效', category: 'ML自动' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="text-center py-5 border-b-2 border-blue-600">
        <h2 className="text-[18px] font-bold text-blue-600">销售预测准确率 & 偏差复盘报告</h2>
        <p className="text-[12px] text-gray-500 mt-1">复盘周期：P260607-14</p>
      </div>

      <div className="p-5 space-y-6">
        {/* 摘要 */}
        <div>
          <div className="text-[14px] font-bold text-blue-600 mb-2 pl-3 border-l-4 border-blue-600">摘要</div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-[13px] text-gray-600 italic">
            （由LLM根据下方数据自动生成摘要）
          </div>
        </div>

        {/* 整体预测表现 */}
        <div>
          <div className="text-[14px] font-bold text-blue-600 mb-3 pl-3 border-l-4 border-blue-600">整体预测表现</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="py-2.5 px-4 text-left font-medium">指标</th>
                <th className="py-2.5 px-4 text-left font-medium">数值</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['客户预测总需求量', '128 万台'],
                ['实际发货数量', '105 万台'],
                ['3个月加权销售预测准确率', '+22%'],
                ['3个月加权AI预测准确率', '—'],
                ['销售预测准确率', '+15%'],
                ['AI预测准确率', '+15%'],
                ['销售预测偏差率', '+15%'],
                ['AI预测偏差率', '+15%'],
              ].map(([label, value], i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/30">
                  <td className="py-2.5 px-4 text-gray-700">{label}</td>
                  <td className={`py-2.5 px-4 font-semibold ${value.startsWith('+') ? 'text-red-600' : value === '—' ? 'text-blue-600' : 'text-gray-800'}`}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 明细维度洞察 */}
        <div>
          <div className="text-[14px] font-bold text-blue-600 mb-3 pl-3 border-l-4 border-blue-600">明细维度洞察（高偏差 Top 10）</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[900px]">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="py-2 px-2 text-left font-medium">客户</th>
                  <th className="py-2 px-2 text-left font-medium">Model</th>
                  <th className="py-2 px-2 text-left font-medium">销售FCST</th>
                  <th className="py-2 px-2 text-left font-medium">AI预测</th>
                  <th className="py-2 px-2 text-left font-medium">实际发货</th>
                  <th className="py-2 px-2 text-left font-medium">销售偏差率</th>
                  <th className="py-2 px-2 text-left font-medium">销售准确率</th>
                  <th className="py-2 px-2 text-left font-medium">3月销售准确率</th>
                  <th className="py-2 px-2 text-left font-medium">AI偏差率</th>
                  <th className="py-2 px-2 text-left font-medium">AI准确率</th>
                  <th className="py-2 px-2 text-left font-medium">3月AI准确率</th>
                  <th className="py-2 px-2 text-left font-medium">FVA判定</th>
                  <th className="py-2 px-2 text-left font-medium">机型分类</th>
                </tr>
              </thead>
              <tbody>
                {detailData.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/30">
                    <td className="py-2 px-2 font-medium text-gray-800">{row.customer}</td>
                    <td className="py-2 px-2 text-gray-600">{row.model}</td>
                    <td className="py-2 px-2">{row.dp}</td>
                    <td className="py-2 px-2">{row.ai}</td>
                    <td className="py-2 px-2">{row.actual}</td>
                    <td className={`py-2 px-2 font-semibold ${row.salesDeviation.startsWith('+') ? 'text-red-600' : 'text-green-600'}`}>{row.salesDeviation}</td>
                    <td className={`py-2 px-2 font-semibold ${parseInt(row.salesAccuracy) < 70 ? 'text-red-600' : 'text-blue-600'}`}>{row.salesAccuracy}</td>
                    <td className={`py-2 px-2 font-semibold ${parseInt(row.sales3m) < 70 ? 'text-red-600' : 'text-blue-600'}`}>{row.sales3m}</td>
                    <td className={`py-2 px-2 font-semibold ${row.aiDeviation.startsWith('+') ? 'text-red-600' : 'text-green-600'}`}>{row.aiDeviation}</td>
                    <td className={`py-2 px-2 font-semibold ${parseInt(row.aiAccuracy) < 70 ? 'text-red-600' : 'text-blue-600'}`}>{row.aiAccuracy}</td>
                    <td className={`py-2 px-2 font-semibold ${parseInt(row.ai3m) < 70 ? 'text-red-600' : 'text-blue-600'}`}>{row.ai3m}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${row.fva === '调整有效' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{row.fva}</span>
                    </td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${row.category === 'ML自动' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>{row.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">* 仅展示触发阈值的 Top 10（按偏差率绝对值降序）</p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3 text-[11px] text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700">分类规则：</p>
            <p><span className="bg-blue-50 text-blue-700 px-1 rounded font-mono text-[10px]">ML自动</span>：AI预测准确率 &gt; 70% 且 AI预测偏差率 &lt; +/-30%</p>
            <p><span className="bg-red-50 text-red-700 px-1 rounded font-mono text-[10px]">需人工介入</span>：AI预测准确率 &lt;= 70% 且 AI预测偏差率 &gt;= +/-30%</p>
            <p><span className="font-medium">FVA判定</span>：销售预测准确率 &gt; AI预测准确率 → 调整有效；反之 → 调整无效</p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-gray-400 pt-3 border-t border-gray-100">
          报告生成时间：2026年6月 | 数据来源：CRM系统 + SAP Billing | 复盘周期：P260607-14
        </div>
      </div>
    </div>
  );
};

const CustomerFCSTRawTable = () => {
  const rawData = [
    { id: 1, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '97.5', model: 'ST975AD04-1', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [6, 9, 9, 9, 6, 39, 0, 0, 0, 0, 0, 0, 0] },
    { id: 2, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '97.5', model: 'ST975AD05-2', extVersion: '2.2', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [1930, 3376, 3376, 3376, 2892, 14950, 226, 1580, 1580, 1580, 1580, 1580, 1580] },
    { id: 3, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '97.5', model: 'ST975AD02-8', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [3195, 5591, 5591, 5591, 4790, 24758, 412, 2884, 2884, 2884, 2884, 2884, 2884] },
    { id: 4, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '97.5', model: 'ST975AD03-2', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [805, 1408, 1408, 1408, 1203, 6232, 289, 2021, 2021, 2021, 2021, 2021, 2021] },
    { id: 5, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '97.5', model: 'ST975AD03-3', extVersion: '1.0', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 6, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '114.5', model: 'STB451D01-1', extVersion: '2.4', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [38, 66, 66, 66, 54, 290, 5, 34, 34, 34, 34, 34, 34] },
    { id: 7, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '114.5', model: 'STB45AD01-2', extVersion: '2.2', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 8, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '31.5', model: 'ST3151B07-1', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [32140, 56245, 56245, 56245, 48208, 249083, 6777, 47435, 47435, 47435, 47435, 47435, 47435] },
    { id: 9, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '31.5', model: 'ST3151A07-5', extVersion: '2.2', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 10, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '42.5', model: 'ST4251B05-2', extVersion: '2.5', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [9559, 16727, 16727, 16727, 14336, 74076, 1294, 9054, 9054, 9054, 9054, 9054, 9054] },
    { id: 11, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '42.5', model: 'ST425AB05-4', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 12, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '42.5', model: 'ST425AD02-7', extVersion: '2.1', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [1162, 2033, 2033, 2033, 1739, 9000, 0, 0, 0, 0, 0, 0, 0] },
    { id: 13, version: '20260712215056566', customer: 'TCL品牌集团_TV', size: '54.6', model: 'ST5461D12-4', extVersion: '2.3', domain: '', shipFrom: '', customerPN: '', deliveryTo: '', offeringId: '', weeks: [17403, 30456, 30456, 30456, 26102, 134873, 4449, 31139, 31139, 31139, 31139, 31139, 31139] },
  ];

  const weekColumns = [
    { key: 'wk27', label: 'WK27', sub: '260701-04' },
    { key: 'wk28', label: 'WK28', sub: '260705-11' },
    { key: 'wk29', label: 'WK29', sub: '260712-18' },
    { key: 'wk30', label: 'WK30', sub: '260719-25' },
    { key: 'wk31', label: 'WK31', sub: '260726-31' },
    { key: 'm2607', label: 'M26-07', sub: '' },
    { key: 'wk31b', label: 'WK31', sub: '260801-01' },
    { key: 'wk32', label: 'WK32', sub: '260802-08' },
    { key: 'wk33', label: 'WK33', sub: '260809-15' },
    { key: 'wk34', label: 'WK34', sub: '260816-22' },
    { key: 'wk35', label: 'WK35', sub: '260823-29' },
    { key: 'wk36', label: 'WK36', sub: '260830-05' },
    { key: 'm2608', label: 'M26-08', sub: '' },
  ];

  const [filters, setFilters] = useState({
    version: '',
    modelName: '',
    customerGroup: '',
    extVersion: '',
    customerPN: '',
    deliveryTo: '',
    size: '',
    periodStart: '202601',
    periodEnd: '202712',
  });

  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingSuccess, setMappingSuccess] = useState(false);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Mapping Modal */}
      {isMappingModalOpen && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold text-gray-800">客户料号映射关系-新增</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded">New</span>
              </div>
              <button onClick={() => { setIsMappingModalOpen(false); setMappingSuccess(false); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            {mappingSuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 gap-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <Check size={32} className="text-green-600" />
                </div>
                <p className="text-lg font-bold text-gray-800">新增成功</p>
                <p className="text-sm text-gray-500">客户料号映射关系已成功创建</p>
                <button
                  onClick={() => { setIsMappingModalOpen(false); setMappingSuccess(false); }}
                  className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all"
                >
                  确定
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
                    <span className="text-sm font-bold text-gray-800">基本信息</span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-6 gap-y-5">
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block"><span className="text-red-500">*</span> BU：</label>
                      <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none">
                        <option value=""></option>
                        <option value="TV">TV</option>
                        <option value="CID">CID</option>
                        <option value="MNT">MNT</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">客户集团：</label>
                      <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white appearance-none">
                        <option value=""></option>
                        <option value="TCL品牌集团_TV">TCL品牌集团_TV</option>
                        <option value="小米集团">小米集团</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">客户PN：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">华星Modelname：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">对外版次：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">产品ID：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">Product ID：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">Offering ID：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1.5 block">备注：</label>
                      <input type="text" placeholder="请输入" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => setIsMappingModalOpen(false)}
                    className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => setMappingSuccess(true)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95"
                  >
                    保存
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200">
        <h2 className="text-base font-bold text-gray-800">查看客户FCST管理</h2>
      </div>

      {/* Filter Area */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
        <div className="grid grid-cols-5 gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">版本<span className="text-red-500">*</span></span>
            <input type="text" placeholder="请选择" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">Model Name</span>
            <input type="text" placeholder="请输入" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">客户集团名称</span>
            <select className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0 appearance-none">
              <option value=""></option>
              <option value="TCL品牌集团_TV">TCL品牌集团_TV</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">对外版次</span>
            <input type="text" placeholder="请输入" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs text-gray-600 whitespace-nowrap">周期</span>
            <input type="text" value="202601" className="w-16 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-center" readOnly />
            <span className="text-xs text-gray-400">~</span>
            <input type="text" value="202712" className="w-16 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-center" readOnly />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">客户PN</span>
            <input type="text" placeholder="请输入" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">交付地点</span>
            <input type="text" placeholder="请输入" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 whitespace-nowrap">尺寸</span>
            <input type="text" placeholder="请输入" className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white min-w-0" />
          </div>
          <div className="col-span-2 flex items-center justify-end gap-2">
            <button className="px-5 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-colors">搜 索</button>
            <button className="px-5 py-1.5 bg-white text-gray-700 text-xs font-bold rounded border border-gray-300 hover:bg-gray-50 transition-colors">重 置</button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2 flex-wrap">
        <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded flex items-center gap-1 hover:bg-blue-700">
          <Plus size={12} /> 发布
        </button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded flex items-center gap-1 hover:bg-gray-50">
          <Edit2 size={12} /> 保存
        </button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded flex items-center gap-1 hover:bg-gray-50">
          <Download size={12} /> 导出
        </button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded hover:bg-gray-50">下载模板</button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded hover:bg-gray-50">导入</button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded hover:bg-gray-50">查看异常数据</button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded hover:bg-gray-50">计划对象</button>
        <button
          onClick={() => setIsMappingModalOpen(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-medium transition-colors"
        >
          客户料号映射-新增
        </button>
        <button className="px-3 py-1.5 bg-white text-gray-700 text-xs border border-gray-300 rounded hover:bg-gray-50">日志</button>
        <button className="px-3 py-1.5 bg-white text-blue-600 text-xs border border-blue-300 rounded hover:bg-blue-50 font-medium">扩展字段</button>
        <span className="ml-auto text-xs text-gray-500">发布状态：未发布</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[1800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 sticky left-0 bg-gray-50 z-10 w-12">序号</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[140px]">
                <div className="flex items-center gap-1">版本号 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[120px]">
                <div className="flex items-center gap-1">客户集团名称 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 w-16">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> 尺寸 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[110px]">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> Model Name <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 w-20">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> 对外版次 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 w-16">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> 领域 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[80px]">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> 发货地点 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[80px]">客户PN</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[80px]">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> 交付地点 <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-600 border-r border-gray-100 min-w-[80px]">
                <div className="flex items-center gap-1"><Edit2 size={10} className="text-gray-400" /> Offering ID <Edit2 size={10} className="text-gray-400" /></div>
              </th>
              {/* Month header spanning weeks */}
              <th colSpan={5} className="px-1 py-1 text-center font-medium text-gray-600 border-r border-gray-200 border-b-0 bg-gray-50">
                <div className="text-xs font-bold">2607</div>
              </th>
              <th className="px-1 py-1 text-center font-medium text-gray-600 border-r border-gray-200 bg-gray-50"></th>
              <th colSpan={5} className="px-1 py-1 text-center font-medium text-gray-600 border-r border-gray-200 bg-gray-50">
                <div className="text-xs font-bold">2608</div>
              </th>
              <th className="px-1 py-1 text-center font-medium text-gray-600 bg-gray-50"></th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="sticky left-0 bg-gray-50 z-10 border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              <th className="border-r border-gray-100"></th>
              {weekColumns.map((col) => (
                <th key={col.key} className="px-2 py-1.5 text-center font-medium text-gray-600 border-r border-gray-100 min-w-[80px]">
                  <div className="flex items-center justify-center gap-0.5">
                    <Edit2 size={9} className="text-gray-400" />
                    <span className="font-bold">{col.label}</span>
                  </div>
                  {col.sub && <div className="text-[10px] text-gray-400 font-normal">{col.sub}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rawData.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                <td className="px-3 py-2.5 text-gray-500 sticky left-0 bg-white z-10 border-r border-gray-100">{row.id}</td>
                <td className="px-3 py-2.5 text-gray-700 border-r border-gray-100 font-mono text-[10px]">{row.version}</td>
                <td className="px-3 py-2.5 text-gray-700 border-r border-gray-100">{row.customer}</td>
                <td className="px-3 py-2.5 text-gray-700 border-r border-gray-100 text-center">{row.size}</td>
                <td className="px-3 py-2.5 text-gray-700 border-r border-gray-100 font-mono">{row.model}</td>
                <td className="px-3 py-2.5 text-gray-700 border-r border-gray-100 text-center">{row.extVersion}</td>
                <td className="px-3 py-2.5 text-gray-400 border-r border-gray-100">{row.domain}</td>
                <td className="px-3 py-2.5 text-gray-400 border-r border-gray-100">{row.shipFrom}</td>
                <td className="px-3 py-2.5 text-gray-400 border-r border-gray-100">{row.customerPN}</td>
                <td className="px-3 py-2.5 text-gray-400 border-r border-gray-100">{row.deliveryTo}</td>
                <td className="px-3 py-2.5 text-gray-400 border-r border-gray-100">{row.offeringId}</td>
                {row.weeks.map((val, idx) => (
                  <td key={idx} className={`px-2 py-2.5 text-right border-r border-gray-100 tabular-nums ${weekColumns[idx]?.label.startsWith('M') ? 'font-bold bg-gray-50/50' : ''}`}>
                    {val.toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'agent', content: '您好！我是您的需求感知/共识助手。有什么我可以帮您的？', type: 'text' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [userRole, setUserRole] = useState<'sales' | 'director' | 'sales-admin' | 'sales-admin-head'>('sales');
  const [buType, setBuType] = useState<'TV' | 'CID' | 'MNT' | 'NB' | '车载' | 'MC'>('TV');
  const [validationScene, setValidationScene] = useState<AnomalyScene>('销售FCST分析');
  const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
  const [backupForecastData, setBackupForecastData] = useState<ForecastRow[] | null>(null);
  const [anomalyRuleRows, setAnomalyRuleRows] = useState<AnomalyRuleRow[]>([]);
  const [drawerState, setDrawerState] = useState<DrawerEditState>({ isOpen: false, ruleId: null, bu: null, dimension: null, timeGranularity: null });
  const [savedThresholds, setSavedThresholds] = useState<Record<string, Record<string, number>>>({});
  const [crmModal, setCrmModal] = useState<{ title: string; image: string } | null>(null);
  const [showHomepage, setShowHomepage] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ id: string; title: string; date: string }[]>([
    { id: 'h1', title: '调整本周销售FCST', date: '26-08-10' },
    { id: 'h2', title: '查看预测复盘报告', date: '26-08-10' },
    { id: 'h3', title: '查询客户FCST变化', date: '26-08-10' },
    { id: 'h4', title: '7月销量是多少？', date: '26-08-09' },
    { id: 'h5', title: '查看本周DP', date: '26-08-09' },
    { id: 'h6', title: 'CRM基础数据维护', date: '26-08-08' },
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);


  const handleToggleRule = (rowId: string) => {
    setAnomalyRuleRows(prev => prev.map(row =>
      row.id === rowId ? { ...row, isEnabled: !row.isEnabled } : row
    ));
  };

  const handleEditRule = (ruleId: string, bu: AnomalyBU, dimension: string, time: string) => {
    setDrawerState({ isOpen: true, ruleId, bu, dimension, timeGranularity: time });
  };

  const handleSaveDrawer = (ruleId: string, values: Record<string, number>) => {
    const bu = drawerState.bu;
    if (bu) setSavedThresholds(prev => ({ ...prev, [`${ruleId}-${bu}`]: values }));
    setDrawerState(prev => ({ ...prev, isOpen: false }));
  };

  const handleCloseDrawer = () => {
    setDrawerState(prev => ({ ...prev, isOpen: false }));
  };

  const processMessage = async (text: string) => {
    if (showHomepage) {
      setShowHomepage(false);
      setChatHistory(prev => [{ id: Date.now().toString(), title: text.slice(0, 20), date: '26-08-10' }, ...prev]);
    }
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, type: 'text' };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate agent processing
    setTimeout(() => {
      setIsTyping(false);
      if (text.startsWith('查看规则详情:')) {
        const ruleName = text.slice('查看规则详情:'.length);
        const ruleDef = ANOMALY_RULE_DEFINITIONS.find(r => r.name === ruleName);
        if (ruleDef && RULE_DETAIL_COMPONENTS[ruleDef.id]) {
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: `${ruleDef.name}校验详情如下：`,
            type: 'rule-detail-table',
            data: ruleDef.id,
            buType: buType
          };
          setMessages(prev => [...prev, agentMsg]);
        } else {
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: '暂无详细校验数据',
            type: 'text'
          };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if (text === 'CRM配置') {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '好的，以下是CRM系统可供跳转的页面清单，请点击页面名称进入对应配置页面：',
          type: 'crm-page-list',
          data: [
            { group: '数据源配置', pages: [
              { name: '公共邮箱配置', image: 'crm/email-config.png' },
              { name: '公共盘配置', image: 'crm/shared-drive.png' },
            ]},
            { group: '原始表及映射关系', pages: [
              { name: '客户原始FCST', image: 'crm/customer-fcst.png' },
              { name: '客户料号映射关系', image: 'crm/part-mapping.png' },
              { name: '产品与客户Mapping关系', image: 'crm/product-mapping.png' },
              { name: 'Forecast映射配置规则清单', image: 'crm/forecast-rules.png' },
            ]},
          ]
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看模拟经营结果') {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '请选择要对比的版本：',
          type: 'version-select'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看客户FCST管理' || text === '查看客户原始fcst' || text === '查看客户原始FCST') {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '好的，为您展示客户原始FCST管理页面。您可以在此查看客户原始预测数据，支持按版本、Model Name、客户集团等条件筛选。',
          type: 'customer-fcst-raw'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '解释客户FCST变化识别') {
        const data: RuleExplanationData = {
          ruleList: [
            {
              name: '客户FCST变化识别',
              threshold: '偏离均值>15%',
              bu: 'TV',
              productLine: 'LCD',
              status: true,
              triggerCount3m: 120,
              triggerCount6m: 250,
              lastModified: '2026-03-20 14:30'
            }
          ],
          summary: {
            topCustomers: [
              { name: '小米', count: 45 },
              { name: '华为', count: 32 },
              { name: '三星', count: 28 }
            ],
            topProducts: [
              { name: '55寸 LCD', count: 50 },
              { name: '65寸 LCD', count: 40 },
              { name: '75寸 LCD', count: 30 }
            ]
          },
          historyTable: [
            { customer: '小米', model: 'Model A', count3m: 45, count6m: 90 },
            { customer: '华为', model: 'Model B', count3m: 32, count6m: 70 },
            { customer: '三星', model: 'Model C', count3m: 28, count6m: 55 },
            { customer: 'OPPO', model: 'Model A', count3m: 15, count6m: 35 }
          ],
          aiAnalysis: {
            explanation: '此规则用于检测各版本预测偏离均值的程度，超过15%视为异常，可能影响生产计划准确性。通过监控客户预测的波动，提前识别潜在的供需风险。',
            evaluation: {
              accuracy: '80%',
              details: '基于历史数据分析，在触发该规则的120次异常中，有96次用户随后手工修改了预测数值（视为真实异常），准确率表现良好。'
            },
            suggestion: '该规则近3个月触发120次，其中80%为真实异常，建议保持当前阈值；但小米产品线误报较多，建议针对该客户单独调整阈值至20%以减少干扰。'
          }
        };
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: `为您查询到"客户FCST变化识别"规则的详细解释及历史分析如下：\n\n规则解释：此规则用于检测各版本预测偏离均值的程度，超过15%视为异常，可能影响生产计划准确性。通过监控客户预测的波动，提前识别潜在的供需风险。\n\n效果评估：准确率:80%。基于历史数据分析，在触发该规则的120次异常中，有96次用户随后手工修改了预测数值（视为真实异常），准确率表现良好。\n\n优化建议：该规则近3个月触发120次，其中80%为真实异常，建议保持当前阈值；但小米产品线误报较多，建议针对该客户单独调整阈值至20%以减少干扰。`, 
          type: 'rule-explanation',
          data: data
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('查看并调整DP')) {
        const initialData = generateInitialData(buType);
        setForecastData(initialData);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，为您进入${buType} DP调整页面。您可以在此查看并调整需求计划相关数据。`,
          type: 'dp-table',
          data: initialData,
          buType: buType
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('查看本周DP')) {
        const initialData = generateInitialData(buType);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，为您展示${buType} 本周DP数据（只读模式）。`,
          type: 'dp-table-readonly',
          data: initialData,
          buType: buType
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '确认查看本周销售fcst') {
        const effectiveBu = buType;
        if (effectiveBu === 'MNT') {
          const mntData = generateMNTData();
          const agentMsg: Message = { id: (Date.now() + 1).toString(), role: 'agent', content: '好的，为您展示MNT BU本周销售预测数据（只读模式）。', type: 'mnt-table', data: mntData };
          setMessages(prev => [...prev, agentMsg]);
        } else if (effectiveBu === 'NB' || effectiveBu === 'MC') {
          const nbData = generateNBData();
          const agentMsg: Message = { id: (Date.now() + 1).toString(), role: 'agent', content: `好的，为您展示${effectiveBu} BU本周销售预测数据（只读模式）。`, type: 'nb-table', data: nbData };
          setMessages(prev => [...prev, agentMsg]);
        } else {
          const initialData = generateInitialData(buType);
          const agentMsg: Message = { id: (Date.now() + 1).toString(), role: 'agent', content: '好的，为您展示本周销售预测数据（只读模式）。', type: 'table-readonly', data: initialData };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if (
        ((text.includes('销售fcst') || text.includes('销售FCST') || text.includes('客户FCST') || text.includes('FCST') || text.includes('fcst')) && (text.includes('查看本周') || text.includes('调整本周') || text.includes('查询本周') || text.includes('查询')))
        || (text.includes('查询') && (text.includes('客户') || text.includes('销量') || text.includes('预测') || text.includes('需求')))
      ) {
        const initialData = generateInitialData(buType);
        setForecastData(initialData);
        const customerMap: Record<string, string> = {
          '小米': '小米集团_TV', '华为': '华为集团_TV', '三星': '三星电子_TV',
          'TCL': 'TCL品牌集团_TV', 'OPPO': 'OPPO集团_TV', 'LG': 'LG电子_TV',
          '海信': '海信集团_TV', '索尼': '索尼集团_TV', '联想': '联想集团_NB',
          '惠普': '惠普集团_NB', '戴尔': '戴尔集团_NB',
        };
        let detectedCustomer: string | undefined;
        for (const [keyword, fullName] of Object.entries(customerMap)) {
          if (text.includes(keyword)) { detectedCustomer = fullName; break; }
        }
        const allDataItemNames = BU_DATA_ITEMS[buType] || BU_DATA_ITEMS['TV'];
        const detectedItems: string[] = [];
        for (const item of allDataItemNames) {
          if (text.includes(item)) detectedItems.push(item);
        }
        if (text.includes('销量预测') && !detectedItems.some(i => i.includes('销量预测'))) {
          const etaItem = allDataItemNames.find(i => i.includes('销量预测'));
          if (etaItem) detectedItems.push(etaItem);
        }
        if (text.includes('销售FCST') && !detectedItems.some(i => i.includes('销售FCST'))) {
          const fcstItem = allDataItemNames.find(i => i.includes('销售FCST') && !i.includes('上版') && !i.includes('vs'));
          if (fcstItem) detectedItems.push(fcstItem);
        }
        const parts: string[] = [];
        if (detectedCustomer) parts.push(`客户：${detectedCustomer}`);
        if (detectedItems.length > 0) parts.push(`数据项：${detectedItems.join('、')}`);
        const filterDesc = parts.length > 0 ? `已为您筛选${parts.join('，')}。` : '';
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，为您查询到本周销售预测数据如下。${filterDesc}`,
          type: 'table',
          data: initialData,
          filterCustomer: detectedCustomer,
          filterDataItems: detectedItems.length > 0 ? detectedItems : undefined
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if ((userRole === 'director') && (text.includes('调整本周销售fcst') || text.includes('fcst')) && !text.startsWith('director-confirm:') && !text.startsWith('确认查看')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '您好，销售总监。请先选择您想查看的数据项，确认后为您展示对应数据。',
          type: 'data-item-select'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('调整MNT本周销售fcst') || text.includes('MNT本周') || text.includes('调整本周销售fcst') || text.includes('fcst')) {
        const effectiveBu = (text.includes('MNT') || text.includes('MNT本周')) ? 'MNT' : buType;
        if (effectiveBu === 'MNT') {
          const mntData = generateMNTData();
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: '好的，为您查询到MNT BU本周销售预测数据如下。您可以点击"尺寸-分辨率"旁的箭头展开查看刷新率维度，再次点击可展开至具体 ProductID 维度数据。',
            type: 'mnt-table',
            data: mntData
          };
          setMessages(prev => [...prev, agentMsg]);
        } else if (effectiveBu === 'NB' || effectiveBu === 'MC') {
          const nbData = generateNBData();
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: `好的，为您查询到${effectiveBu} BU本周销售预测数据如下。您可以点击"技术别"旁的箭头展开查看具体 Model 维度数据。`,
            type: 'nb-table',
            data: nbData
          };
          setMessages(prev => [...prev, agentMsg]);
        } else {
          const initialData = generateInitialData(buType);
          setForecastData(initialData);
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: '好的，为您查询到本周客户预测数据如下。',
            type: 'table',
            data: initialData
          };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if (text === '发布版本') {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '版本 P260726-01 发布成功。数据已同步至下游系统。',
          type: 'text'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '提交修改') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '修改已提交成功，是否需要进行校验？',
          type: 'validation-ask'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '需要进行校验' || text === '执行校验' || text === '执行校验-FCST' || text === '执行校验-DP') {
        const scene: AnomalyScene = text === '执行校验-DP' ? 'DP分析' : text === '执行校验-FCST' ? '销售FCST分析' : validationScene;
        const rules: ValidationRule[] = ANOMALY_RULE_DEFINITIONS
          .filter(rule => rule.scenes.includes(scene) && rule.applicableBUs.includes(buType))
          .map(rule => ({
            id: rule.id,
            name: rule.name,
            passed: rule.name !== '销售目标达成对比',
            failCount: rule.name === '销售目标达成对比' ? 10 : undefined,
          }));
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '正在为您进行校验... 校验已完成，结果如下：', 
          type: 'validation-results',
          data: rules
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '暂不校验') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '好的，如有其他需要请指示。', 
          type: 'text'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '创建模拟版本') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '已创建模拟版本 P260329-04-001。是否需要进行经营结果模拟？', 
          type: 'simulation-ask'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.startsWith('识别到文件')) {
        const fileName = text.split('[')[1]?.split(']')[0] || '未知文件';
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: `识别到文件 [${fileName}]，是否导入并覆盖当前销售fcst数据？`, 
          type: 'import-confirm'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === 'CONFIRM_IMPORT') {
        setBackupForecastData([...forecastData]);
        // Simulate updating data by just generating new initial data or similar
        // For demo purposes, we'll just re-set it but now we have a backup
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '已导入成功！销售fcst数据已更新。', 
          type: 'import-result'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === 'ROLLBACK') {
        if (backupForecastData) {
          setForecastData([...backupForecastData]);
          setBackupForecastData(null);
          const agentMsg: Message = { 
            id: (Date.now() + 1).toString(), 
            role: 'agent', 
            content: '已成功回退到导入前的版本。', 
            type: 'text'
          };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if (text === 'Y') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '请选择要对比的版本：', 
          type: 'version-select'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === 'N') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '好的，如有其他需要请随时告诉我。', 
          type: 'text'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.startsWith('对比版本:')) {
        // 后端模拟经营计算约需 1 分钟，先展示 loading 状态，计算完成后再替换为结果
        const compareVersions = text.replace('对比版本:', '').split(',').map(s => s.trim()).filter(Boolean);
        const loadingId = (Date.now() + 1).toString();
        const loadingMsg: Message = {
          id: loadingId,
          role: 'agent',
          content: '正在进行模拟经营计算，预计需要约 1 分钟，请稍候…',
          type: 'simulation-loading',
          simVersions: compareVersions
        };
        setMessages(prev => [...prev, loadingMsg]);
        // 模拟后端执行耗时（真实环境约 1 分钟，此处 demo 缩短为约 3 秒），完成后将 loading 替换为结果
        setTimeout(() => {
          setMessages(prev => prev.map(m => m.id === loadingId ? {
            ...m,
            content: '模拟结果已生成，以下是各版本经营指标的对比分析：',
            type: 'simulation-result'
          } : m));
        }, 3000);
      } else if (text.startsWith('查看模拟版')) {
        const simVersion = text.replace('查看模拟版', '');
        const initialData = generateInitialData(buType);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，这是模拟版本 ${simVersion} 的数据，已为您进入本周DP页面。该模拟版本相较当前版本修改过的单元格已用黄色底色标记，点击尺寸旁的箭头可展开至具体 Model 维度级别查看。`,
          type: 'dp-table',
          data: initialData,
          simulationVersion: simVersion
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看销售目标达成对比') {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '销售目标达成对比校验详情如下：',
          type: 'sales-comparison-table'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.startsWith('查看') && text.endsWith('详情')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '暂无详细校验数据',
          type: 'text'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看客户&尺寸维度' || text === '查看技术别维度' || text === '查看客户&技术别维度' || text === '查看技术别维度的客户FCST变化情况' || text === '查看客户&尺寸维度的客户FCST变化情况' || text === '查看客户&技术别维度的客户FCST变化情况' || text === '技术别维度，按周/月/季/半年/年显示，可展开到Model') {
        const isTech = text.includes('技术别');
        const isCustomerTech = text.includes('客户&技术别');
        const gType = isCustomerTech ? 'customer-tech' : (isTech ? 'tech' : 'customer-size');
        const initialData = generateInitialData(buType);
        setForecastData(initialData);
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: `为您识别到${isCustomerTech ? '客户&技术别' : (isTech ? '技术别' : '客户&尺寸')}维度的FCST变化情况。`, 
          type: 'change-table',
          data: initialData,
          groupingType: gType
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('查看客户FCST及其变化') || text.includes('变化')) {
        const initialData = generateInitialData(buType);
        setForecastData(initialData);
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '为您识别到客户&尺寸维度的FCST变化情况。', 
          type: 'change-table',
          data: initialData,
          groupingType: 'customer-size'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查询今日外部信息') {
        const info: ExternalInfo[] = [
          {
            id: '1',
            impactType: '正面/负面影响',
            title: 'LG Display—季度营业利润预计大增，但在华子公司净利下滑',
            matchRate: 80,
            impactSize: '全尺寸OLED',
            impactBU: 'TV及MNT BU',
            impactCustomer: '全球各大电视/显示器品牌',
            contentSummary: 'LG Display今年一季度营业利润预计达2109亿韩元（约合人民币9.7亿元），同比增长530%，环比增长25.2%，超出市场预期54%，业绩改善源于公司结构性体质优化与OLED核心业务转型。然而，LG Display旗下16家海外子公司2025年净利润合计5830亿韩元（折合人民币26.61亿元），同比下降34.4%，其中7家在华子公司全部出现大幅下滑。净利润规模最大的广州OLED生产法人净利润2361亿韩元，同比大降45.4%，受电视需求复苏延迟、面板售价下跌、成本负担加重等因素影响。',
            agentAnalysis: 'LG Display的业绩分化反映了全球显示市场的区域结构性矛盾：全球OLED需求在北美等市场持续增长，但中国市场电视需求复苏不及预期，叠加本土面板厂竞争加剧，导致在华业务承压。对行业而言，这一信号提示：OLED的渗透普及仍需终端需求的持续支撑，中国市场的消费信心恢复将是关键变量。'
          },
          {
            id: '2',
            impactType: '负面影响',
            title: 'IT用液晶面板需求持续疲软，笔电面板价格面临下行压力',
            matchRate: 75,
            impactSize: '14/15.6英寸',
            impactBU: 'MNT BU',
            impactCustomer: '全球头部PC品牌',
            contentSummary: '由于商用PC市场换机潮未达预期，叠加渠道端库存依然偏高，本月14英寸及15.6英寸主流笔电面板订单量出现超预期下滑。',
            agentAnalysis: '目前的困境源于宏观经济压力导致企业IT支出极为保守，商用换机周期被拉长。预计这种需求低迷将至少持续到明年Q1。短期内，IT面板供应商可能不得不通过牺牲报价或提供更灵活的账期来刺激下游提货。建议密切关注微软终止支持Win10可能引发的被动换机潮。'
          },
          {
            id: '3',
            impactType: '正面影响',
            title: '车载显示需求激增，LTPS LCD车规面板出货量创年内新高',
            matchRate: 90,
            impactSize: '中大尺寸联屏',
            impactBU: '车载事业部',
            impactCustomer: '新能源车企',
            contentSummary: '随着新能源汽车智能化程度加深，车内多屏化、大屏化趋势带动了高分辨率、高对比度的车载LCD面板需求爆发，相关LTPS产线目前满载运作。',
            agentAnalysis: '车载显示是目前液晶面板行业最具确定性的增量市场。与消费电子不同，车规级面板认证周期长、客户粘性高、毛利率更丰厚。传统面板厂正在加速将原本用于手机/IT的旧产线产能向车载转移，以优化产品结构，有效对冲了消费电子疲软的冲击。'
          }
        ];
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '以下为2026年4月15日外部消息。4月初电视面板采购热度因体育赛事备货接近尾声而环比降温，大尺寸显示器面板备货则因618活动保持稳健；需求端各应用分化加剧，存储涨价对中小尺寸面板需求构成显著抑制。', 
          type: 'external-info',
          data: info
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('查询异常规则')) {
        const rows: AnomalyRuleRow[] = [];
        ANOMALY_RULE_DEFINITIONS.forEach(def => {
          def.applicableBUs.forEach(bu => {
            const dim = (bu === 'TV' || bu === 'CID') ? def.dimTV : (bu === 'MNT' || bu === 'NB') ? def.dimIT : def.dimMC;
            rows.push({
              id: `${def.id}-${bu}`, ruleId: def.id, bu, isEnabled: true,
              name: def.name, dimension: dim, timeGranularity: def.timeGranularity,
              parameterSummary: def.parameterSummary, scenes: def.scenes,
            });
          });
        });
        setAnomalyRuleRows(rows);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '为您查询到当前的异常识别规则如下：',
          type: 'rules-table',
          data: rows
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('复盘') || text.includes('retrospective')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '已为您生成销售预测准确率 & 偏差复盘报告，复盘周期：P260607-14。',
          type: 'retrospective'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '抱歉，我目前主要支持查询客户预测数据。您可以尝试点击上方的常用语。',
          type: 'text'
        };
        setMessages(prev => [...prev, agentMsg]);
      }
    }, 1000);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    processMessage(inputValue);
    setInputValue('');
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const fileName = files[0].name;
      processMessage(`识别到文件 [${fileName}]`);
    }
  };

  const handleQuickAction = (text: string) => {
    processMessage(text);
  };

  const handleUpdateAttribute = (rowId: string, field: string, value: string) => {
    setForecastData(prev => prev.map(row => {
      const targetRow = prev.find(r => r.id === rowId);
      if (!targetRow) return row;
      // Update all rows that share relevant attributes
      if (row.customer === targetRow.customer && row.size === targetRow.size && row.model === targetRow.model) {
        return { ...row, [field]: value };
      }
      return row;
    }));
  };

  const handleBatchUpdateReasons = (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => {
    setForecastData(prev => prev.map(row => {
      let nextRow = { ...row };
      reasons.forEach(r => {
        if (r.rowId === row.id) {
          nextRow.reasons = { ...nextRow.reasons, [r.key]: r.reason };
          nextRow.tags = { ...nextRow.tags, [r.key]: r.tag };
        }
      });
      return nextRow;
    }));
  };

  const handleBatchUpdateValues = (updates: { rowId: string, key: string, newVal: number }[]) => {
    setForecastData(prev => {
      // 1. Apply all updates to the rows first
      let newData = prev.map(row => {
        const rowUpdates = updates.filter(u => u.rowId === row.id);
        if (rowUpdates.length === 0) return row;
        const nextRow = { ...row, values: { ...row.values }, isAnomaly: { ...row.isAnomaly } };
        rowUpdates.forEach(u => {
          nextRow.values[u.key] = u.newVal;
          if (nextRow.item === '销售FCST (ETD)') {
            nextRow.isAnomaly[u.key] = u.newVal < 80;
          }
        });
        return nextRow;
      });

      // 2. Identify affected (customer, size, item, key) combinations
      const affectedSummaries = new Set<string>(); // Format: "customer|size|item|key"
      updates.forEach(u => {
        const row = prev.find(r => r.id === u.rowId);
        if (row && row.model && (row.item === '销售FCST (ETD)' || row.item === 'ExtraSales')) {
          affectedSummaries.add(`${row.customer}|${row.size}|${row.item}|${u.key}`);
        }
      });

      // 3. Recalculate each affected summary
      if (affectedSummaries.size > 0) {
        // Group by (customer|size|item) to avoid redundant filtering
        const groupedAffected = new Map<string, Set<string>>(); // "c|s|i" -> Set of keys
        affectedSummaries.forEach(s => {
          const parts = s.split('|');
          const groupKey = `${parts[0]}|${parts[1]}|${parts[2]}`;
          const valKey = parts[3];
          if (!groupedAffected.has(groupKey)) groupedAffected.set(groupKey, new Set());
          groupedAffected.get(groupKey)!.add(valKey);
        });

        newData = newData.map(row => {
          if (!row.model) {
            const groupKey = `${row.customer}|${row.size}|${row.item}`;
            if (groupedAffected.has(groupKey)) {
              const affectedKeys = groupedAffected.get(groupKey)!;
              const nextValues = { ...row.values };
              
              // Find all siblings to sum up
              const siblings = newData.filter(r => 
                r.customer === row.customer && 
                r.size === row.size && 
                r.item === row.item && 
                !!r.model
              );

              affectedKeys.forEach(k => {
                const sum = siblings.reduce((acc, sib) => acc + (sib.values[k] || 0), 0);
                nextValues[k] = sum;
              });

              return { ...row, values: nextValues };
            }
          }
          return row;
        });
      }

      return newData;
    });
  };

  const handleUpdate = (rowId: string, key: string, newVal: number, reason?: string, tag?: string) => {
    setForecastData(prev => {
      const targetRow = prev.find(r => r.id === rowId);
      if (!targetRow) return prev;

      // 1. Update the row itself
      const newData = prev.map(row => {
        if (row.id === rowId) {
          const updatedValues = { ...row.values, [key]: newVal };
          const updatedReasons = { ...row.reasons, [key]: reason || row.reasons?.[key] || '' };
          const updatedTags = { ...row.tags, [key]: tag || row.tags?.[key] || '' };
          
          const updatedAnomaly = { ...row.isAnomaly };
          if (row.item === '销售FCST (ETD)') {
            updatedAnomaly[key] = newVal < 80;
          }
          return { ...row, values: updatedValues, reasons: updatedReasons, tags: updatedTags, isAnomaly: updatedAnomaly };
        }
        return row;
      });

      // 2. If it is a model-level row for specific items, update the summary row
      if (targetRow.model && (targetRow.item === '销售FCST (ETD)' || targetRow.item === 'ExtraSales')) {
        const sumRow = newData.find(r => 
          r.customer === targetRow.customer && 
          r.size === targetRow.size && 
          r.item === targetRow.item && 
          !r.model
        );

        if (sumRow) {
          // Calculate new sum from all model rows
          const siblingModels = newData.filter(r => 
            r.customer === targetRow.customer && 
            r.size === targetRow.size && 
            r.item === targetRow.item && 
            !!r.model
          );
          
          const newSum = siblingModels.reduce((sum, r) => sum + (r.values[key] || 0), 0);
          
          return newData.map(row => {
            if (row.id === sumRow.id) {
              return { ...row, values: { ...row.values, [key]: newSum } };
            }
            return row;
          });
        }
      }

      return newData;
    });
  };

  const handleNewChat = () => {
    setMessages([{ id: '1', role: 'agent', content: '您好！我是您的需求感知/共识助手。有什么我可以帮您的？', type: 'text' }]);
    setShowHomepage(true);
    setForecastData([]);
    setBackupForecastData(null);
  };

  return (
    <div className="flex h-screen bg-[#F8F9FB] font-sans text-gray-900">
      {/* Sidebar */}
      <aside className={`${sidebarCollapsed ? 'w-0' : 'w-[260px]'} transition-all duration-300 bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0`}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Bot size={20} />
            </div>
            <span className="text-sm font-bold text-gray-800 whitespace-nowrap">需求感知/共识Agent</span>
          </div>
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <PlusCircle size={16} />
            开启新对话
          </button>
        </div>
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-gray-400 font-medium">
          <Clock size={14} />
          历史记录
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {chatHistory.map(item => (
            <div key={item.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors">
              <span className="text-xs text-gray-700 font-medium truncate flex-1">{item.title}</span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-[10px] text-gray-400">{item.date}</span>
                <MoreHorizontal size={14} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <PanelLeftClose size={14} />
            折叠菜单
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-3">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-gray-500 font-medium">在线</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-gray-100 rounded-full p-0.5">
              <button onClick={() => setUserRole('sales')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${userRole === 'sales' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销售员</button>
              <button onClick={() => setUserRole('director')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${userRole === 'director' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销售总监</button>
              <button onClick={() => setUserRole('sales-admin')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${userRole === 'sales-admin' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销管</button>
              <button onClick={() => setUserRole('sales-admin-head')} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${userRole === 'sales-admin-head' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销管主管</button>
            </div>
            <div className="flex items-center bg-gray-100 rounded-full p-0.5">
              {(['TV', 'CID', 'MNT', 'NB', '车载', 'MC'] as const).map(bu => (
                <button key={bu} onClick={() => setBuType(bu)} className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${buType === bu ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{bu}</button>
              ))}
            </div>
          </div>
        </header>

      {/* Homepage */}
      {showHomepage ? (
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start pt-12 px-6" style={{ background: 'linear-gradient(180deg, #EFF6FF 0%, #F8F9FB 40%)' }}>
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-200/50 mb-5">
            <Bot size={40} />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-1">您好，欢迎使用</h2>
          <p className="text-sm text-gray-500 mb-8">需求感知/共识智能助手</p>

          <div className="w-full max-w-2xl mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="请输入您的问题"
                className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm shadow-sm"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-lg shadow-blue-200"
              >
                <Send size={18} />
              </button>
            </div>
          </div>

          <div className="w-full max-w-3xl">
            <p className="text-sm font-bold text-gray-700 mb-4">功能列表：</p>
            <div className="flex gap-3 mb-6">
              <span className="px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-medium shadow-md shadow-blue-200">需求感知&共识</span>
            </div>
            <div className="flex flex-col gap-1">
              {((userRole === 'sales-admin' || userRole === 'sales-admin-head') ? [
                '查看并调整DP',
                '查看客户FCST及其变化',
                '近期客户FCST异常分析',
                '查询今日外部信息',
                '查询异常规则',
                '查看模拟经营结果',
                '复盘报告',
                '查看客户FCST管理',
                'CRM配置',
              ] : [
                '调整本周销售fcst',
                '查看客户FCST及其变化',
                '近期客户FCST异常分析',
                '查询今日外部信息',
                '查询异常规则',
                '复盘报告',
                '查看客户FCST管理',
                'CRM配置',
              ]).map(item => (
                <button
                  key={item}
                  onClick={() => handleQuickAction(item)}
                  className="flex items-center gap-2 px-2 py-2.5 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-left group"
                >
                  <span className="w-1.5 h-1.5 bg-blue-400 rounded-full shrink-0"></span>
                  <span className="group-hover:font-medium transition-all">{item === '调整本周销售fcst' ? '查看FCSTDP' : item === '查看并调整DP' ? '查看FCSTDP' : item === '复盘报告' ? '查看预测复盘报告' : item === 'CRM配置' ? 'CRM基础数据维护' : item}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 ${msg.type === 'rules-table' || msg.type === 'customer-fcst-raw' || msg.type === 'table' || msg.type === 'forecast-view' ? 'max-w-[98%]' : 'max-w-[90%]'} ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm
                  ${msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>
                <div className="space-y-2 min-w-0 overflow-hidden">
                  <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap
                    ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                  {msg.type === 'table' && (
                    <div className="mt-4 w-full min-w-0">
                      <ForecastTable
                        data={forecastData}
                        groupingType={msg.groupingType}
                        onUpdate={handleUpdate}
                        onUpdateAttribute={handleUpdateAttribute}
                        onBatchUpdateReasons={handleBatchUpdateReasons}
                        onBatchUpdateValues={handleBatchUpdateValues}
                        onSubmit={() => { setValidationScene('销售FCST分析'); processMessage('提交修改'); }}
                        onValidate={() => { setValidationScene('销售FCST分析'); processMessage('执行校验-FCST'); }}
                        onPublish={() => processMessage('发布版本')}
                        filterCustomer={msg.filterCustomer}
                        filterDataItems={msg.filterDataItems}
                        buType={buType}
                      />
                    </div>
                  )}
                  {msg.type === 'validation-results' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <ValidationResults rules={msg.data} onAction={processMessage} />
                    </div>
                  )}
                  {msg.type === 'change-table' && (
                    <div className="mt-4 w-full overflow-hidden flex flex-col items-start gap-3">
                      <ForecastChangeTable data={forecastData} groupingType={msg.groupingType} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleQuickAction(
                            userRole === 'sales' ? '调整本周销售fcst' :
                            userRole === 'director' ? '查看本周销售fcst' :
                            userRole === 'sales-admin' ? '查看并调整DP' :
                            '查看本周DP'
                          )}
                          className="px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Edit2 size={14} />
                          查看FCSTDP
                        </button>
                        <button
                          onClick={() => handleQuickAction(msg.groupingType === 'tech' ? '查看客户&尺寸维度的客户FCST变化情况' : '查看技术别维度的客户FCST变化情况')}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
                        >
                          <RefreshCw size={14} />
                          {msg.groupingType === 'tech' ? '切换客户&尺寸维度' : '切换技术别维度'}
                        </button>
                      </div>
                    </div>
                  )}
                  {msg.type === 'data-item-select' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DataItemSelectCard onSelect={(items) => processMessage('确认查看本周销售fcst')} />
                    </div>
                  )}
                  {msg.type === 'dp-table' && (
                    <div className="mt-4 w-full min-w-0">
                      <ForecastTable
                        data={forecastData.length > 0 ? forecastData : msg.data}
                        groupingType={msg.groupingType}
                        onUpdate={handleUpdate}
                        onUpdateAttribute={handleUpdateAttribute}
                        onBatchUpdateReasons={handleBatchUpdateReasons}
                        onBatchUpdateValues={handleBatchUpdateValues}
                        onSubmit={() => { setValidationScene('DP分析'); processMessage('提交修改'); }}
                        onValidate={() => { setValidationScene('DP分析'); processMessage('执行校验-DP'); }}
                        onPublish={() => processMessage('发布版本')}
                        onSimulate={() => processMessage('创建模拟版本')}
                        buType={buType}
                        mode="dp"
                        simulationVersion={msg.simulationVersion}
                      />
                    </div>
                  )}
                  {msg.type === 'dp-table-readonly' && (
                    <div className="mt-4 w-full min-w-0">
                      <ForecastTable
                        data={msg.data}
                        groupingType={msg.groupingType}
                        onUpdate={handleUpdate}
                        onUpdateAttribute={handleUpdateAttribute}
                        onBatchUpdateReasons={handleBatchUpdateReasons}
                        onBatchUpdateValues={handleBatchUpdateValues}
                        onSubmit={() => { setValidationScene('DP分析'); processMessage('提交修改'); }}
                        buType={buType}
                        mode="dp"
                      />
                    </div>
                  )}
                  {msg.type === 'table-readonly' && (
                    <div className="mt-4 w-full min-w-0">
                      <ForecastTable
                        data={msg.data}
                        groupingType={msg.groupingType}
                        onUpdate={handleUpdate}
                        onUpdateAttribute={handleUpdateAttribute}
                        onBatchUpdateReasons={handleBatchUpdateReasons}
                        onBatchUpdateValues={handleBatchUpdateValues}
                        onSubmit={() => { setValidationScene('销售FCST分析'); processMessage('提交修改'); }}
                        onValidate={() => { setValidationScene('销售FCST分析'); processMessage('执行校验-FCST'); }}
                        buType={buType}
                        mode="fcst"
                      />
                    </div>
                  )}
                  {msg.type === 'mnt-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <MNTForecastTable data={msg.data} onAction={processMessage} />
                    </div>
                  )}
                  {msg.type === 'nb-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DPAdjustmentTable data={msg.data} onAction={processMessage} columnLabel="技术别/Model" />
                    </div>
                  )}
                  {msg.type === 'customer-fcst-raw' && (
                    <div className="mt-4 w-full min-w-0">
                      <CustomerFCSTRawTable />
                    </div>
                  )}
                  {msg.type === 'simulation-ask' && (
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={() => processMessage('Y')}
                        className="px-8 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all w-24"
                      >
                        Y
                      </button>
                      <button 
                        onClick={() => processMessage('N')}
                        className="px-8 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all w-24"
                      >
                        N
                      </button>
                    </div>
                  )}
                  {msg.type === 'validation-ask' && (
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={() => processMessage('需要进行校验')}
                        className="px-8 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all w-24"
                      >
                        Y
                      </button>
                      <button 
                        onClick={() => processMessage('暂不校验')}
                        className="px-8 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all w-24"
                      >
                        N
                      </button>
                    </div>
                  )}
                  {msg.type === 'import-confirm' && (
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={() => processMessage('CONFIRM_IMPORT')}
                        className="px-8 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-700 active:scale-95 transition-all w-24"
                      >
                        Y
                      </button>
                      <button 
                        onClick={() => processMessage('N')}
                        className="px-8 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all w-24"
                      >
                        N
                      </button>
                    </div>
                  )}
                  {msg.type === 'import-result' && (
                    <div className="mt-4 flex gap-3">
                      <button 
                        onClick={() => processMessage('ROLLBACK')}
                        className="px-6 py-2 bg-white border border-orange-200 text-orange-600 rounded-lg text-xs font-bold shadow-sm hover:bg-orange-50 active:scale-95 transition-all flex items-center gap-2"
                      >
                        <RefreshCcw size={14} />
                        回退
                      </button>
                    </div>
                  )}
                  {msg.type === 'version-select' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <SimulationVersionSelectView 
                        onConfirm={(versions) => processMessage(`对比版本: ${versions.join(', ')}`)} 
                        onNavigateToDP={() => processMessage('查看并调整DP')}
                      />
                    </div>
                  )}
                  {msg.type === 'simulation-loading' && (
                    <div className="mt-4">
                      <SimulationLoadingView />
                    </div>
                  )}
                  {msg.type === 'simulation-result' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <SimulationResultView selectedVersions={msg.simVersions} onCheckVersion={(v) => handleQuickAction(`查看模拟版${v}`)} />
                    </div>
                  )}
                  {msg.type === 'sales-comparison-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <SalesTargetComparisonTable buType={buType} />
                    </div>
                  )}
                  {msg.type === 'rule-detail-table' && RULE_DETAIL_COMPONENTS[msg.data] && (
                    <div className="mt-4 w-full overflow-hidden">
                      {React.createElement(RULE_DETAIL_COMPONENTS[msg.data], { buType: msg.buType! })}
                    </div>
                  )}
                  {msg.type === 'external-info' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <ExternalInfoCards info={msg.data} />
                    </div>
                  )}
                  {msg.type === 'rule-explanation' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <RuleExplanationView data={msg.data} />
                    </div>
                  )}
                  {msg.type === 'rules-table' && (
                    <div className="mt-4 w-full overflow-hidden flex flex-col items-start gap-3">
                      <AnomalyRulesTable
                        rows={anomalyRuleRows.length > 0 ? anomalyRuleRows : msg.data}
                        onToggle={handleToggleRule}
                        onEdit={handleEditRule}
                        defaultBU={buType}
                      />
                      <div className="flex gap-3 mt-2">
                        <button className="px-6 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95">
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                  {msg.type === 'retrospective' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <RetrospectiveReport />
                    </div>
                  )}
                  {msg.type === 'crm-page-list' && msg.data && (
                    <div className="mt-3 w-full bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                      {msg.data.map((group: { group: string; pages: { name: string; image: string }[] }, gi: number) => (
                        <div key={gi}>
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{group.group}</span>
                          </div>
                          {group.pages.map((page: { name: string; image: string }, pi: number) => (
                            <button
                              key={pi}
                              onClick={() => setCrmModal({ title: page.name, image: `${import.meta.env.BASE_URL}${page.image}` })}
                              className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors border-b border-gray-50 last:border-b-0 group text-left"
                            >
                              <span className="font-medium">{page.name}</span>
                              <ExternalLink size={14} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isTyping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center text-gray-400">
              <Bot size={18} />
            </div>
            <div className="bg-white border border-gray-100 px-4 py-2.5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
              <Loader2 size={16} className="animate-spin text-blue-500" />
              <span className="text-xs text-gray-500">Agent 正在思考...</span>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </main>

      <AnimatePresence>
        {drawerState.isOpen && (
          <RuleEditDrawer
            isOpen={drawerState.isOpen}
            ruleId={drawerState.ruleId}
            bu={drawerState.bu}
            dimension={drawerState.dimension}
            timeGranularity={drawerState.timeGranularity}
            onClose={handleCloseDrawer}
            onSave={handleSaveDrawer}
          />
        )}
      </AnimatePresence>

      {/* Input Area */}
      <footer 
        className={`bg-white border-t border-gray-200 p-4 transition-colors relative ${isDragging ? 'bg-blue-50/50' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-blue-600/10 backdrop-blur-[1px] pointer-events-none border-2 border-dashed border-blue-400 m-2 rounded-xl">
            <div className="bg-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 text-blue-600 font-bold">
              <Upload size={20} />
              松开上传文件导入 FCST
            </div>
          </div>
        )}
        <div className="max-w-4xl mx-auto">
          {/* Quick Actions */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
            {userRole === 'sales' && (
              <button
                onClick={() => handleQuickAction('调整本周销售fcst')}
                className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
              >
                查看FCSTDP
              </button>
            )}
            {userRole === 'director' && (
              <button
                onClick={() => handleQuickAction('查看本周销售fcst')}
                className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
              >
                查看本周销售fcst
              </button>
            )}
            {userRole === 'sales-admin' && (
              <button
                onClick={() => handleQuickAction('查看并调整DP')}
                className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
              >
                查看FCSTDP
              </button>
            )}
            {userRole === 'sales-admin-head' && (
              <button
                onClick={() => handleQuickAction('查看本周DP')}
                className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
              >
                查看本周DP
              </button>
            )}
            <button
              onClick={() => handleQuickAction('查看客户FCST及其变化')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              查看客户FCST及其变化
            </button>
            <button
              onClick={() => handleQuickAction('查看客户FCST管理')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              查看客户FCST管理
            </button>
            <button
              onClick={() => handleQuickAction('解释客户FCST变化识别')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              解释客户FCST变化识别
            </button>
            {(userRole === 'sales-admin' || userRole === 'sales-admin-head') && (
              <button
                onClick={() => handleQuickAction('查看模拟经营结果')}
                className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
              >
                查看模拟经营结果
              </button>
            )}
            <button
              onClick={() => handleQuickAction('查询今日外部信息')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              查询今日外部信息
            </button>
            <button
              onClick={() => handleQuickAction('查询异常规则')}
              className="whitespace-nowrap px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-100 rounded-full text-xs font-medium hover:bg-gray-100 transition-colors shadow-sm"
            >
              查询异常规则
            </button>
            <button
              onClick={() => handleQuickAction('复盘报告')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              预测复盘
            </button>
            {/* CRM 配置按钮 */}
            <button
              onClick={() => handleQuickAction('CRM配置')}
              className="whitespace-nowrap px-3 py-1.5 bg-gray-50 text-gray-600 border border-gray-200 rounded-full text-xs font-medium hover:bg-gray-100 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Layers size={12} />
              CRM配置
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="输入您的问题..."
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-all shadow-lg shadow-blue-200"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-3 uppercase tracking-widest font-medium">
          Powered by Demand Sensing AI
        </p>
      </footer>
      </>
      )}

      {/* CRM 页面预览弹窗 - 在条件外部，确保首页和聊天页都能显示 */}
      {crmModal && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-8"
          onClick={() => setCrmModal(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h3 className="text-base font-bold text-gray-800">{crmModal.title}</h3>
              <button
                onClick={() => setCrmModal(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <img
                src={crmModal.image}
                alt={crmModal.title}
                className="w-full h-auto rounded-lg border border-gray-100"
              />
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}
      </div>
    </div>
  );
}
