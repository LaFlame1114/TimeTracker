const { query } = require('../config/database-factory');

/**
 * Multi-tenancy middleware
 * Ensures all queries are scoped to the user's organization
 * This adds an extra layer of security by validating organization access
 */

/**
 * Validates that a resource belongs to the user's organization
 */
const validateOrganizationResource = async (req, resourceId, resourceTable, idColumn = 'id') => {
  try {
    const result = await query(
      `SELECT organization_id FROM ${resourceTable} 
       WHERE ${idColumn} = $1 AND deleted_at IS NULL`,
      [resourceId]
    );

    if (result.rows.length === 0) {
      return { valid: false, message: 'Resource not found' };
    }

    if (result.rows[0].organization_id !== req.user.organizationId) {
      return { valid: false, message: 'Resource does not belong to your organization' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Organization validation error:', error);
    return { valid: false, message: 'Validation failed' };
  }
};

/**
 * Middleware to validate project belongs to organization
 */
const validateProject = async (req, res, next) => {
  const projectId = req.body.projectId || req.params.projectId || req.query.projectId;
  
  if (!projectId) {
    return next(); // Let the route handle missing projectId
  }

  const validation = await validateOrganizationResource(req, projectId, 'projects');
  
  if (!validation.valid) {
    return res.status(403).json({
      success: false,
      message: validation.message
    });
  }

  next();
};

/**
 * Middleware to validate task belongs to organization
 */
const validateTask = async (req, res, next) => {
  const taskId = req.body.taskId || req.params.taskId || req.query.taskId;
  
  if (!taskId) {
    return next(); // Let the route handle missing taskId
  }

  const validation = await validateOrganizationResource(req, taskId, 'tasks');
  
  if (!validation.valid) {
    return res.status(403).json({
      success: false,
      message: validation.message
    });
  }

  next();
};

/**
 * Middleware to validate time log belongs to organization
 */
const validateTimeLog = async (req, res, next) => {
  const timeLogId = req.body.timeLogId || req.params.timeLogId || req.query.timeLogId;
  
  if (!timeLogId) {
    return next();
  }

  const validation = await validateOrganizationResource(req, timeLogId, 'time_logs');
  
  if (!validation.valid) {
    return res.status(403).json({
      success: false,
      message: validation.message
    });
  }

  next();
};

module.exports = {
  validateOrganizationResource,
  validateProject,
  validateTask,
  validateTimeLog
};

