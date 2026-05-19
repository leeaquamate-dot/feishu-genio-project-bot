import { Env } from '../types';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export async function callDeepSeek(env: Env, contextText: string, projectCount: number): Promise<string> {
  if (!env.DEEPSEEK_API_KEY) {
    return 'AI 未配置，请查看表格。';
  }

  const prompt = `你是一个高级项目助理。请根据以下【多项目晨报数据】，为管理者生成一份风险简报。

扫描概况：共扫描 ${projectCount} 个项目

风险数据：
${contextText}

要求：
1. 宏观视角：开头说明共扫描了多少个项目，发现多少个逾期风险。
2. 重点聚焦：只列出严重的逾期项。
3. 语气：客观、精炼。
4. 200字以内，Markdown格式。`;

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      console.error('DeepSeek API error:', response.status);
      return 'AI 生成失败，请查看表格。';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'AI 生成失败，请查看表格。';
  } catch (error) {
    console.error('DeepSeek API error:', error);
    return 'AI 生成失败，请查看表格。';
  }
}