const express = require('express');
const router = express.Router();
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database-factory');
const { authenticate, enforceOrganizationAccess } = require('../middleware/auth');
const { validateTimeLog } = require('../middleware/multiTenancy');

// Configure AWS S3
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Configure multer for memory storage (we'll upload directly to S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * POST /api/log/screenshot
 * Upload screenshot to S3 and save metadata to database
 */
router.post('/screenshot',
  authenticate,
  enforceOrganizationAccess,
  upload.single('screenshot'),
  [
    body('timeLogId').optional().isUUID(),
    body('capturedAt').optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No screenshot file provided'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { timeLogId, capturedAt } = req.body;

      // Validate time log if provided
      if (timeLogId) {
        const timeLogCheck = await query(
          'SELECT id FROM time_logs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
          [timeLogId, req.user.organizationId]
        );

        if (timeLogCheck.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Time log not found or does not belong to your organization'
          });
        }
      }

      // Generate unique S3 key
      const fileExtension = req.file.originalname.split('.').pop() || 'png';
      const s3Key = `screenshots/${req.user.organizationId}/${req.user.id}/${uuidv4()}.${fileExtension}`;

      // Upload to S3
      const s3Params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
        ACL: 'private', // Make files private by default
        Metadata: {
          'user-id': req.user.id,
          'organization-id': req.user.organizationId,
          'uploaded-at': new Date().toISOString()
        }
      };

      const s3Result = await s3.upload(s3Params).promise();

      // Generate presigned URL for access (valid for 1 hour)
      const presignedUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: s3Key,
        Expires: 3600 // 1 hour
      });

      // Save metadata to database
      const result = await query(
        `INSERT INTO screenshots (
          organization_id, user_id, time_log_id,
          s3_key, s3_url, file_size, mime_type,
          captured_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, s3_key, s3_url, captured_at, created_at`,
        [
          req.user.organizationId,
          req.user.id,
          timeLogId || null,
          s3Key,
          s3Result.Location,
          req.file.size,
          req.file.mimetype,
          capturedAt || new Date().toISOString()
        ]
      );

      const screenshot = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Screenshot uploaded successfully',
        data: {
          screenshot: {
            id: screenshot.id,
            s3Key: screenshot.s3_key,
            s3Url: screenshot.s3_url,
            presignedUrl: presignedUrl, // Temporary access URL
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            capturedAt: screenshot.captured_at,
            createdAt: screenshot.created_at
          }
        }
      });
    } catch (error) {
      console.error('Screenshot upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload screenshot',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * GET /api/log/screenshot/:id
 * Get screenshot metadata and presigned URL
 */
router.get('/screenshot/:id',
  authenticate,
  enforceOrganizationAccess,
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await query(
        `SELECT id, s3_key, s3_url, file_size, mime_type, captured_at, created_at
         FROM screenshots
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [id, req.user.organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Screenshot not found'
        });
      }

      const screenshot = result.rows[0];

      // Generate presigned URL
      const presignedUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: screenshot.s3_key,
        Expires: 3600 // 1 hour
      });

      res.json({
        success: true,
        data: {
          screenshot: {
            id: screenshot.id,
            s3Key: screenshot.s3_key,
            s3Url: screenshot.s3_url,
            presignedUrl: presignedUrl,
            fileSize: parseInt(screenshot.file_size),
            mimeType: screenshot.mime_type,
            capturedAt: screenshot.captured_at,
            createdAt: screenshot.created_at
          }
        }
      });
    } catch (error) {
      console.error('Get screenshot error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get screenshot'
      });
    }
  }
);

/**
 * GET /api/log/screenshots
 * Get all screenshots for the authenticated user
 */
router.get('/screenshots',
  authenticate,
  enforceOrganizationAccess,
  async (req, res) => {
    try {
      const { startDate, endDate, timeLogId, limit = 50, offset = 0 } = req.query;

      let queryText = `
        SELECT id, s3_key, s3_url, file_size, mime_type, captured_at, created_at
        FROM screenshots
        WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL
      `;

      const queryParams = [req.user.organizationId, req.user.id];
      let paramIndex = 3;

      if (startDate) {
        queryText += ` AND captured_at >= $${paramIndex}`;
        queryParams.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        queryText += ` AND captured_at <= $${paramIndex}`;
        queryParams.push(endDate);
        paramIndex++;
      }

      if (timeLogId) {
        queryText += ` AND time_log_id = $${paramIndex}`;
        queryParams.push(timeLogId);
        paramIndex++;
      }

      queryText += ` ORDER BY captured_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(parseInt(limit), parseInt(offset));

      const result = await query(queryText, queryParams);

      // Generate presigned URLs for each screenshot
      const screenshots = await Promise.all(
        result.rows.map(async (screenshot) => {
          const presignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: screenshot.s3_key,
            Expires: 3600
          });

          return {
            id: screenshot.id,
            s3Key: screenshot.s3_key,
            s3Url: screenshot.s3_url,
            presignedUrl: presignedUrl,
            fileSize: parseInt(screenshot.file_size),
            mimeType: screenshot.mime_type,
            capturedAt: screenshot.captured_at,
            createdAt: screenshot.created_at
          };
        })
      );

      res.json({
        success: true,
        data: {
          screenshots,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });
    } catch (error) {
      console.error('Get screenshots error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get screenshots'
      });
    }
  }
);

module.exports = router;

