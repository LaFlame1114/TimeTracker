const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess } = require('../middleware/auth');
const { validateProject, validateTask } = require('../middleware/multiTenancy');

/**
 * POST /api/log/time
 * Create a new time log entry
 */
router.post('/time',
  authenticate,
  enforceOrganizationAccess,
  validateProject,
  validateTask,
  [
    body('projectId').isUUID(),
    body('taskId').isUUID(),
    body('startTime').isISO8601(),
    body('endTime').isISO8601(),
    body('durationMs').isInt({ min: 1 }),
    body('durationHours').isFloat({ min: 0 }),
    body('activityScore').optional().isFloat({ min: 0, max: 100 }),
    body('description').optional().isString().trim(),
    body('isBillable').optional().isBoolean(),
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

      const {
        projectId,
        taskId,
        startTime,
        endTime,
        durationMs,
        durationHours,
        pausedDurationMs = 0,
        activityScore = 0,
        description,
        isBillable = false
      } = req.body;

      // Validate that project and task belong to the organization
      const projectCheck = await query(
        'SELECT id FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
        [projectId, req.user.organizationId]
      );

      if (projectCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Project not found or does not belong to your organization'
        });
      }

      const taskCheck = await query(
        'SELECT id FROM tasks WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
        [taskId, req.user.organizationId]
      );

      if (taskCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Task not found or does not belong to your organization'
        });
      }

      // Insert time log
      const result = await query(
        `INSERT INTO time_logs (
          organization_id, user_id, project_id, task_id,
          start_time, end_time, duration_ms, duration_hours,
          paused_duration_ms, activity_score, description, is_billable
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, start_time, end_time, duration_hours, activity_score, created_at`,
        [
          req.user.organizationId,
          req.user.id,
          projectId,
          taskId,
          startTime,
          endTime,
          durationMs,
          durationHours,
          pausedDurationMs,
          activityScore,
          description || null,
          isBillable
        ]
      );

      const timeLog = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Time log created successfully',
        data: {
          timeLog: {
            id: timeLog.id,
            startTime: timeLog.start_time,
            endTime: timeLog.end_time,
            durationHours: parseFloat(timeLog.duration_hours),
            activityScore: parseFloat(timeLog.activity_score),
            createdAt: timeLog.created_at
          }
        }
      });
    } catch (error) {
      console.error('Time log creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create time log',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/log/time
 * Get time logs for the authenticated user
 * Supports filtering by date range, project, task
 */
router.get('/time',
  authenticate,
  enforceOrganizationAccess,
  async (req, res) => {
    try {
      const { startDate, endDate, projectId, taskId, status, limit = 50, offset = 0 } = req.query;

      let queryText = `
        SELECT 
          tl.id, tl.start_time, tl.end_time, tl.duration_ms, tl.duration_hours,
          tl.paused_duration_ms, tl.activity_score, tl.description, tl.is_billable,
          tl.status, tl.created_at,
          p.id as project_id, p.name as project_name,
          t.id as task_id, t.name as task_name
        FROM time_logs tl
        JOIN projects p ON tl.project_id = p.id
        JOIN tasks t ON tl.task_id = t.id
        WHERE tl.organization_id = $1
          AND tl.user_id = $2
          AND tl.deleted_at IS NULL
      `;

      const queryParams = [req.user.organizationId, req.user.id];
      let paramIndex = 3;

      if (startDate) {
        queryText += ` AND tl.start_time >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        queryText += ` AND tl.end_time <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      if (projectId) {
        queryText += ` AND tl.project_id = $${paramIndex}`;
        queryParams.push(projectId);
        paramIndex++;
      }

      if (taskId) {
        queryText += ` AND tl.task_id = $${paramIndex}`;
        queryParams.push(taskId);
        paramIndex++;
      }

      if (status) {
        queryText += ` AND tl.status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      queryText += ` ORDER BY tl.start_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await query(queryText, queryParams);

      // Get total count for pagination
      const countResult = await query(
        `SELECT COUNT(*) as total
         FROM time_logs
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [req.user.organizationId, req.user.id]
      );

      res.json({
        success: true,
        data: {
          timeLogs: result.rows.map(log => ({
            id: log.id,
            startTime: log.start_time,
            endTime: log.end_time,
            durationMs: parseInt(log.duration_ms),
            durationHours: parseFloat(log.duration_hours),
            pausedDurationMs: parseInt(log.paused_duration_ms),
            activityScore: parseFloat(log.activity_score),
            description: log.description,
            isBillable: log.is_billable,
            status: log.status,
            project: {
              id: log.project_id,
              name: log.project_name
            },
            task: {
              id: log.task_id,
              name: log.task_name
            },
            createdAt: log.created_at
          })),
          pagination: {
            total: parseInt(countResult.rows[0].total),
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });
    } catch (error) {
      console.error('Get time logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get time logs'
      });
    }
  }
);

module.exports = router;

