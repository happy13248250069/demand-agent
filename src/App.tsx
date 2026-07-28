/**输入示例：客户&技术别，按月/季/年，可展开到Model
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, User, Bot, Edit2, Check, X, AlertCircle, ChevronRight, ChevronDown, Loader2, BarChart3, Target, Tag, Plus, Eye, EyeOff, Activity, ArrowUpRight, ArrowDownRight, Crown, Download, Upload, Search, Settings, Filter, RefreshCcw, RefreshCw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIPredictionTooltip } from './components/tooltips/AIPredictionTooltip';
import { generateAnomalyReasoning } from './services/llm-service';

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

interface ForecastRow {
  id: string;
  customer: string;
  version?: string;
  tech?: string;
  size: string;
  specs?: string;
  model?: string;
  shippingLocation?: string;
  item: DataItemType | MNTDataItemType;
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
  type: 'text' | 'table' | 'table-readonly' | 'change-table' | 'rules-table' | 'validation-results' | 'sales-comparison-table' | 'external-info' | 'rule-explanation' | 'dp-table' | 'dp-table-readonly' | 'mnt-table' | 'nb-table' | 'simulation-ask' | 'version-select' | 'simulation-result' | 'import-confirm' | 'import-result' | 'validation-ask' | 'fcst-dimension-select' | 'data-item-select' | 'data-item-select-dp' | 'retrospective' | 'customer-fcst-raw' | 'forecast-view';
  data?: any;
  groupingType?: 'customer-size' | 'tech' | 'customer-tech';
  buType?: 'TV' | 'CID' | 'MNT' | 'NB' | '车载' | 'MC';
  filterCustomer?: string;
  filterDataItems?: string[];
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
        '量产产品M+6内无任何需求，自动触发产品EOL风险预警（此规则不可修改）'
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
    dimTV: '客户+尺寸', dimIT: '客户+技术别', dimMC: '客户+技术别',
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

const generateInitialData = (): ForecastRow[] => {
  const customers = [
    { name: '小米', sizes: ['55寸', '65寸', '75寸'] },
    { name: '三星电子', sizes: ['55寸', '65寸', '75寸', '85寸'] },
    { name: 'LG电子', sizes: ['55寸', '65寸', '75寸'] },
    { name: '海信', sizes: ['55寸', '65寸', '75寸', '85寸'] },
    { name: '索尼', sizes: ['55寸', '65寸', '75寸'] },
    { name: 'TCL电子', sizes: ['55寸', '65寸', '75寸', '85寸'] },
  ];

  const rows: ForecastRow[] = [];
  const items: DataItemType[] = [
    '客户FCST', 
    'AI预测', 
    '销售FCST (ETD)', 
    'ExtraSales', 
    '需求计划', 
    'ExtraUnmet'
  ];
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
              <AIPredictionTooltip simple={aiPredictionSimple} />
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

const SalesTargetComparisonTable = () => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [weeksCollapsed, setWeeksCollapsed] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);

  const weeklyHeaders = [
    { label: 'WK1 260101-07', isWeek: true },
    { label: 'WK2 260108-14', isWeek: true },
    { label: 'WK3 260115-21', isWeek: true },
    { label: 'WK4 260122-31', isWeek: true },
    { label: 'M2601', isWeek: false },
    { label: 'WK5 260201-07', isWeek: true },
    { label: 'WK6 260208-14', isWeek: true },
    { label: 'M2602', isWeek: false },
    { label: 'WK7 260301-07', isWeek: true },
    { label: 'WK8 260308-14', isWeek: true },
    { label: 'M2603', isWeek: false },
  ];

  const allColumns = [
    { id: 'customer', label: '集团客户名称' },
    { id: 'sizeModel', label: '尺寸 / Model' },
    { id: 'dataItem', label: '数据项' },
    ...weeklyHeaders.map(h => ({ id: h.label, label: h.label }))
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

  const groupedData = [
    {
      customer: '小米',
      size: '55寸',
      total: { item: '销售FCST VS 销量计划BP/RP', values: ['180 (+30, 20%)', '90 (+10, 13%)', '100', '400', '400', '400', '100 (+40, 40%)', '1200', 'MK', 'MK', 'MK'] },
      models: [
        { name: 'Model A V1.1', values: ['60 (+10, 20%)', '30 (+5, 20%)', '30', '130', '130', '130', '30 (+10, 50%)', '400', 'MK', 'MK', 'MK'] },
        { name: 'Model B V1.1', values: ['120 (+20, 20%)', '60 (+5, 9%)', '70', '270', '270', '270', '70 (+30, 75%)', '800', 'MK', 'MK', 'MK'] },
      ]
    },
    {
      customer: '小米',
      size: '35寸',
      total: { item: '销售FCST VS 销量计划BP/RP', values: ['150', '100', '100', '400', '400', '400', '350', '1200', 'MK', 'MK', 'MK'] },
      models: [
        { name: 'Model C V1.1', values: ['150', '100', '100', '400', '400', '400', '350', '1200', 'MK', 'MK', 'MK'] },
      ]
    },
    {
      customer: '华为',
      size: '55寸',
      total: { item: '销售FCST VS 销量计划BP/RP', values: ['300', '300', '300', '1200', '1200', '1200', '900', '3600', 'MK', 'MK', 'MK'] },
      models: [
        { name: 'Model D V1.1', values: ['150', '150', '150', '600', '600', '600', '450', '1800', 'MK', 'MK', 'MK'] },
        { name: 'Model E V1.1', values: ['150', '150', '150', '600', '600', '600', '450', '1800', 'MK', 'MK', 'MK'] },
      ]
    }
  ];

  // Modified headers to include weeks and month abbreviations
  // (already defined above)

  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="p-4 border-b border-gray-100 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-600" />
          本周客户FCST及其变化
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
            onClick={() => setWeeksCollapsed(!weeksCollapsed)}
            className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1"
          >
            {weeksCollapsed ? <Eye size={14} /> : <EyeOff size={14} />}
            {weeksCollapsed ? '展开周次' : '缩起周次'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleColumns.has('customer') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[80px]">集团客户名称</th>}
              {visibleColumns.has('sizeModel') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[100px]">尺寸 / Model</th>}
              {visibleColumns.has('dataItem') && <th className="border border-gray-200 p-2 bg-gray-50 font-bold text-gray-700 min-w-[120px]">数据项</th>}
              {weeklyHeaders.map((h, i) => (
                (!weeksCollapsed || !h.isWeek) && visibleColumns.has(h.label) && (
                  <th key={i} className={`border border-gray-200 p-1 font-bold min-w-[100px] ${h.isWeek ? 'bg-white text-gray-600' : 'bg-blue-50 text-blue-700'}`}>
                    {h.label}
                  </th>
                )
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedData.map((group, gIdx) => {
              const isExpanded = expandedGroups.has(`${group.customer}-${group.size}`);
              
              return (
                <React.Fragment key={gIdx}>
                  {/* Total Row */}
                  <tr className={`${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'} transition-colors`}>
                    {visibleColumns.has('customer') && <td className="border border-gray-200 p-2 text-center font-bold text-gray-800">{group.customer}</td>}
                    {visibleColumns.has('sizeModel') && (
                      <td className="border border-gray-200 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-700">{group.size}</span>
                          <button 
                            onClick={() => toggleGroup(group.customer, group.size)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700 leading-tight">{group.total.item}</td>}
                    {group.total.values.map((val, vIdx) => {
                      const h = weeklyHeaders[vIdx];
                      if (weeksCollapsed && h?.isWeek) return null;
                      if (!visibleColumns.has(h.label)) return null;
                      const hasChange = val.includes('(');
                      return (
                        <td key={vIdx} className="border border-gray-200 p-2 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className="font-medium text-gray-900">{val.split(' ')[0]}</span>
                            {hasChange && (
                              <span className="text-[10px] text-green-600 font-bold">
                                {val.substring(val.indexOf('('))}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>

                  {/* Model Rows */}
                  {isExpanded && group.models.map((model, mIdx) => (
                    <tr key={mIdx} className="bg-white hover:bg-gray-50 transition-colors">
                      {visibleColumns.has('customer') && <td className="border border-gray-200 p-2 text-center font-medium text-gray-400 opacity-50">{group.customer}</td>}
                      {visibleColumns.has('sizeModel') && (
                        <td className="border border-gray-200 p-2 text-blue-600 font-medium pl-6">
                          <div className="flex items-center gap-1">
                            <ChevronRight size={10} className="text-gray-300" />
                            {model.name}
                          </div>
                        </td>
                      )}
                      {visibleColumns.has('dataItem') && <td className="border border-gray-200 p-2 font-bold text-blue-700/70 leading-tight">{group.total.item}</td>}
                      {model.values.map((val, vIdx) => {
                        const h = weeklyHeaders[vIdx];
                        if (weeksCollapsed && h?.isWeek) return null;
                        if (!visibleColumns.has(h.label)) return null;
                        const hasChange = val.includes('(');
                        return (
                          <td key={vIdx} className="border border-gray-200 p-2 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <span className="font-medium text-gray-900">{val.split(' ')[0]}</span>
                              {hasChange && (
                                <span className="text-[10px] text-green-600 font-bold">
                                  {val.substring(val.indexOf('('))}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ValidationResults = ({ rules, onAction }: { rules: ValidationRule[], onAction: (text: string) => void }) => {
  const handleAction = (rule: ValidationRule) => {
    if (rule.name === '销售目标达成对比') {
      onAction('查看销售目标达成对比');
    } else {
      onAction(`查看${rule.name}详情`);
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

const ForecastDimensionSelect = ({ onSelect }: { onSelect: (dimension: string) => void }) => {
  return (
    <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm max-w-md">
      <h3 className="text-sm font-bold text-gray-800">请选择展示维度</h3>
      <div className="grid grid-cols-1 gap-2">
        <button 
          onClick={() => onSelect('查看客户&尺寸维度的客户FCST变化情况')}
          className="flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg group hover:bg-blue-100 transition-all text-left"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold text-blue-700">客户 & 尺寸维度</span>
            <span className="text-[10px] text-blue-500 mt-0.5">按客户和产品尺寸进行汇总，可展开至Model</span>
          </div>
          <ChevronRight size={16} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
        <button 
          onClick={() => onSelect('查看技术别维度的客户FCST变化情况')}
          className="flex items-center justify-between px-4 py-3 bg-orange-50 border border-orange-100 rounded-lg group hover:bg-orange-100 transition-all text-left"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold text-orange-700">技术别维度</span>
            <span className="text-[10px] text-orange-500 mt-0.5">按面板技术类型进行汇总，可展开至Model</span>
          </div>
          <ChevronRight size={16} className="text-orange-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
        <button 
          onClick={() => onSelect('查看客户&技术别维度的客户FCST变化情况')}
          className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-100 rounded-lg group hover:bg-green-100 transition-all text-left"
        >
          <div className="flex flex-col">
            <span className="text-xs font-bold text-green-700">客户 & 技术别维度</span>
            <span className="text-[10px] text-green-500 mt-0.5">按客户和技术别进行汇总，不展开至Model</span>
          </div>
          <ChevronRight size={16} className="text-green-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
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

const SimulationResultView = ({ onCheckVersion }: { onCheckVersion?: (version: string) => void }) => {
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

      {onCheckVersion && (
        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-start">
          <button 
            onClick={() => onCheckVersion('P260329-04-002')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 shadow-sm rounded-xl text-[13px] font-medium text-[#4a5568] hover:bg-gray-50 transition-all active:scale-95 group"
          >
            <RefreshCcw size={16} className="text-[#718096] group-hover:rotate-180 transition-transform duration-500" />
            查看P260329-04-002
          </button>
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
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-medium text-gray-600 bg-white align-top">T1</td>
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
                      <td rowSpan={3} className="border-b border-r border-gray-200 p-3 font-medium text-gray-600 bg-white align-top">T2</td>
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
  groupingType = 'customer-size',
  filterCustomer,
  filterDataItems
}: {
  data: ForecastRow[],
  onUpdate: (rowId: string, key: string, newVal: number, reason?: string, tag?: string) => void,
  onUpdateAttribute?: (rowId: string, field: string, value: string) => void,
  onBatchUpdateReasons?: (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => void,
  onBatchUpdateValues?: (updates: { rowId: string; key: string; newVal: number }[]) => void,
  onSubmit: () => void,
  onValidate?: () => void,
  onPublish?: () => void,
  groupingType?: 'customer-size' | 'tech' | 'customer-tech',
  filterCustomer?: string,
  filterDataItems?: string[]
}) => {
  const [filteredData, setFilteredData] = useState(data);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [visibleRowsCount, setVisibleRowsCount] = useState(3); // Start with a small number to show "Load More"
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [visibleDataItems, setVisibleDataItems] = useState<Set<DataItemType>>(new Set(['客户FCST', 'AI预测', '销售FCST (ETD)', 'ExtraSales']));
  const [isDataItemFilterOpen, setIsDataItemFilterOpen] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [locationInputValue, setLocationInputValue] = useState('');
  
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [itemsToValidate, setItemsToValidate] = useState<{ rowId: string; key: string; oldVal: number; newVal: number; customer: string; size: string; model?: string; item: string }[]>([]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());

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

  const allDataItems: DataItemType[] = ['客户FCST', 'AI预测', '销售FCST (ETD)', 'ExtraSales'];

  const toggleColumn = (id: string) => {
    const next = new Set(visibleColumns);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setVisibleColumns(next);
  };

  const toggleDataItem = (item: DataItemType) => {
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

  const dataItems = ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '客户PSI周数模拟', '上版销售FCST', '销售FCST(ETD-...', '销售FCST（DP调...', 'FCST/上版Alloca...', '策备库存（净）', '上版Allocation'];

  const [mergeMode, setMergeMode] = useState(false);
  const [sumMode, setSumMode] = useState(false);
  const [anomalyModalOpen, setAnomalyModalOpen] = useState(false);
  const [anomalyModalData, setAnomalyModalData] = useState<{ model: string; dataItem: string; week: string; value: number } | null>(null);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; weekKey: string; weekLabel: string; weekSub: string; size: string } | null>(null);
  const [deliveryModal, setDeliveryModal] = useState<{ weekLabel: string; weekSub: string; size: string; monthTotal: number } | null>(null);
  const [deliveryValues, setDeliveryValues] = useState<number[]>([100, 80, 90, 100, 80, 90, 65]);

  const anomalyCells = new Set([
    'ST5461D13-6_客户FCST_wk28',
    'ST5461D13-6_客户FCST_wk31a',
    'ST4251D02-1_客户FCST_wk28',
    'ST4251D02-1_客户FCST_wk29',
    'ST4251D02-1_客户FCST_wk30',
    'ST4251D02-1_客户FCST_wk31a',
    'ST3151B07-1_客户FCST_wk28',
    'ST3151B07-1_客户FCST_wk30',
    'ST3151B07-1_销售FCST(ETD)_wk29',
    'ST3151B07-1_销售FCST(ETD)_wk30',
    'ST6501A08-3_客户FCST_wk28',
    'ST6501A08-3_客户FCST_wk29',
    'ST7501D02-5_客户FCST_wk28',
    'ST6502E03-4_客户FCST_wk28',
    'ST5502F01-7_客户FCST_wk28',
    'ST5502F01-7_客户FCST_wk29',
    'ST5502F01-7_客户FCST_wk30',
  ]);

  const weekCols = [
    { key: 'wk27', label: 'WK27', sub: '260701-04', month: '2607', highlight: false },
    { key: 'wk28', label: 'WK28', sub: '260705-11', month: '2607', highlight: false },
    { key: 'wk29', label: 'WK29', sub: '260712-18', month: '2607', highlight: false },
    { key: 'wk30', label: 'WK30', sub: '260719-25', month: '2607', highlight: false },
    { key: 'wk31a', label: 'WK31', sub: '260726-31', month: '2607', highlight: true },
    { key: 'm2607', label: 'M26-07', sub: '', month: '2607', highlight: false, isMonthTotal: true },
    { key: 'wk31b', label: 'WK31', sub: '260801-01', month: '2608', highlight: false },
    { key: 'wk32', label: 'WK32', sub: '260802-08', month: '2608', highlight: false },
    { key: 'wk33', label: 'WK33', sub: '260809-15', month: '2608', highlight: false },
    { key: 'wk34', label: 'WK34', sub: '260816-22', month: '2608', highlight: false },
    { key: 'wk35', label: 'WK35', sub: '260823-29', month: '2608', highlight: false },
    { key: 'm2608', label: 'M26-08', sub: '', month: '2608', highlight: false, isMonthTotal: true },
  ];

  const months = [
    { id: '2607', label: '2607', cols: weekCols.filter(c => c.month === '2607') },
    { id: '2608', label: '2608', cols: weekCols.filter(c => c.month === '2608') },
  ];

  const flatRows = useMemo(() => {
    const models = [
      { version: 'P260726-01', model: 'ST5461D13-6', extVersion: '2.4', size: '55', groupId: '60127', customer: '小米集团_TV' },
      { version: 'P260726-01', model: 'ST4251D02-1', extVersion: '2.4', size: '43', groupId: '60127', customer: '小米集团_TV' },
      { version: 'P260726-01', model: 'ST3151B07-1', extVersion: '2.1', size: '31.5', groupId: '60127', customer: '小米集团_TV' },
      { version: 'P260726-01', model: 'ST6501A08-3', extVersion: '2.2', size: '65', groupId: '60215', customer: '华为集团_TV' },
      { version: 'P260726-01', model: 'ST5501B04-2', extVersion: '2.3', size: '55', groupId: '60215', customer: '华为集团_TV' },
      { version: 'P260726-01', model: 'ST4301C06-1', extVersion: '1.8', size: '43', groupId: '60215', customer: '华为集团_TV' },
      { version: 'P260726-01', model: 'ST7501D02-5', extVersion: '2.1', size: '75', groupId: '60318', customer: '三星电子_TV' },
      { version: 'P260726-01', model: 'ST6502E03-4', extVersion: '2.0', size: '65', groupId: '60318', customer: '三星电子_TV' },
      { version: 'P260726-01', model: 'ST5502F01-7', extVersion: '2.4', size: '55', groupId: '60318', customer: '三星电子_TV' },
    ];

    const modelData: Record<string, { fcst: number[]; prevFcst: number[]; ai: number[]; etd: number[]; dp: number[] }> = {
      'ST5461D13-6': { fcst: [200, 800, 200, 200, 250, 1650, 0, 0, 0, 0, 0, 0], prevFcst: [200, 200, 200, 200, 200, 1000, 0, 0, 0, 0, 0, 0], ai: [200, 250, 200, 200, 200, 1050, 200, 200, 200, 200, 200, 1000], etd: [200, 250, 350, 420, 200, 1420, 200, 200, 200, 200, 200, 1000], dp: [10, 5, 2, 2, 0, 19, 0, 0, 0, 0, 0, 0] },
      'ST4251D02-1': { fcst: [5352, 9365, 9365, 9365, 8025, 41472, 516, 3611, 3611, 3611, 3611, 14960], prevFcst: [5352, 5352, 5352, 5352, 5352, 26760, 516, 3611, 3611, 3611, 3611, 14960], ai: [5000, 5200, 5200, 5200, 5000, 25600, 500, 3500, 3500, 3500, 3500, 14500], etd: [5352, 9365, 9365, 9365, 8025, 41472, 516, 3611, 3611, 3611, 3611, 14960], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      'ST3151B07-1': { fcst: [66, 266, 66, 200, 66, 664, 66, 66, 66, 66, 66, 330], prevFcst: [66, 66, 66, 66, 66, 330, 66, 66, 66, 66, 66, 330], ai: [66, 66, 66, 66, 66, 330, 66, 66, 66, 66, 66, 330], etd: [66, 66, 116, 140, 66, 454, 66, 66, 66, 66, 66, 330], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      'ST6501A08-3': { fcst: [1200, 1500, 1800, 1400, 1300, 7200, 1100, 1200, 1200, 1200, 1200, 5900], prevFcst: [1200, 1200, 1200, 1200, 1200, 6000, 1100, 1200, 1200, 1200, 1200, 5900], ai: [1180, 1250, 1300, 1280, 1200, 6210, 1100, 1150, 1150, 1150, 1150, 5700], etd: [1200, 1500, 1800, 1400, 1300, 7200, 1100, 1200, 1200, 1200, 1200, 5900], dp: [0, 50, 0, 0, 0, 50, 0, 0, 0, 0, 0, 0] },
      'ST5501B04-2': { fcst: [3200, 3500, 3400, 3600, 3300, 17000, 2800, 3000, 3000, 3000, 3000, 14800], prevFcst: [3200, 3200, 3200, 3200, 3200, 16000, 2800, 3000, 3000, 3000, 3000, 14800], ai: [3100, 3300, 3300, 3400, 3200, 16300, 2750, 2900, 2900, 2900, 2900, 14350], etd: [3200, 3500, 3400, 3600, 3300, 17000, 2800, 3000, 3000, 3000, 3000, 14800], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      'ST4301C06-1': { fcst: [800, 900, 850, 920, 780, 4250, 700, 750, 750, 750, 750, 3700], prevFcst: [800, 800, 800, 800, 800, 4000, 700, 750, 750, 750, 750, 3700], ai: [780, 820, 830, 850, 770, 4050, 690, 730, 730, 730, 730, 3610], etd: [800, 900, 850, 920, 780, 4250, 700, 750, 750, 750, 750, 3700], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      'ST7501D02-5': { fcst: [420, 580, 450, 500, 430, 2380, 380, 400, 400, 400, 400, 1980], prevFcst: [420, 420, 420, 420, 420, 2100, 380, 400, 400, 400, 400, 1980], ai: [410, 430, 440, 440, 420, 2140, 375, 390, 390, 390, 390, 1935], etd: [420, 580, 450, 500, 430, 2380, 380, 400, 400, 400, 400, 1980], dp: [0, 20, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0] },
      'ST6502E03-4': { fcst: [2100, 2800, 2300, 2500, 2200, 11900, 1900, 2000, 2000, 2000, 2000, 9900], prevFcst: [2100, 2100, 2100, 2100, 2100, 10500, 1900, 2000, 2000, 2000, 2000, 9900], ai: [2050, 2150, 2200, 2250, 2100, 10750, 1850, 1950, 1950, 1950, 1950, 9650], etd: [2100, 2800, 2300, 2500, 2200, 11900, 1900, 2000, 2000, 2000, 2000, 9900], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      'ST5502F01-7': { fcst: [4500, 5200, 4800, 5100, 4600, 24200, 4000, 4200, 4200, 4200, 4200, 20800], prevFcst: [4500, 4500, 4500, 4500, 4500, 22500, 4000, 4200, 4200, 4200, 4200, 20800], ai: [4400, 4600, 4700, 4800, 4500, 23000, 3900, 4100, 4100, 4100, 4100, 20300], etd: [4500, 5200, 4800, 5100, 4600, 24200, 4000, 4200, 4200, 4200, 4200, 20800], dp: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    };

    const rows: { version: string; model: string; extVersion: string; size: string; groupId: string; customer: string; dataItem: string; values: number[] }[] = [];

    models.forEach(m => {
      const md = modelData[m.model];
      dataItems.forEach(item => {
        const vals = weekCols.map((_col, idx) => {
          if (item === '客户FCST') return md?.fcst[idx] || 0;
          if (item === '上版客户FCST') return md?.prevFcst[idx] || 0;
          if (item === 'AI预测') return md?.ai[idx] || 0;
          if (item === '销售FCST(ETD)') return md?.etd[idx] || 0;
          if (item === '销售FCST（DP调...') return md?.dp[idx] || 0;
          return 0;
        });
        rows.push({ ...m, dataItem: item, values: vals });
      });
    });

    return rows;
  }, []);

  const displayRows = useMemo(() => {
    let filtered = flatRows;
    if (filterCustomer) {
      filtered = filtered.filter(r => r.customer.includes(filterCustomer));
    }
    if (filterDataItems && filterDataItems.length > 0) {
      filtered = filtered.filter(r => filterDataItems.includes(r.dataItem));
    }
    return filtered;
  }, [flatRows, filterCustomer, filterDataItems]);

  const activeDataItems = filterDataItems && filterDataItems.length > 0 ? filterDataItems : dataItems;

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
      {/* Top Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600 font-medium">布局:</span>
          <select className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[100px]">
            <option>TV默认布局</option>
          </select>
          <button className="p-1 text-gray-400 hover:text-gray-600"><Settings size={14} /></button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600 font-medium">计划对象:</span>
          <select className="text-xs border border-gray-300 rounded px-2 py-1 bg-white min-w-[80px]">
            <option value=""></option>
          </select>
          <button className="p-1 text-gray-400 hover:text-gray-600"><Settings size={14} /></button>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-gray-500"><span className="w-3 h-3 rounded-full border border-gray-300 inline-block"></span> 列</span>
          <ToggleSwitch label="合并" active={mergeMode} onToggle={() => { setMergeMode(!mergeMode); if (!mergeMode) setSumMode(false); }} />
          <ToggleSwitch label={sumMode ? '非合计' : '合计'} active={sumMode} onToggle={() => { setSumMode(!sumMode); if (!sumMode) setMergeMode(false); }} />
        </div>
        <button className="px-2.5 py-1 text-xs border border-blue-500 text-blue-600 rounded hover:bg-blue-50 font-medium">扩展字段</button>
        <button className="px-2.5 py-1 text-xs border border-blue-500 text-blue-600 rounded hover:bg-blue-50 font-medium">扩展数据项</button>
        <span className="px-3 py-1 text-xs bg-orange-500 text-white rounded font-bold">数量单位为pcs</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors"
          >
            <Plus size={14} /> 新增
          </button>
          <button className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 rounded transition-colors">
            <Download size={14} /> 日志
          </button>
          <button className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">...</button>
        </div>
      </div>

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
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">客户集团名称</span>
          <input type="text" placeholder="请输入" className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white w-[120px]" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-600">Model Name</span>
          <input type="text" placeholder="请输入" className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white w-[120px]" />
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
            {/* Month grouping row */}
            <tr className="border-b border-gray-200">
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[100px] bg-gray-50">
                <div className="flex items-center gap-1">版本号 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[120px] bg-gray-50">
                <div className="flex items-center gap-1">Model Name <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[70px] bg-gray-50">
                <div className="flex items-center gap-1">对外版次 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-center font-medium text-gray-700 border-r border-gray-200 min-w-[50px] bg-gray-50">
                <div className="flex items-center justify-center gap-1">尺寸 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-center font-medium text-gray-700 border-r border-gray-200 min-w-[60px] bg-gray-50">
                <div className="flex items-center justify-center gap-1">集团号 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              {!mergeMode && <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[100px] bg-gray-50">
                <div className="flex items-center gap-1">客户名称 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>}
              <th rowSpan={2} className="px-3 py-2 text-left font-medium text-gray-700 border-r border-gray-200 min-w-[120px] bg-gray-50">
                <div className="flex items-center gap-1">数据项 <ChevronDown size={10} className="text-gray-400" /> <Filter size={10} className="text-gray-400" /></div>
              </th>
              {months.map(m => (
                <th key={m.id} colSpan={m.cols.length} className="px-1 py-1.5 text-center font-bold text-gray-700 border-r border-gray-200 bg-gray-50">
                  {m.label}
                </th>
              ))}
              {sumMode && <th rowSpan={2} className="px-3 py-2 text-center font-medium text-gray-700 bg-gray-50 min-w-[60px]">合计</th>}
            </tr>
            <tr className="border-b border-gray-200">
              {weekCols.map(col => (
                <th key={col.key} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 min-w-[85px] ${col.highlight ? 'bg-orange-50 text-orange-700' : 'bg-gray-50 text-gray-700'}`}>
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="font-bold">{col.label}</span>
                    <ChevronDown size={9} className="text-gray-400" />
                  </div>
                  {col.sub && <div className="text-[10px] text-gray-400 font-normal">{col.sub}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIdx) => {
              const isFirstOfModel = rowIdx === 0 || displayRows[rowIdx - 1].model !== row.model;
              const modelRowCount = activeDataItems.length;
              const rowSum = row.values.reduce((a, b) => a + b, 0);
              return (
                <tr key={rowIdx} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  {!mergeMode && (
                    <>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200 font-mono text-[11px]">{row.version}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200 font-mono">{row.model}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{row.extVersion}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{row.size}</td>
                      <td className="px-3 py-2 text-center text-gray-700 border-r border-gray-200">{row.groupId}</td>
                      <td className="px-3 py-2 text-gray-700 border-r border-gray-200">{row.customer}</td>
                    </>
                  )}
                  {mergeMode && isFirstOfModel && (
                    <>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-gray-700 border-r border-gray-200 align-middle font-mono text-[11px]">{row.version}</td>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-gray-700 border-r border-gray-200 align-middle font-mono">{row.model}</td>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-center text-gray-700 border-r border-gray-200 align-middle">{row.extVersion}</td>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-center text-gray-700 border-r border-gray-200 align-middle">{row.size}</td>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-center text-gray-700 border-r border-gray-200 align-middle">{row.groupId}</td>
                      <td rowSpan={modelRowCount} className="px-3 py-2 text-gray-700 border-r border-gray-200 align-middle">{row.customer}</td>
                    </>
                  )}
                  <td className={`px-3 py-2 border-r border-gray-200 font-medium ${row.dataItem === '销售FCST(ETD)' ? 'text-orange-500' : 'text-gray-800'}`}>
                    {row.dataItem}
                  </td>
                  {row.values.map((val, vIdx) => {
                    const cellKey = `${row.model}_${row.dataItem}_${weekCols[vIdx]?.key}`;
                    const isAnomaly = anomalyCells.has(cellKey);
                    return (
                      <td
                        key={vIdx}
                        className={`px-2 py-2 text-right border-r border-gray-200 tabular-nums ${isAnomaly ? 'bg-red-100 text-red-700 font-bold cursor-pointer hover:bg-red-200 transition-colors' : `text-gray-700 ${weekCols[vIdx]?.highlight ? 'bg-orange-50/50' : ''}`}`}
                        onClick={isAnomaly ? () => { setAnomalyModalData({ model: row.model, dataItem: row.dataItem, week: weekCols[vIdx]?.label || '', value: val }); setAnomalyModalOpen(true); } : undefined}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (row.dataItem === '销售FCST(ETD)') {
                            setContextMenu({ x: e.clientX, y: e.clientY, weekKey: weekCols[vIdx]?.key || '', weekLabel: weekCols[vIdx]?.label || '', weekSub: weekCols[vIdx]?.sub || '', size: row.size });
                          }
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                  {sumMode && (
                    <td className="px-2 py-2 text-right tabular-nums text-gray-700 font-medium">{rowSum}</td>
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
            提交修改
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
        <h2 className="text-base font-bold text-gray-800">客户FCST管理</h2>
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
  const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
  const [backupForecastData, setBackupForecastData] = useState<ForecastRow[] | null>(null);
  const [anomalyRuleRows, setAnomalyRuleRows] = useState<AnomalyRuleRow[]>([]);
  const [drawerState, setDrawerState] = useState<DrawerEditState>({ isOpen: false, ruleId: null, bu: null, dimension: null, timeGranularity: null });
  const [savedThresholds, setSavedThresholds] = useState<Record<string, Record<string, number>>>({});
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
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, type: 'text' };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate agent processing
    setTimeout(() => {
      setIsTyping(false);
      if (text === '查看客户原始fcst' || text === '查看客户原始FCST') {
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
        const initialData = generateInitialData();
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，为您进入${buType} DP调整页面。在此视图下，您可以根据预测建议手动调整销售FCST及需求计划。点击${buType === 'NB' || buType === 'MC' ? '技术别' : '尺寸'}旁的箭头可展开至具体 Model 维度级别进行微调。`,
          type: 'dp-table',
          data: initialData,
          buType: buType
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '确认查看本周DP') {
        const initialData = generateInitialData();
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `好的，为您展示${buType} 本周DP数据（只读模式）。`,
          type: 'dp-table-readonly',
          data: initialData,
          buType: buType
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('查看本周DP')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '您好，销管主管。请先选择您想查看的数据项，确认后为您展示对应数据。',
          type: 'data-item-select-dp'
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
          const initialData = generateInitialData();
          const agentMsg: Message = { id: (Date.now() + 1).toString(), role: 'agent', content: '好的，为您展示本周销售预测数据（只读模式）。', type: 'table-readonly', data: initialData };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if ((text.includes('销售fcst') || text.includes('销售FCST') || text.includes('客户FCST') || text.includes('FCST')) && (text.includes('查看本周') || text.includes('调整本周'))) {
        const initialData = generateInitialData();
        setForecastData(initialData);
        const customerMap: Record<string, string> = { '小米': '小米集团_TV', '华为': '华为集团_TV', '三星': '三星电子_TV', 'TCL': 'TCL品牌集团_TV', 'OPPO': 'OPPO集团_TV' };
        let detectedCustomer: string | undefined;
        for (const [keyword, fullName] of Object.entries(customerMap)) {
          if (text.includes(keyword)) { detectedCustomer = fullName; break; }
        }
        const allDataItemNames = ['客户FCST', '上版客户FCST', '上版客户RTF', 'AI预测', '销量预测(ETA)', '在途', '销售FCST(ETD)', '客户PSI周数模拟', '上版销售FCST'];
        const detectedItems: string[] = [];
        for (const item of allDataItemNames) {
          if (text.includes(item)) detectedItems.push(item);
        }
        if (text.includes('销售FCST') && !text.includes('销售FCST(ETD)') && !detectedItems.includes('销售FCST(ETD)')) {
          if (!detectedItems.some(i => i.includes('销售FCST'))) detectedItems.push('销售FCST(ETD)');
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
          const initialData = generateInitialData();
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
      } else if (text === '需要进行校验' || text === '执行校验') {
        const rules: ValidationRule[] = [
          { id: '1', name: '销售FCST变化', passed: true },
          { id: '2', name: '产品生命周期验证', passed: true },
          { id: '3', name: '需求供应对比', passed: true },
          { id: '4', name: '销售目标达成对比', passed: false, failCount: 10 },
          { id: '5', name: '销售FCST vs 客户FCST', passed: true },
          { id: '6', name: '历史同期趋势偏差', passed: true },
          { id: '7', name: '重点产品达成分析', passed: true },
        ];
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
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '模拟结果已生成，以下是各版本经营指标的对比分析：', 
          type: 'simulation-result'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看模拟版P260329-04-002') {
        const initialData = generateInitialData();
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '好的，为您进入模拟版 P260329-04-002 的本周DP页面。在此视图下，您可以根据预测建议手动调整销售FCST及需求计划。点击尺寸旁的箭头可展开至具体 Model 维度级别进行微调。', 
          type: 'dp-table',
          data: initialData
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text === '查看销售目标达成对比') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '本周客户FCST及其变化', 
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
        const initialData = generateInitialData();
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
        const initialData = generateInitialData();
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
      } else if (text === '自定义维度' || text === '切换更多维度') {
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '可以选择以下热门维度，或自行输入维度组合 + 时间粒度查看聚合结果。支持可选维度如下：\n-字段维度：版本号、BU、应用别、集团客户代码、Model Name、对外版本号、尺寸、大板、面板厂、技术别\n-时间维度：周、月、季、半年、年\n输入示例：技术别维度，按周/月/季/半年/年显示，可展开到Model', 
          type: 'fcst-dimension-select'
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

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FB] font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Bot size={24} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">需求感知/共识Agent</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-xs text-gray-500 font-medium">在线</span>
            </div>
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
          <button className="text-gray-400 hover:text-gray-600 transition-colors">
            <AlertCircle size={20} />
          </button>
        </div>
      </header>

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
                        onSubmit={() => processMessage('提交修改')}
                        onValidate={() => processMessage('执行校验')}
                        onPublish={() => processMessage('发布版本')}
                        filterCustomer={msg.filterCustomer}
                        filterDataItems={msg.filterDataItems}
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
                          onClick={() => handleQuickAction('调整本周销售fcst')}
                          className="px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Edit2 size={14} />
                          调整本周客户 FCST
                        </button>
                        <button 
                          onClick={() => handleQuickAction(msg.groupingType === 'tech' ? '查看客户&尺寸维度的客户FCST变化情况' : '查看技术别维度的客户FCST变化情况')}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
                        >
                          <RefreshCw size={14} />
                          {msg.groupingType === 'tech' ? '切换客户&尺寸维度' : '切换技术别维度'}
                        </button>
                        <button 
                          onClick={() => handleQuickAction('切换更多维度')}
                          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all shadow-sm flex items-center gap-2"
                        >
                          <Layers size={14} />
                          切换更多维度
                        </button>
                      </div>
                    </div>
                  )}
                  {msg.type === 'fcst-dimension-select' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <ForecastDimensionSelect onSelect={processMessage} />
                    </div>
                  )}
                  {msg.type === 'data-item-select' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DataItemSelectCard onSelect={(items) => processMessage('确认查看本周销售fcst')} />
                    </div>
                  )}
                  {msg.type === 'data-item-select-dp' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DataItemSelectCard onSelect={(items) => processMessage('确认查看本周DP')} />
                    </div>
                  )}
                  {msg.type === 'dp-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DPAdjustmentTable data={msg.data} onAction={processMessage} columnLabel={msg.buType === 'NB' || msg.buType === 'MC' ? '技术别/Model' : '尺寸/model'} />
                    </div>
                  )}
                  {msg.type === 'dp-table-readonly' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DPAdjustmentTable data={msg.data} onAction={processMessage} title="本周DP" columnLabel={msg.buType === 'NB' || msg.buType === 'MC' ? '技术别/Model' : '尺寸/model'} />
                    </div>
                  )}
                  {msg.type === 'table-readonly' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DPAdjustmentTable data={msg.data} onAction={processMessage} title="本周销售FCST" />
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
                  {msg.type === 'simulation-result' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <SimulationResultView onCheckVersion={(v) => handleQuickAction(`查看模拟版${v}`)} />
                    </div>
                  )}
                  {msg.type === 'sales-comparison-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <SalesTargetComparisonTable />
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
                        <button className="px-6 py-2 bg-white border border-blue-600 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 transition-all shadow-sm active:scale-95">
                          保存并执行
                        </button>
                      </div>
                    </div>
                  )}
                  {msg.type === 'retrospective' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <RetrospectiveReport />
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
                查看并调整本周销售fcst
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
                查看并调整DP
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
              onClick={() => handleQuickAction('查看客户原始fcst')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              查看客户原始fcst
            </button>
            <button
              onClick={() => handleQuickAction('解释客户FCST变化识别')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              解释客户FCST变化识别
            </button>
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
    </div>
  );
}
