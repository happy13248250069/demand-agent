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
用bullet point（每行以"• "开头）输出恰好3条，综合所有外部信息一起分析（不要逐条拆开）：
• 归因：综合所有外部信息，用1-2句话解释本次异常的核心原因和传导逻辑
• 判断：给出合理/存疑/需确认的结论，附简短理由
• 建议：给出1个具体可执行的跟进动作

每条控制在30字左右，简洁有力，不啰嗦。

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
