// Environment bindings
export interface Env {
  // Secrets
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  DEEPSEEK_API_KEY: string;

  // Variables
  ENVIRONMENT: string;
  ADMIN_OPEN_IDS: string;

  // KV namespace
  KV: KVNamespace;

  // D1 database
  DB: D1Database;
}

// Project configuration
export interface Project {
  token: string;
  table: string;
  name: string;
  chat_id: string | null;
}

// User cache
export interface UserCache {
  [openId: string]: string; // openId -> displayName
}

// Bot configuration
export interface BotConfig {
  colTaskKey: string;
  colPhaseKey: string;
  colStart: string;
  colEnd: string;
  colOwner: string;
  colStatus: string;
  doneList: string[];
  dailyTodoStatusList: string[];
}

// Feishu API types
export interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

export interface FeishuMessageEvent {
  schema: string;
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event: {
    sender: {
      sender_id: {
        open_id: string;
        user_id: string;
      };
      type: string;
      tenant_key: string;
    };
    message: {
      message_id: string;
      root_id: string;
      parent_id: string;
      create_time: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      content: string;
      mentions: Array<{
        key: string;
        id: {
          open_id: string;
          user_id: string;
        };
        name: string;
        tenant_key: string;
      }>;
    };
  };
}

export interface BitableRecord {
  record_id: string;
  fields: Record<string, any>;
}

export interface BitableField {
  field_id: string;
  field_name: string;
  type: number;
  property?: any;
}

// Task analysis types
export interface TaskInfo {
  taskName: string;
  phaseName: string;
  status: string;
  owners: Array<{ id: string; name?: string }>;
  endDate: Date | null;
  dueContext?: {
    endDate: Date;
    days: number;
    text: string;
  };
}

export interface RiskEntry {
  projectName: string;
  displayName: string;
  days: number;
  riskDesc: string;
  ownerNames: string;
  summaryLine: string;
  cardLine: string;
}

// Card message types
export interface CardMessage {
  config: {
    wide_screen_mode: boolean;
    card_link?: {
      url: string;
      pc_url: string;
      android_url: string;
      ios_url: string;
    };
  };
  header: {
    title: { tag: string; content: string };
    template: string;
  };
  elements: Array<{
    tag: string;
    text?: { tag: string; content: string };
    actions?: Array<{
      tag: string;
      text: { tag: string; content: string };
      url: string;
      type: string;
    }>;
    elements?: Array<{ tag: string; content: string }>;
  }>;
}