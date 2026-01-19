const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel')
        .setDescription('Create the license redemption panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            // Create the main embed
            const panelEmbed = new EmbedBuilder()
                .setColor('#4ECDC4')
                .setTitle('🎮 Lexis VR Mods - License System')
                .setDescription(`
**Welcome to the automated license redemption system!**

After purchasing any of our VR mods from SellAuth, you can instantly redeem your license key here.

**🔸 Supported Products:**
• UG
• Animal Company
• Scary Baboon
• Rec Room Mods
• Big Scary
• Yeeps
• Steal a Monke
• Ghost of Tabor
• All VR Mods Pack

**📋 Instructions:**
1️⃣ **Purchase** any VR mod from our SellAuth store
2️⃣ **Copy** your invoice ID from the purchase email
3️⃣ **Click "Redeem License"** button below
4️⃣ **Paste** your invoice ID in the popup
5️⃣ **Receive** your lifetime KeyAuth license instantly!

**🔑 Lost Your Key?**
Click the "Get My Keys" button to retrieve all your previously redeemed licenses.

**⚠️ Important Notes:**
• Each invoice can only be redeemed **once**
• Keys are permanently stored and linked to your Discord account
• You can retrieve your keys anytime using the "Get My Keys" button
• Rate limit: 1 redemption per user per 24 hours
                `)
                .setThumbnail('https://cdn.discordapp.com/attachments/placeholder/lexis_logo.png') // You can replace with your actual logo
                .setFooter({
                    text: 'Lexis VR Mods • Automated License System',
                    iconURL: 'https://cdn.discordapp.com/attachments/placeholder/lexis_icon.png'
                })
                .setTimestamp();

            // Create buttons
            const buttonRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('redeem_license')
                        .setLabel('🎯 Redeem License')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎮'),
                    new ButtonBuilder()
                        .setCustomId('get_my_keys')
                        .setLabel('🔑 Get My Keys')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋')
                );

            // Send the panel
            await interaction.reply({
                embeds: [panelEmbed],
                components: [buttonRow]
            });

            logger.info(`License panel created by ${interaction.user.username} in ${interaction.guild?.name}`);

        } catch (error) {
            logger.error('Error creating license panel:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('❌ Error')
                .setDescription('Failed to create license panel. Please try again.')
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};