import { Env, BitableRecord } from '../types';
import { feishuGet } from './auth';

export interface BitableRecordListResponse {
  items: BitableRecord[];
  has_more: boolean;
  page_token?: string;
}

export interface BitableAppResponse {
  app: {
    name: string;
    app_token: string;
  };
}

export async function fetchAllRecords(
  env: Env,
  appToken: string,
  tableId: string
): Promise<BitableRecord[]> {
  const allRecords: BitableRecord[] = [];
  let pageToken: string | undefined;

  do {
    let path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=100`;
    if (pageToken) {
      path += `&page_token=${pageToken}`;
    }

    const data = await feishuGet<BitableRecordListResponse>(env, path);

    if (data.items) {
      allRecords.push(...data.items);
    }

    pageToken = data.has_more ? data.page_token : undefined;
  } while (pageToken);

  return allRecords;
}

export async function getAppName(env: Env, appToken: string): Promise<string> {
  try {
    const data = await feishuGet<BitableAppResponse>(env, `/bitable/v1/apps/${appToken}`);
    return data.app.name;
  } catch {
    return `项目-${appToken.slice(-4)}`;
  }
}

export function buildBitableUrl(appToken: string, tableId: string): string {
  return `https://feishu.cn/base/${appToken}?table=${tableId}`;
}