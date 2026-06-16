/**输入示例：客户&技术别，按月/季/年，可展开到Model
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  type: 'text' | 'table' | 'change-table' | 'rules-table' | 'validation-results' | 'sales-comparison-table' | 'external-info' | 'rule-explanation' | 'dp-table' | 'mnt-table' | 'simulation-ask' | 'version-select' | 'simulation-result' | 'import-confirm' | 'import-result' | 'validation-ask' | 'fcst-dimension-select' | 'data-item-select';
  data?: any;
  groupingType?: 'customer-size' | 'tech' | 'customer-tech';
}

interface ValidationRule {
  id: string;
  name: string;
  passed: boolean;
  failCount?: number;
}

interface AnomalyRule {
  id: string;
  isEnabled: boolean;
  name: string;
  dimension: string;
  timeGranularity: string;
  parameters: string;
  scope: string;
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
    customer: '',
    model: '',
    version: '',
    productId: '',
    shippingLocation: '',
    volumes: {} as Record<string, number>
  });

  const customers = ['小米', '华为', 'OPPO', 'VIVO', '三星', '索尼'];
  const models = ['Model A V1.1', 'Model B V1.1', 'Model C V1.1', 'Model D V1.1', 'Model E V1.1'];
  const versions = ['V1.0', 'V1.1', 'V1.2', 'V2.0'];
  const productIds = ['PROD-1001', 'PROD-2022', 'PROD-3045', 'PROD-4098', 'PROD-5120'];
  const locations = ['深圳仓库', '惠州工厂', '苏州物流中心', '东莞分拨点', '北京中转站'];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-blue-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <Plus size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-800">新增预测数据</h2>
              <p className="text-[10px] text-gray-500">在该页面新增一条销售预测及其对应的各项数据</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 mb-6">
            <SearchSelect 
              label="客户" 
              options={customers} 
              value={formData.customer} 
              onChange={(val) => setFormData(prev => ({ ...prev, customer: val }))} 
              placeholder="请选择客户..."
            />
            <SearchSelect 
              label="Model" 
              options={models} 
              value={formData.model} 
              onChange={(val) => setFormData(prev => ({ ...prev, model: val }))} 
              placeholder="请选择型号..."
            />
            <SearchSelect 
              label="版次" 
              options={versions} 
              value={formData.version} 
              onChange={(val) => setFormData(prev => ({ ...prev, version: val }))} 
              placeholder="请选择版次..."
            />
            <SearchSelect 
              label="Product ID" 
              options={productIds} 
              value={formData.productId} 
              onChange={(val) => setFormData(prev => ({ ...prev, productId: val }))} 
              placeholder="请选择产品ID..."
            />
            <SearchSelect 
              label="收货地点" 
              options={locations} 
              value={formData.shippingLocation} 
              onChange={(val) => setFormData(prev => ({ ...prev, shippingLocation: val }))} 
              placeholder="请选择收货地点..."
            />
          </div>

          <div className="space-y-6">
            {MONTHS.map(m => {
              const monthlyTotal = m.weeks.reduce((sum, w) => sum + (formData.volumes[`${m.name}-${w}`] || 0), 0);
              return (
                <div key={m.name} className="p-4 bg-gray-50 rounded-xl border border-gray-200 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                      <h3 className="text-xs font-bold text-gray-700">{m.name} 预测数量</h3>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100/50 rounded-lg">
                      <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">月度汇总:</span>
                      <span className="text-xs font-black text-blue-700">{monthlyTotal}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    {m.weeks.map(w => (
                      <div key={w} className="flex flex-col gap-1">
                        <span className="text-[10px] text-gray-500 font-medium whitespace-pre-wrap leading-tight">{w}</span>
                        <input 
                          type="number" 
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-center text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
                          placeholder="0"
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setFormData(prev => ({
                              ...prev,
                              volumes: { ...prev.volumes, [`${m.name}-${w}`]: val }
                            }));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            onClick={() => onAdd(formData)}
            disabled={!formData.customer || !formData.model}
            className="px-8 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            确认添加
          </button>
        </div>
      </motion.div>
    </div>
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
        
        MONTHS.forEach((m) => {
          m.weeks.forEach((w) => {
            const key = `${m.name}-${w}`;
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

            values[key] = val;
            prevValues[key] = prevVal;
          });
        });

        rows.push({
          id: `${c.name}-${s}-Total-${item}`,
          customer: c.name,
          version: 'P260329-04-002',
          tech: 'N/A', // Totals might not have a specific tech if multiple models mixed, but for this app let's just use LTPS/VA balance if needed, or keep N/A for totals
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

              if (item === 'AI预测') {
                isAIPrediction[key] = true;
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
    const handleClickOutside = () => setShowPopup(false);
    if (showPopup) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [showPopup]);

  useEffect(() => {
    if (showPopup && hasAnomalyPopup && !llmReasoning && !isLoadingLlm) {
      setIsLoadingLlm(true);
      const externalInfos = [
        { title: '小米电视宣布618大促提前启动，备货量同比增长25%', content: '小米电视宣布今年618年中大促将提前至5月15日启动，涵盖55寸、65寸、75寸全系电视品类，预计面板备货量同比增长25%以上。', source: '企业公告' },
        { title: 'TrendForce：2026年Q2全球电视面板价格预计上涨8-12%', content: '受欧洲杯及奥运会备货需求拉动，叠加上游玻璃基板及偏光片涨价传导，Q2全球电视面板均价预计环比上涨8-12%。', source: 'TrendForce研报' },
      ];
      generateAnomalyReasoning(
        startRowId?.split('-')[0] || '客户',
        startRowId?.split('-')[1] || '',
        startColumnKey?.split('-')[0] || '',
        value,
        oldValue || value,
        violatedRules || [],
        aiSummary || '',
        externalInfos
      ).then(text => {
        setLlmReasoning(text);
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

      {/* AI预测值解读弹窗 (click-triggered) */}
      {showPopup && isAIPrediction && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-[0_10px_60px_-10px_rgba(0,0,0,0.4)] z-[10000] text-left border border-gray-200 cursor-default w-[480px]"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-gray-100">
            <span className="text-[14px] font-black text-gray-900">AI预测值解读</span>
            <button
              onClick={(e) => { e.stopPropagation(); setShowPopup(false); }}
              className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={14} className="text-gray-500" />
            </button>
          </div>
          <div className="p-5 max-h-[70vh] overflow-y-auto">
            <AIPredictionTooltip simple={aiPredictionSimple} />
          </div>
        </div>
      )}

      {/* 异常归因弹窗 (click-triggered, with DeepSeek reasoning) */}
      {showPopup && hasAnomalyPopup && !specialRuleData && !isAIPrediction && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20"
        >
          <div className="bg-white rounded-2xl shadow-[0_20px_80px_-10px_rgba(0,0,0,0.5)] border border-gray-200 w-[620px] max-h-[85vh] flex flex-col">
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
        </div>
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
                              isAnomaly={row.isAnomaly[key]}
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
                            isAnomaly={row.isAnomaly[key]}
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
                                  isAnomaly={row.isAnomaly[key]}
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
                                isAnomaly={row.isAnomaly[key]}
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

const DPAdjustmentTable = ({ data: initialData, onAction }: { data: ForecastRow[], onAction?: (text: string) => void }) => {
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
        <h3 className="text-sm font-bold text-gray-800">DP & 销售预测调整</h3>
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
              <th rowSpan={2} className="border border-gray-200 p-2 min-w-[80px] font-bold text-gray-700 bg-[#f8faff]">尺寸/model</th>
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
                      return (
                        <td key={key} className="border border-gray-200 p-0 h-9">
                          {cellIsAnomaly && hasAnomalyContent ? (
                            <EditableCell
                              value={rowData.values[key] || 0}
                              isEditable={false}
                              isAnomaly={true}
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
                              {rowData.isAIPrediction?.[key] && (
                                <div className="absolute top-0.5 right-0.5">
                                  <Bot size={8} className="text-blue-500" />
                                </div>
                              )}
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
                                  isAnomaly={rowData.isAnomaly[key]}
                                  isAIPrediction={rowData.isAIPrediction?.[key]}
                                  aiPredictionSimple={true}
                                  specialRuleData={rowData.specialRuleData?.[key]}
                                  allowModificationMarker={rowData.item === '销售FCST (ETD)' || rowData.item === 'ExtraSales'}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center relative group cursor-default">
                                  {rowData.values[key] || 0}
                                  {rowData.isAIPrediction?.[key] && (
                                    <>
                                      <div className="absolute top-0.5 right-0.5">
                                        <Bot size={8} className="text-blue-500" />
                                      </div>
                                      <AIPredictionTooltip simple={true} />
                                    </>
                                  )}
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
    { metric: 'VS 供应BP', v1: 150, v2: -850, v3: 2100 },
    { metric: '收入', v1: -34000, v2: 56700, v3: -12800 },
    { metric: '利润', v1: 3200, v2: -4700, v3: 1500 },
    { metric: 'KPI产品', v1: -3, v2: 8, v3: -1 },
    { metric: '成品库存', v1: 450, v2: -120, v3: 780 },
    { metric: '净收入', v1: -28300, v2: 52100, v3: -9500 },
    { metric: '重点产品', v1: 15, v2: -5, v3: 4 },
    { metric: '库存', v1: 1250, v2: -340, v3: 680 },
    { metric: '销量BP/RP', v1: -18, v2: 25, v3: -7 },
    { metric: '供应BP/RP', v1: 10, v2: -9, v3: 22 },
  ];

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
              return (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
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
  groupingType = 'customer-size'
}: { 
  data: ForecastRow[], 
  onUpdate: (rowId: string, key: string, newVal: number, reason?: string, tag?: string) => void, 
  onUpdateAttribute?: (rowId: string, field: string, value: string) => void,
  onBatchUpdateReasons?: (reasons: { rowId: string; key: string; reason: string; tag: string }[]) => void,
  onBatchUpdateValues?: (updates: { rowId: string; key: string; newVal: number }[]) => void,
  onSubmit: () => void,
  onValidate?: () => void,
  groupingType?: 'customer-size' | 'tech' | 'customer-tech'
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

  return (
    <div className="flex flex-col w-full max-w-full bg-white rounded-xl border border-gray-200 shadow-sm relative z-0">
      <div className="flex items-center justify-between p-4 bg-gray-50/50 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <BarChart3 size={18} className="text-blue-600" />
          本周销售FCST
        </h3>
        <div className="flex items-center gap-2">
          <button 
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="导出当前数据"
          >
            <Download size={16} />
          </button>
          <button 
            className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
            title="导入预测数据"
          >
            <Upload size={16} />
          </button>
          <div className="relative" ref={settingsRef}>
            <button 
              onClick={() => setIsColumnSettingsOpen(!isColumnSettingsOpen)}
              className="w-8 h-8 bg-white border border-gray-200 text-gray-600 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-all shadow-sm active:scale-90"
              title="自定义显示字段"
            >
              <Settings size={18} />
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
            onClick={() => setIsAddModalOpen(true)}
            className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-all shadow-sm active:scale-90"
            title="新增预测数据条目"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
      
      <ForecastFilterBar data={data} onFilterChange={setFilteredData} />
      
      <div className="overflow-x-auto min-h-[500px] pb-32" ref={scrollContainerRef}>
        <table className="w-full border-collapse text-xs">
          <thead className="bg-gray-50 sticky top-0 z-40 shadow-sm">
            <tr>
              {groupingType === 'tech' ? (
                visibleColumns.has('techModel') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[150px] bg-gray-50 text-center">技术别 / Model</th>
              ) : (
                <>
                  {visibleColumns.has('customer') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[80px] bg-gray-50 text-center">集团客户名称</th>}
                  {groupingType === 'customer-tech' ? (
                    visibleColumns.has('tech') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[100px] bg-gray-50 text-center">技术别</th>
                  ) : (
                    visibleColumns.has('sizeModel') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[100px] bg-gray-50 text-center">尺寸 / Model</th>
                  )}
                </>
              )}
              {visibleColumns.has('specs') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[150px] bg-gray-50 text-center">规格描述</th>}
              {visibleColumns.has('shippingLocation') && <th rowSpan={2} className="border border-gray-200 p-2 min-w-[80px] bg-gray-50 text-center">收货地</th>}
              {visibleColumns.has('dataItem') && (
                <th rowSpan={2} className="border border-gray-200 p-2 min-w-[120px] bg-gray-50 relative group text-center">
                  <div className="flex items-center justify-center gap-1">
                    数据项
                    <div className="relative" ref={dataItemRef}>
                      <button 
                        onClick={() => setIsDataItemFilterOpen(!isDataItemFilterOpen)}
                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${visibleDataItems.size < allDataItems.length ? 'text-blue-600 bg-blue-50' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}
                        title="筛选数据项"
                      >
                        <Filter size={12} />
                      </button>
                      
                      <AnimatePresence>
                        {isDataItemFilterOpen && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute top-full left-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl z-[110] p-2 text-left font-normal"
                          >
                            <p className="px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1 leading-none">选择显示数据项</p>
                            <div className="max-h-60 overflow-y-auto">
                              {allDataItems.map(item => (
                                <label key={item} className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                                  <input 
                                    type="checkbox" 
                                    checked={visibleDataItems.has(item)} 
                                    onChange={() => toggleDataItem(item)}
                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                                  />
                                  <span className={`text-[11px] font-medium transition-colors ${visibleDataItems.has(item) ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-900'}`}>{item}</span>
                                </label>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </th>
              )}
              {MONTHS.filter(m => visibleColumns.has(m.name)).map(m => (
                <th key={m.name} colSpan={m.weeks.length} className="border border-gray-200 p-1 bg-blue-50 text-blue-700 font-bold text-center">
                  {m.name}
                </th>
              ))}
            </tr>
            <tr>
              {MONTHS.filter(m => visibleColumns.has(m.name)).flatMap(m => m.weeks.map(w => (
                <th key={`${m.name}-${w}`} className="border border-gray-200 p-1 min-w-[60px] font-medium text-gray-600">
                  {w}
                </th>
              )))}
            </tr>
          </thead>
          <tbody>
            {secondaryGroups.slice(0, visibleRowsCount).map((group) => {
              const { primary: p, secondary: s } = group;
              const { total, models } = groupedData[p][s];
              const isExpanded = expandedGroups.has(`${p}-${s}`);
              const modelNames = Object.keys(models);
              
              // Total rows for this size
              const rows = [];
              
              // 1. Add Total rows
              const sizeTotalRows = total.filter(r => displayItems.includes(r.item));
              const rowCountPerModel = sizeTotalRows.length;
              const totalRowSpan = rowCountPerModel + (isExpanded ? modelNames.length * rowCountPerModel : 0);
              
              sizeTotalRows.forEach((row, idx) => {
                const isFirstInSize = idx === 0;
                
                rows.push(
                  <tr key={row.id} className={`${isExpanded ? 'bg-blue-50/30' : 'hover:bg-gray-50'} transition-colors`}>
                    {groupingType === 'tech' ? (
                      visibleColumns.has('techModel') && isFirstInSize && (
                        <td rowSpan={totalRowSpan} className="border border-gray-200 p-2 font-bold text-gray-800 bg-white align-top">
                          <div className="flex items-center justify-between gap-2">
                            <span>{p}</span>
                            <button 
                              onClick={() => toggleGroup(p, s)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors text-blue-600"
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter font-semibold">汇总数据</div>
                        </td>
                      )
                    ) : (
                      <>
                        {visibleColumns.has('customer') && isFirstInSize && (
                          <td rowSpan={totalRowSpan} className="border border-gray-200 p-2 font-bold text-center bg-white align-top">
                            {p}
                          </td>
                        )}
                        {isFirstInSize && (
                          groupingType === 'customer-tech' ? (
                            visibleColumns.has('tech') && (
                              <td className="border border-gray-200 p-2 bg-white font-bold text-gray-700">
                                {s}
                                <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter font-semibold">汇总数据</div>
                              </td>
                            )
                          ) : (
                            visibleColumns.has('sizeModel') && (
                          <td rowSpan={rowCountPerModel} className="border border-gray-200 p-2 bg-white">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-gray-700">{s}</span>
                              <button 
                                onClick={() => toggleGroup(p, s)}
                                className="p-1 hover:bg-gray-200 rounded transition-colors text-blue-600"
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-tighter font-semibold">汇总数据</div>
                          </td>
                        ) ) )}
                      </>
                    )}
                    {visibleColumns.has('specs') && isFirstInSize && (
                      <td rowSpan={rowCountPerModel} className="border border-gray-200 p-2 bg-white text-gray-500 font-medium">
                        {row.specs}
                      </td>
                    )}
                    {visibleColumns.has('shippingLocation') && isFirstInSize && (
                      <td rowSpan={rowCountPerModel} className="border border-gray-200 p-2 bg-white text-center group cursor-pointer hover:bg-blue-50 transition-colors"
                        onClick={() => {
                          setEditingLocationId(row.id);
                          setLocationInputValue(row.shippingLocation || '');
                        }}
                      >
                        {editingLocationId === row.id ? (
                          <input 
                            autoFocus
                            className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded focus:outline-none"
                            value={locationInputValue}
                            onChange={(e) => setLocationInputValue(e.target.value)}
                            onBlur={() => handleLocationSave(row.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleLocationSave(row.id);
                              if (e.key === 'Escape') setEditingLocationId(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-gray-700">{row.shippingLocation || '-'}</span>
                            <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                      </td>
                    )}
                    {visibleColumns.has('dataItem') && (
                      <td className="border border-gray-200 p-2 font-medium text-black">
                        {row.item}
                      </td>
                    )}
                    {MONTHS.filter(m => visibleColumns.has(m.name)).flatMap(m => m.weeks.map(w => {
                      const key = `${m.name}-${w}`;
                      return (
                        <td key={key} className="border border-gray-200 p-0 h-8">
                          <EditableCell 
                            value={row.values[key]} 
                            isEditable={false}
                            isAnomaly={row.isAnomaly[key]}
                            reason={row.reasons[key]}
                            tag={row.tags[key]}
                            aiSummary={row.aiSummaries?.[key]}
                            violatedRules={row.violatedRules?.[key]}
                            isAIPrediction={row.item === 'AI预测'}
                            onSave={(val, reason, tag) => onUpdate(row.id, key, val, reason, tag)}
                            oldValue={row.prevValues?.[key]}
                          />
                        </td>
                      );
                    }))}
                  </tr>
                );
              });

              // 2. Add Model rows if expanded
              if (isExpanded) {
                modelNames.forEach(modelName => {
                  const modelRows = models[modelName].filter(r => displayItems.includes(r.item));
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
                        {visibleColumns.has('specs') && isFirstInModel && (
                          <td rowSpan={modelRowSpan} className="border border-gray-200 p-2 bg-gray-50/50 text-gray-400 italic">
                            {row.specs}
                          </td>
                        )}
                        {visibleColumns.has('shippingLocation') && isFirstInModel && (
                          <td rowSpan={modelRowSpan} className="border border-gray-200 p-2 bg-white text-center group cursor-pointer hover:bg-blue-50 transition-colors"
                            onClick={() => {
                              setEditingLocationId(row.id);
                              setLocationInputValue(row.shippingLocation || '');
                            }}
                          >
                            {editingLocationId === row.id ? (
                              <input 
                                autoFocus
                                className="w-full px-1 py-0.5 text-xs border border-blue-400 rounded focus:outline-none"
                                value={locationInputValue}
                                onChange={(e) => setLocationInputValue(e.target.value)}
                                onBlur={() => handleLocationSave(row.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleLocationSave(row.id);
                                  if (e.key === 'Escape') setEditingLocationId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <span className="text-gray-700">{row.shippingLocation || '-'}</span>
                                <Edit2 size={10} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            )}
                          </td>
                        )}
                        {visibleColumns.has('dataItem') && (
                          <td className={`border border-gray-200 p-2 font-medium ${row.item === '销售FCST (ETD)' || row.item === 'ExtraSales' ? 'text-blue-600' : 'text-black'}`}>
                            {row.item}
                          </td>
                        )}
                        {MONTHS.filter(m => visibleColumns.has(m.name)).flatMap(m => m.weeks.map(w => {
                          const key = `${m.name}-${w}`;
                          const isEditable = row.item === '销售FCST (ETD)' || row.item === 'ExtraSales';
                          return (
                            <td key={key} className="border border-gray-200 p-0 h-8">
                              <EditableCell 
                                value={row.values[key]} 
                                isEditable={isEditable}
                                isAnomaly={row.isAnomaly[key]}
                                reason={row.reasons[key]}
                                tag={row.tags[key]}
                                aiSummary={row.aiSummaries?.[key]}
                                violatedRules={row.violatedRules?.[key]}
                                isAIPrediction={row.item === 'AI预测'}
                                onSave={(val, reason, tag) => onUpdate(row.id, key, val, reason, tag)}
                                startRowId={row.id}
                                startColumnKey={key}
                                oldValue={row.prevValues?.[key]}
                                allowModificationMarker={row.item === '销售FCST (ETD)' || row.item === 'ExtraSales'}
                              />
                            </td>
                          );
                        }))}
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
          console.log('Adding new data:', newData);
          setIsAddModalOpen(false);
        }} 
      />
    </div>
  );
};

const AnomalyRulesTable = ({ rules, onToggle, onEdit }: { rules: AnomalyRule[], onToggle: (id: string) => void, onEdit: (rule: AnomalyRule) => void }) => {
  return (
    <div className="w-full overflow-hidden bg-white rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-gray-50">
          <tr>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">是否启用</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">规则名称</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">维度</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">时间粒度</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">规则特有参数</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">适用范围</th>
            <th className="border border-gray-200 p-2 text-left font-bold text-gray-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
              <td className="border border-gray-200 p-2 text-center">
                <div className="flex justify-center">
                  <button 
                    onClick={() => onToggle(rule.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${rule.isEnabled ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-gray-300 hover:border-gray-400'}`}
                  >
                    {rule.isEnabled && <Check size={14} strokeWidth={3} />}
                  </button>
                </div>
              </td>
              <td className="border border-gray-200 p-2 text-gray-800">{rule.name}</td>
              <td className="border border-gray-200 p-2 text-gray-800">{rule.dimension}</td>
              <td className="border border-gray-200 p-2 text-gray-800">{rule.timeGranularity}</td>
              <td className="border border-gray-200 p-2 text-gray-800">{rule.parameters}</td>
              <td className="border border-gray-200 p-2 text-gray-800">{rule.scope}</td>
              <td className="border border-gray-200 p-2">
                <div className="flex gap-2">
                  <button 
                    onClick={() => onEdit(rule)}
                    className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-2"
                  >
                    修改
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const RuleEditModal = ({ rule, onClose, onSave }: { rule: AnomalyRule, onClose: () => void, onSave: (updatedRule: AnomalyRule) => void }) => {
  const [dimensions, setDimensions] = useState(['客户', '尺寸', 'model']);
  const [granularities, setGranularities] = useState([
    { label: '周', threshold: '0%', checked: false },
    { label: '月', threshold: '5%', checked: true },
    { label: '季', threshold: '10%', checked: true },
    { label: '年', threshold: '15%', checked: true },
  ]);
  const [scope, setScope] = useState('TV');

  const allDimensions = ['客户', '尺寸', 'model', '技术别', '面板厂', '大板'];
  const allScopes = ['全部', 'TV', 'CID', 'MNT', '平板', 'NB', '车载', 'MB'];

  const toggleDimension = (dim: string) => {
    setDimensions(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);
  };

  const toggleGranularity = (idx: number) => {
    setGranularities(prev => prev.map((g, i) => i === idx ? { ...g, checked: !g.checked } : g));
  };

  const handleSave = () => {
    onSave({
      ...rule,
      dimension: dimensions.join('+'),
      timeGranularity: granularities.filter(g => g.checked).map(g => g.label).join('+'),
      parameters: granularities.filter(g => g.checked).map(g => `${g.label}${g.threshold}`).join('、'),
      scope: `BU：${scope}`
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Edit2 size={18} className="text-blue-600" />
            修改异常规则: {rule.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8">
          {/* Statistical Dimension */}
          <section>
            <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
              统计维度 (多选)
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {allDimensions.map(dim => (
                <button
                  key={dim}
                  onClick={() => toggleDimension(dim)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center justify-center gap-1.5
                    ${dimensions.includes(dim) 
                      ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors
                    ${dimensions.includes(dim) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                    {dimensions.includes(dim) && <Check size={10} strokeWidth={4} />}
                  </div>
                  {dim}
                </button>
              ))}
            </div>
          </section>

          {/* Time Granularity and Threshold */}
          <section>
            <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
              时间粒度及阈值勾选
            </h4>
            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-3 text-center w-16 font-bold text-gray-600">勾选</th>
                    <th className="p-3 text-left font-bold text-gray-600">时间粒度</th>
                    <th className="p-3 text-left font-bold text-gray-600">阈值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {granularities.map((g, idx) => (
                    <tr key={g.label} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => toggleGranularity(idx)}
                          className={`mx-auto w-5 h-5 rounded border flex items-center justify-center transition-colors
                            ${g.checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 hover:border-gray-400'}`}
                        >
                          {g.checked && <Check size={12} strokeWidth={3} />}
                        </button>
                      </td>
                      <td className="p-3 font-medium text-gray-700">{g.label}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={g.threshold} 
                            onChange={(e) => {
                              const newVal = e.target.value;
                              setGranularities(prev => prev.map((item, i) => i === idx ? { ...item, threshold: newVal } : item));
                            }}
                            className="w-20 px-2 py-1 border border-gray-200 rounded bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Scope */}
          <section>
            <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
              适用范围 (单选)
            </h4>
            <div className="flex flex-wrap gap-3">
              {allScopes.map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-4 py-2 rounded-full text-xs font-medium border transition-all flex items-center gap-2
                    ${scope === s 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100' 
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >
                  <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center
                    ${scope === s ? 'border-white' : 'border-gray-300'}`}>
                    {scope === s && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  {s}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all active:scale-95"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            className="px-8 py-2 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            确认修改
          </button>
        </div>
      </motion.div>
    </div>
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

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'agent', content: '您好！我是您的需求感知/共识助手。有什么我可以帮您的？', type: 'text' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [userRole, setUserRole] = useState<'sales' | 'director'>('sales');
  const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
  const [backupForecastData, setBackupForecastData] = useState<ForecastRow[] | null>(null);
  const [anomalyRules, setAnomalyRules] = useState<AnomalyRule[]>([]);
  const [editingRule, setEditingRule] = useState<AnomalyRule | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleToggleRule = (id: string) => {
    setAnomalyRules(prev => prev.map(rule => 
      rule.id === id ? { ...rule, isEnabled: !rule.isEnabled } : rule
    ));
  };

  const handleEditRule = (rule: AnomalyRule) => {
    setEditingRule(rule);
  };

  const handleSaveRule = (updatedRule: AnomalyRule) => {
    setAnomalyRules(prev => prev.map(rule => 
      rule.id === updatedRule.id ? updatedRule : rule
    ));
    setEditingRule(null);
  };

  const processMessage = async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, type: 'text' };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    // Simulate agent processing
    setTimeout(() => {
      setIsTyping(false);
      if (text === '解释客户FCST变化识别') {
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
          content: '好的，为您进入DP调整页面。在此视图下，您可以根据预测建议手动调整销售FCST及需求计划。点击尺寸旁的箭头可展开至具体 Model 维度级别进行微调。', 
          type: 'dp-table',
          data: initialData
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (userRole === 'director' && (text.includes('调整MNT本周销售fcst') || text.includes('MNT本周') || text.includes('调整本周销售fcst') || text.includes('fcst')) && !text.startsWith('director-confirm:')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '您好，销售总监。请先选择您想查看的数据项，确认后为您展示对应数据。',
          type: 'data-item-select'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.startsWith('director-confirm:') || (userRole !== 'director' && (text.includes('调整MNT本周销售fcst') || text.includes('MNT本周')))) {
        const actualText = text.startsWith('director-confirm:') ? text.replace('director-confirm:', '') : text;
        if (actualText.includes('MNT') || text.includes('MNT本周')) {
          const mntData = generateMNTData();
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: '好的，为您查询到MNT BU本周销售预测数据如下。您可以点击"尺寸-分辨率"旁的箭头展开查看刷新率维度，再次点击可展开至具体 ProductID 维度数据。',
            type: 'mnt-table',
            data: mntData
          };
          setMessages(prev => [...prev, agentMsg]);
        } else {
          const initialData = generateInitialData();
          setForecastData(initialData);
          const agentMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'agent',
            content: '好的，为您查询到本周客户预测数据如下。您可以点击"尺寸"单元格旁的箭头展开查看具体的 Model 维度数据。',
            type: 'table',
            data: initialData
          };
          setMessages(prev => [...prev, agentMsg]);
        }
      } else if (text.includes('调整本周销售fcst') || text.includes('fcst')) {
        const initialData = generateInitialData();
        setForecastData(initialData);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '好的，为您查询到本周客户预测数据如下。您可以点击"尺寸"单元格旁的箭头展开查看具体的 Model 维度数据。',
          type: 'table',
          data: initialData
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
          content: '好的，为您进入模拟版 P260329-04-002 的 DP & 销售预测调整页面。在此视图下，您可以根据预测建议手动调整销售FCST及需求计划。点击尺寸旁的箭头可展开至具体 Model 维度级别进行微调。', 
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
        const rules: AnomalyRule[] = [
          { id: '1', isEnabled: true, name: '客户FCST变化识别', dimension: '客户+尺寸+Model', timeGranularity: '周+月+季度', parameters: '月5%、季10%', scope: 'BU：TV' },
          { id: '2', isEnabled: true, name: '客户FCST变化识别', dimension: '客户+技术别+尺寸+Model', timeGranularity: '周+月+季度', parameters: '月5%、季10%', scope: 'BU：MNT' },
          { id: '3', isEnabled: true, name: '产品生命周期验证', dimension: 'Model', timeGranularity: '月', parameters: 'NPI阈值50%', scope: '全部' },
          { id: '4', isEnabled: true, name: '需求供应对比', dimension: '客户+尺寸', timeGranularity: '月', parameters: '月10%', scope: 'BU：TV' },
          { id: '5', isEnabled: true, name: '需求供应对比', dimension: '客户+技术别', timeGranularity: '月', parameters: '月10%', scope: 'BU：MNT' },
        ];
        setAnomalyRules(rules);
        const agentMsg: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'agent', 
          content: '为您查询到当前的异常识别规则如下：', 
          type: 'rules-table',
          data: rules
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
          const updatedReasons = { ...row.reasons, [key]: reason || row.reasons[key] || '' };
          const updatedTags = { ...row.tags, [key]: tag || row.tags[key] || '' };
          
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
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-100 rounded-full p-0.5">
            <button onClick={() => setUserRole('sales')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${userRole === 'sales' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销售员</button>
            <button onClick={() => setUserRole('director')} className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${userRole === 'director' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>销售总监</button>
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
              <div className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm
                  ${msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-white text-gray-600 border border-gray-200'}`}>
                  {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                </div>
                <div className="space-y-2">
                  <div className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed whitespace-pre-wrap
                    ${msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'}`}>
                    {msg.content}
                  </div>
                  {msg.type === 'table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <ForecastTable 
                        data={forecastData} 
                        groupingType={msg.groupingType}
                        onUpdate={handleUpdate} 
                        onUpdateAttribute={handleUpdateAttribute}
                        onBatchUpdateReasons={handleBatchUpdateReasons}
                        onBatchUpdateValues={handleBatchUpdateValues}
                        onSubmit={() => processMessage('提交修改')} 
                        onValidate={() => processMessage('执行校验')} 
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
                      <DataItemSelectCard onSelect={(items) => processMessage('director-confirm:调整本周销售fcst')} />
                    </div>
                  )}
                  {msg.type === 'dp-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <DPAdjustmentTable data={msg.data} onAction={processMessage} />
                    </div>
                  )}
                  {msg.type === 'mnt-table' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <MNTForecastTable data={msg.data} onAction={processMessage} />
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
                        rules={anomalyRules.length > 0 ? anomalyRules : msg.data} 
                        onToggle={handleToggleRule} 
                        onEdit={handleEditRule}
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

      {editingRule && (
        <RuleEditModal 
          rule={editingRule} 
          onClose={() => setEditingRule(null)} 
          onSave={handleSaveRule} 
        />
      )}

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
            <button 
              onClick={() => handleQuickAction('查看并调整DP')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
            >
              查看并调整DP
            </button>
            <button
              onClick={() => handleQuickAction('调整本周销售fcst')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              调整本周销售fcst
            </button>
            <button
              onClick={() => handleQuickAction('调整MNT本周销售fcst')}
              className="whitespace-nowrap px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full text-xs font-medium hover:bg-indigo-100 transition-colors shadow-sm"
            >
              调整MNT本周销售fcst
            </button>
            <button 
              onClick={() => handleQuickAction('查看客户FCST及其变化')}
              className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
            >
              查看客户FCST及其变化
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
