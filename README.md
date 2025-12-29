# Time Tracking SaaS Backend API

A comprehensive Node.js/Express backend API for a Time Tracking SaaS application with PostgreSQL database, JWT authentication, and multi-tenancy support.

## Features

- ✅ **Multi-Tenancy**: Complete organization-based data isolation
- ✅ **JWT Authentication**: Secure token-based authentication
- ✅ **Role-Based Access Control**: Admin, Manager, Employee roles
- ✅ **Time Logging**: Track time with projects, tasks, and activity scores
- ✅ **Screenshot Management**: AWS S3 integration for screenshot storage
- ✅ **Wellness Tracking**: Log wellness reminder acknowledgments
- ✅ **Reporting**: Timeline reports with filtering and statistics
- ✅ **Security**: Helmet, CORS, rate limiting, input validation

## Database Schema

The database includes the following tables:

- `organizations` - Multi-tenancy root
- `users` - User accounts with role-based access
- `projects` - Project management
- `tasks` - Task management
- `time_logs` - Time tracking entries
- `screenshots` - Screenshot metadata with S3 references
- `activity_logs` - Activity monitoring data
- `wellness_logs` - Wellness reminder acknowledgments
- `refresh_tokens` - JWT refresh token management

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Database Setup

**Quick Start with Docker (Recommended):**

If you have Docker installed, this is the easiest method:

```bash
docker-compose up -d
```

This will automatically:
- Start PostgreSQL container
- Create the database
- Run the schema.sql file

**Alternative Methods:**

See [SETUP.md](./SETUP.md) for detailed instructions on:
- Installing PostgreSQL via Homebrew
- Using Docker (detailed steps)
- Using PostgreSQL.app (GUI)
- Using cloud databases

**Manual Setup (if PostgreSQL is installed):**

```bash
createdb time_tracking_db
psql -d time_tracking_db -f schema.sql
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Update the following variables:

- Database connection details
- JWT secret (use a strong random string)
- AWS S3 credentials and bucket name
- CORS origin (your frontend URL)

### 4. AWS S3 Setup

1. Create an S3 bucket for screenshots
2. Configure IAM user with S3 access
3. Update `.env` with AWS credentials and bucket name

### 5. Run the Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new organization and admin user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info (requires auth)

### Time Logs

- `POST /api/log/time` - Create time log entry (requires auth)
- `GET /api/log/time` - Get time logs with filtering (requires auth)

### Screenshots

- `POST /api/log/screenshot` - Upload screenshot to S3 (requires auth)
- `GET /api/log/screenshot/:id` - Get screenshot with presigned URL (requires auth)
- `GET /api/log/screenshots` - Get all screenshots (requires auth)

### Wellness

- `POST /api/log/wellness` - Log wellness reminder acknowledgment (requires auth)

### Reports

- `GET /api/report/timeline` - Get timeline data for visualization (requires auth)
- `GET /api/report/wellness` - Get wellness logs (requires auth)

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Multi-Tenancy

All data is automatically scoped to the user's organization. The `organization_id` is extracted from the JWT token and used in all queries to ensure data isolation.

## Role-Based Access

- **Admin**: Full access to all organization data
- **Manager**: Can view and manage team member data
- **Employee**: Can only access their own data

## Request/Response Format

### Success Response

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error message",
  "errors": [] // Validation errors if applicable
}
```

## Example Requests

### Register Organization

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "securepassword123",
    "firstName": "John",
    "lastName": "Doe",
    "organizationName": "Acme Corp",
    "organizationSlug": "acme-corp"
  }'
```

### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "securepassword123"
  }'
```

### Create Time Log

```bash
curl -X POST http://localhost:3001/api/log/time \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "projectId": "uuid-here",
    "taskId": "uuid-here",
    "startTime": "2024-01-01T09:00:00Z",
    "endTime": "2024-01-01T17:00:00Z",
    "durationMs": 28800000,
    "durationHours": 8.0,
    "activityScore": 85.5
  }'
```

### Upload Screenshot

```bash
curl -X POST http://localhost:3001/api/log/screenshot \
  -H "Authorization: Bearer <your-token>" \
  -F "screenshot=@/path/to/image.png" \
  -F "timeLogId=uuid-here" \
  -F "capturedAt=2024-01-01T10:00:00Z"
```

### Get Timeline Report

```bash
curl -X GET "http://localhost:3001/api/report/timeline?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer <your-token>"
```

## Security Features

- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: express-validator for all inputs
- **SQL Injection Prevention**: Parameterized queries
- **Rate Limiting**: Prevents abuse
- **CORS**: Configurable cross-origin resource sharing
- **Helmet**: Security headers
- **Multi-Tenancy**: Organization-level data isolation

## Database Indexes

The schema includes optimized indexes for:
- Organization lookups
- User queries
- Time log date ranges
- Foreign key relationships
- Soft delete queries

## Production Considerations

1. **Environment Variables**: Never commit `.env` file
2. **JWT Secret**: Use a strong, random secret
3. **Database**: Use connection pooling in production
4. **SSL**: Enable SSL for database connections
5. **Backups**: Regular database backups
6. **Monitoring**: Set up error tracking and logging
7. **Rate Limiting**: Adjust limits based on usage
8. **S3 Bucket**: Configure proper IAM policies and bucket policies

## License

MIT

