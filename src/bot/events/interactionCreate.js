const { Events, EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const logger = require('../../utils/logger');
const database = require('../../api/database');
const SellAuthAPI = require('../../api/sellauth');
const KeyAuthAPI = require('../../api/keyauth');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                await handleSlashCommand(interaction);
            }
            // Handle button clicks
            else if (interaction.isButton()) {
                await handleButtonInteraction(interaction);
            }
            // Handle modal submissions
            else if (interaction.isModalSubmit()) {
                await handleModalSubmit(interaction);
            }
        } catch (error) {
            logger.error('Error in interaction handler:', error);
        }
    }
};

async function handleSlashCommand(interaction) {
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
        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Command Error')
            .setDescription('An error occurred while executing this command. Please try again later or contact support if the problem persists.')
            .setColor('#FF6B6B')
            .setTimestamp()
            .setFooter({ text: 'If this error continues, please contact support.' });

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

async function handleButtonInteraction(interaction) {
    try {
        if (interaction.customId === 'redeem_license') {
            // Show modal for invoice ID input
            const modal = new ModalBuilder()
                .setCustomId('redeem_modal')
                .setTitle('🎮 Redeem License Key');

            const invoiceInput = new TextInputBuilder()
                .setCustomId('invoice_id')
                .setLabel('SellAuth Invoice ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter your SellAuth invoice ID here...')
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(50);

            const actionRow = new ActionRowBuilder().addComponents(invoiceInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);

        } else if (interaction.customId === 'get_my_keys') {
            // Handle get keys button - same as /key command
            await interaction.deferReply({ ephemeral: true });

            const userId = interaction.user.id;
            const username = interaction.user.username;

            logger.info(`User ${username} (${userId}) requesting their license keys via button`);

            // Get user's redeemed licenses from database
            const userLicenses = await database.getUserLicenses(userId);

            if (!userLicenses || userLicenses.length === 0) {
                const noLicenseEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🔑 No License Keys Found')
                    .setDescription('You haven\'t redeemed any license keys yet.\n\nUse the "Redeem License" button to redeem your SellAuth invoice!')
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
                'key_retrieval_button',
                {
                    username: username,
                    keysRetrieved: userLicenses.length
                }
            );
        }
    } catch (error) {
        logger.error('Error handling button interaction:', error);

        const errorEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing your request. Please try again.')
            .setTimestamp();

        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'redeem_modal') {
        try {
            await interaction.deferReply({ ephemeral: true });

            const invoiceId = interaction.fields.getTextInputValue('invoice_id');
            const userId = interaction.user.id;
            const userName = interaction.user.tag;

            logger.info(`User ${userName} attempting to redeem invoice: ${invoiceId} via modal`);

            // Rate limiting check
            const rateLimitResult = await database.checkRateLimit(
                userId,
                'license_redemption',
                1, // Max 1 redemption
                24 // Per 24 hours
            );

            if (!rateLimitResult.allowed) {
                const resetTime = Math.floor(rateLimitResult.resetAfter.getTime() / 1000);

                const rateLimitEmbed = new EmbedBuilder()
                    .setColor('#FF9800')
                    .setTitle('⏰ Rate Limited')
                    .setDescription(`You've already redeemed a license today.\n\nYou can redeem another license <t:${resetTime}:R>.`)
                    .setTimestamp()
                    .setFooter({ text: 'Lexis License Bot' });

                await interaction.editReply({ embeds: [rateLimitEmbed] });
                return;
            }

            // Check if invoice already redeemed
            const alreadyRedeemed = await database.isInvoiceRedeemed(invoiceId);
            if (alreadyRedeemed) {
                const alreadyRedeemedEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Invoice Already Redeemed')
                    .setDescription(`This invoice has already been redeemed.\n\nIf this is your invoice, you can retrieve your key using the "Get My Keys" button!`)
                    .setTimestamp()
                    .setFooter({ text: 'Lexis License Bot' });

                await interaction.editReply({ embeds: [alreadyRedeemedEmbed] });
                return;
            }

            // Verify invoice with SellAuth
            const verificationResult = await SellAuthAPI.verifyInvoice(invoiceId);

            if (!verificationResult.valid) {
                const invalidEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Invoice Verification Failed')
                    .setDescription(`**Reason:** ${verificationResult.reason}\n\nPlease check your invoice ID and try again.`)
                    .setTimestamp()
                    .setFooter({ text: 'Lexis License Bot' });

                await interaction.editReply({ embeds: [invalidEmbed] });
                return;
            }

            // Create license key through KeyAuth
            const licenseResult = await KeyAuthAPI.createLicenseForRedemption(
                invoiceId,
                userId,
                verificationResult.invoiceData
            );

            if (!licenseResult.success) {
                const keyAuthErrorEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ License Creation Failed')
                    .setDescription('Failed to create your license key. Please contact support.')
                    .setTimestamp()
                    .setFooter({ text: 'Lexis License Bot' });

                await interaction.editReply({ embeds: [keyAuthErrorEmbed] });
                return;
            }

            // Store redemption in database
            const invoiceDetails = SellAuthAPI.extractInvoiceDetails(verificationResult.invoiceData);
            await database.markInvoiceRedeemed(
                invoiceId,
                userId,
                licenseResult.licenseKey,
                invoiceDetails,
                licenseResult.keyAuthResponse,
                {
                    username: userName,
                    redeemed_via: 'modal'
                }
            );

            // Success response
            const successEmbed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🎉 License Redeemed Successfully!')
                .setDescription(`
**Product:** ${invoiceDetails.productName || 'Unknown Product'}
**License Key:**
\`\`\`${licenseResult.licenseKey}\`\`\`

**✅ Important Notes:**
• This is a **lifetime license**
• Save your key in a safe place
• You can retrieve this key anytime using the "Get My Keys" button
• Each invoice can only be redeemed once

**🎮 Enjoy your VR mod!**
                `)
                .addFields(
                    { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                    { name: 'Amount Paid', value: `${invoiceDetails.amount || 'Unknown'} ${invoiceDetails.currency || 'USD'}`, inline: true },
                    { name: 'Redeemed By', value: `<@${userId}>`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Lexis License Bot' });

            await interaction.editReply({ embeds: [successEmbed] });

            // Log successful redemption
            await database.logAction(
                userId,
                'redemption_success_modal',
                {
                    invoiceId: invoiceId,
                    productName: invoiceDetails.productName,
                    licenseKey: licenseResult.licenseKey,
                    username: userName
                }
            );

            logger.info(`License successfully redeemed via modal: ${invoiceId} -> ${licenseResult.licenseKey} for user ${userName}`);

        } catch (error) {
            logger.error('Error processing modal redemption:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Redemption Error')
                .setDescription('An error occurred while processing your redemption. Please try again later.')
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}