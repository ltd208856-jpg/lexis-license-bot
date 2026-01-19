const { Client, Collection, GatewayIntentBits, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs').promises;
const path = require('path');

const config = require('../config/config');
const logger = require('../utils/logger');
const database = require('../api/database');
const keyauth = require('../api/keyauth');
const sellauth = require('../api/sellauth');

class DiscordBot {
    constructor() {
        // Create Discord client with required intents
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages
            ]
        });

        // Collections for commands and events
        this.client.commands = new Collection();
        this.commands = [];

        // Bind methods
        this.loadCommands = this.loadCommands.bind(this);
        this.loadEvents = this.loadEvents.bind(this);
        this.deployCommands = this.deployCommands.bind(this);
    }

    /**
     * Initialize the bot
     */
    async initialize() {
        try {
            logger.info('Initializing Discord License Bot...');

            // Connect to database
            await database.connect();
            logger.info('Database connected successfully');

            // Test external APIs
            await this.testAPIs();

            // Load commands and events
            await this.loadCommands();
            await this.loadEvents();

            // Deploy commands to Discord
            await this.deployCommands();

            // Login to Discord
            await this.client.login(config.discord.token);

            logger.info('Bot initialization completed successfully');

        } catch (error) {
            logger.error('Bot initialization failed:', error);
            process.exit(1);
        }
    }

    /**
     * Test external API connections
     */
    async testAPIs() {
        try {
            logger.info('Testing external API connections...');

            // Test KeyAuth connection
            const keyauthTest = await keyauth.testConnection();
            if (keyauthTest) {
                logger.info('✅ KeyAuth API connection successful');
            } else {
                logger.warn('⚠️  KeyAuth API connection failed - license creation may not work');
            }

            // Test SellAuth connection (if API key is provided)
            if (config.sellauth.apiKey) {
                const sellauthTest = await sellauth.testConnection();
                if (sellauthTest) {
                    logger.info('✅ SellAuth API connection successful');
                } else {
                    logger.warn('⚠️  SellAuth API connection failed - invoice verification may not work');
                }
            } else {
                logger.warn('⚠️  SellAuth API key not provided - invoice verification disabled');
            }

        } catch (error) {
            logger.error('API testing failed:', error);
        }
    }

    /**
     * Load all command files
     */
    async loadCommands() {
        try {
            const commandsPath = path.join(__dirname, 'commands');
            const commandFiles = await fs.readdir(commandsPath);
            const jsFiles = commandFiles.filter(file => file.endsWith('.js'));

            for (const file of jsFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);

                if ('data' in command && 'execute' in command) {
                    this.client.commands.set(command.data.name, command);
                    this.commands.push(command.data.toJSON());
                    logger.info(`Loaded command: ${command.data.name}`);
                } else {
                    logger.warn(`Command at ${filePath} is missing required "data" or "execute" property`);
                }
            }

            logger.info(`Loaded ${this.commands.length} commands`);
        } catch (error) {
            logger.error('Failed to load commands:', error);
        }
    }

    /**
     * Load all event files
     */
    async loadEvents() {
        try {
            const eventsPath = path.join(__dirname, 'events');
            const eventFiles = await fs.readdir(eventsPath);
            const jsFiles = eventFiles.filter(file => file.endsWith('.js'));

            for (const file of jsFiles) {
                const filePath = path.join(eventsPath, file);
                const event = require(filePath);

                if (event.once) {
                    this.client.once(event.name, (...args) => event.execute(...args));
                } else {
                    this.client.on(event.name, (...args) => event.execute(...args));
                }

                logger.info(`Loaded event: ${event.name}`);
            }
        } catch (error) {
            logger.error('Failed to load events:', error);
        }
    }

    /**
     * Deploy commands to Discord API
     */
    async deployCommands() {
        try {
            logger.info('Deploying commands to Discord...');

            const rest = new REST({ version: '10' }).setToken(config.discord.token);

            if (config.discord.guildId) {
                // Deploy to specific guild (faster for development)
                await rest.put(
                    Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
                    { body: this.commands }
                );
                logger.info(`Deployed ${this.commands.length} commands to guild ${config.discord.guildId}`);
            } else {
                // Deploy globally (takes up to 1 hour to update)
                await rest.put(
                    Routes.applicationCommands(config.discord.clientId),
                    { body: this.commands }
                );
                logger.info(`Deployed ${this.commands.length} commands globally`);
            }
        } catch (error) {
            logger.error('Failed to deploy commands:', error);
        }
    }

    /**
     * Handle graceful shutdown
     */
    async shutdown() {
        logger.info('Shutting down bot...');

        try {
            // Close Discord connection
            if (this.client) {
                await this.client.destroy();
            }

            // Close database connection
            await database.disconnect();

            logger.info('Bot shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Handle process signals for graceful shutdown
const bot = new DiscordBot();

process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    bot.shutdown();
});

// Initialize and start the bot
bot.initialize().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});