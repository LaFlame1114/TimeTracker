const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess, authorize } = require('../middleware/auth');

/**
 * GET /api/timesheets/pending
 * Get pending time logs awaiting approval
 * Only accessible by managers and admins
 */
router.get('/pending',
  authenticate,
  enforceOrganizationAccess,
  authorize(['admin', 'manager']),
  async (req, res) => {
    try {
      const { userId, limit = 50, offset = 0 } = req.query;

      let queryText = `
        SELECT 
          tl.id,
          tl.start_time,
          tl.end_time,
          tl.duration_hours,
          tl.activity_score,
          tl.description,
          tl.is_billable,
          tl.status,
          tl.created_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.email,
          p.id as project_id,
          p.name as project_name,
          t.id as task_id,
          t.name as task_name
        FROM time_logs tl
        JOIN users u ON tl.user_id = u.id
        JOIN projects p ON tl.project_id = p.id
        JOIN tasks t ON tl.task_id = t.id
        WHERE tl.organization_id = $1
          AND tl.status = 'pending'
          AND tl.deleted_at IS NULL
          AND u.deleted_at IS NULL
      `;

      const queryParams = [req.user.organizationId];
      let paramIndex = 2;

      if (userId) {
        queryText += ` AND tl.user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      queryText += ` ORDER BY tl.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await query(queryText, queryParams);

      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) as total
         FROM time_logs
         WHERE organization_id = $1 AND status = 'pending' AND deleted_at IS NULL`,
        [req.user.organizationId]
      );

      res.json({
        success: true,
        data: {
          timeLogs: result.rows.map(log => ({
            id: log.id,
            startTime: log.start_time,
            endTime: log.end_time,
            durationHours: parseFloat(log.duration_hours),
            activityScore: parseFloat(log.activity_score),
            description: log.description,
            isBillable: log.is_billable,
            status: log.status,
            createdAt: log.created_at,
            user: {
              id: log.user_id,
              firstName: log.first_name,
              lastName: log.last_name,
              email: log.email
            },
            project: {
              id: log.project_id,
              name: log.project_name
            },
            task: {
              id: log.task_id,
              name: log.task_name
            }
          })),
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });
    } catch (error) {
      console.error('Get pending timesheets error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending timesheets'
      });
    }
  }
);

/**
 * PUT /api/timesheets/approve
 * Approve or reject a time log entry
 * Only accessible by managers and admins
 */
router.put('/approve',
  authenticate,
  enforceOrganizationAccess,
  authorize(['admin', 'manager']),
  [
    body('timeLogId').isUUID(),
    body('action').isIn(['approve', 'reject']),
    body('notes').optional().isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { timeLogId, action, notes } = req.body;

      // Verify time log exists and belongs to the organization
      const timeLogCheck = await query(
        `SELECT id, user_id, status
         FROM time_logs
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [timeLogId, req.user.organizationId]
      );

      if (timeLogCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Time log not found'
        });
      }

      const timeLog = timeLogCheck.rows[0];

      if (timeLog.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Time log is already ${timeLog.status}`
        });
      }

      // Update time log status
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const updateResult = await query(
        `UPDATE time_logs
         SET status = $1,
             approved_by = $2,
             approved_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING id, status, approved_at`,
        [newStatus, req.user.id, timeLogId]
      );

      res.json({
        success: true,
        message: `Time log ${action}d successfully`,
        data: {
          timeLog: {
            id: updateResult.rows[0].id,
            status: updateResult.rows[0].status,
            approvedAt: updateResult.rows[0].approved_at,
            approvedBy: {
              id: req.user.id,
              name: `${req.user.firstName} ${req.user.lastName}`
            }
          }
        }
      });
    } catch (error) {
      console.error('Approve timesheet error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to approve/reject time log',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * PUT /api/timesheets/bulk-approve
 * Approve or reject multiple time log entries at once
 */
router.put('/bulk-approve',
  authenticate,
  enforceOrganizationAccess,
  authorize(['admin', 'manager']),
  [
    body('timeLogIds').isArray().notEmpty(),
    body('timeLogIds.*').isUUID(),
    body('action').isIn(['approve', 'reject']),
    body('notes').optional().isString().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { timeLogIds, action, notes } = req.body;

      // Verify all time logs exist and belong to the organization
      const placeholders = timeLogIds.map((_, i) => `$${i + 2}`).join(',');
      const verifyQuery = `
        SELECT id, status
        FROM time_logs
        WHERE id IN (${placeholders})
          AND organization_id = $1
          AND deleted_at IS NULL
      `;
      
      const verifyResult = await query(verifyQuery, [req.user.organizationId, ...timeLogIds]);

      if (verifyResult.rows.length !== timeLogIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some time logs were not found or do not belong to your organization'
        });
      }

      // Filter to only pending logs
      const pendingLogs = verifyResult.rows.filter(log => log.status === 'pending');
      
      if (pendingLogs.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No pending time logs found in the selected entries'
        });
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const pendingIds = pendingLogs.map(log => log.id);
      const updatePlaceholders = pendingIds.map((_, i) => `$${i + 2}`).join(',');

      const updateQuery = `
        UPDATE time_logs
        SET status = $1,
            approved_by = $${pendingIds.length + 2},
            approved_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${updatePlaceholders})
          AND status = 'pending'
        RETURNING id, status
      `;

      const updateResult = await query(updateQuery, [newStatus, req.user.id, ...pendingIds]);

      res.json({
        success: true,
        message: `${updateResult.rows.length} time log(s) ${action}d successfully`,
        data: {
          approved: updateResult.rows.length,
          total: timeLogIds.length,
          skipped: timeLogIds.length - pendingLogs.length
        }
      });
    } catch (error) {
      console.error('Bulk approve timesheet error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk approve/reject time logs',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;

