const express = require('express');
const router = express.Router();
const { query } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess, authorize } = require('../middleware/auth');

/**
 * GET /api/report/timeline
 * Get timeline data for visual timeline report
 * Supports filtering by date range, user (for managers/admins), project, task
 */
router.get('/timeline',
  authenticate,
  enforceOrganizationAccess,
  async (req, res) => {
    try {
      const { startDate, endDate, userId, projectId, taskId } = req.query;

      // Managers and admins can view other users' data
      // Employees can only view their own data
      const targetUserId = userId && (req.user.role === 'admin' || req.user.role === 'manager')
        ? userId
        : req.user.id;

      // Validate that if userId is provided, user has permission
      if (userId && userId !== req.user.id) {
        if (req.user.role !== 'admin' && req.user.role !== 'manager') {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to view other users\' data'
          });
        }

        // Verify the target user belongs to the same organization
        const userCheck = await query(
          'SELECT id FROM users WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
          [userId, req.user.organizationId]
        );

        if (userCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'User not found or does not belong to your organization'
          });
        }
      }

      // Build query for time logs
      let queryText = `
        SELECT 
          tl.id,
          tl.start_time,
          tl.end_time,
          tl.duration_hours,
          tl.activity_score,
          tl.status,
          tl.description,
          p.id as project_id,
          p.name as project_name,
          p.color as project_color,
          t.id as task_id,
          t.name as task_name,
          u.id as user_id,
          u.first_name as user_first_name,
          u.last_name as user_last_name,
          u.email as user_email
        FROM time_logs tl
        JOIN projects p ON tl.project_id = p.id
        JOIN tasks t ON tl.task_id = t.id
        JOIN users u ON tl.user_id = u.id
        WHERE tl.organization_id = $1
          AND tl.user_id = $2
          AND tl.deleted_at IS NULL
          AND p.deleted_at IS NULL
          AND t.deleted_at IS NULL
      `;

      const queryParams = [req.user.organizationId, targetUserId];
      let paramIndex = 3;

      // Date range filter
      if (startDate) {
        queryText += ` AND tl.start_time >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      } else {
        // Default to last 30 days if no start date
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        queryText += ` AND tl.start_time >= $${paramIndex}`;
        queryParams.push(defaultStartDate.toISOString());
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

      queryText += ` ORDER BY tl.start_time ASC`;

      const result = await query(queryText, queryParams);

      // Get summary statistics
      const statsResult = await query(
        `SELECT 
          COUNT(*) as total_logs,
          SUM(duration_hours) as total_hours,
          AVG(activity_score) as avg_activity_score,
          COUNT(DISTINCT project_id) as project_count,
          COUNT(DISTINCT task_id) as task_count
         FROM time_logs
         WHERE organization_id = $1
           AND user_id = $2
           AND deleted_at IS NULL
           ${startDate ? `AND start_time >= '${startDate}'` : ''}
           ${endDate ? `AND end_time <= '${endDate}'` : ''}
           ${projectId ? `AND project_id = '${projectId}'` : ''}
           ${taskId ? `AND task_id = '${taskId}'` : ''}`,
        [req.user.organizationId, targetUserId]
      );

      const stats = statsResult.rows[0];

      // Format timeline data
      const timeline = result.rows.map(log => ({
        id: log.id,
        startTime: log.start_time,
        endTime: log.end_time,
        durationHours: parseFloat(log.duration_hours),
        activityScore: parseFloat(log.activity_score),
        status: log.status,
        description: log.description,
        project: {
          id: log.project_id,
          name: log.project_name,
          color: log.project_color
        },
        task: {
          id: log.task_id,
          name: log.task_name
        },
        user: {
          id: log.user_id,
          firstName: log.user_first_name,
          lastName: log.user_last_name,
          email: log.user_email
        }
      }));

      res.json({
        success: true,
        data: {
          timeline,
          summary: {
            totalLogs: parseInt(stats.total_logs) || 0,
            totalHours: parseFloat(stats.total_hours) || 0,
            avgActivityScore: parseFloat(stats.avg_activity_score) || 0,
            projectCount: parseInt(stats.project_count) || 0,
            taskCount: parseInt(stats.task_count) || 0
          },
          filters: {
            startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: endDate || new Date().toISOString(),
            userId: targetUserId,
            projectId: projectId || null,
            taskId: taskId || null
          }
        }
      });
    } catch (error) {
      console.error('Timeline report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate timeline report',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/report/wellness
 * Get wellness logs for the authenticated user
 */
router.get('/wellness',
  authenticate,
  enforceOrganizationAccess,
  async (req, res) => {
    try {
      const { startDate, endDate, wellnessType, limit = 100, offset = 0 } = req.query;

      let queryText = `
        SELECT id, wellness_type, acknowledged_at, reminder_sent_at,
               wellness_score, notes, created_at
        FROM wellness_logs
        WHERE organization_id = $1 AND user_id = $2
      `;

      const queryParams = [req.user.organizationId, req.user.id];
      let paramIndex = 3;

      if (startDate) {
        queryText += ` AND acknowledged_at >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        queryText += ` AND acknowledged_at <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      if (wellnessType) {
        queryText += ` AND wellness_type = $${paramIndex}`;
        queryParams.push(wellnessType);
        paramIndex++;
      }

      queryText += ` ORDER BY acknowledged_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await query(queryText, queryParams);

      res.json({
        success: true,
        data: {
          wellnessLogs: result.rows.map(log => ({
            id: log.id,
            wellnessType: log.wellness_type,
            acknowledgedAt: log.acknowledged_at,
            reminderSentAt: log.reminder_sent_at,
            wellnessScore: log.wellness_score ? parseFloat(log.wellness_score) : null,
            notes: log.notes,
            createdAt: log.created_at
          })),
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });
    } catch (error) {
      console.error('Wellness report error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get wellness logs'
      });
    }
  }
);

/**
 * GET /api/reports/web-stats
 * Get web activity statistics from Chrome Extension
 * No authentication required (local extension data)
 */
router.get('/web-stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Get activity breakdown for today
    // Use PostgreSQL-style placeholders ($1, $2) - database-factory will convert for SQLite
    const activityBreakdown = await query(
      `SELECT 
        activity_type,
        COUNT(*) as count
      FROM web_logs
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY activity_type`,
      [today.toISOString(), todayEnd.toISOString()]
    );

    // Calculate total and percentages
    const total = activityBreakdown.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
    
    const breakdown = {
      Productive: 0,
      Unproductive: 0,
      Meeting: 0
    };

    activityBreakdown.rows.forEach(row => {
      const type = row.activity_type;
      const count = parseInt(row.count);
      breakdown[type] = total > 0 ? Math.round((count / total) * 100) : 0;
    });

    // Get top 5 most visited domains for today
    const topSites = await query(
      `SELECT 
        domain,
        COUNT(*) as visit_count,
        activity_type
      FROM web_logs
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY domain, activity_type
      ORDER BY visit_count DESC
      LIMIT 5`,
      [today.toISOString(), todayEnd.toISOString()]
    );

    const topDomains = topSites.rows.map(row => ({
      domain: row.domain,
      visitCount: parseInt(row.visit_count),
      activityType: row.activity_type
    }));

    // Get top distractions (unproductive sites)
    const topDistractions = await query(
      `SELECT 
        domain,
        COUNT(*) as visit_count
      FROM web_logs
      WHERE timestamp >= $1 AND timestamp <= $2
        AND activity_type = 'Unproductive'
      GROUP BY domain
      ORDER BY visit_count DESC
      LIMIT 5`,
      [today.toISOString(), todayEnd.toISOString()]
    );

    const distractions = topDistractions.rows.map(row => ({
      domain: row.domain,
      visitCount: parseInt(row.visit_count)
    }));

    res.json({
      success: true,
      data: {
        breakdown: {
          productive: breakdown.Productive,
          unproductive: breakdown.Unproductive,
          meeting: breakdown.Meeting,
          total: total
        },
        topSites: topDomains,
        topDistractions: distractions
      }
    });
  } catch (error) {
    console.error('Web stats report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get web stats',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

