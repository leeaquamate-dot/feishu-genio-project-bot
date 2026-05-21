// Ported from task_rules.py

// Default column mappings
export const DEFAULT_CONFIG = {
  colTaskKey: 'Task',
  colPhaseKey: '阶段名称',
  colStart: '开始时间',
  colEnd: '结束时间',
  colOwner: '负责人',
  colStatus: 'Status/任务状态',
  // 真正的"已完成"状态（不再包含暂停）
  doneList: [
    'Finished/已完成',
    '已完成',
    'Done',
    'Completed',
    'Canceled/取消',
    '取消',
    'Canceled'
  ],
  // 每日待办状态（包含暂停，暂停任务也需要提醒）
  dailyTodoStatusList: [
    'On Process/进行中',
    '进行中',
    'Pause/暂停',
    '暂停',
    'Delay/延期',
    '延期'
  ],
  // 暂停状态关键词
  pauseList: [
    'Pause/暂停',
    '暂停'
  ]
};

export function statusMatches(status: any, keywords: string[]): boolean {
  const statusText = String(status || '');
  return keywords.some(keyword => statusText.includes(keyword));
}

export function buildDisplayName(taskName: string, phaseName: string = ''): string {
  if (!taskName) return '';
  if (phaseName) return `${taskName} (${phaseName})`;
  return taskName;
}

export function parseEndDate(endValue: any): Date | null {
  if (!endValue) return null;

  // Timestamp in milliseconds
  if (typeof endValue === 'number') {
    return new Date(endValue);
  }

  // String date format
  const dateStr = String(endValue).slice(0, 10);
  return new Date(dateStr);
}

export function buildDueContext(endValue: any, today: Date): { endDate: Date; days: number; text: string } | null {
  const endDate = parseEndDate(endValue);
  if (!endDate) return null;

  const days = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const text = days < 0 ? `逾期${Math.abs(days)}天` : `剩余${days}天`;

  return { endDate, days, text };
}

export function buildTaskLine(
  displayName: string,
  status: string,
  dueContext: { endDate: Date; days: number; text: string } | null,
  baseIcon: string = '🔵'
): { icon: string; line: string } {
  const icon = dueContext && dueContext.days < 0 ? '🔴' : baseIcon;
  const suffix = dueContext ? ` · ${dueContext.text}` : '';
  return {
    icon,
    line: `${icon} **${displayName}**\n> ${status}${suffix}`
  };
}

export function buildDailyTodoTask(
  taskName: string,
  phaseName: string,
  status: string,
  endValue: any,
  today: Date,
  allowedStatuses: string[]
): { displayName: string; icon: string; line: string } | null {
  if (!taskName || !statusMatches(status, allowedStatuses)) return null;

  const displayName = buildDisplayName(taskName, phaseName);

  let icon = '🔵';
  if (statusMatches(status, ['Delay/延期', '延期'])) {
    icon = '🟠';
  } else if (statusMatches(status, ['Pause/暂停', '暂停'])) {
    icon = '🟡';
  }

  let dueContext = null;
  try {
    dueContext = buildDueContext(endValue, today);
  } catch {
    dueContext = null;
  }

  const taskLine = buildTaskLine(displayName, status, dueContext, icon);
  return {
    displayName,
    icon: taskLine.icon,
    line: taskLine.line
  };
}

export function buildAdminRiskEntry(
  projectName: string,
  taskName: string,
  phaseName: string,
  owners: Array<{ id: string; name?: string }> | null,
  status: string,
  endValue: any,
  today: Date,
  doneStatuses: string[]
): { displayName: string; days: number; riskDesc: string; ownerNames: string; summaryLine: string; cardLine: string } | null {
  if (!taskName || !owners || owners.length === 0 || !endValue || statusMatches(status, doneStatuses)) return null;

  const displayName = buildDisplayName(taskName, phaseName);

  let dueContext = null;
  try {
    dueContext = buildDueContext(endValue, today);
  } catch {
    return null;
  }

  if (!dueContext || dueContext.days > 1) return null;

  const ownerNames = owners
    .filter(o => o.name || o.id)
    .map(o => o.name || o.id)
    .join(',');

  return {
    displayName,
    days: dueContext.days,
    riskDesc: dueContext.text,
    ownerNames,
    summaryLine: `- 【${projectName}】${displayName} (${ownerNames}): ${dueContext.text}`,
    cardLine: `🔴 **${displayName}**\n> ${ownerNames} · ${dueContext.text}`
  };
}

export function buildMyTaskLine(
  taskName: string,
  phaseName: string,
  status: string,
  endValue: any,
  today: Date
): string | null {
  if (!taskName) return null;

  const displayName = buildDisplayName(taskName, phaseName);

  // 根据状态设置图标
  let icon = '🔵';
  if (statusMatches(status, ['Delay/延期', '延期'])) {
    icon = '🟠';
  } else if (statusMatches(status, DEFAULT_CONFIG.pauseList)) {
    icon = '🟡';
  }

  let dueContext = null;
  try {
    dueContext = buildDueContext(endValue, today);
  } catch {
    dueContext = null;
  }

  return buildTaskLine(displayName, status, dueContext, icon).line;
}