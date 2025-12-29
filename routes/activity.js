const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../config/database-factory');

/**
 * Meeting domains - Tagged as 'Meeting'
 */
const MEETING_DOMAINS = [
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com'
];

/**
 * Unproductive domains - Tagged as 'Unproductive'
 */
const UNPRODUCTIVE_DOMAINS = [
  'youtube.com',
  'facebook.com',
  'instagram.com'
];

/**
 * Classify domain activity type
 * @param {string} domain - Domain name
 * @returns {string} - 'Meeting', 'Unproductive', or 'Productive'
 */
function classifyActivity(domain) {
  if (!domain) return 'Productive';
  
  const normalizedDomain = domain.toLowerCase().trim();
  
  // Check for meeting domains
  if (MEETING_DOMAINS.some(meetingDomain => normalizedDomain.includes(meetingDomain))) {
    return 'Meeting';
  }
  
  // Check for unproductive domains
  if (UNPRODUCTIVE_DOMAINS.some(unproductiveDomain => normalizedDomain === unproductiveDomain)) {
    return 'Unproductive';
  }
  
  // Default to productive
  return 'Productive';
}

/**
 * POST /api/activity/url
 * Receive URL activity from Chrome Extension
 * No authentication required (local extension)
 */
router.post('/url',
  [
    body('domain').isString().trim().notEmpty(),
    body('timestamp').isInt({ min: 0 }),
    body('url').optional().isString().trim()
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

      const { domain, timestamp, url } = req.body;

      // Classify activity
      const activityType = classifyActivity(domain);

      // Log to console
      console.log(`📊 Received URL: ${domain} (Type: ${activityType})`);

      // Determine database type
      const dbType = process.env.DB_TYPE || (process.env.EMBEDDED_MODE === 'true' ? 'sqlite' : 'postgresql');

      if (dbType === 'sqlite') {
        // SQLite implementation - use execute method
        const db = await getClient();
        const logEntry = {
          id: Date.now().toString(),
          domain: domain,
          url: url || `https://${domain}`,
          activity_type: activityType,
          timestamp: new Date(timestamp).toISOString(),
          created_at: new Date().toISOString()
        };

        await db.execute(
          `INSERT INTO web_logs (id, domain, url, activity_type, timestamp, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            logEntry.id,
            logEntry.domain,
            logEntry.url,
            logEntry.activity_type,
            logEntry.timestamp,
            logEntry.created_at
          ]
        );

        res.json({
          success: true,
          message: 'URL activity logged',
          data: {
            id: logEntry.id,
            domain: logEntry.domain,
            activityType: logEntry.activity_type,
            timestamp: logEntry.timestamp
          }
        });
        return;
      } else {
        // PostgreSQL implementation
        const result = await query(
          `INSERT INTO web_logs (domain, url, activity_type, timestamp, created_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, domain, activity_type, timestamp`,
          [
            domain,
            url || `https://${domain}`,
            activityType,
            new Date(timestamp),
            new Date()
          ]
        );

        res.json({
          success: true,
          message: 'URL activity logged',
          data: {
            id: result.rows[0].id,
            domain: result.rows[0].domain,
            activityType: result.rows[0].activity_type,
            timestamp: result.rows[0].timestamp
          }
        });
      }
    } catch (error) {
      console.error('Error processing URL activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to log URL activity',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

module.exports = router;

