const winston = require('winston');
const config = require('../config/config');

const logger = winston.createLogger({
    level: config.app.logLevel,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, stack }) => {
            return `${timestamp} ${level}: ${stack || message}`;
        })
    ),
    defaultMeta: { service: 'discord-license-bot' },
    transports: [
        // Console transport for development and Heroku logs
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Add file transport for production if not on Heroku
if (config.app.environment === 'production' && !process.env.DYNO) {
    logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
    }));
    logger.add(new winston.transports.File({
        filename: 'logs/combined.log'
    }));
}

module.exports = logger;