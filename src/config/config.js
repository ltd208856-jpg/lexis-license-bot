require('dotenv').config();

module.exports = {
    // Discord Configuration
    discord: {
        token: process.env.DISCORD_BOT_TOKEN,
        clientId: process.env.DISCORD_CLIENT_ID,
        guildId: process.env.DISCORD_GUILD_ID || null // null for global commands
    },

    // SellAuth Configuration
    sellauth: {
        apiKey: process.env.SELLAUTH_API_KEY,
        apiUrl: process.env.SELLAUTH_API_URL || 'https://api.mysellauth.com/v1',
        shopId: process.env.SELLAUTH_SHOP_ID,
        productId: process.env.SELLAUTH_PRODUCT_ID,
        timeout: 10000 // 10 seconds
    },

    // KeyAuth Configuration
    keyauth: {
        name: process.env.KEYAUTH_NAME || "Ltd208856's Application",
        ownerId: process.env.KEYAUTH_OWNERID || 'bvLogTU3Fd',
        version: process.env.KEYAUTH_VERSION || '1.0',
        url: process.env.KEYAUTH_URL || 'https://keyauth.win/api/1.3/',
        secret: process.env.KEYAUTH_SECRET
    },

    // Database Configuration
    database: {
        url: process.env.DATABASE_URL || 'sqlite:./database/licenses.db'
    },

    // Security Configuration
    security: {
        encryptionKey: process.env.ENCRYPTION_KEY,
        jwtSecret: process.env.JWT_SECRET,
        rateLimits: {
            redemptionsPerDay: 1,
            attemptsPerHour: 5,
            globalRequestsPerMinute: 60
        }
    },

    // Application Configuration
    app: {
        environment: process.env.NODE_ENV || 'development',
        port: process.env.PORT || 3000,
        logLevel: process.env.LOG_LEVEL || 'info'
    }
};