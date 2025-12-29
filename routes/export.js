const express = require('express');
const router = express.Router();
const { query } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess, authorize } = require('../middleware/auth');
const { format } = require('date-fns');

/**
 * GET /api/export/payroll
 * Export payroll data as CSV
 * Only accessible by managers and admins
 */
router.get('/payroll',
  authenticate,
  enforceOrganizationAccess,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const { startDate, endDate, userId, format: exportFormat = 'csv' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'startDate and endDate are required'
        });
      }

      // Build query to get time logs for payroll
      let queryText = `
        SELECT 
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.email,
          tl.id as time_log_id,
          tl.start_time,
          tl.end_time,
          tl.duration_hours,
          tl.is_billable,
          tl.status,
          p.name as project_name,
          t.name as task_name,
          tl.description
        FROM time_logs tl
        JOIN users u ON tl.user_id = u.id
        JOIN projects p ON tl.project_id = p.id
        JOIN tasks t ON tl.task_id = t.id
        WHERE tl.organization_id = $1
          AND tl.deleted_at IS NULL
          AND u.deleted_at IS NULL
          AND tl.start_time >= $2
          AND tl.end_time <= $3
      `;

      const queryParams = [req.user.organizationId, startDate, endDate];
      let paramIndex = 4;

      // If manager (not admin), only show their team members
      if (req.user.role === 'manager') {
        // For now, managers can see all users in their org
        // In a real system, you'd have a team assignment table
      }

      // Filter by specific user if provided (and user has permission)
      if (userId) {
        if (req.user.role !== 'admin' && userId !== req.user.id) {
          // Managers can view any user in their org
          // Employees can only view themselves
          if (req.user.role === 'employee') {
            return res.status(403).json({
              success: false,
              message: 'You do not have permission to view other users\' data'
            });
          }
        }
        queryText += ` AND tl.user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      queryText += ` ORDER BY u.last_name, u.first_name, tl.start_time ASC`;

      const result = await query(queryText, queryParams);

      if (exportFormat === 'csv') {
        // Generate CSV
        const csvRows = [];
        
        // CSV Header
        csvRows.push([
          'Employee Name',
          'Email',
          'Date',
          'Start Time',
          'End Time',
          'Duration (Hours)',
          'Project',
          'Task',
          'Billable',
          'Status',
          'Description'
        ].join(','));

        // CSV Data Rows
        result.rows.forEach(row => {
          const startDate = new Date(row.start_time);
          const endDate = new Date(row.end_time);
          
          csvRows.push([
            `"${row.first_name} ${row.last_name}"`,
            `"${row.email}"`,
            format(startDate, 'yyyy-MM-dd'),
            format(startDate, 'HH:mm:ss'),
            format(endDate, 'HH:mm:ss'),
            parseFloat(row.duration_hours).toFixed(2),
            `"${row.project_name}"`,
            `"${row.task_name}"`,
            row.is_billable ? 'Yes' : 'No',
            row.status,
            `"${(row.description || '').replace(/"/g, '""')}"`
          ].join(','));
        });

        const csvContent = csvRows.join('\n');
        
        // Set response headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="payroll-export-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
        res.send(csvContent);
      } else if (exportFormat === 'json') {
        // Return JSON format
        res.json({
          success: true,
          data: {
            timeLogs: result.rows.map(row => ({
              userId: row.user_id,
              employeeName: `${row.first_name} ${row.last_name}`,
              email: row.email,
              timeLogId: row.time_log_id,
              date: format(new Date(row.start_time), 'yyyy-MM-dd'),
              startTime: row.start_time,
              endTime: row.end_time,
              durationHours: parseFloat(row.duration_hours),
              projectName: row.project_name,
              taskName: row.task_name,
              isBillable: row.is_billable,
              status: row.status,
              description: row.description
            })),
            summary: {
              totalHours: result.rows.reduce((sum, row) => sum + parseFloat(row.duration_hours), 0),
              totalBillableHours: result.rows
                .filter(row => row.is_billable)
                .reduce((sum, row) => sum + parseFloat(row.duration_hours), 0),
              totalEntries: result.rows.length,
              uniqueEmployees: new Set(result.rows.map(row => row.user_id)).size
            }
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid format. Supported formats: csv, json'
        });
      }
    } catch (error) {
      console.error('Payroll export error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export payroll data',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;

