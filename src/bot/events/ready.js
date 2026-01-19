const { Events, ActivityType } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../config/config');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        try {
            logger.info(`Bot is ready! Logged in as ${client.user.tag}`);
            logger.info(`Bot is in ${client.guilds.cache.size} servers`);

            // Set bot activity status
            client.user.setActivity({
                name: 'for license redemptions',
                type: ActivityType.Watching
            });

            // Log bot information
            logger.info(`Bot ID: ${client.user.id}`);
            logger.info(`Environment: ${config.app.environment}`);

            // Optional: Send startup notification to a specific channel
            if (config.discord.logChannelId) {
                try {
                    const logChannel = client.channels.cache.get(config.discord.logChannelId);
                    if (logChannel) {
                        await logChannel.send({
                            embeds: [{
                                title: '🤖 Bot Started',
                                description: 'License redemption bot is now online and ready to process requests.',
                                color: 0x00ff00, // Green
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: `Environment: ${config.app.environment}`
                                }
                            }]
                        });
                    }
                } catch (error) {
                    logger.warn('Failed to send startup notification:', error.message);
                }
            }

            // Schedule periodic health checks (optional)
            setInterval(async () => {
                try {
                    // Simple health check - just log bot stats
                    const stats = {
                        guilds: client.guilds.cache.size,
                        users: client.users.cache.size,
                        uptime: process.uptime(),
                        memoryUsage: process.memoryUsage()
                    };

                    logger.debug('Bot health check:', stats);
                } catch (error) {
                    logger.error('Health check failed:', error);
                }
            }, 5 * 60 * 1000); // Every 5 minutes

        } catch (error) {
            logger.error('Error in ready event:', error);
        }
    }
};