/**
 * Quick script to create web_logs table in existing SQLite database
 * Run this if you get "no such table: web_logs" error
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.time-tracker', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  
  console.log('Connected to database:', dbPath);
  
  // Create web_logs table
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
      process.exit(1);
    }
    
    console.log('✅ web_logs table created successfully');
    
    // Create indexes
    db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_domain ON web_logs(domain)', (err) => {
      if (err) console.error('Error creating index:', err);
    });
    
    db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_activity_type ON web_logs(activity_type)', (err) => {
      if (err) console.error('Error creating index:', err);
    });
    
    db.run('CREATE INDEX IF NOT EXISTS idx_web_logs_timestamp ON web_logs(timestamp)', (err) => {
      if (err) {
        console.error('Error creating index:', err);
      } else {
        console.log('✅ Indexes created successfully');
        console.log('✅ Done! You can now restart your app.');
        db.close();
      }
    });
  });
});

