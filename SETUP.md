# Database Setup Guide

## Option 1: Install PostgreSQL via Homebrew (Recommended for macOS)

### Step 1: Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Step 2: Install PostgreSQL
```bash
brew install postgresql@15
```

### Step 3: Start PostgreSQL service
```bash
brew services start postgresql@15
```

### Step 4: Create database
```bash
createdb time_tracking_db
```

### Step 5: Run schema
```bash
psql -d time_tracking_db -f schema.sql
```

---

## Option 2: Use Docker (Easier, No Installation Required)

### Step 1: Create docker-compose.yml
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: time_tracking_db
    environment:
      POSTGRES_DB: time_tracking_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql

volumes:
  postgres_data:
```

### Step 2: Start PostgreSQL
```bash
docker-compose up -d
```

The schema will be automatically applied when the container starts.

### Step 3: Update .env file
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=time_tracking_db
DB_USER=postgres
DB_PASSWORD=postgres
```

---

## Option 3: Use PostgreSQL.app (GUI for macOS)

1. Download from: https://postgresapp.com/
2. Install and launch the app
3. Click "Initialize" to create a new server
4. Use the GUI or terminal commands from the app

---

## Option 4: Use Cloud Database (Production)

### AWS RDS, Google Cloud SQL, or Heroku Postgres

1. Create a PostgreSQL instance
2. Get connection string
3. Update `.env` with connection details
4. Run schema using connection string:
```bash
psql "postgresql://user:password@host:port/dbname" -f schema.sql
```

---

## Verify Installation

After setup, test the connection:

```bash
psql -d time_tracking_db -c "SELECT version();"
```

Or test from Node.js:
```bash
cd backend
node -e "const {query} = require('./config/database'); query('SELECT version()').then(r => console.log(r.rows[0])).catch(e => console.error(e));"
```

---

## Troubleshooting

### If `psql` command not found:
- Add PostgreSQL to PATH: `export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"`
- Or use full path: `/opt/homebrew/opt/postgresql@15/bin/psql`

### If connection refused:
- Check if PostgreSQL is running: `brew services list`
- Start it: `brew services start postgresql@15`

### If permission denied:
- Check PostgreSQL user permissions
- Try: `psql -U postgres -d time_tracking_db`

