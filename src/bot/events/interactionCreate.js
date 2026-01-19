const { Events } = require('discord.js');
const logger = require('../../utils/logger');
const database = require('../../api/database');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // Only handle slash commands
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            // Log command usage for audit purposes
            await database.logAction(
                interaction.user.id,
                'command_used',
                {
                    command: interaction.commandName,
                    options: interaction.options.data,
                    guild: interaction.guild?.name || 'DM',
                    channel: interaction.channel?.name || 'DM'
                }
            );

            logger.info(`Command executed: ${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);

            // Execute the command
            await command.execute(interaction);

        } catch (error) {
            logger.error(`Error executing command ${interaction.commandName}:`, error);

            // Log error for audit purposes
            await database.logAction(
                interaction.user.id,
                'command_error',
                {
                    command: interaction.commandName,
                    error: error.message,
                    stack: error.stack
                }
            );

            // Respond to user with error message
            const errorEmbed = {
                title: '❌ Command Error',
                description: 'An error occurred while executing this command. Please try again later or contact support if the problem persists.',
                color: 0xff0000, // Red
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'If this error continues, please contact support.'
                }
            };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        embeds: [errorEmbed],
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        embeds: [errorEmbed],
                        ephemeral: true
                    });
                }
            } catch (followUpError) {
                logger.error('Failed to send error message to user:', followUpError);
            }
        }
    }
};