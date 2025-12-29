/**
 * Initialize SQLite Database Schema
 * Creates all tables for the time tracking application
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const dbDir = path.join(os.homedir(), '.time-tracker');
const dbPath = path.join(dbDir, 'database.sqlite');

// Create directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database:', dbPath);
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Create tables
const createTables = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Organizations table
      db.run(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          plan TEXT DEFAULT 'free',
          settings TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL
        )
      `);

      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          email TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'employee',
          is_active INTEGER DEFAULT 1,
          last_login_at TEXT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL,
          UNIQUE(organization_id, email),
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        )
      `);

      // Projects table
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          color TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        )
      `);

      // Tasks table
      db.run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
      `);

      // Time logs table
      db.run(`
        CREATE TABLE IF NOT EXISTS time_logs (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          duration_hours REAL NOT NULL,
          paused_duration_ms INTEGER DEFAULT 0,
          activity_score REAL DEFAULT 0.00,
          description TEXT,
          is_billable INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending',
          approved_by TEXT NULL,
          approved_at TEXT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `);

      // Screenshots table
      db.run(`
        CREATE TABLE IF NOT EXISTS screenshots (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          time_log_id TEXT NULL,
          s3_key TEXT NOT NULL,
          s3_url TEXT NOT NULL,
          thumbnail_url TEXT,
          file_size INTEGER,
          mime_type TEXT,
          width INTEGER,
          height INTEGER,
          captured_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (time_log_id) REFERENCES time_logs(id) ON DELETE SET NULL
        )
      `);

      // Activity logs table
      db.run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          time_log_id TEXT NULL,
          activity_percentage REAL NOT NULL,
          events_count INTEGER DEFAULT 0,
          is_inactive INTEGER DEFAULT 0,
          inactivity_duration_ms INTEGER DEFAULT 0,
          logged_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (time_log_id) REFERENCES time_logs(id) ON DELETE SET NULL
        )
      `);

      // Wellness logs table
      db.run(`
        CREATE TABLE IF NOT EXISTS wellness_logs (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          wellness_type TEXT NOT NULL,
          acknowledged_at TEXT NOT NULL,
          reminder_sent_at TEXT NOT NULL,
          wellness_score REAL,
          notes TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Refresh tokens table
      db.run(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          revoked_at TEXT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      db.run('CREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_time_logs_organization_id ON time_logs(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_time_logs_user_id ON time_logs(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_time_logs_start_time ON time_logs(start_time)');
      db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_organization_id ON screenshots(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_activity_logs_organization_id ON activity_logs(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_wellness_logs_organization_id ON wellness_logs(organization_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_id ON wellness_logs(user_id)');

      db.run('COMMIT', (err) => {
        if (err) {
          console.error('Error creating tables:', err);
          return reject(err);
        }
        console.log('✅ Database schema initialized successfully');
        resolve();
      });
    });
  });
};

// Initialize database
createTables()
  .then(() => {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        process.exit(1);
      }
      console.log('Database connection closed');
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error('Initialization failed:', err);
    db.close();
    process.exit(1);
  });

