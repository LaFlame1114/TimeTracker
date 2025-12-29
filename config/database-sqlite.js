/**
 * SQLite Database Configuration
 * Used for embedded/portable mode where PostgreSQL is not available
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');
const { encrypt, decrypt, encryptFields, decryptFields } = require('../../services/crypto');

let db = null;

/**
 * Initialize SQLite database
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // Determine database path
    const dbDir = path.join(os.homedir(), '.time-tracker');
    const dbPath = path.join(dbDir, 'database.sqlite');

    // Create directory if it doesn't exist
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Check if database exists
    const dbExists = fs.existsSync(dbPath);

    // Open database connection
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        return reject(err);
      }
      console.log('Connected to SQLite database:', dbPath);
      
      // Enable foreign keys
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
          console.error('Error enabling foreign keys:', err);
          return reject(err);
        }
        
        // Initialize schema if database is new, or verify tables exist
        if (!dbExists) {
          console.log('Initializing database schema...');
          createSchema().then(() => resolve()).catch(reject);
        } else {
          // Database exists - verify all tables exist (for migrations)
          console.log('Database exists, verifying tables...');
          verifyTables().then(() => resolve()).catch(reject);
        }
      });
    });

    // Handle database errors
    db.on('error', (err) => {
      console.error('Database error:', err);
    });
  });
}

/**
 * Create database schema
 */
function createSchema() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Create all tables (simplified version)
      const tables = [
        `CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          plan TEXT DEFAULT 'free',
          settings TEXT DEFAULT '{}',
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS users (
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
        )`,
        `CREATE TABLE IF NOT EXISTS projects (
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
        )`,
        `CREATE TABLE IF NOT EXISTS tasks (
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
        )`,
        `CREATE TABLE IF NOT EXISTS time_logs (
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
        )`,
        `CREATE TABLE IF NOT EXISTS screenshots (
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
        )`,
        `CREATE TABLE IF NOT EXISTS activity_logs (
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
        )`,
        `CREATE TABLE IF NOT EXISTS wellness_logs (
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
        )`,
        `CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          revoked_at TEXT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS web_logs (
          id TEXT PRIMARY KEY,
          domain TEXT NOT NULL,
          url TEXT,
          activity_type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
      ];

      let completed = 0;
      tables.forEach((sql) => {
        db.run(sql, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            return reject(err);
          }
          completed++;
          if (completed === tables.length) {
            console.log('✅ Database schema initialized');
            resolve();
          }
        });
      });
    });
  });
}

/**
 * Verify all tables exist (for migrations)
 */
function verifyTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Check if web_logs table exists, create if not
      db.run(`CREATE TABLE IF NOT EXISTS web_logs (
        id TEXT PRIMARY KEY,
        domain TEXT NOT NULL,
        url TEXT,
        activity_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating web_logs table:', err);
          return reject(err);
        }
        
        // Create indexes if they don't exist
        db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_domain ON web_logs(domain)', (err) => {
          if (err && !err.message?.includes('already exists')) console.error('Error creating index:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_activity_type ON web_logs(activity_type)', (err) => {
          if (err && !err.message?.includes('already exists')) console.error('Error creating index:', err);
        });
        db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_timestamp ON web_logs(timestamp)', (err) => {
          if (err && !err.message?.includes('already exists')) console.error('Error creating index:', err);
        });
        
        console.log('✅ Database tables verified (web_logs table created if needed)');
        resolve();
      });
    });
  });
}

/**
 * Execute a query (SELECT)
 */
const query = (text, params = []) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    
    // Convert PostgreSQL-style placeholders ($1, $2) to SQLite-style (?)
    const sqliteQuery = text.replace(/\$(\d+)/g, '?');
    
    db.all(sqliteQuery, params, (err, rows) => {
      const duration = Date.now() - start;
      
      if (err) {
        console.error('Database query error:', { text, error: err.message });
        return reject(err);
      }
      
      console.log('Executed query', { text: sqliteQuery, duration, rows: rows.length });
      
      // Return in PostgreSQL format
      resolve({
        rows: rows || [],
        rowCount: rows ? rows.length : 0
      });
    });
  });
};

/**
 * Execute a query that returns a single row
 */
const queryOne = (text, params = []) => {
  return new Promise((resolve, reject) => {
    const sqliteQuery = text.replace(/\$(\d+)/g, '?');
    
    db.get(sqliteQuery, params, (err, row) => {
      if (err) {
        console.error('Database query error:', { text, error: err.message });
        return reject(err);
      }
      
      resolve({
        rows: row ? [row] : [],
        rowCount: row ? 1 : 0
      });
    });
  });
};

/**
 * Execute a query (INSERT, UPDATE, DELETE)
 */
const execute = (text, params = []) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sqliteQuery = text.replace(/\$(\d+)/g, '?');
    
    db.run(sqliteQuery, params, function(err) {
      const duration = Date.now() - start;
      
      if (err) {
        console.error('Database execute error:', { text, error: err.message });
        return reject(err);
      }
      
      console.log('Executed query', { text: sqliteQuery, duration, rows: this.changes });
      
      resolve({
        rows: [],
        rowCount: this.changes,
        lastID: this.lastID
      });
    });
  });
};

/**
 * Get a client for transactions (SQLite doesn't need this, but for compatibility)
 */
const getClient = async () => {
  return {
    query: (text, params) => query(text, params),
    execute: (text, params) => execute(text, params),
    release: () => {}
  };
};

/**
 * Close database connection
 */
const close = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
          return reject(err);
        }
        console.log('Database connection closed');
        db = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
};

/**
 * Insert a time log with encrypted sensitive fields
 * Encrypts: project_id, start_time, end_time, activity_score
 * 
 * @param {object} timeLogData - Time log data object
 * @returns {Promise<object>} - Inserted time log with encrypted fields
 */
async function insertTimeLog(timeLogData) {
  try {
    // Fields to encrypt
    const fieldsToEncrypt = ['project_id', 'start_time', 'end_time', 'activity_score'];
    
    // Create a copy of the data and encrypt sensitive fields
    const encryptedData = encryptFields(timeLogData, fieldsToEncrypt);
    
    // Prepare SQL with all fields
    const fields = Object.keys(encryptedData);
    const placeholders = fields.map((_, i) => `?`).join(', ');
    const values = fields.map(field => encryptedData[field]);
    
    const sql = `INSERT INTO time_logs (${fields.join(', ')}) VALUES (${placeholders})`;
    
    // Execute insert
    const result = await execute(sql, values);
    
    // Return the inserted data (with encrypted fields)
    return {
      ...encryptedData,
      id: timeLogData.id || result.lastID?.toString()
    };
  } catch (error) {
    console.error('Error inserting encrypted time log:', error);
    throw error;
  }
}

/**
 * Insert a screenshot with encrypted sensitive fields
 * Encrypts: captured_at (and time_log_id if present)
 * Note: Screenshots table doesn't have project_id, start_time, end_time, activity_score
 * So we encrypt captured_at and time_log_id as sensitive metadata
 * 
 * @param {object} screenshotData - Screenshot data object
 * @returns {Promise<object>} - Inserted screenshot with encrypted fields
 */
async function insertScreenshot(screenshotData) {
  try {
    // Fields to encrypt for screenshots
    // Note: Screenshots don't have project_id, start_time, end_time, activity_score
    // Encrypting captured_at and time_log_id as sensitive metadata
    const fieldsToEncrypt = ['captured_at'];
    if (screenshotData.time_log_id) {
      fieldsToEncrypt.push('time_log_id');
    }
    
    // Create a copy of the data and encrypt sensitive fields
    const encryptedData = encryptFields(screenshotData, fieldsToEncrypt);
    
    // Prepare SQL with all fields
    const fields = Object.keys(encryptedData);
    const placeholders = fields.map((_, i) => `?`).join(', ');
    const values = fields.map(field => encryptedData[field]);
    
    const sql = `INSERT INTO screenshots (${fields.join(', ')}) VALUES (${placeholders})`;
    
    // Execute insert
    const result = await execute(sql, values);
    
    // Return the inserted data (with encrypted fields)
    return {
      ...encryptedData,
      id: screenshotData.id || result.lastID?.toString()
    };
  } catch (error) {
    console.error('Error inserting encrypted screenshot:', error);
    throw error;
  }
}

/**
 * Get pending sync logs with decrypted sensitive fields
 * Decrypts: project_id, start_time, end_time, activity_score
 * 
 * @param {object} options - Query options
 * @param {string} options.organizationId - Organization ID filter
 * @param {number} options.limit - Maximum number of records
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Array>} - Array of time logs with decrypted fields
 */
async function getPendingSyncLogs(options = {}) {
  try {
    const { organizationId, limit = 100, offset = 0 } = options;
    
    // Build query
    let sql = `
      SELECT 
        id, organization_id, user_id, project_id, task_id,
        start_time, end_time, duration_ms, duration_hours,
        paused_duration_ms, activity_score, description, is_billable,
        status, approved_by, approved_at, created_at, updated_at
      FROM time_logs
      WHERE deleted_at IS NULL
    `;
    
    const params = [];
    
    if (organizationId) {
      sql += ` AND organization_id = ?`;
      params.push(organizationId);
    }
    
    // Add ordering and pagination
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // Execute query
    const result = await query(sql, params);
    
    // Decrypt sensitive fields for each row
    const fieldsToDecrypt = ['project_id', 'start_time', 'end_time', 'activity_score'];
    const decryptedRows = result.rows.map(row => {
      return decryptFields(row, fieldsToDecrypt);
    });
    
    return decryptedRows;
  } catch (error) {
    console.error('Error getting pending sync logs:', error);
    throw error;
  }
}

/**
 * Get pending sync screenshots with decrypted sensitive fields
 * Decrypts: captured_at, time_log_id
 * 
 * @param {object} options - Query options
 * @param {string} options.organizationId - Organization ID filter
 * @param {number} options.limit - Maximum number of records
 * @param {number} options.offset - Offset for pagination
 * @returns {Promise<Array>} - Array of screenshots with decrypted fields
 */
async function getPendingSyncScreenshots(options = {}) {
  try {
    const { organizationId, limit = 100, offset = 0 } = options;
    
    // Build query
    let sql = `
      SELECT 
        id, organization_id, user_id, time_log_id,
        s3_key, s3_url, thumbnail_url, file_size, mime_type,
        width, height, captured_at, created_at
      FROM screenshots
      WHERE deleted_at IS NULL
    `;
    
    const params = [];
    
    if (organizationId) {
      sql += ` AND organization_id = ?`;
      params.push(organizationId);
    }
    
    // Add ordering and pagination
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    // Execute query
    const result = await query(sql, params);
    
    // Decrypt sensitive fields for each row
    const fieldsToDecrypt = ['captured_at', 'time_log_id'];
    const decryptedRows = result.rows.map(row => {
      const decrypted = decryptFields(row, fieldsToDecrypt);
      // Filter out null time_log_id
      if (decrypted.time_log_id === null) {
        delete decrypted.time_log_id;
      }
      return decrypted;
    });
    
    return decryptedRows;
  } catch (error) {
    console.error('Error getting pending sync screenshots:', error);
    throw error;
  }
}

module.exports = {
  initializeDatabase,
  query,
  queryOne,
  execute,
  getClient,
  close,
  insertTimeLog,
  insertScreenshot,
  getPendingSyncLogs,
  getPendingSyncScreenshots,
  db // Expose db for direct access if needed
};

