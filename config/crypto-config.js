/**
 * Encryption Configuration
 * Manages encryption keys for database encryption at rest
 * 
 * TODO: Replace hardcoded key with environment variable or secure key management
 * For production, use:
 * - Environment variables (process.env.ENCRYPTION_KEY)
 * - Key management service (AWS KMS, Azure Key Vault, etc.)
 * - Hardware Security Module (HSM)
 */

const crypto = require('crypto');

// Hardcoded 32-byte key for development/testing
// WARNING: In production, this should come from environment variables or secure key management
const HARDCODED_KEY = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

/**
 * Get the encryption key
 * Priority:
 * 1. Environment variable (ENCRYPTION_KEY)
 * 2. Hardcoded key (development only)
 * 
 * @returns {Buffer} - 32-byte encryption key
 */
function getEncryptionKey() {
  // Check for environment variable first
  if (process.env.ENCRYPTION_KEY) {
    const envKey = process.env.ENCRYPTION_KEY;
    
    // If it's a hex string, convert it
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    
    // Otherwise, derive a 32-byte key from the string using SHA-256
    return crypto.createHash('sha256').update(envKey).digest();
  }
  
  // Fallback to hardcoded key (development only)
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY environment variable is required in production');
  }
  
  console.warn('⚠️  WARNING: Using hardcoded encryption key. This is insecure for production!');
  console.warn('⚠️  Set ENCRYPTION_KEY environment variable for secure key management.');
  
  return HARDCODED_KEY;
}

/**
 * Generate a new random encryption key (for setup/migration)
 * @returns {string} - Hex-encoded 32-byte key
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  getEncryptionKey,
  generateEncryptionKey
};

