const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess } = require('../middleware/auth');

/**
 * POST /api/log/wellness
 * Log a wellness reminder acknowledgment
 */
router.post('/wellness',
  authenticate,
  enforceOrganizationAccess,
  [
    body('wellnessType').isIn(['standup', 'hydration', 'stretch', 'micro_exercise']),
    body('reminderSentAt').isISO8601(),
    body('wellnessScore').optional().isFloat({ min: 0, max: 100 }),
    body('notes').optional().isString().trim(),
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

      const { wellnessType, reminderSentAt, wellnessScore, notes } = req.body;
      const acknowledgedAt = new Date().toISOString();

      const result = await query(
        `INSERT INTO wellness_logs (
          organization_id, user_id, wellness_type,
          acknowledged_at, reminder_sent_at, wellness_score, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, wellness_type, acknowledged_at, reminder_sent_at, wellness_score, created_at`,
        [
          req.user.organizationId,
          req.user.id,
          wellnessType,
          acknowledgedAt,
          reminderSentAt,
          wellnessScore || null,
          notes || null
        ]
      );

      const wellnessLog = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Wellness log created successfully',
        data: {
          wellnessLog: {
            id: wellnessLog.id,
            wellnessType: wellnessLog.wellness_type,
            acknowledgedAt: wellnessLog.acknowledged_at,
            reminderSentAt: wellnessLog.reminder_sent_at,
            wellnessScore: wellnessLog.wellness_score ? parseFloat(wellnessLog.wellness_score) : null,
            createdAt: wellnessLog.created_at
          }
        }
      });
    } catch (error) {
      console.error('Wellness log creation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create wellness log',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;

