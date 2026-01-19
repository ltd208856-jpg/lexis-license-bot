const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class SellAuthAPI {
    constructor() {
        this.apiUrl = config.sellauth.apiUrl;
        this.apiKey = config.sellauth.apiKey;
        this.shopId = config.sellauth.shopId;
        this.productId = config.sellauth.productId;
        this.timeout = config.sellauth.timeout;

        if (!this.apiKey) {
            throw new Error('SellAuth API key not provided in environment variables');
        }

        if (!this.shopId) {
            throw new Error('SellAuth Shop ID not provided in environment variables');
        }

        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: this.timeout,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'User-Agent': 'Discord-License-Bot/1.0'
            }
        });

        // Request interceptor for logging
        this.client.interceptors.request.use(
            (config) => {
                logger.debug(`SellAuth API Request: ${config.method.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('SellAuth API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Response interceptor for logging
        this.client.interceptors.response.use(
            (response) => {
                logger.debug(`SellAuth API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                logger.error(`SellAuth API Error: ${error.response?.status || 'Unknown'} ${error.config?.url}`);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Verify an invoice by ID
     * @param {string} invoiceId - Invoice ID to verify
     * @returns {object} - Invoice verification result
     */
    async verifyInvoice(invoiceId) {
        try {
            logger.info(`Verifying invoice: ${invoiceId}`);

            // Format invoice ID (remove any extra characters, ensure proper format)
            const cleanInvoiceId = this.sanitizeInvoiceId(invoiceId);

            const response = await this.client.get(`/shops/${this.shopId}/invoices/${cleanInvoiceId}`);
            const invoiceData = response.data;

            // Validate the response structure
            if (!invoiceData || !invoiceData.id) {
                throw new Error('Invalid response from SellAuth API');
            }

            // Verify the invoice meets our criteria
            const verification = this.validateInvoice(invoiceData);

            logger.info(`Invoice verification completed for ${invoiceId}: ${verification.valid ? 'VALID' : 'INVALID'}`);

            return {
                valid: verification.valid,
                reason: verification.reason,
                invoiceData: invoiceData,
                verifiedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error(`Invoice verification failed for ${invoiceId}:`, error.message);

            // Handle specific error cases
            if (error.response) {
                const status = error.response.status;
                const message = error.response.data?.message || error.message;

                switch (status) {
                    case 404:
                        return {
                            valid: false,
                            reason: 'Invoice not found. Please check your invoice ID.',
                            error: 'INVOICE_NOT_FOUND'
                        };
                    case 401:
                        return {
                            valid: false,
                            reason: 'Authentication failed. Please contact support.',
                            error: 'AUTHENTICATION_FAILED'
                        };
                    case 403:
                        return {
                            valid: false,
                            reason: 'Access denied. Please contact support.',
                            error: 'ACCESS_DENIED'
                        };
                    case 429:
                        return {
                            valid: false,
                            reason: 'Rate limit exceeded. Please try again later.',
                            error: 'RATE_LIMITED'
                        };
                    default:
                        return {
                            valid: false,
                            reason: `API Error: ${message}`,
                            error: 'API_ERROR'
                        };
                }
            }

            return {
                valid: false,
                reason: 'Unable to verify invoice. Please try again later.',
                error: 'NETWORK_ERROR'
            };
        }
    }

    /**
     * Validate invoice data meets our requirements
     * @param {object} invoiceData - Invoice data from SellAuth
     * @returns {object} - Validation result
     */
    validateInvoice(invoiceData) {
        try {
            // Check if invoice is paid
            if (!invoiceData.paid || invoiceData.status !== 'paid') {
                return {
                    valid: false,
                    reason: 'Invoice is not marked as paid. Please complete your payment first.'
                };
            }

            // Accept any product from our shop - no specific product validation
            // This allows UG, Animal Company, and all other products to work
            logger.info(`Invoice is for product: ${invoiceData.product_name} (ID: ${invoiceData.product_id})`);

            // Check if invoice is not too old (optional - 30 days)
            const invoiceDate = new Date(invoiceData.created_at);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            if (invoiceDate < thirtyDaysAgo) {
                return {
                    valid: false,
                    reason: 'This invoice is too old to redeem. Invoices must be redeemed within 30 days.'
                };
            }

            // Check if amount is reasonable (basic sanity check)
            if (!invoiceData.amount || invoiceData.amount <= 0) {
                return {
                    valid: false,
                    reason: 'Invalid invoice amount.'
                };
            }

            // All checks passed
            return {
                valid: true,
                reason: 'Invoice is valid and can be redeemed.'
            };

        } catch (error) {
            logger.error('Invoice validation error:', error);
            return {
                valid: false,
                reason: 'Error validating invoice data.'
            };
        }
    }

    /**
     * Sanitize and format invoice ID
     * @param {string} invoiceId - Raw invoice ID
     * @returns {string} - Clean invoice ID
     */
    sanitizeInvoiceId(invoiceId) {
        if (!invoiceId || typeof invoiceId !== 'string') {
            throw new Error('Invalid invoice ID format');
        }

        // Remove whitespace and convert to uppercase if needed
        let clean = invoiceId.trim();

        // Basic format validation (adjust based on SellAuth format)
        if (clean.length < 5 || clean.length > 50) {
            throw new Error('Invoice ID must be between 5 and 50 characters');
        }

        // Remove any potentially harmful characters
        clean = clean.replace(/[^a-zA-Z0-9\-_]/g, '');

        if (!clean) {
            throw new Error('Invoice ID contains invalid characters');
        }

        return clean;
    }

    /**
     * Get invoice details for logging/audit purposes
     * @param {object} invoiceData - Invoice data
     * @returns {object} - Sanitized invoice details
     */
    extractInvoiceDetails(invoiceData) {
        return {
            invoiceId: invoiceData.id,
            productId: invoiceData.product_id,
            productName: invoiceData.product_name,
            amount: invoiceData.amount,
            currency: invoiceData.currency,
            customerEmail: invoiceData.customer_email,
            customerName: invoiceData.customer_name,
            createdAt: invoiceData.created_at,
            paidAt: invoiceData.paid_at,
            status: invoiceData.status
        };
    }

    /**
     * Test API connection
     * @returns {boolean} - True if API is accessible
     */
    async testConnection() {
        try {
            // Try to make a simple request to test connectivity
            const response = await this.client.get('/ping');
            return response.status === 200;
        } catch (error) {
            logger.error('SellAuth API connection test failed:', error.message);
            return false;
        }
    }
}

module.exports = new SellAuthAPI();