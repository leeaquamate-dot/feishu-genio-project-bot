import { Env, BitableRecord } from '../types';

export interface BackupData {
  project_token: string;
  project_name: string;
  backup_date: string;
  record_count: number;
  data: string;
}

export async function saveBackup(
  env: Env,
  projectToken: string,
  projectName: string,
  records: BitableRecord[]
): Promise<void> {
  const backupDate = new Date().toISOString().split('T')[0];
  const data = JSON.stringify(records);

  await env.DB.prepare(
    `INSERT INTO backups (project_token, project_name, backup_date, record_count, data)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(projectToken, projectName, backupDate, records.length, data)
    .run();
}

export async function getLatestBackup(
  env: Env,
  projectToken: string
): Promise<BackupData | null> {
  const result = await env.DB.prepare(
    `SELECT project_token, project_name, backup_date, record_count, data
     FROM backups
     WHERE project_token = ?
     ORDER BY backup_date DESC
     LIMIT 1`
  )
    .bind(projectToken)
    .first();

  return result as BackupData | null;
}

export async function cleanupOldBackups(env: Env, retentionDays: number = 30): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  await env.DB.prepare(
    `DELETE FROM backups WHERE backup_date < ?`
  )
    .bind(cutoffStr)
    .run();
}

export async function logHistory(env: Env, eventType: string, message: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO history (event_type, message) VALUES (?, ?)`
  )
    .bind(eventType, message)
    .run();
}