import { Env, Project, UserCache, BotConfig } from '../types';

const KEY_PROJECTS = 'projects';
const KEY_USERS = 'users';
const KEY_CONFIG = 'config';

// Projects

export async function getProjects(env: Env): Promise<Project[]> {
  const data = await env.KV.get(KEY_PROJECTS, 'json');
  return data ? (data as Project[]) : [];
}

export async function saveProjects(env: Env, projects: Project[]): Promise<void> {
  await env.KV.put(KEY_PROJECTS, JSON.stringify(projects));
}

export async function addProject(
  env: Env,
  token: string,
  tableId: string,
  name: string,
  chatId: string | null = null
): Promise<void> {
  const projects = await getProjects(env);

  // Check if exists
  const existingIndex = projects.findIndex(p => p.token === token);
  if (existingIndex >= 0) {
    // Update, preserve chat_id if not provided
    projects[existingIndex] = {
      token,
      table: tableId,
      name,
      chat_id: chatId || projects[existingIndex].chat_id
    };
  } else {
    projects.push({ token, table: tableId, name, chat_id: chatId });
  }

  await saveProjects(env, projects);
}

export async function removeProject(env: Env, token: string): Promise<boolean> {
  const projects = await getProjects(env);
  const index = projects.findIndex(p => p.token === token);

  if (index < 0) return false;

  projects.splice(index, 1);
  await saveProjects(env, projects);
  return true;
}

export async function updateProjectChatId(env: Env, token: string, chatId: string): Promise<boolean> {
  const projects = await getProjects(env);
  const project = projects.find(p => p.token === token);

  if (!project) return false;

  project.chat_id = chatId;
  await saveProjects(env, projects);
  return true;
}

// Users

export async function getUsers(env: Env): Promise<UserCache> {
  const data = await env.KV.get(KEY_USERS, 'json');
  return data ? (data as UserCache) : {};
}

export async function saveUser(env: Env, openId: string, name: string): Promise<void> {
  const users = await getUsers(env);
  users[openId] = name;
  await env.KV.put(KEY_USERS, JSON.stringify(users));
}

export async function saveUsers(env: Env, newUsers: UserCache): Promise<void> {
  const users = await getUsers(env);
  Object.assign(users, newUsers);
  await env.KV.put(KEY_USERS, JSON.stringify(users));
}

export async function getUserDisplayName(env: Env, openId: string): Promise<string> {
  const users = await getUsers(env);
  return users[openId] || `用户(${openId.slice(-4)})`;
}

// Config

export async function getBotConfig(env: Env): Promise<BotConfig> {
  const data = await env.KV.get(KEY_CONFIG, 'json');
  return data ? (data as BotConfig) : {
    colTaskKey: 'Task',
    colPhaseKey: '阶段名称',
    colStart: '开始时间',
    colEnd: '结束时间',
    colOwner: '负责人',
    colStatus: 'Status/任务状态',
    doneList: [
      'Finished/已完成',
      '已完成',
      'Done',
      'Completed',
      'Canceled/取消',
      '取消',
      'Canceled',
      'Pause/暂停',
      '暂停'
    ],
    dailyTodoStatusList: [
      'On Process/进行中',
      '进行中',
      'Pause/暂停',
      '暂停',
      'Delay/延期',
      '延期'
    ]
  };
}

// Message deduplication

export async function isMessageProcessed(env: Env, messageId: string): Promise<boolean> {
  const key = `processed:${messageId}`;
  const existing = await env.KV.get(key);
  return existing !== null;
}

export async function markMessageProcessed(env: Env, messageId: string): Promise<void> {
  const key = `processed:${messageId}`;
  // TTL: 10 minutes (600 seconds)
  await env.KV.put(key, '1', { expirationTtl: 600 });
}