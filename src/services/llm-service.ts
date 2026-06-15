declare const process: { env: { DEEPSEEK_API_KEY?: string } };

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export async function generateAnomalyReasoning(
  customer: string,
  size: string,
  period: string,
  currentValue: number,
  previousValue: number,
  violatedRules: string[],
  aiSummary: string
): Promise<string> {
  const changePercent = previousValue ? ((currentValue - previousValue) / previousValue * 100).toFixed(1) : '0';

  const prompt = `你是TCL华星的需求感知AI分析师，擅长分析液晶面板行业的需求异常。

请根据以下异常数据，给出异常推理分析（3-5句话）。

## 异常数据
- 客户：${customer}
- 产品：${size}
- 时间段：${period}
- 变化：${previousValue} → ${currentValue}（${Number(changePercent) > 0 ? '+' : ''}${changePercent}%）
- 触发规则：
${violatedRules.join('\n')}
- 异常分析摘要：${aiSummary.substring(0, 200)}

## 输出格式
用bullet point（每行以"• "开头）输出3-5条，每条一句话，分别覆盖：
• 异常原因（结合行业背景的传导机制）
• 合理性判断（是否有合理外部解释）
• 后续建议（观察指标或跟进动作）

要求：语言简洁专业，适合供应链管理人员快速扫读。直接输出bullet points，不要加标题或序号。`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '异常推理生成失败，请重试。';
  } catch (error) {
    console.error('LLM call failed:', error);
    return '异常推理服务暂时不可用，请稍后重试。';
  }
}
