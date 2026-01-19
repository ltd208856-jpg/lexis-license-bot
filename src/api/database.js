const { Client } = require('pg');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    /**
     * Initialize database connection
     */
    async connect() {
        try {
            this.client = new Client({
                connectionString: config.database.url,
                ssl: config.app.environment === 'production' ? { rejectUnauthorized: false } : false
            });

            await this.client.connect();
            this.isConnected = true;
            logger.info('Database connected successfully');

            // Run initial migrations
            await this.createTables();
        } catch (error) {
            logger.error('Database connection failed:', error);
            throw error;
        }
    }

    /**
     * Create necessary tables if they don't exist
     */
    async createTables() {
        try {
            // Create redeemed_invoices table
            await this.client.query(`
                CREATE TABLE IF NOT EXISTS redeemed_invoices (
                    id SERIAL PRIMARY KEY,
                    invoice_id VARCHAR(255) UNIQUE NOT NULL,
                    discord_user_id VARCHAR(255) NOT NULL,
                    license_key TEXT NOT NULL,
                    redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    sellauth_data JSONB,
                    keyauth_response JSONB,
                    user_info JSONB
                );
            `);

            // Create rate_limits table
            await this.client.query(`
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    action_type VARCHAR(100) NOT NULL,
                    attempts INTEGER DEFAULT 1,
                    last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    reset_after TIMESTAMP,
                    UNIQUE(user_id, action_type)
                );
            `);

            // Create audit_log table
            await this.client.query(`
                CREATE TABLE IF NOT EXISTS audit_log (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(255),
                    action VARCHAR(100) NOT NULL,
                    details JSONB,
                    ip_address INET,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create indexes for performance
            await this.client.query(`
                CREATE INDEX IF NOT EXISTS idx_redeemed_invoices_user_id
                ON redeemed_invoices(discord_user_id);
            `);

            await this.client.query(`
                CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action
                ON rate_limits(user_id, action_type);
            `);

            logger.info('Database tables created/verified successfully');
        } catch (error) {
            logger.error('Database table creation failed:', error);
            throw error;
        }
    }

    /**
     * Check if an invoice has already been redeemed
     * @param {string} invoiceId - Invoice ID to check
     * @returns {boolean} - True if already redeemed
     */
    async isInvoiceRedeemed(invoiceId) {
        try {
            const result = await this.client.query(
                'SELECT id FROM redeemed_invoices WHERE invoice_id = $1',
                [invoiceId]
            );
            return result.rows.length > 0;
        } catch (error) {
            logger.error('Error checking invoice redemption status:', error);
            throw error;
        }
    }

    /**
     * Mark an invoice as redeemed
     * @param {string} invoiceId - Invoice ID
     * @param {string} userId - Discord user ID
     * @param {string} licenseKey - Generated license key
     * @param {object} sellAuthData - SellAuth response data
     * @param {object} keyAuthResponse - KeyAuth response data
     * @param {object} userInfo - Discord user information
     */
    async markInvoiceRedeemed(invoiceId, userId, licenseKey, sellAuthData, keyAuthResponse, userInfo) {
        try {
            await this.client.query(`
                INSERT INTO redeemed_invoices
                (invoice_id, discord_user_id, license_key, sellauth_data, keyauth_response, user_info)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [invoiceId, userId, licenseKey, sellAuthData, keyAuthResponse, userInfo]);

            logger.info(`Invoice ${invoiceId} marked as redeemed for user ${userId}`);
        } catch (error) {
            logger.error('Error marking invoice as redeemed:', error);
            throw error;
        }
    }

    /**
     * Check rate limit for a user action
     * @param {string} userId - User ID
     * @param {string} actionType - Type of action (e.g., 'redeem', 'attempt')
     * @param {number} maxAttempts - Maximum attempts allowed
     * @param {number} windowHours - Time window in hours
     * @returns {object} - Rate limit status
     */
    async checkRateLimit(userId, actionType, maxAttempts, windowHours) {
        try {
            const resetAfter = new Date(Date.now() + windowHours * 60 * 60 * 1000);
            const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

            // Get current rate limit status
            const result = await this.client.query(
                'SELECT attempts, reset_after FROM rate_limits WHERE user_id = $1 AND action_type = $2',
                [userId, actionType]
            );

            if (result.rows.length === 0) {
                // First attempt - create record
                await this.client.query(`
                    INSERT INTO rate_limits (user_id, action_type, attempts, reset_after)
                    VALUES ($1, $2, 1, $3)
                `, [userId, actionType, resetAfter]);

                return {
                    allowed: true,
                    attempts: 1,
                    maxAttempts,
                    resetAfter
                };
            }

            const record = result.rows[0];
            const currentResetAfter = new Date(record.reset_after);

            // Check if rate limit window has expired
            if (new Date() > currentResetAfter) {
                // Reset the counter
                await this.client.query(`
                    UPDATE rate_limits
                    SET attempts = 1, last_attempt = CURRENT_TIMESTAMP, reset_after = $3
                    WHERE user_id = $1 AND action_type = $2
                `, [userId, actionType, resetAfter]);

                return {
                    allowed: true,
                    attempts: 1,
                    maxAttempts,
                    resetAfter
                };
            }

            // Check if under the limit
            if (record.attempts < maxAttempts) {
                await this.client.query(`
                    UPDATE rate_limits
                    SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP
                    WHERE user_id = $1 AND action_type = $2
                `, [userId, actionType]);

                return {
                    allowed: true,
                    attempts: record.attempts + 1,
                    maxAttempts,
                    resetAfter: currentResetAfter
                };
            }

            // Rate limited
            return {
                allowed: false,
                attempts: record.attempts,
                maxAttempts,
                resetAfter: currentResetAfter
            };
        } catch (error) {
            logger.error('Error checking rate limit:', error);
            throw error;
        }
    }

    /**
     * Log an action for audit purposes
     * @param {string} userId - User ID
     * @param {string} action - Action performed
     * @param {object} details - Action details
     * @param {string} ipAddress - IP address (if available)
     */
    async logAction(userId, action, details, ipAddress = null) {
        try {
            await this.client.query(`
                INSERT INTO audit_log (user_id, action, details, ip_address)
                VALUES ($1, $2, $3, $4)
            `, [userId, action, details, ipAddress]);
        } catch (error) {
            logger.error('Error logging action:', error);
            // Don't throw here as audit logging shouldn't break main functionality
        }
    }

    /**
     * Get redemption statistics
     * @returns {object} - Statistics object
     */
    async getStats() {
        try {
            const [totalRedemptions, todayRedemptions, uniqueUsers] = await Promise.all([
                this.client.query('SELECT COUNT(*) as count FROM redeemed_invoices'),
                this.client.query(`
                    SELECT COUNT(*) as count FROM redeemed_invoices
                    WHERE redeemed_at >= CURRENT_DATE
                `),
                this.client.query('SELECT COUNT(DISTINCT discord_user_id) as count FROM redeemed_invoices')
            ]);

            return {
                totalRedemptions: parseInt(totalRedemptions.rows[0].count),
                todayRedemptions: parseInt(todayRedemptions.rows[0].count),
                uniqueUsers: parseInt(uniqueUsers.rows[0].count)
            };
        } catch (error) {
            logger.error('Error getting stats:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    async disconnect() {
        if (this.client && this.isConnected) {
            await this.client.end();
            this.isConnected = false;
            logger.info('Database disconnected');
        }
    }
}

module.exports = new Database();