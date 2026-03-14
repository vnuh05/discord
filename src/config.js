require('dotenv').config();

// Helper: đọc setting từ DB, fallback về .env
function getSetting(key, fallback = null) {
  try {
    const db = require('./database');
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return (row && row.value) ? row.value : (process.env[key] || fallback);
  } catch {
    return process.env[key] || fallback;
  }
}

module.exports = {
  get discord() {
    return {
      token: getSetting('DISCORD_TOKEN'),
      clientId: getSetting('CLIENT_ID'),
      guildId: getSetting('GUILD_ID'),
    };
  },
  mongodb: {
    uri: process.env.MONGODB_URI,
  },
  get channels() {
    return {
      shop: getSetting('SHOP_CHANNEL_ID'),
      log: getSetting('LOG_CHANNEL_ID'),
      review: getSetting('REVIEW_CHANNEL_ID'),
      notifyCS: getSetting('NOTIFY_CS_CHANNEL_ID'),
      ticketCategory: getSetting('TICKET_CATEGORY_ID'),
      announcement: getSetting('ANNOUNCEMENT_CHANNEL_ID'),
    };
  },
  get roles() {
    return {
      cs: getSetting('CS_ROLE_ID'),
      admin: getSetting('ADMIN_ROLE_ID'),
      mod: getSetting('MOD_ROLE_ID'),
      tiers: [
        { id: process.env.ROLE_BRONZE_ID, name: '🥉 Bronze', min: parseInt(process.env.ROLE_BRONZE_MIN) || 200000 },
        { id: process.env.ROLE_SILVER_ID, name: '🥈 Silver', min: parseInt(process.env.ROLE_SILVER_MIN) || 500000 },
        { id: process.env.ROLE_GOLD_ID,   name: '🥇 Gold',   min: parseInt(process.env.ROLE_GOLD_MIN)   || 1000000 },
        { id: process.env.ROLE_DIAMOND_ID,name: '💎 Diamond', min: parseInt(process.env.ROLE_DIAMOND_MIN)|| 5000000 },
      ],
    };
  },
  casso: {
    apiKey: process.env.CASSO_API_KEY,
    bankAccount: process.env.BANK_ACCOUNT_NUMBER,
    bankName: process.env.BANK_NAME,
    bankId: process.env.BANK_ID,
    accountName: process.env.BANK_ACCOUNT_NAME,
  },
  card: {
    apiUrl: process.env.CARD_API_URL || 'https://api.thesieure.com/chargingws/v2',
    partnerId: process.env.CARD_API_PARTNER_ID,
    partnerKey: process.env.CARD_API_PARTNER_KEY,
  },
  dashboard: {
    port: parseInt(process.env.DASHBOARD_PORT) || 3000,
    secret: process.env.DASHBOARD_SECRET || 'super_secret',
    username: process.env.DASHBOARD_USERNAME || 'admin',
    password: process.env.DASHBOARD_PASSWORD || 'admin123',
  },
  cs: {
    commissionPerOrder: parseInt(process.env.CS_COMMISSION_PER_ORDER) || 7000,
    ticketTimeout: parseInt(process.env.CS_TICKET_TIMEOUT) || 300000,
  },
};