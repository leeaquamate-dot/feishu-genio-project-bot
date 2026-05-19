import { Env, CardMessage } from '../types';
import { feishuPost } from './auth';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-api';

export interface SendMessageResult {
  message_id: string;
}

export function buildCard(
  title: string,
  content: string,
  url?: string,
  color: string = 'blue'
): CardMessage {
  const config: any = { wide_screen_mode: true };
  if (url) {
    config.card_link = { url, pc_url: url, android_url: url, ios_url: url };
  }

  const elements: any[] = [
    { tag: 'div', text: { tag: 'lark_md', content } }
  ];

  // Add AI footer for reports
  if (title.includes('汇报') || title.includes('AI')) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: 'Powered by DeepSeek AI 🧠' }]
    });
  }

  // Add button if URL provided
  if (url) {
    const btnText = title.includes('汇报') ? '👉 查看项目详情' : '👉 进入表格处理';
    elements.splice(1, 0, {
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: btnText },
          url,
          type: 'primary'
        }
      ]
    });
  }

  return {
    config,
    header: {
      title: { tag: 'plain_text', content: title },
      template: color
    },
    elements
  };
}

export async function sendCardMessage(
  env: Env,
  userId: string,
  title: string,
  content: string,
  url?: string,
  color: string = 'blue'
): Promise<string | null> {
  const card = buildCard(title, content, url, color);

  try {
    const result = await feishuPost<SendMessageResult>(env, '/im/v1/messages', {
      receive_id_type: 'open_id',
      receive_id: userId,
      msg_type: 'interactive',
      content: JSON.stringify(card)
    });

    return result.message_id;
  } catch (error) {
    console.error(`Failed to send message to ${userId}:`, error);
    return null;
  }
}

export async function updateCardMessage(
  env: Env,
  messageId: string,
  title: string,
  content: string,
  url?: string,
  color: string = 'blue'
): Promise<boolean> {
  const card = buildCard(title, content, url, color);

  try {
    const token = await getTenantAccessToken(env);
    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: JSON.stringify(card) }),
    });

    const data = await response.json();
    return data.code === 0;
  } catch (error) {
    console.error(`Failed to update message ${messageId}:`, error);
    return false;
  }
}

// Import getTenantAccessToken
import { getTenantAccessToken } from './auth';