import { Env, FeishuMessageEvent, Project } from './types';
import { sendCardMessage, updateCardMessage } from './feishu/message';
import { fetchAllRecords, getAppName, buildBitableUrl } from './feishu/bitable';
import { createGroup, addGroupMembers } from './feishu/chat';
import { getProjects, addProject, removeProject, isMessageProcessed, markMessageProcessed, getUsers, saveUsers } from './storage/kv';
import { logHistory } from './storage/d1';
import { DEFAULT_CONFIG, buildDailyTodoTask, buildAdminRiskEntry, buildMyTaskLine, statusMatches } from './utils/task-rules';
import { runInspection } from './services/inspection';

// URL pattern to extract app_token and table_id
const URL_PATTERN = /base\/([a-zA-Z0-9]+).*table=([a-zA-Z0-9]+)/;

function extractIdsFromUrl(text: string): { token: string; tableId: string } | null {
  const match = text.match(URL_PATTERN);
  if (match) {
    return { token: match[1], tableId: match[2] };
  }
  return null;
}

function getAdminIds(env: Env): string[] {
  return env.ADMIN_OPEN_IDS.split(',').map(s => s.trim()).filter(Boolean);
}

export async function handleWebhook(request: Request, env: Env): Promise<Response> {
  // Parse event
  const event: FeishuMessageEvent = await request.json();

  // Validate event
  if (!event.header?.event_id || !event.event?.message) {
    return new Response('Invalid event', { status: 400 });
  }

  // Deduplication
  if (await isMessageProcessed(env, event.header.event_id)) {
    return new Response('OK');
  }
  await markMessageProcessed(env, event.header.event_id);

  // Only handle message receive events
  if (event.header.event_type !== 'im.message.receive_v1') {
    return new Response('OK');
  }

  const senderId = event.event.sender.sender_id.open_id;
  const messageContent = JSON.parse(event.event.message.content);
  const text = (messageContent.text || '').trim().toLowerCase();

  console.log(`Received message: "${text}" from ${senderId}`);

  try {
    // Handle commands
    await dispatchCommand(env, senderId, text, messageContent.text);
  } catch (error) {
    console.error('Command handling error:', error);
    await sendCardMessage(env, senderId, '❌ 错误', String(error), undefined, 'red');
  }

  return new Response('OK');
}

async function dispatchCommand(env: Env, senderId: string, textLower: string, originalText: string): Promise<void> {
  // Help
  if (['help', '帮助', '指令', '?', 'command'].includes(textLower)) {
    await sendHelp(env, senderId);
    return;
  }

  // List projects
  if (['list', '项目列表', 'ls'].includes(textLower)) {
    await sendProjectList(env, senderId);
    return;
  }

  // My tasks
  if (['my task', '我的任务', 'task', 'tasks', 'todo'].includes(textLower)) {
    await sendMyTasks(env, senderId);
    return;
  }

  // Summary
  if (['项目汇总', 'summary', 'report', 'brief'].includes(textLower)) {
    await sendSummary(env, senderId);
    return;
  }

  // Run inspection
  if (['立即巡检', 'run', 'inspect', 'check'].includes(textLower)) {
    await sendCardMessage(env, senderId, '🚀 收到指令', '后台正在巡检中...', undefined, 'blue');
    // Run in background (fire and forget in Workers)
    await runInspection(env);
    return;
  }

  // Create groups
  if (['建群', 'create groups', 'one click group'].includes(textLower)) {
    await handleCreateGroups(env, senderId);
    return;
  }

  // Create group for specific project
  if (textLower.startsWith('建群 ') || textLower.startsWith('group ')) {
    const parts = textLower.split(' ');
    const index = parseInt(parts[parts.length - 1]) - 1;
    if (!isNaN(index)) {
      await handleCreateGroups(env, senderId, index);
    }
    return;
  }

  // Add project (monitor)
  const monitorKeywords = ['监控', 'monitor', 'add', '添加'];
  if (monitorKeywords.some(k => textLower.includes(k)) && originalText.includes('feishu.cn')) {
    await handleAddProject(env, senderId, originalText);
    return;
  }

  // Remove project
  const removeKeywords = ['停止', 'stop', 'remove', 'del'];
  if (removeKeywords.some(k => textLower.startsWith(k))) {
    const arg = removeKeywords.reduce((s, k) => s.replace(k, ''), textLower).trim();
    await handleRemoveProject(env, senderId, arg);
    return;
  }

  // Get ID
  if (['id', '查id', 'whoami', '身份'].includes(textLower)) {
    await sendCardMessage(env, senderId, '🆔 用户身份', `您的 Open ID:\n**${senderId}**\n*(已复制到剪贴板)*`, undefined, 'blue');
    return;
  }

  // Shutdown (admin only)
  if (['下线', 'shutdown', 'exit', 'bye'].some(k => textLower.startsWith(k))) {
    const admins = getAdminIds(env);
    if (admins.includes(senderId)) {
      await sendCardMessage(env, senderId, '💤 准备下线', '机器人即将关闭...', undefined, 'grey');
      // In Workers, we can't really "shutdown", but we can notify admins
      for (const adminId of admins) {
        if (adminId !== senderId) {
          await sendCardMessage(env, adminId, '💤 机器人下线通知', `管理员 ${senderId} 已请求关闭机器人。`, undefined, 'grey');
        }
      }
    }
    return;
  }
}

async function sendHelp(env: Env, userId: string): Promise<void> {
  const helpText = `**📋 Pro Bot Commands / 指令列表：**

| 中文指令 | English | 功能/Function |
|---|---|---|
| \`建群\` | \`create groups\` | **一键建群** / Create Group |
| \`建群\`+序号 | \`group\`+N | 指定建群 / Create for Proj |
| \`我的任务\` | \`tasks\` | 查看待办 / My Todos |
| \`项目汇总\` | \`summary\` | 风险汇报 / Risk Report |
| \`列表\` | \`list\` | 监控列表 / Project List |
| \`停止 1\` | \`stop 1\` | 移除项目 / Remove Proj |
| \`查ID\` | \`id\` | 查看ID / View ID |
| \`立即巡检\` | \`run\` | 立即检查(全员广播) / Run Check |
| \`监控\`+链接 | \`add\`+URL | 添加项目 / Add Proj |
| \`下线\` | \`off\` | **通知并关机** / Shutdown |

💡 **Auto:** Daily 09:00 AM`;

  await sendCardMessage(env, userId, '🤖 机器人帮助 | Help', helpText, undefined, 'blue');
}

async function sendProjectList(env: Env, userId: string): Promise<void> {
  const projects = await getProjects(env);

  if (projects.length === 0) {
    await sendCardMessage(env, userId, '📁 项目列表', '暂无配置任何项目。', undefined, 'grey');
    return;
  }

  const lines = projects.map((p, i) => `${i + 1}. ${p.name}`);
  await sendCardMessage(env, userId, `📁 项目列表 (${projects.length})`, lines.join('\n'), undefined, 'blue');
}

async function handleAddProject(env: Env, userId: string, text: string): Promise<void> {
  const ids = extractIdsFromUrl(text);
  if (!ids) {
    await sendCardMessage(env, userId, '❌ 失败', '链接无效', undefined, 'red');
    return;
  }

  const name = await getAppName(env, ids.token);
  await addProject(env, ids.token, ids.tableId, name);
  await sendCardMessage(env, userId, '✅ 添加成功', `已开始监控：**${name}**`, undefined, 'green');
  await logHistory(env, 'add_project', `Added project: ${name} (${ids.token})`);
}

async function handleRemoveProject(env: Env, userId: string, arg: string): Promise<void> {
  const projects = await getProjects(env);
  let removed = false;

  if (/^\d+$/.test(arg)) {
    const index = parseInt(arg) - 1;
    if (index >= 0 && index < projects.length) {
      const project = projects[index];
      await removeProject(env, project.token);
      await sendCardMessage(env, userId, '🗑️ 已停止', `已移除：**${project.name}**`, undefined, 'green');
      removed = true;
    }
  }

  if (!removed && arg) {
    for (const p of projects) {
      if (p.token.includes(arg)) {
        await removeProject(env, p.token);
        await sendCardMessage(env, userId, '🗑️ 已停止', `已移除：**${p.name}**`, undefined, 'green');
        removed = true;
        break;
      }
    }
  }

  if (!removed) {
    await sendCardMessage(env, userId, '❌ 失败', '找不到该项目，请使用 \'List\' 查看序号。', undefined, 'red');
  }
}

async function sendMyTasks(env: Env, userId: string): Promise<void> {
  const loadingMsgId = await sendCardMessage(env, userId, '⏳ 查询中', '正在扫描所有项目寻找您的任务...', undefined, 'blue');

  const projects = await getProjects(env);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allTasks: string[] = [];
  let totalTasks = 0;

  for (const proj of projects) {
    try {
      const records = await fetchAllRecords(env, proj.token, proj.table);
      const projTasks: string[] = [];

      for (const record of records) {
        const fields = record.fields;
        const owners = fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string; name?: string }> | undefined;

        if (!owners) continue;

        const ownerIds = owners.map(o => o.id);
        if (!ownerIds.includes(userId)) continue;

        // Save user names
        const newUsers: Record<string, string> = {};
        for (const o of owners) {
          if (o.name) newUsers[o.id] = o.name;
        }
        await saveUsers(env, newUsers);

        const taskName = fields[DEFAULT_CONFIG.colTaskKey] || '';
        const phaseName = fields[DEFAULT_CONFIG.colPhaseKey] || '';
        const status = fields[DEFAULT_CONFIG.colStatus] || '';
        const endValue = fields[DEFAULT_CONFIG.colEnd];

        if (!taskName || statusMatches(status, DEFAULT_CONFIG.doneList)) continue;

        const taskLine = buildMyTaskLine(taskName, phaseName, status, endValue, today);
        if (taskLine) {
          projTasks.push(taskLine);
        }
      }

      if (projTasks.length > 0) {
        const url = buildBitableUrl(proj.token, proj.table);
        const header = `📁 **[${proj.name}](${url})**`;
        allTasks.push(`${header}\n${projTasks.join('\n')}`);
        totalTasks += projTasks.length;
      }
    } catch (error) {
      console.error(`Failed to process project ${proj.name}:`, error);
    }
  }

  let title: string;
  let content: string;
  let color: string;

  if (totalTasks === 0) {
    title = '📋 我的任务';
    content = '🎉 太棒了！你目前没有待办任务。';
    color = 'green';
  } else {
    title = `📋 我的任务 (${totalTasks}个)`;
    content = allTasks.join('\n\n---\n\n');
    color = content.includes('🔴') ? 'red' : 'blue';
  }

  if (loadingMsgId) {
    await updateCardMessage(env, loadingMsgId, title, content, undefined, color);
  } else {
    await sendCardMessage(env, userId, title, content, undefined, color);
  }
}

async function sendSummary(env: Env, userId: string): Promise<void> {
  // Import summary function from inspection
  const { generateSummary } = await import('./services/inspection');
  await generateSummary(env, userId);
}

async function handleCreateGroups(env: Env, userId: string, targetIndex?: number): Promise<void> {
  const loadingMsgId = await sendCardMessage(env, userId, '⏳ 处理中', '正在分析项目成员并创建群聊...', undefined, 'blue');

  const projects = await getProjects(env);
  const logs: string[] = [];

  let targets: Project[];
  if (targetIndex !== undefined) {
    if (targetIndex >= 0 && targetIndex < projects.length) {
      targets = [projects[targetIndex]];
    } else {
      await updateCardMessage(env, loadingMsgId!, '❌ 失败', `无效的序号: ${targetIndex! + 1}`, undefined, 'red');
      return;
    }
  } else {
    targets = projects.filter(p => !p.chat_id);
    if (targets.length === 0) {
      await updateCardMessage(env, loadingMsgId!, '⚠️ 提示', '所有项目都已有群聊，无需创建。', undefined, 'green');
      return;
    }
  }

  let successCount = 0;

  for (const proj of targets) {
    try {
      const records = await fetchAllRecords(env, proj.token, proj.table);
      const members = new Set<string>();

      for (const record of records) {
        const owners = record.fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string }> | undefined;
        if (owners) {
          for (const o of owners) members.add(o.id);
        }
      }

      if (members.size === 0) {
        logs.push(`- 【${proj.name}】跳过: 无成员`);
        continue;
      }

      const groupName = `${proj.name} - 沟通群`;
      const { chatId, error } = await createGroup(env, groupName, userId, Array.from(members));

      if (chatId) {
        const { updateProjectChatId } = await import('./storage/kv');
        await updateProjectChatId(env, proj.token, chatId);
        logs.push(`- ✅ **${proj.name}**: 建群成功 (已拉 ${members.size} 人)`);
        successCount++;
      } else {
        logs.push(`- ❌ **${proj.name}**: 建群失败 (${error})`);
      }
    } catch (error) {
      logs.push(`- ❌ **${proj.name}**: 处理异常 (${error})`);
    }
  }

  const title = `🏗️ 建群结果 (${successCount}/${targets.length})`;
  const content = logs.length > 0 ? logs.join('\n') : '没有可处理的项目。';
  const color = successCount > 0 ? 'green' : 'red';

  await updateCardMessage(env, loadingMsgId!, title, content, undefined, color);
}