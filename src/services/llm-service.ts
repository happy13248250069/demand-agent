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
  aiSummary: string,
  externalInfos?: { title: string; content: string; source: string }[]
): Promise<string> {
  const changePercent = previousValue ? ((currentValue - previousValue) / previousValue * 100).toFixed(1) : '0';

  const externalInfoText = externalInfos && externalInfos.length > 0
    ? externalInfos.map((info, i) => `${i + 1}. 【${info.title}】(来源: ${info.source})\n   ${info.content}`).join('\n')
    : '暂无关联外部信息';

  const prompt = `你是TCL华星的需求感知AI分析师，擅长分析液晶面板行业的需求异常。

请根据以下异常数据和关联的外部信息，给出异常推理分析。

## 异常数据
- 客户：${customer}
- 产品：${size}
- 时间段：${period}
- 变化：${previousValue} → ${currentValue}（${Number(changePercent) > 0 ? '+' : ''}${changePercent}%）
- 触发规则：
${violatedRules.join('\n')}
- 异常分析摘要：${aiSummary.substring(0, 200)}

## 关联外部信息
${externalInfoText}

## 输出格式
用bullet point（每行以"• "开头）输出3-5条，每条一句话，必须结合上方的外部信息对异常数据进行解读，覆盖：
• 异常原因（必须引用具体的外部信息标题或事件，解释传导机制）
• 外部信息关联（指出哪条外部信息与本次异常最相关，如何影响客户行为）
• 合理性判断（基于外部信息，判断异常是否具有合理解释）
• 后续建议（观察指标或跟进动作）

要求：每一条都必须关联外部信息进行分析，不能脱离外部信息空谈。语言简洁专业，适合供应链管理人员快速扫读。直接输出bullet points，不要加标题或序号。`;

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
