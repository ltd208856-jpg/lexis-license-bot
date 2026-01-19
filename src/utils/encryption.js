const crypto = require('crypto');
const config = require('../config/config');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

class Encryption {
    constructor() {
        if (!config.security.encryptionKey) {
            throw new Error('Encryption key not provided in environment variables');
        }

        // Ensure key is 32 bytes
        this.key = crypto
            .createHash('sha256')
            .update(config.security.encryptionKey)
            .digest();
    }

    /**
     * Encrypt a string value
     * @param {string} text - Text to encrypt
     * @returns {string} - Base64 encoded encrypted data
     */
    encrypt(text) {
        try {
            const iv = crypto.randomBytes(IV_LENGTH);
            const cipher = crypto.createCipherGCM(ALGORITHM, this.key, iv);

            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const tag = cipher.getAuthTag();

            // Combine iv + tag + encrypted data
            const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
            return combined.toString('base64');
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt a string value
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @returns {string} - Decrypted text
     */
    decrypt(encryptedData) {
        try {
            const combined = Buffer.from(encryptedData, 'base64');

            const iv = combined.slice(0, IV_LENGTH);
            const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
            const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);

            const decipher = crypto.createDecipherGCM(ALGORITHM, this.key, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Generate a secure random string
     * @param {number} length - Length of the string
     * @returns {string} - Random string
     */
    generateSecureString(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Hash a password or sensitive string
     * @param {string} input - Input to hash
     * @param {string} salt - Optional salt
     * @returns {string} - Hashed string
     */
    hash(input, salt = null) {
        const actualSalt = salt || crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(input, actualSalt, 10000, 64, 'sha512').toString('hex');
        return `${actualSalt}:${hash}`;
    }

    /**
     * Verify a hash
     * @param {string} input - Input to verify
     * @param {string} hash - Hash to verify against
     * @returns {boolean} - True if valid
     */
    verifyHash(input, hash) {
        const [salt, originalHash] = hash.split(':');
        const computedHash = crypto.pbkdf2Sync(input, salt, 10000, 64, 'sha512').toString('hex');
        return originalHash === computedHash;
    }
}

module.exports = new Encryption();