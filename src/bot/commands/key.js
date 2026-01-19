const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../../api/database');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('key')
        .setDescription('Retrieve your previously redeemed license key'),

    async execute(interaction) {
        try {
            // Make response ephemeral (only user can see)
            await interaction.deferReply({ ephemeral: true });

            const userId = interaction.user.id;
            const username = interaction.user.username;

            logger.info(`User ${username} (${userId}) requesting their license key`);

            // Get user's redeemed licenses from database
            const userLicenses = await database.getUserLicenses(userId);

            if (!userLicenses || userLicenses.length === 0) {
                const noLicenseEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🔑 No License Keys Found')
                    .setDescription('You haven\'t redeemed any license keys yet.\n\nUse `/redeem` or the redeem button to redeem your SellAuth invoice!')
                    .setTimestamp()
                    .setFooter({ text: 'Lexis License Bot' });

                await interaction.editReply({ embeds: [noLicenseEmbed] });
                return;
            }

            // Create embed with user's license keys
            const keyEmbed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🔑 Your License Keys')
                .setDescription('Here are your redeemed license keys:')
                .setTimestamp()
                .setFooter({ text: 'Lexis License Bot' });

            // Add fields for each license
            userLicenses.forEach((license, index) => {
                const productName = license.product_name || 'Unknown Product';
                const redeemedDate = new Date(license.redeemed_at).toLocaleDateString();

                keyEmbed.addFields({
                    name: `${productName} (${redeemedDate})`,
                    value: `\`\`\`${license.license_key}\`\`\``,
                    inline: false
                });
            });

            if (userLicenses.length > 1) {
                keyEmbed.setDescription(`You have ${userLicenses.length} license keys:`);
            }

            await interaction.editReply({ embeds: [keyEmbed] });

            // Log the key retrieval
            await database.logAction(
                userId,
                'key_retrieval',
                {
                    username: username,
                    keysRetrieved: userLicenses.length
                }
            );

        } catch (error) {
            logger.error('Error in key command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('An error occurred while retrieving your license keys. Please try again later.')
                .setTimestamp()
                .setFooter({ text: 'Lexis License Bot' });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};