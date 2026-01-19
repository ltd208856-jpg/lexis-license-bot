const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class Database {
    constructor() {
        this.db = null;
        this.isConnected = false;
        this.dbPath = this.getDatabasePath();
    }

    /**
     * Get database path for SQLite
     */
    getDatabasePath() {
        if (config.database.url.startsWith('sqlite:')) {
            return config.database.url.replace('sqlite:', '');
        }
        return './licenses.db'; // Default SQLite database file
    }

    /**
     * Initialize database connection
     */
    async connect() {
        return new Promise((resolve, reject) => {
            try {
                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        logger.error('Database connection failed:', err);
                        reject(err);
                        return;
                    }

                    this.isConnected = true;
                    logger.info(`SQLite database connected: ${this.dbPath}`);

                    // Run initial migrations
                    this.createTables().then(() => {
                        resolve();
                    }).catch(reject);
                });
            } catch (error) {
                logger.error('Database connection failed:', error);
                reject(error);
            }
        });
    }

    /**
     * Create required tables
     */
    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS redeemed_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id TEXT UNIQUE NOT NULL,
                discord_user_id TEXT NOT NULL,
                discord_username TEXT,
                license_key TEXT NOT NULL,
                product_name TEXT,
                product_id TEXT,
                amount REAL,
                currency TEXT,
                customer_email TEXT,
                redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sellauth_data TEXT,
                keyauth_response TEXT,
                user_metadata TEXT
            )`,

            `CREATE TABLE IF NOT EXISTS rate_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                attempts INTEGER DEFAULT 1,
                first_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP,
                reset_after DATETIME,
                UNIQUE(user_id, action)
            )`,

            `CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                data TEXT,
                ip_address TEXT,
                user_agent TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }

        logger.info('Database tables created/verified');
    }

    /**
     * Run a query with parameters
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error('Database query failed:', err);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Get a single row
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('Database query failed:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Get multiple rows
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('Database query failed:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Check if invoice has already been redeemed
     */
    async isInvoiceRedeemed(invoiceId) {
        try {
            const result = await this.get(
                'SELECT id FROM redeemed_invoices WHERE invoice_id = ?',
                [invoiceId]
            );
            return !!result;
        } catch (error) {
            logger.error('Error checking invoice redemption:', error);
            throw error;
        }
    }

    /**
     * Mark invoice as redeemed
     */
    async markInvoiceRedeemed(invoiceId, userId, licenseKey, invoiceDetails, keyAuthResponse, userMetadata) {
        try {
            const result = await this.run(
                `INSERT INTO redeemed_invoices (
                    invoice_id, discord_user_id, discord_username, license_key,
                    product_name, product_id, amount, currency, customer_email,
                    sellauth_data, keyauth_response, user_metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invoiceId,
                    userId,
                    userMetadata?.username || null,
                    licenseKey,
                    invoiceDetails?.productName || null,
                    invoiceDetails?.productId || null,
                    invoiceDetails?.amount || null,
                    invoiceDetails?.currency || null,
                    invoiceDetails?.customerEmail || null,
                    JSON.stringify(invoiceDetails),
                    JSON.stringify(keyAuthResponse),
                    JSON.stringify(userMetadata)
                ]
            );

            logger.info(`Invoice ${invoiceId} marked as redeemed for user ${userId}`);
            return result;
        } catch (error) {
            logger.error('Error marking invoice as redeemed:', error);
            throw error;
        }
    }

    /**
     * Check rate limits for a user
     */
    async checkRateLimit(userId, action, maxAttempts, timeWindowHours) {
        try {
            const timeWindow = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

            const result = await this.get(
                'SELECT * FROM rate_limits WHERE user_id = ? AND action = ? AND first_attempt > ?',
                [userId, action, timeWindow.toISOString()]
            );

            if (!result) {
                // No recent attempts, allow and create new record
                await this.run(
                    `INSERT OR REPLACE INTO rate_limits
                     (user_id, action, attempts, first_attempt, last_attempt, reset_after)
                     VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
                    [userId, action, new Date(Date.now() + timeWindowHours * 60 * 60 * 1000).toISOString()]
                );

                return {
                    allowed: true,
                    attempts: 1,
                    maxAttempts,
                    resetAfter: new Date(Date.now() + timeWindowHours * 60 * 60 * 1000)
                };
            }

            if (result.attempts >= maxAttempts) {
                // Rate limit exceeded
                return {
                    allowed: false,
                    attempts: result.attempts,
                    maxAttempts,
                    resetAfter: new Date(result.reset_after)
                };
            }

            // Increment attempts
            await this.run(
                'UPDATE rate_limits SET attempts = attempts + 1, last_attempt = CURRENT_TIMESTAMP WHERE user_id = ? AND action = ?',
                [userId, action]
            );

            return {
                allowed: true,
                attempts: result.attempts + 1,
                maxAttempts,
                resetAfter: new Date(result.reset_after)
            };

        } catch (error) {
            logger.error('Error checking rate limit:', error);
            throw error;
        }
    }

    /**
     * Log user actions for audit purposes
     */
    async logAction(userId, action, data = {}, ipAddress = null, userAgent = null) {
        try {
            await this.run(
                `INSERT INTO audit_log (user_id, action, data, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    userId,
                    action,
                    JSON.stringify(data),
                    ipAddress,
                    userAgent
                ]
            );

            logger.debug(`Logged action: ${action} for user ${userId}`);
        } catch (error) {
            logger.error('Error logging action:', error);
            // Don't throw error for audit logging failures
        }
    }

    /**
     * Get all license keys for a specific Discord user
     */
    async getUserLicenses(userId) {
        try {
            const result = await this.all(
                `SELECT invoice_id, license_key, product_name, product_id,
                        amount, currency, redeemed_at
                 FROM redeemed_invoices
                 WHERE discord_user_id = ?
                 ORDER BY redeemed_at DESC`,
                [userId]
            );

            logger.info(`Retrieved ${result.length} licenses for user ${userId}`);
            return result;
        } catch (error) {
            logger.error('Error getting user licenses:', error);
            throw error;
        }
    }

    /**
     * Get redemption statistics
     */
    async getRedemptionStats() {
        try {
            const totalRedemptions = await this.get('SELECT COUNT(*) as count FROM redeemed_invoices');
            const todayRedemptions = await this.get(
                `SELECT COUNT(*) as count FROM redeemed_invoices
                 WHERE date(redeemed_at) = date('now')`
            );

            return {
                total: totalRedemptions.count,
                today: todayRedemptions.count
            };
        } catch (error) {
            logger.error('Error getting redemption stats:', error);
            throw error;
        }
    }

    /**
     * Close database connection
     */
    async disconnect() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        logger.error('Error closing database:', err);
                    } else {
                        logger.info('Database connection closed');
                    }
                    this.isConnected = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            await this.get('SELECT 1');
            return true;
        } catch (error) {
            logger.error('Database connection test failed:', error);
            return false;
        }
    }
}

module.exports = new Database();