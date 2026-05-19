-- Feishu Bot Backup Schema for D1

CREATE TABLE IF NOT EXISTS backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_token TEXT NOT NULL,
  project_name TEXT NOT NULL,
  backup_date TEXT NOT NULL,
  record_count INTEGER DEFAULT 0,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backups_project_token ON backups(project_token);
CREATE INDEX IF NOT EXISTS idx_backups_backup_date ON backups(backup_date);

-- History log table
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);