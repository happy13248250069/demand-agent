/**输入示例：客户&技术别，按月/季/年，可展开到Model
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Edit2, Check, X, AlertCircle, ChevronRight, ChevronDown, Loader2, BarChart3, Target, Tag, Plus, Eye, EyeOff, Activity, ArrowUpRight, ArrowDownRight, Crown, Download, Upload, Search, Settings, Filter, RefreshCcw, RefreshCw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { DataItemType, MNTDataItemType, ForecastRow, EditReason } from './types';
import type { RuleDetail, TriggerRecord, RuleExplanationData, ValidationRule, AnomalyRule } from './types';
import type { Message, MessageType, GroupingType } from './types';
import type { ExternalInfo } from './types';
import { MONTHS, AGGREGATES } from './constants';
import { MNT_CUSTOMERS, MNT_REFRESH_RATES_MAP, MNT_PRODUCTS_MAP, MNT_ITEMS } from './constants';
import { generateInitialData, generateMNTData } from './data';
import { AnomalyCard } from './components/tooltips/AnomalyCard';
import { ExternalEventCard } from './components/tooltips/ExternalEventCard';
import { CellTooltipContent } from './components/tooltips/CellTooltipContent';
import { ForecastFilterBar } from './components/common/ForecastFilterBar';
import { SearchSelect } from './components/common/SearchSelect';
import { EditableCell } from './components/common/EditableCell';
import { BatchReasonModal } from './components/common/BatchReasonModal';
import { AIPredictionTooltip } from './components/tooltips/AIPredictionTooltip';
import { StrategyAdjustmentTooltip } from './components/tooltips/StrategyAdjustmentTooltip';
import { ForecastTable } from './components/tables/ForecastTable';
import { ForecastChangeTable } from './components/tables/ForecastChangeTable';
import { DPAdjustmentTable } from './components/tables/DPAdjustmentTable';
import { MNTForecastTable } from './components/tables/MNTForecastTable';
import { SalesTargetComparisonTable } from './components/tables/SalesTargetComparisonTable';
import { ValidationResults } from './components/tables/ValidationResults';
import { AnomalyRulesTable } from './components/tables/AnomalyRulesTable';
import { RuleExplanationView } from './components/views/RuleExplanationView';
import { ExternalInfoCards } from './components/views/ExternalInfoCards';
import { ForecastDimensionSelect } from './components/views/ForecastDimensionSelect';
import { SimulationVersionSelectView } from './components/views/SimulationVersionSelectView';
import { SimulationResultView } from './components/views/SimulationResultView';
import { AddDataModal } from './components/modals/AddDataModal';
import { RuleEditModal } from './components/modals/RuleEditModal';
import { ForecastRetrospectiveView } from './components/views/ForecastRetrospectiveView';
import { AnomalyAttributionView } from './components/views/AnomalyAttributionView';
import { executeAnomalyDetection, generateDetectionSummary, getDefaultRuleConfigs } from './services/anomaly-detection-service';
import { calculateAIPrediction, generateMockPredictionScenarios } from './services/ai-prediction-service';
import { getMockAttributionDemo, performAttributionForForecastData } from './services/anomaly-attribution-service';

const ALL_DATA_ITEMS = ['客户FCST', 'AI预测', '销售FCST (ETD)', 'ExtraSales', '需求计划', 'ExtraUnmet'] as const;

const DataItemSelectCard = ({ onConfirm }: { onConfirm: (items: string[]) => void }) => {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleItem = (item: string) => {
    if (selected.includes(item)) {
      setSelected(selected.filter(i => i !== item));
    } else {
      setSelected([...selected, item]);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="text-[13px] font-bold text-gray-800">
        请选择您要查看的数据项（建议不超过3项）：
      </div>
      <div className="text-[11px] text-gray-500">
        默认按汇总维度展示。选择后将仅加载对应数据项，提升查询速度。
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ALL_DATA_ITEMS.map((item) => {
          const isSelected = selected.includes(item);
          return (
            <button
              key={item}
              onClick={() => toggleItem(item)}
              className={`px-3 py-2.5 rounded-lg text-[11px] font-medium border transition-all ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      {selected.length > 3 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
          <span className="text-[11px] text-orange-700 font-medium">
            选择数据项过多，加载时间可能较长，请稍后。
          </span>
        </div>
      )}

      <button
        onClick={() => onConfirm(selected)}
        disabled={selected.length === 0}
        className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all ${
          selected.length > 0
            ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-[0.98]'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        确认查看{selected.length > 0 ? `（已选${selected.length}项）` : ''}
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
  const [forecastData, setForecastData] = useState<ForecastRow[]>([]);
  const [backupForecastData, setBackupForecastData] = useState<ForecastRow[] | null>(null);
  const [anomalyRules, setAnomalyRules] = useState<AnomalyRule[]>([]);
  const [editingRule, setEditingRule] = useState<AnomalyRule | null>(null);
  const [userRole, setUserRole] = useState<'sales' | 'director'>('sales');
  const [pendingDirectorAction, setPendingDirectorAction] = useState<string | null>(null);
  const [directorSelectedItems, setDirectorSelectedItems] = useState<string[]>([]);
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

      // 销售总监引导式对话：拦截表格类命令
      const isTableCommand = text.includes('调整本周销售fcst') || text.includes('fcst') || text.includes('查看并调整DP') || text.includes('调整MNT');
      if (userRole === 'director' && isTableCommand && !text.startsWith('DIRECTOR_CONFIRMED:')) {
        setPendingDirectorAction(text);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '作为销售总监，数据量较大。请先选择您要查看的数据项（最多2项），以便为您精准展示关键信息。',
          type: 'data-item-select',
          data: { originalCommand: text }
        };
        setMessages(prev => [...prev, agentMsg]);
        return;
      }

      // 处理总监确认后的命令（去掉前缀后走正常流程）
      if (text.startsWith('DIRECTOR_CONFIRMED:')) {
        text = text.replace('DIRECTOR_CONFIRMED:', '');
      }

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
          content: `为您查询到“客户FCST变化识别”规则的详细解释及历史分析如下：\n\n规则解释：此规则用于检测各版本预测偏离均值的程度，超过15%视为异常，可能影响生产计划准确性。通过监控客户预测的波动，提前识别潜在的供需风险。\n\n效果评估：准确率:80%。基于历史数据分析，在触发该规则的120次异常中，有96次用户随后手工修改了预测数值（视为真实异常），准确率表现良好。\n\n优化建议：该规则近3个月触发120次，其中80%为真实异常，建议保持当前阈值；但小米产品线误报较多，建议针对该客户单独调整阈值至20%以减少干扰。`, 
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
      } else if (text.includes('调整MNT本周销售fcst') || text.includes('MNT本周')) {
        const mntData = generateMNTData();
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '好的，为您查询到MNT BU本周销售预测数据如下。您可以点击”尺寸-分辨率”旁的箭头展开查看刷新率维度，再次点击可展开至具体 ProductID 维度数据。',
          type: 'mnt-table',
          data: mntData
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('调整本周销售fcst') || text.includes('fcst')) {
        const initialData = generateInitialData();
        setForecastData(initialData);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '好的，为您查询到本周客户预测数据如下。您可以点击”尺寸”单元格旁的箭头展开查看具体的 Model 维度数据。',
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
      } else if (text.includes('查看复盘') || text.includes('预测复盘') || text.includes('复盘报告')) {
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: '已为您生成预测复盘分析报告。报告对比了实际出货与各预测版本（客户FCST、销售FCST、ML预测）的偏差情况，帮助您识别预测准确性问题和改进方向。',
          type: 'retrospective'
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('异常归因') || text.includes('AI归因') || text.includes('归因分析')) {
        const data = forecastData.length > 0 ? forecastData : generateInitialData();
        const attributionResults = performAttributionForForecastData(data);
        const displayResults = attributionResults.length > 0 ? attributionResults : [getMockAttributionDemo()];
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: `已完成异常归因分析，共识别${displayResults.length}条异常并匹配到相关外部信息。系统通过标签匹配和时效性评分，为每条异常找到了最相关的外部事件解释。`,
          type: 'anomaly-attribution',
          data: displayResults
        };
        setMessages(prev => [...prev, agentMsg]);
      } else if (text.includes('执行异常检测') || text.includes('运行异常检测')) {
        const data = forecastData.length > 0 ? forecastData : generateInitialData();
        const ruleConfigs = getDefaultRuleConfigs();
        const results = executeAnomalyDetection(data, ruleConfigs);
        const summary = generateDetectionSummary(results);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'agent',
          content: summary.aiSummaryText,
          type: 'anomaly-detection-result',
          data: summary
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
            <button
              onClick={() => setUserRole('sales')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRole === 'sales' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              销售员
            </button>
            <button
              onClick={() => setUserRole('director')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRole === 'director' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              销售总监
            </button>
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
                        initialVisibleItems={userRole === 'director' && directorSelectedItems.length > 0 ? directorSelectedItems : undefined}
                        readOnly={userRole === 'director'}
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
                  {msg.type === 'data-item-select' && (
                    <div className="mt-4 w-full">
                      <DataItemSelectCard
                        onConfirm={(items) => {
                          setDirectorSelectedItems(items);
                          const cmd = msg.data?.originalCommand || pendingDirectorAction || '调整本周销售fcst';
                          setPendingDirectorAction(null);
                          processMessage(`DIRECTOR_CONFIRMED:${cmd}`);
                        }}
                      />
                    </div>
                  )}
                  {msg.type === 'retrospective' && (
                    <div className="mt-4 w-full overflow-hidden">
                      <ForecastRetrospectiveView />
                    </div>
                  )}
                  {msg.type === 'anomaly-attribution' && msg.data && (
                    <div className="mt-4 w-full overflow-hidden">
                      <AnomalyAttributionView results={msg.data} />
                    </div>
                  )}
                  {msg.type === 'anomaly-detection-result' && msg.data && (
                    <div className="mt-4 w-full overflow-hidden">
                      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                          <AlertCircle size={16} className="text-orange-500" />
                          异常检测结果 — 共发现 {msg.data.totalAnomalies} 条异常
                        </div>
                        {msg.data.byRule && msg.data.byRule.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.data.byRule.map((r: any) => (
                              <span key={r.ruleId} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded-full text-[11px] text-orange-700 font-medium">
                                {r.ruleName}: {r.count}条
                              </span>
                            ))}
                          </div>
                        )}
                        {msg.data.byCustomer && msg.data.byCustomer.length > 0 && (
                          <div className="text-[11px] text-gray-600">
                            <span className="font-medium text-gray-700">主要客户: </span>
                            {msg.data.byCustomer.slice(0, 5).map((c: any) => `${c.customer}(${c.count})`).join('、')}
                          </div>
                        )}
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
            {userRole === 'director' ? (
              <>
                <button
                  onClick={() => handleQuickAction('查看并调整DP')}
                  className="whitespace-nowrap px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
                >
                  查看本周DP
                </button>
                <button
                  onClick={() => handleQuickAction('调整本周销售fcst')}
                  className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
                >
                  查看本周销售fcst
                </button>
                <button
                  onClick={() => handleQuickAction('调整MNT本周销售fcst')}
                  className="whitespace-nowrap px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full text-xs font-medium hover:bg-indigo-100 transition-colors shadow-sm"
                >
                  查看MNT本周销售fcst
                </button>
                <button
                  onClick={() => handleQuickAction('查看客户FCST及其变化')}
                  className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
                >
                  查看客户fcst及其变化
                </button>
                <button
                  onClick={() => handleQuickAction('查询今日外部信息')}
                  className="whitespace-nowrap px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors shadow-sm"
                >
                  查询今日外部信息
                </button>
              </>
            ) : (
              <>
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
                <button
                  onClick={() => handleQuickAction('执行异常检测')}
                  className="whitespace-nowrap px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-100 rounded-full text-xs font-medium hover:bg-orange-100 transition-colors shadow-sm"
                >
                  执行异常检测
                </button>
                <button
                  onClick={() => handleQuickAction('AI归因分析')}
                  className="whitespace-nowrap px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-full text-xs font-medium hover:bg-purple-100 transition-colors shadow-sm"
                >
                  AI归因分析
                </button>
                <button
                  onClick={() => handleQuickAction('查看复盘报告')}
                  className="whitespace-nowrap px-3 py-1.5 bg-green-50 text-green-600 border border-green-100 rounded-full text-xs font-medium hover:bg-green-100 transition-colors shadow-sm"
                >
                  查看复盘报告
                </button>
              </>
            )}
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
