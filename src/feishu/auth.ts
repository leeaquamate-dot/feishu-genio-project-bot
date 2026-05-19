import { Env, FeishuTokenResponse } from '../types';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-api';

// Token cache with TTL
let cachedToken: string | null = null;
let tokenExpireTime: number = 0;

export async function getTenantAccessToken(env: Env): Promise<string> {
  // Check cache
  const now = Date.now();
  if (cachedToken && now < tokenExpireTime - 60000) {
    return cachedToken;
  }

  // Request new token
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });

  const data: FeishuTokenResponse = await response.json();

  if (data.code !== 0) {
    throw new Error(`Failed to get tenant access token: ${data.msg}`);
  }

  cachedToken = data.tenant_access_token;
  tokenExpireTime = now + data.expire * 1000;

  return cachedToken!;
}

export async function feishuFetch(
  env: Env,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getTenantAccessToken(env);

  return fetch(`${FEISHU_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function feishuGet<T>(env: Env, path: string): Promise<T> {
  const response = await feishuFetch(env, path);
  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} - ${data.msg}`);
  }

  return data.data;
}

export async function feishuPost<T>(env: Env, path: string, body: any): Promise<T> {
  const response = await feishuFetch(env, path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Feishu API error: ${data.code} - ${data.msg}`);
  }

  return data.data;
}