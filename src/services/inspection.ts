import { Env, BitableRecord } from './types';
import { sendCardMessage } from './feishu/message';
import { fetchAllRecords, buildBitableUrl } from './feishu/bitable';
import { getProjects, saveUsers, getUsers } from './storage/kv';
import { saveBackup, logHistory } from './storage/d1';
import { callDeepSeek } from './services/ai';
import { DEFAULT_CONFIG, buildDailyTodoTask, buildAdminRiskEntry, statusMatches } from './utils/task-rules';

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

  // Global data collection
  const allRisksForAdmin: string[] = [];
  const globalUserTasks: Map<string, string[]> = new Map();
  const adminRiskDetails: string[] = [];

  for (const proj of projects) {
    console.log(`📂 扫描项目: ${proj.name}...`);

    try {
      const records = await fetchAllRecords(env, proj.token, proj.table);

      if (records.length === 0) {
        console.log(`⚠️ 项目 ${proj.name} 为空或读取失败。`);
        continue;
      }

      // Backup
      await saveBackup(env, proj.token, proj.name, records);

      // Process records
      const projUserMap: Map<string, string[]> = new Map();
      const allProjMembers = new Set<string>();
      const projRisks: string[] = [];

      for (const record of records) {
        const fields = record.fields;
        const taskVal = fields[DEFAULT_CONFIG.colTaskKey] || '';
        const phaseCn = fields[DEFAULT_CONFIG.colPhaseKey] || '';
        const owners = fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string; name?: string }> | undefined;
        const status = fields[DEFAULT_CONFIG.colStatus] || '';
        const endValue = fields[DEFAULT_CONFIG.colEnd];

        // A. Engineer daily todos
        const dailyTask = buildDailyTodoTask(
          taskVal, phaseCn, status, endValue, today, DEFAULT_CONFIG.dailyTodoStatusList
        );

        if (dailyTask && owners) {
          // Save user names
          const newUsers: Record<string, string> = {};
          for (const p of owners) {
            if (p.name) newUsers[p.id] = p.name;
            allProjMembers.add(p.id);
          }
          await saveUsers(env, newUsers);

          for (const p of owners) {
            const uid = p.id;
            if (!projUserMap.has(uid)) projUserMap.set(uid, []);
            projUserMap.get(uid)!.push(dailyTask.line);
          }
        }

        // B. Admin risk collection
        const riskEntry = buildAdminRiskEntry(
          proj.name, taskVal, phaseCn, owners || null, status, endValue, today, DEFAULT_CONFIG.doneList
        );

        if (riskEntry) {
          allRisksForAdmin.push(riskEntry.summaryLine);
          projRisks.push(riskEntry.cardLine);
        }
      }

      // Aggregate to global
      const projUrl = buildBitableUrl(proj.token, proj.table);
      const projHeader = `📁 **[${proj.name}](${projUrl})**`;

      for (const [uid, tasks] of projUserMap) {
        if (!globalUserTasks.has(uid)) globalUserTasks.set(uid, []);
        const section = `${projHeader}\n${tasks.join('\n')}`;
        globalUserTasks.get(uid)!.push(section);
      }

      if (projRisks.length > 0) {
        const section = `${projHeader}\n${projRisks.join('\n')}`;
        adminRiskDetails.push(section);
      }
    } catch (error) {
      console.error(`❌ 处理项目 ${proj.name} 失败:`, error);
    }
  }

  // Send notifications
  // A. Send to engineers
  for (const [uid, sections] of globalUserTasks) {
    const totalTasks = sections.reduce((sum, s) => sum + (s.match(/\n>/g) || []).length, 0);
    const content = sections.join('\n\n---\n\n');
    const color = content.includes('🔴') || content.includes('🟠') ? 'red' : 'blue';
    await sendCardMessage(env, uid, `📋 每日待办 (${totalTasks}个)`, content, undefined, color);
    console.log(`   ✅ 已通知负责人: ${uid}`);
  }

  // B. Send to admins
  const adminIds = getAdminIds(env);

  if (adminIds.length === 0) {
    console.log('⚠️ 异常：名单里的 ID 都没识别出来。');
  } else if (allRisksForAdmin.length > 0) {
    console.log('🤖 发现风险，正在请求 DeepSeek 生成简报...');

    // 1. Risk details card
    const detailContent = adminRiskDetails.join('\n\n---\n\n');
    for (const adminId of adminIds) {
      await sendCardMessage(env, adminId, '📋 每日风险详情', detailContent, undefined, 'red');
    }

    // 2. AI summary card
    const summaryText = allRisksForAdmin.join('\n');
    const aiReport = await callDeepSeek(env, summaryText, projects.length);

    for (const adminId of adminIds) {
      await sendCardMessage(env, adminId, '📊 项目风险晨报 (AI)', aiReport, undefined, 'purple');
      console.log(`   ✅ 已汇报给管理员(风险): ${adminId}`);
    }
  } else {
    console.log('🎉 一切正常，正在发送平安报...');
    const normalReport = `✅ **今日巡检完成**

📊 扫描项目：${projects.length} 个
🛡️ 风险状况：无逾期 / 无临期
✨ 状态：一切正常，请管理员放心！`;

    for (const adminId of adminIds) {
      await sendCardMessage(env, adminId, '🟢 每日巡检简报', normalReport, undefined, 'green');
      console.log(`   ✅ 已汇报给管理员(正常): ${adminId}`);
    }
  }

  console.log('✅ 巡检结束。');
  await logHistory(env, 'inspection', '✅ **自动巡检结束**');
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

  const allRisks: string[] = [];
  const detailedSections: string[] = [];

  for (const proj of projects) {
    try {
      const records = await fetchAllRecords(env, proj.token, proj.table);
      if (records.length === 0) continue;

      const projRisksMd: string[] = [];

      for (const record of records) {
        const fields = record.fields;
        const taskVal = fields[DEFAULT_CONFIG.colTaskKey] || '';
        const phaseCn = fields[DEFAULT_CONFIG.colPhaseKey] || '';
        const owners = fields[DEFAULT_CONFIG.colOwner] as Array<{ id: string; name?: string }> | undefined;
        const status = fields[DEFAULT_CONFIG.colStatus] || '';
        const endValue = fields[DEFAULT_CONFIG.colEnd];

        // Save user names
        if (owners) {
          const newUsers: Record<string, string> = {};
          for (const p of owners) {
            if (p.name) newUsers[p.id] = p.name;
          }
          await saveUsers(env, newUsers);
        }

        const riskEntry = buildAdminRiskEntry(
          proj.name, taskVal, phaseCn, owners || null, status, endValue, today, DEFAULT_CONFIG.doneList
        );

        if (riskEntry) {
          allRisks.push(riskEntry.summaryLine);
          projRisksMd.push(riskEntry.cardLine);
        }
      }

      if (projRisksMd.length > 0) {
        const url = buildBitableUrl(proj.token, proj.table);
        const header = `📁 **[${proj.name}](${url})**`;
        detailedSections.push(`${header}\n${projRisksMd.join('\n')}`);
      }
    } catch (error) {
      console.error(`❌ 处理项目 ${proj.name} 失败:`, error);
    }
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
    const { updateCardMessage } = await import('./feishu/message');
    await updateCardMessage(env, loadingMsgId, title, content, undefined, color);
  } else {
    await sendCardMessage(env, userId, title, content, undefined, color);
  }
}