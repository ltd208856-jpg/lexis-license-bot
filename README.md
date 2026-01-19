# Discord License Bot

An automated Discord bot that integrates SellAuth invoice verification with KeyAuth license creation, allowing users to convert their purchase invoices into license keys automatically.

## Features

- 🔍 **Invoice Verification**: Verifies SellAuth invoices automatically
- 🔑 **License Generation**: Creates lifetime licenses via KeyAuth API
- 🛡️ **Security**: Rate limiting, duplicate prevention, and audit logging
- 💬 **Discord Integration**: Slash commands with rich embeds
- 📊 **Database Tracking**: PostgreSQL database for redemption tracking
- ☁️ **Heroku Ready**: Configured for easy Heroku deployment

## Prerequisites

Before setting up the bot, you'll need:

1. **Discord Bot Token**: Create a bot on [Discord Developer Portal](https://discord.com/developers/applications)
2. **SellAuth API Key**: Obtain from your [SellAuth Dashboard](https://sellauth.com/dashboard)
3. **KeyAuth Account**: Your existing account (`Ltd208856's Application`)
4. **Heroku Account**: For hosting (free tier available)

## Setup Guide

### Step 1: Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this later)
5. Under "Privileged Gateway Intents", enable:
   - Message Content Intent (if needed)
6. Go to "OAuth2" > "URL Generator":
   - Select "bot" and "applications.commands"
   - Select permissions: "Send Messages", "Use Slash Commands"
   - Copy the generated URL and use it to invite the bot to your server

### Step 2: SellAuth API Setup

1. Log into your [SellAuth Dashboard](https://sellauth.com/dashboard)
2. Navigate to "API" or "Developer Settings"
3. Generate a new API key with permissions:
   - Read invoice data
   - Verify payment status
   - Access product information
4. Note your product ID (found in product settings)
5. Copy the API key and endpoint URL

### Step 3: Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in all the required values:
   ```env
   # Discord Bot Configuration
   DISCORD_BOT_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_application_id_here

   # SellAuth API Configuration
   SELLAUTH_API_KEY=your_sellauth_api_key_here
   SELLAUTH_API_URL=https://api.sellauth.com/v1
   SELLAUTH_PRODUCT_ID=your_product_id_here

   # KeyAuth Configuration (your existing setup)
   KEYAUTH_NAME=Ltd208856's Application
   KEYAUTH_OWNERID=bvLogTU3Fd
   KEYAUTH_VERSION=1.0
   KEYAUTH_URL=https://keyauth.win/api/1.3/
   KEYAUTH_SECRET=your_keyauth_secret_here

   # Database Configuration
   DATABASE_URL=postgres://username:password@localhost:5432/license_bot

   # Security Configuration
   ENCRYPTION_KEY=your_32_byte_encryption_key_here
   JWT_SECRET=your_jwt_secret_for_sessions

   # Environment
   NODE_ENV=production
   ```

### Step 4: Local Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up local PostgreSQL database:
   ```bash
   # Install PostgreSQL (if not already installed)
   # Create database
   createdb license_bot
   ```

3. Start the bot:
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

## Heroku Deployment

### Step 1: Heroku Setup

1. Install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Login to Heroku:
   ```bash
   heroku login
   ```

3. Create a new Heroku app:
   ```bash
   heroku create your-license-bot
   ```

### Step 2: Add Heroku Postgres

```bash
heroku addons:create heroku-postgresql:hobby-dev
```

### Step 3: Configure Environment Variables

Set all required environment variables:

```bash
heroku config:set DISCORD_BOT_TOKEN=your_bot_token
heroku config:set DISCORD_CLIENT_ID=your_client_id
heroku config:set SELLAUTH_API_KEY=your_sellauth_key
heroku config:set SELLAUTH_API_URL=https://api.sellauth.com/v1
heroku config:set SELLAUTH_PRODUCT_ID=your_product_id
heroku config:set KEYAUTH_NAME="Ltd208856's Application"
heroku config:set KEYAUTH_OWNERID=bvLogTU3Fd
heroku config:set KEYAUTH_VERSION=1.0
heroku config:set KEYAUTH_URL=https://keyauth.win/api/1.3/
heroku config:set KEYAUTH_SECRET=your_keyauth_secret
heroku config:set ENCRYPTION_KEY=your_32_byte_key
heroku config:set JWT_SECRET=your_jwt_secret
heroku config:set NODE_ENV=production
```

### Step 4: Deploy

```bash
git add .
git commit -m "Initial deployment"
git push heroku main
```

### Step 5: Scale Worker

```bash
heroku ps:scale worker=1
```

### Step 6: Monitor

```bash
# View logs
heroku logs --tail

# Check status
heroku ps
```

## Usage

### For Users

1. Purchase the software through SellAuth
2. Receive invoice ID via email
3. Use Discord slash command: `/redeem invoice_id`
4. Receive lifetime license key instantly

### For Administrators

- Monitor redemptions via Heroku logs
- Database contains full audit trail
- Rate limiting prevents abuse
- Error logging for troubleshooting

## Commands

- `/redeem <invoice_id>` - Redeem a license using SellAuth invoice ID

## Database Schema

### Tables

1. **redeemed_invoices**: Tracks all successful redemptions
2. **rate_limits**: Rate limiting data per user
3. **audit_log**: Complete audit trail of all actions

## Security Features

- **Rate Limiting**: 1 redemption per user per 24 hours, 5 attempts per hour
- **Duplicate Prevention**: Each invoice can only be redeemed once
- **Data Encryption**: Sensitive data encrypted at rest
- **Input Validation**: All inputs sanitized and validated
- **Audit Logging**: Complete audit trail of all actions

## API Integrations

### SellAuth API

- Verifies invoice payment status
- Validates product matches
- Checks invoice age (30 day limit)

### KeyAuth API

- Creates lifetime licenses automatically
- Generates secure license keys
- Links licenses to invoice data

## Error Handling

- User-friendly error messages
- Comprehensive logging
- Graceful degradation
- Automatic retry mechanisms

## Monitoring and Maintenance

### Logs

```bash
# Heroku logs
heroku logs --tail

# Application logs contain:
# - Command usage
# - Redemption attempts
# - API responses
# - Error details
```

### Database Queries

```sql
-- Check recent redemptions
SELECT * FROM redeemed_invoices ORDER BY redeemed_at DESC LIMIT 10;

-- Check rate limits
SELECT * FROM rate_limits WHERE user_id = 'DISCORD_USER_ID';

-- Audit trail
SELECT * FROM audit_log WHERE action = 'redemption_success' ORDER BY timestamp DESC;
```

### Health Checks

The bot includes automatic health monitoring:
- API connectivity tests on startup
- Periodic health check logging
- Database connection monitoring

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check Heroku worker is running (`heroku ps`)
2. **Database errors**: Verify DATABASE_URL is set correctly
3. **SellAuth errors**: Verify API key and product ID
4. **KeyAuth errors**: Check secret key and credentials

### Debug Mode

Enable debug logging:
```bash
heroku config:set LOG_LEVEL=debug
```

## Support

For issues with the bot:
1. Check Heroku logs for errors
2. Verify all environment variables are set
3. Test API connections independently
4. Contact support with error details

## License

MIT License - see LICENSE file for details.

---

## Quick Reference

### Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_CLIENT_ID` | Yes | Discord application ID |
| `SELLAUTH_API_KEY` | Yes | SellAuth API key |
| `SELLAUTH_PRODUCT_ID` | Yes | Your product ID |
| `KEYAUTH_SECRET` | Yes | KeyAuth secret key |
| `ENCRYPTION_KEY` | Yes | 32-byte encryption key |
| `DATABASE_URL` | Auto | PostgreSQL URL (set by Heroku) |

### Deployment Checklist

- [ ] Discord bot created and invited to server
- [ ] SellAuth API key obtained
- [ ] All environment variables configured
- [ ] Heroku app created with Postgres add-on
- [ ] Code deployed to Heroku
- [ ] Worker dyno scaled to 1
- [ ] Bot shows online in Discord
- [ ] Test redemption with valid invoice

---

*Generated for Lexis Team - Discord License Bot v1.0*