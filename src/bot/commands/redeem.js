const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config/config');
const logger = require('../../utils/logger');
const database = require('../../api/database');
const sellauth = require('../../api/sellauth');
const keyauth = require('../../api/keyauth');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Redeem a license key using your SellAuth invoice ID')
        .addStringOption(option =>
            option
                .setName('invoice_id')
                .setDescription('Your SellAuth invoice ID')
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(50)
        ),

    async execute(interaction) {
        const invoiceId = interaction.options.getString('invoice_id');
        const userId = interaction.user.id;
        const userName = interaction.user.tag;

        try {
            // Acknowledge the interaction immediately
            await interaction.deferReply({ ephemeral: true });

            logger.info(`Redemption attempt: Invoice ${invoiceId} by ${userName} (${userId})`);

            // Step 1: Check rate limits
            const rateLimitResult = await database.checkRateLimit(
                userId,
                'redeem',
                config.security.rateLimits.redemptionsPerDay,
                24 // 24 hours
            );

            if (!rateLimitResult.allowed) {
                const resetTime = Math.floor(rateLimitResult.resetAfter.getTime() / 1000);
                const embed = new EmbedBuilder()
                    .setTitle('⏰ Rate Limited')
                    .setDescription(`You have reached the daily limit for license redemptions.\n\nYou can redeem another license <t:${resetTime}:R>.`)
                    .setColor(0xff9900) // Orange
                    .addFields(
                        { name: 'Attempts Used', value: `${rateLimitResult.attempts}/${rateLimitResult.maxAttempts}`, inline: true },
                        { name: 'Reset Time', value: `<t:${resetTime}:F>`, inline: true }
                    )
                    .setFooter({ text: 'Rate limits help prevent abuse of the system.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Step 2: Check if invoice already redeemed
            const alreadyRedeemed = await database.isInvoiceRedeemed(invoiceId);
            if (alreadyRedeemed) {
                const embed = new EmbedBuilder()
                    .setTitle('🚫 Already Redeemed')
                    .setDescription('This invoice has already been used to redeem a license key.')
                    .setColor(0xff0000) // Red
                    .addFields(
                        { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true }
                    )
                    .setFooter({ text: 'Each invoice can only be redeemed once.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Step 3: Update interaction with progress
            const progressEmbed = new EmbedBuilder()
                .setTitle('🔄 Processing Redemption')
                .setDescription('Verifying your invoice with SellAuth...')
                .setColor(0x0099ff) // Blue
                .addFields(
                    { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                    { name: 'Status', value: '🔍 Verifying invoice...', inline: true }
                )
                .setFooter({ text: 'This may take a few moments...' })
                .setTimestamp();

            await interaction.editReply({ embeds: [progressEmbed] });

            // Step 4: Verify invoice with SellAuth
            const invoiceVerification = await sellauth.verifyInvoice(invoiceId);

            if (!invoiceVerification.valid) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Invoice Verification Failed')
                    .setDescription(invoiceVerification.reason)
                    .setColor(0xff0000) // Red
                    .addFields(
                        { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                        { name: 'Error', value: invoiceVerification.error || 'Verification failed', inline: true }
                    )
                    .setFooter({ text: 'Please check your invoice ID and try again.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                // Log failed verification
                await database.logAction(userId, 'redemption_failed', {
                    invoiceId,
                    reason: invoiceVerification.reason,
                    error: invoiceVerification.error
                });

                return;
            }

            // Step 5: Update progress - creating license
            progressEmbed.setFields(
                { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                { name: 'Status', value: '✅ Invoice verified\n🔑 Creating license...', inline: true }
            );
            await interaction.editReply({ embeds: [progressEmbed] });

            // Step 6: Create license with KeyAuth
            const licenseResult = await keyauth.createLicenseForRedemption(
                invoiceId,
                userId,
                invoiceVerification.invoiceData
            );

            if (!licenseResult.success) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ License Creation Failed')
                    .setDescription('Your invoice was verified successfully, but we encountered an error while creating your license key. Please contact support with your invoice ID.')
                    .setColor(0xff0000) // Red
                    .addFields(
                        { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                        { name: 'Error', value: licenseResult.error || 'Unknown error', inline: true }
                    )
                    .setFooter({ text: 'Please contact support for assistance.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                // Log failed license creation
                await database.logAction(userId, 'license_creation_failed', {
                    invoiceId,
                    error: licenseResult.error
                });

                return;
            }

            // Step 7: Mark invoice as redeemed in database
            await database.markInvoiceRedeemed(
                invoiceId,
                userId,
                licenseResult.licenseKey,
                sellauth.extractInvoiceDetails(invoiceVerification.invoiceData),
                licenseResult.keyAuthResponse,
                {
                    username: userName,
                    id: userId,
                    redemptionMethod: 'discord_bot'
                }
            );

            // Step 8: Send success message with license key
            const successEmbed = new EmbedBuilder()
                .setTitle('🎉 License Redeemed Successfully!')
                .setDescription('Your license key has been generated successfully. Please save this key securely as it will not be shown again.')
                .setColor(0x00ff00) // Green
                .addFields(
                    { name: '🔑 Your License Key', value: `\`\`\`${licenseResult.licenseKey}\`\`\``, inline: false },
                    { name: 'License Type', value: 'Lifetime', inline: true },
                    { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true }
                )
                .setFooter({
                    text: 'Keep this license key safe. Support: If you lose this key, contact us with your invoice ID.'
                })
                .setTimestamp();

            // Also send via DM for extra security
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🔑 Your License Key')
                    .setDescription('Here is your license key for safekeeping:')
                    .setColor(0x00ff00)
                    .addFields(
                        { name: 'License Key', value: `\`\`\`${licenseResult.licenseKey}\`\`\``, inline: false },
                        { name: 'Product', value: invoiceVerification.invoiceData.product_name || 'Software License', inline: true },
                        { name: 'Redeemed', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setFooter({ text: 'Save this message for future reference.' });

                await interaction.user.send({ embeds: [dmEmbed] });

                successEmbed.addFields(
                    { name: '📧 DM Sent', value: 'A copy has been sent to your DMs for safekeeping.', inline: false }
                );
            } catch (dmError) {
                logger.warn(`Failed to send DM to user ${userId}:`, dmError.message);
                successEmbed.addFields(
                    { name: '⚠️ DM Failed', value: 'Could not send a copy to your DMs. Please screenshot this message.', inline: false }
                );
            }

            await interaction.editReply({ embeds: [successEmbed] });

            // Log successful redemption
            await database.logAction(userId, 'redemption_success', {
                invoiceId,
                licenseKey: licenseResult.licenseKey,
                productName: invoiceVerification.invoiceData.product_name,
                amount: invoiceVerification.invoiceData.amount
            });

            logger.info(`Redemption successful: Invoice ${invoiceId} -> License ${licenseResult.licenseKey} for user ${userName} (${userId})`);

        } catch (error) {
            logger.error(`Redemption error for ${invoiceId} by ${userName}:`, error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Unexpected Error')
                .setDescription('An unexpected error occurred while processing your redemption. Please try again later or contact support if the problem persists.')
                .setColor(0xff0000) // Red
                .addFields(
                    { name: 'Invoice ID', value: `\`${invoiceId}\``, inline: true },
                    { name: 'Error Code', value: '`REDEMPTION_ERROR`', inline: true }
                )
                .setFooter({ text: 'Please contact support if this error continues.' })
                .setTimestamp();

            try {
                await interaction.editReply({ embeds: [errorEmbed] });
            } catch (replyError) {
                logger.error('Failed to send error response:', replyError);
            }

            // Log unexpected error
            await database.logAction(userId, 'redemption_error', {
                invoiceId,
                error: error.message,
                stack: error.stack
            });
        }
    }
};