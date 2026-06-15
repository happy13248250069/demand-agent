import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EventItem {
  name: string;
  impact: number;
  relevance: number;
  similarity: number;
  decay: number;
  contribution: number;
  meaning: string;
}

const MOCK_EVENTS: EventItem[] = [
  {
    name: '下游品牌618备货需求增加',
    impact: 0.7,
    relevance: 0.8,
    similarity: 0.6,
    decay: 0.9,
    contribution: 0.302,
    meaning: '涨价预期可能导致客户提前囤货，存在真实需求放大的可能性。'
  },
  {
    name: '面板价格短期波动回调',
    impact: -0.3,
    relevance: 0.6,
    similarity: 0.4,
    decay: 0.67,
    contribution: -0.048,
    meaning: '短期价格回调可能抑制部分投机性采购，对稳定需求影响有限。'
  }
];

const MOCK_ML_FEATURES = [
  { feature: '客户FCST', contribution: 1200 },
  { feature: '异常标签（销售FCST异常）', contribution: -800 },
  { feature: '历史发货基线', contribution: 400 },
  { feature: '产品生命周期（成长期）', contribution: 150 },
  { feature: '季节性因子', contribution: 50 },
];

export const AIPredictionTooltip = ({ simple = false }: { simple?: boolean }) => {
  const [mlExpanded, setMlExpanded] = useState(false);
  const [eventExpanded, setEventExpanded] = useState(false);

  const mlValue = 10000;
  const mape = 8.2;
  const finalValue = 12540;
  const supplyLimit = 15000;
  const totalEventCorrection = MOCK_EVENTS.reduce((sum, e) => sum + e.contribution, 0);
  const isSupplyCapped = finalValue >= supplyLimit;

  return (
    <div className="flex flex-col gap-4">
      {/* 摘要区 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[12px] text-gray-600">AI最终预测值</span>
          <span className="text-[22px] font-black text-blue-700">{finalValue.toLocaleString()} pcs</span>
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed mb-3">
          ML模型基于客户最新FCST和历史趋势预测为{mlValue.toLocaleString()} pcs，叠加外部事件修正{totalEventCorrection > 0 ? '+' : ''}{(totalEventCorrection * 100).toFixed(1)}%后得出最终值{isSupplyCapped ? '，已触及供应上限' : ''}。
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg p-2.5 text-center border border-blue-50">
            <div className="text-[10px] text-gray-500 mb-0.5">ML预测值</div>
            <div className="text-[14px] font-bold text-gray-800">{mlValue.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-lg p-2.5 text-center border border-blue-50">
            <div className="text-[10px] text-gray-500 mb-0.5">外部事件修正</div>
            <div className={`text-[14px] font-bold ${totalEventCorrection >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {totalEventCorrection >= 0 ? '+' : ''}{(totalEventCorrection * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white rounded-lg p-2.5 text-center border border-blue-50">
            <div className="text-[10px] text-gray-500 mb-0.5">供应上限</div>
            <div className="text-[14px] font-bold text-gray-800">{supplyLimit.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 供应上限警告 */}
      {isSupplyCapped && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
          <span className="text-orange-500">&#9888;</span>
          <span className="text-[11px] text-orange-700 font-medium">受供应能力限制，建议值已封顶至 {supplyLimit.toLocaleString()} pcs。</span>
        </div>
      )}

      {/* ML预测详情 - 手风琴 */}
      {!simple && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setMlExpanded(!mlExpanded)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {mlExpanded ? <ChevronDown size={14} className="text-blue-500" /> : <ChevronRight size={14} className="text-blue-500" />}
              <span className="text-[12px] font-bold text-gray-800">ML预测详情</span>
            </div>
            <span className="text-[10px] text-gray-500">预测值 {mlValue.toLocaleString()} | MAPE {mape}%</span>
          </button>

          <AnimatePresence>
            {mlExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-3 border-t border-gray-50">
                  <table className="w-full text-[11px] mt-2">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-1.5 text-gray-500 font-medium">特征</th>
                        <th className="text-right py-1.5 text-gray-500 font-medium">对预测的贡献</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_ML_FEATURES.map((f, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1.5 text-gray-700">{f.feature}</td>
                          <td className={`py-1.5 text-right font-medium ${f.contribution >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {f.contribution >= 0 ? '+' : ''}{f.contribution.toLocaleString()} pcs
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 外部事件修正详情 - 手风琴 */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setEventExpanded(!eventExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {eventExpanded ? <ChevronDown size={14} className="text-blue-500" /> : <ChevronRight size={14} className="text-blue-500" />}
            <span className="text-[12px] font-bold text-gray-800">外部事件修正</span>
          </div>
          <span className="text-[10px] text-gray-500">
            累计 {totalEventCorrection >= 0 ? '+' : ''}{(totalEventCorrection * 100).toFixed(1)}%（{MOCK_EVENTS.length}个事件）
          </span>
        </button>

        <AnimatePresence>
          {eventExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 border-t border-gray-50 space-y-2 mt-2">
                {MOCK_EVENTS.map((event, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-gray-800">{event.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          event.contribution >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                        }`}>
                          {event.contribution >= 0 ? '正向' : '负向'}
                        </span>
                      </div>
                      <span className={`text-[12px] font-bold ${event.contribution >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {event.contribution >= 0 ? '+' : ''}{(event.contribution * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">{event.meaning}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">
                        影响力 {event.impact > 0 ? '+' : ''}{event.impact} | 相关性 {event.relevance} | 相似度 {event.similarity} | 衰减 {event.decay}
                      </span>
                      <a href="#" className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-0.5" onClick={(e) => e.preventDefault()}>
                        <ExternalLink size={10} />查看原文
                      </a>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-1 border-t border-gray-50">
                  <span className="text-[11px] font-bold text-gray-700">
                    累计修正：<span className={totalEventCorrection >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {totalEventCorrection >= 0 ? '+' : ''}{(totalEventCorrection * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
