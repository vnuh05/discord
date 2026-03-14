require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'shop.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize tables
function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY, username TEXT, total_spent INTEGER DEFAULT 0,
      total_orders INTEGER DEFAULT 0, monthly_spent INTEGER DEFAULT 0,
      monthly_reset TEXT, current_tier TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY, type TEXT, data TEXT, price INTEGER,
      description TEXT, status TEXT DEFAULT 'available', added_by TEXT,
      sold_to TEXT, sold_at TEXT, order_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY, user_id TEXT, username TEXT, account_id TEXT,
      account_type TEXT, amount INTEGER, payment_method TEXT, payment_status TEXT DEFAULT 'pending',
      card_telco TEXT, card_serial TEXT, card_pin TEXT, card_declared INTEGER,
      bank_content TEXT, cs_staff_id TEXT, completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, username TEXT,
      order_id TEXT, cs_staff_id TEXT, cs_staff_name TEXT, status TEXT DEFAULT 'open',
      rating INTEGER, rating_feedback TEXT, assigned_at TEXT, closed_at TEXT, rated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      discord_id TEXT PRIMARY KEY, username TEXT, total_orders INTEGER DEFAULT 0,
      total_earnings INTEGER DEFAULT 0, monthly_orders INTEGER DEFAULT 0,
      monthly_earnings INTEGER DEFAULT 0, monthly_reset TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrations: thêm cột mới nếu chưa có
  const ticketCols = db.prepare(`PRAGMA table_info(tickets)`).all().map(c => c.name);
  if (!ticketCols.includes('rated_at')) {
    db.exec(`ALTER TABLE tickets ADD COLUMN rated_at TEXT`);
    console.log('✅ Migration: added rated_at to tickets');
  }

  // Seed settings từ .env nếu chưa có
  const SETTING_KEYS = [
    'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID',
    'SHOP_CHANNEL_ID', 'LOG_CHANNEL_ID', 'NOTIFY_CS_CHANNEL_ID',
    'TICKET_CATEGORY_ID', 'REVIEW_CHANNEL_ID', 'ANNOUNCEMENT_CHANNEL_ID',
    'CS_ROLE_ID', 'ADMIN_ROLE_ID', 'MOD_ROLE_ID',
  ];
  const upsert = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const key of SETTING_KEYS) {
    if (process.env[key]) upsert.run(key, process.env[key]);
  }

  console.log('✅ SQLite database initialized');
}

initTables();

module.exports = db;

