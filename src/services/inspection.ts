import { Env, BitableRecord } from '../types';
import { sendCardMessage } from '../feishu/message';
import { fetchAllRecords, buildBitableUrl } from '../feishu/bitable';
import { getProjects, saveUsers, getUsers } from '../storage/kv';
import { saveBackup, logHistory } from '../storage/d1';
import { callDeepSeek } from './ai';
import { DEFAULT_CONFIG, buildDailyTodoTask, buildAdminRiskEntry, statusMatches } from '../utils/task-rules';

function getAdminIds(env: Env): string[] {
  return env.ADMIN_OPEN_IDS.split(',').map(s => s.trim()).filter(Boolean);
}

export async function runInspection(env: Env): Promise<void> {
  const now = new Date();
  const weekday = now.getDay();

  // Skip weekends
  if (weekday === 0 || weekday === 6) {
    console.log('☕️ 今天是周末，机器人休息。');
    return;
  }

  console.log(`⏰ [${now.toISOString()}] 开始执行巡检...`);
  await logHistory(env, 'inspection', '⏰ **自动巡检开始**');

  const projects = await getProjects(env);
  if (projects.length === 0) {
    console.log('⚠️ 未配置任何项目。');
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    projects.map(proj =>
      processProjectForInspection(env, proj, today).catch(error => {
        console.error(`❌ 处理项目 ${proj.name} 失败:`, error);
        return null;
      })
    )
  );

  // Merge results
  const globalUserTasks: Map<string, string[]> = new Map();
  const allRisksForAdmin: string[] = [];
  const adminRiskDetails: string[] = [];
  const allNewUsers: Record<string, string> = {};

  for (const result of results) {
    if (!result) continue;
    Object.assign(allNewUsers, result.newUsers);

    for (const [uid, tasks] of result.userTasks) {
      if (!globalUserTasks.has(uid)) globalUserTasks.set(uid, []);
      globalUserTasks.get(uid)!.push(tasks);
    }

    allRisksForAdmin.push(...result.adminRiskSummaries);
    if (result.adminRiskDetail) {
      adminRiskDetails.push(result.adminRiskDetail);
    }
  }

  if (Object.keys(allNewUsers).length > 0) {
    await saveUsers(env, allNewUsers);
  }

  // Send notifications in parallel by recipient type
  const sendTasks: Promise<any>[] = [];

  // A. Send to engineers
  for (const [uid, sections] of globalUserTasks) {
    const totalTasks = sections.reduce((sum, s) => sum + (s.match(/\n>/g) || []).length, 0);
    const content = sections.join('\n\n---\n\n');
    const color = content.includes('🔴') || content.includes('🟠') ? 'red' : 'blue';
    sendTasks.push(
      sendCardMessage(env, uid, `📋 每日待办 (${totalTasks}个)`, content, undefined, color)
        .then(() => console.log(`   ✅ 已通知负责人: ${uid}`))
    );
  }

  // B. Send to admins
  const adminIds = getAdminIds(env);

  if (adminIds.length === 0) {
    console.log('⚠️ 异常：名单里的 ID 都没识别出来。');
  } else if (allRisksForAdmin.length > 0) {
    console.log('🤖 发现风险，正在请求 DeepSeek 生成简报...');

    const detailContent = adminRiskDetails.join('\n\n---\n\n');
    const summaryText = allRisksForAdmin.join('\n');
    const aiReport = await callDeepSeek(env, summaryText, projects.length);

    for (const adminId of adminIds) {
      sendTasks.push(
        sendCardMessage(env, adminId, '📋 每日风险详情', detailContent, undefined, 'red')
      );
      sendTasks.push(
        sendCardMessage(env, adminId, '📊 项目风险晨报 (AI)', aiReport, undefined, 'purple')
          .then(() => console.log(`   ✅ 已汇报给管理员(风险): ${adminId}`))
      );
    }
  } else {
    console.log('🎉 一切正常，正在发送平安报...');
    const normalReport = `✅ **今日巡检完成**

📊 扫描项目：${projects.length} 个
🛡️ 风险状况：无逾期 / 无临期
✨ 状态：一切正常，请管理员放心！`;

    for (const adminId of adminIds) {
      sendTasks.push(
        sendCardMessage(env, adminId, '🟢 每日巡检简报', normalReport, undefined, 'green')
          .then(() => console.log(`   ✅ 已汇报给管理员(正常): ${adminId}`))
      );
    }
  }

  await Promise.all(sendTasks);

  console.log('✅ 巡检结束。');
  await logHistory(env, 'inspection', '✅ **自动巡检结束**');
}

async function processProjectForInspection(
  env: Env,
  proj: { token: string; table: string; name: string },
  today: Date
): Promise<{
  userTasks: Map<string, string>;
  adminRiskSummaries: string[];
  adminRiskDetail: string | null;
  newUsers: Record<string, string>;
} | null> {
  console.log(`📂 扫描项目: ${proj.name}...`);

  const records = await fetchAllRecords(env, proj.token, proj.table);
  if (records.length === 0) {
    console.log(`⚠️ 项目 ${proj.name} 为空或读取失败。`);
    return null;
  }

  await saveBackup(env, proj.token, proj.name, records);

  const projUserMap: Map<string, string[]> = new Map();
  const projRisks: string[] = [];
  const adminRiskSummaries: string[] = [];
  const newUsers: Record<string, string> = {};

  for (const record of records) {
    const fields = record.fields;
    const taskVal = fields[DEFAULT_CONFIG.colTaskKey] || '';
    const phaseCn = fields[DEFAULT_CONFIG.colPhaseKey] || '';
    const owners = fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string; name?: string }> | undefined;
    const status = fields[DEFAULT_CONFIG.colStatus] || '';
    const endValue = fields[DEFAULT_CONFIG.colEnd];

    const dailyTask = buildDailyTodoTask(
      taskVal, phaseCn, status, endValue, today, DEFAULT_CONFIG.dailyTodoStatusList
    );

    if (dailyTask && owners) {
      for (const p of owners) {
        if (p.name) newUsers[p.id] = p.name;
        const uid = p.id;
        if (!projUserMap.has(uid)) projUserMap.set(uid, []);
        projUserMap.get(uid)!.push(dailyTask.line);
      }
    }

    const riskEntry = buildAdminRiskEntry(
      proj.name, taskVal, phaseCn, owners || null, status, endValue, today, DEFAULT_CONFIG.doneList
    );

    if (riskEntry) {
      adminRiskSummaries.push(riskEntry.summaryLine);
      projRisks.push(riskEntry.cardLine);
    }
  }

  const projUrl = buildBitableUrl(proj.token, proj.table);
  const projHeader = `📁 **[${proj.name}](${projUrl})**`;

  const userTasks = new Map<string, string>();
  for (const [uid, tasks] of projUserMap) {
    userTasks.set(uid, `${projHeader}\n${tasks.join('\n')}`);
  }

  return {
    userTasks,
    adminRiskSummaries,
    adminRiskDetail: projRisks.length > 0 ? `${projHeader}\n${projRisks.join('\n')}` : null,
    newUsers
  };
}

export async function generateSummary(env: Env, userId: string): Promise<void> {
  const loadingMsgId = await sendCardMessage(env, userId, '⏳ 生成中', '正在扫描所有项目并请求 AI 分析，请稍候...', undefined, 'blue');

  const projects = await getProjects(env);
  if (projects.length === 0) {
    const content = '暂无监控项目';
    if (loadingMsgId) {
      await sendCardMessage(env, userId, '📊 项目汇总', content, undefined, 'grey');
    } else {
      await sendCardMessage(env, userId, '📊 项目汇总', content, undefined, 'grey');
    }
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = await Promise.all(
    projects.map(proj =>
      processProjectForSummary(env, proj, today).catch(error => {
        console.error(`❌ 处理项目 ${proj.name} 失败:`, error);
        return null;
      })
    )
  );

  const allRisks: string[] = [];
  const detailedSections: string[] = [];
  const allNewUsers: Record<string, string> = {};

  for (const result of results) {
    if (!result) continue;
    Object.assign(allNewUsers, result.newUsers);
    allRisks.push(...result.summaryLines);
    if (result.detailSection) {
      detailedSections.push(result.detailSection);
    }
  }

  if (Object.keys(allNewUsers).length > 0) {
    await saveUsers(env, allNewUsers);
  }

  let title: string;
  let content: string;
  let color: string;

  if (allRisks.length > 0) {
    console.log(`🤖 正在为 ${userId} 生成AI简报...`);
    const aiReport = await callDeepSeek(env, allRisks.join('\n'), projects.length);

    title = '📊 项目风险汇总 (AI)';
    content = `**🤖 AI 风险简报：**\n${aiReport}\n\n---\n\n**🔍 风险详情：**\n${detailedSections.join('\n\n---\n\n')}`;
    color = 'purple';
  } else {
    title = '📊 项目汇总';
    content = '🎉 所有项目正常，无风险项！';
    color = 'green';
  }

  if (loadingMsgId) {
    const { updateCardMessage } = await import('../feishu/message');
    await updateCardMessage(env, loadingMsgId, title, content, undefined, color);
  } else {
    await sendCardMessage(env, userId, title, content, undefined, color);
  }
}

async function processProjectForSummary(
  env: Env,
  proj: { token: string; table: string; name: string },
  today: Date
): Promise<{
  summaryLines: string[];
  detailSection: string | null;
  newUsers: Record<string, string>;
} | null> {
  const records = await fetchAllRecords(env, proj.token, proj.table);
  if (records.length === 0) return null;

  const projRisksMd: string[] = [];
  const summaryLines: string[] = [];
  const newUsers: Record<string, string> = {};

  for (const record of records) {
    const fields = record.fields;
    const owners = fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string; name?: string }> | undefined;

    if (owners) {
      for (const p of owners) {
        if (p.name) newUsers[p.id] = p.name;
      }
    }

    const riskEntry = buildAdminRiskEntry(
      proj.name,
      fields[DEFAULT_CONFIG.colTaskKey] || '',
      fields[DEFAULT_CONFIG.colPhaseKey] || '',
      owners || null,
      fields[DEFAULT_CONFIG.colStatus] || '',
      fields[DEFAULT_CONFIG.colEnd],
      today,
      DEFAULT_CONFIG.doneList
    );

    if (riskEntry) {
      summaryLines.push(riskEntry.summaryLine);
      projRisksMd.push(riskEntry.cardLine);
    }
  }

  let detailSection: string | null = null;
  if (projRisksMd.length > 0) {
    const url = buildBitableUrl(proj.token, proj.table);
    detailSection = `📁 **[${proj.name}](${url})**\n${projRisksMd.join('\n')}`;
  }

  return { summaryLines, detailSection, newUsers };
}