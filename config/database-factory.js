/**
 * Database Factory
 * Chooses between PostgreSQL and SQLite based on environment
 */

const DB_TYPE = process.env.DB_TYPE || (process.env.EMBEDDED_MODE === 'true' ? 'sqlite' : 'postgresql');

let dbModule = null;

if (DB_TYPE === 'sqlite') {
  console.log('Using SQLite database (embedded mode)');
  dbModule = require('./database-sqlite');
  
  // Initialize SQLite on load
  dbModule.initializeDatabase().catch(err => {
    console.error('Failed to initialize SQLite database:', err);
  });
} else {
  console.log('Using PostgreSQL database');
  dbModule = require('./database');
}

module.exports = dbModule;

