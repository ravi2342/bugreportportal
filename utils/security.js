/**
 * Security Enhancements for Bug Report Portal
 * Addresses SonarQube security hotspots and best practices
 */

/**
 * SECURITY HOTSPOT 1: Cookie Security Flags
 * Issue: Missing security flags on authentication cookie
 * Fix: Add httpOnly, sameSite, secure flags
 * Status: ✅ Already implemented in login route (line ~250)
 * 
 * Current code in app.js:
 * res.cookie(AUTH_COOKIE_NAME, username, {
 *   signed: true,
 *   httpOnly: true,
 *   sameSite: 'lax',
 *   maxAge: 7 * 24 * 60 * 60 * 1000
 * });
 * 
 * Recommendations:
 * - Add `secure: true` in production (requires HTTPS)
 * - Consider shortening maxAge to 24 hours instead of 7 days
 */

/**
 * SECURITY HOTSPOT 2: Input Validation
 * Issue: Form inputs not validated before processing
 * Fix: Add strict validation for all user inputs
 * Status: ⚠️ NEEDS IMPROVEMENT
 */
const inputValidation = {
  /**
   * Validate incident creation payload
   */
  validateIncidentCreation: (payload) => {
    const errors = [];

    if (!payload.title || typeof payload.title !== 'string' || payload.title.trim().length === 0) {
      errors.push('Title is required and must be non-empty');
    }
    if (payload.title && payload.title.length > 500) {
      errors.push('Title must not exceed 500 characters');
    }

    if (payload.description && typeof payload.description !== 'string') {
      errors.push('Description must be a string');
    }
    if (payload.description && payload.description.length > 5000) {
      errors.push('Description must not exceed 5000 characters');
    }

    const validPriorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!payload.priority || !validPriorities.includes(payload.priority.toUpperCase())) {
      errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
    }

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'DONE', 'RESOLVED', 'CLOSED'];
    if (payload.status && !validStatuses.includes(payload.status.toUpperCase())) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    if (payload.assignee && payload.assignee.length > 100) {
      errors.push('Assignee name must not exceed 100 characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate comment creation
   */
  validateCommentCreation: (text) => {
    const errors = [];

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      errors.push('Comment cannot be empty');
    }
    if (text && text.length > 2000) {
      errors.push('Comment must not exceed 2000 characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Validate search query
   */
  validateSearchQuery: (query) => {
    if (!query) return { valid: true };
    if (typeof query !== 'string') {
      return { valid: false, errors: ['Query must be a string'] };
    }
    if (query.length > 500) {
      return { valid: false, errors: ['Query must not exceed 500 characters'] };
    }
    return { valid: true };
  },

  /**
   * Sanitize string input (basic XSS prevention)
   */
  sanitizeInput: (input) => {
    if (typeof input !== 'string') return input;
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
};

/**
 * SECURITY HOTSPOT 3: File Upload Security
 * Issue: File uploads not validated
 * Fix: Add file type and size restrictions
 * Status: ⚠️ NEEDS IMPROVEMENT
 */
const uploadSecurityConfig = {
  /**
   * Validate uploaded file
   */
  validateFile: (file) => {
    const errors = [];
    const maxSizeMB = 5;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors };
    }

    // Check file size
    if (file.size > maxSizeBytes) {
      errors.push(`File size must not exceed ${maxSizeMB}MB`);
    }

    // Allowed MIME types
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`File type must be one of: ${allowedMimeTypes.join(', ')}`);
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = file.originalname.substring(file.originalname.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      errors.push(`File extension must be one of: ${allowedExtensions.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
};

/**
 * SECURITY HOTSPOT 4: Rate Limiting
 * Issue: No rate limiting on login attempts
 * Fix: Implement login attempt throttling
 * Status: ⚠️ NEEDS IMPLEMENTATION
 */
const rateLimitConfig = {
  maxLoginAttempts: 5,
  lockoutDurationMs: 15 * 60 * 1000, // 15 minutes
  attemptWindow: 10 * 60 * 1000, // 10 minute window

  /**
   * Track login attempts in memory (use Redis in production)
   */
  loginAttempts: new Map(),

  /**
   * Check if IP is locked out
   */
  isLockedOut: (ip) => {
    const record = rateLimitConfig.loginAttempts.get(ip);
    if (!record) return false;
    if (Date.now() - record.lastAttempt > rateLimitConfig.lockoutDurationMs) {
      rateLimitConfig.loginAttempts.delete(ip);
      return false;
    }
    return record.attempts >= rateLimitConfig.maxLoginAttempts;
  },

  /**
   * Record login attempt
   */
  recordAttempt: (ip) => {
    const record = rateLimitConfig.loginAttempts.get(ip) || { attempts: 0, lastAttempt: Date.now() };
    const now = Date.now();

    if (now - record.lastAttempt > rateLimitConfig.attemptWindow) {
      record.attempts = 1;
    } else {
      record.attempts += 1;
    }

    record.lastAttempt = now;
    rateLimitConfig.loginAttempts.set(ip, record);
  }
};

/**
 * SECURITY HOTSPOT 5: Error Handling
 * Issue: Verbose error messages in responses
 * Fix: Generic error messages to users, detailed logs for admins
 * Status: ⚠️ NEEDS IMPROVEMENT
 */
const secureErrorHandling = {
  /**
   * Get safe error message for client
   */
  getSafeErrorMessage: (error) => {
    if (error.message && error.message.includes('Database')) {
      return 'A database error occurred. Please try again later.';
    }
    if (error.message && error.message.includes('ENOENT')) {
      return 'The requested resource was not found.';
    }
    return 'An unexpected error occurred. Please try again.';
  },

  /**
   * Log detailed error for debugging
   */
  logDetailedError: (error, context = {}) => {
    console.error('[ERROR LOG]', {
      timestamp: new Date().toISOString(),
      message: error.message,
      stack: error.stack,
      context
    });
  }
};

/**
 * SECURITY HOTSPOT 6: CSRF Protection
 * Issue: No CSRF tokens in forms
 * Fix: Implement CSRF token generation and validation
 * Status: ⚠️ NEEDS IMPLEMENTATION
 */
const csrfProtection = {
  tokens: new Map(), // In production, use database or Redis

  /**
   * Generate CSRF token
   */
  generateToken: (sessionId) => {
    const token = require('crypto').randomBytes(32).toString('hex');
    csrfProtection.tokens.set(sessionId, token);
    return token;
  },

  /**
   * Validate CSRF token
   */
  validateToken: (sessionId, token) => {
    const stored = csrfProtection.tokens.get(sessionId);
    return stored === token;
  }
};

/**
 * SECURITY HOTSPOT 7: SQL Injection Prevention
 * Issue: User data passed to Prisma (technically safe, but audit concern)
 * Fix: Ensure all Prisma queries use parameterized operations (already done)
 * Status: ✅ SAFE - Prisma handles this automatically
 */

/**
 * SECURITY HOTSPOT 8: Logging & Monitoring
 * Issue: Sensitive data may be logged
 * Fix: Filter sensitive data from logs
 * Status: ⚠️ NEEDS IMPROVEMENT
 */
const secureLogging = {
  /**
   * Filter sensitive fields from log output
   */
  filterSensitiveData: (data) => {
    const filtered = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'sessionId'];

    for (const field of sensitiveFields) {
      if (field in filtered) {
        filtered[field] = '***REDACTED***';
      }
    }

    return filtered;
  }
};

module.exports = {
  inputValidation,
  uploadSecurityConfig,
  rateLimitConfig,
  secureErrorHandling,
  csrfProtection,
  secureLogging
};
