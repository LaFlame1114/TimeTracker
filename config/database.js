const { Pool } = require('pg');

// 1. Get the connection string from Render environment variables
const connectionString = process.env.DATABASE_URL;

// 2. Validate it exists
if (!connectionString) {
  console.error("❌ CRITICAL ERROR: DATABASE_URL is missing! Defaulting to localhost (This will fail on Render).");
}

// 3. Create the pool with SSL required for Supabase
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Render -> Supabase connections
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};