require('dotenv').config({ path: '../.env' });
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const config = require('../src/config');
const logger = require('../src/utils/logger');
const db = require('../src/database');
const discordClient = require('../src/index');

const app = express();

function verifyDashboardPassword(password) {
  return Boolean(password) && password === config.dashboard.password;
}

function ensureBotEnabledSetting() {
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('BOT_ENABLED', '1', datetime('now'))"
  ).run();
}

function setBotEnabled(value) {
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('BOT_ENABLED', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  ).run(value ? '1' : '0');
}

function isBotEnabled() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'BOT_ENABLED'").get();
  return row ? row.value !== '0' : true;
}

function getBotStatus() {
  if (!discordClient || !discordClient.ws) {
    return { connected: false, state: 'offline', enabled: isBotEnabled() };
  }
  const state = discordClient.ws.status;
  const connectedStates = [0, 1, 2]; // READY, CONNECTING, RECONNECTING
  return { connected: connectedStates.includes(state), state, enabled: isBotEnabled() };
}

async function stopDiscordBot() {
  setBotEnabled(false);
  const before = getBotStatus();
  if (!before.connected) return { success: true, message: 'Bot đã dừng sẵn.' };
  await discordClient.destroy();
  logger.warn('Discord bot stopped from dashboard control');
  return { success: true, message: 'Đã dừng bot Discord.' };
}

async function startDiscordBot() {
  setBotEnabled(true);
  const before = getBotStatus();
  if (before.connected) return { success: true, message: 'Bot đang hoạt động.' };
  await discordClient.login(config.discord.token);
  logger.info('Discord bot started from dashboard control');
  return { success: true, message: 'Đã khởi động bot Discord.' };
}

async function restartDiscordBot() {
  setBotEnabled(true);
  const wasConnected = getBotStatus().connected;
  if (wasConnected) await discordClient.destroy();
  await discordClient.login(config.discord.token);
  logger.info('Discord bot restarted from dashboard control');
  return { success: true, message: 'Đã khởi động lại bot Discord.' };
}

ensureBotEnabledSetting();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: config.dashboard.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

// ========================
// AUTH MIDDLEWARE
// ========================
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ========================
// AUTH ROUTES
// ========================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.dashboard.username && password === config.dashboard.password) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Sai thông tin đăng nhập!' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (req.session.authenticated) {
    res.json({ username: req.session.username });
  } else {
    res.json({ authenticated: false });
  }
});

// ========================
// STATS API
// ========================
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const totalAccs = db.prepare(`SELECT COUNT(*) as cnt FROM accounts`).get().cnt;
    const availableAccs = db.prepare(`SELECT COUNT(*) as cnt FROM accounts WHERE status = 'available'`).get().cnt;
    const soldAccs = db.prepare(`SELECT COUNT(*) as cnt FROM accounts WHERE status = 'sold'`).get().cnt;
    const totalOrders = db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE payment_status = 'confirmed'`).get().cnt;
    const totalUsers = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get().cnt;
    const openTickets = db.prepare(`SELECT COUNT(*) as cnt FROM tickets WHERE status IN ('open', 'assigned')`).get().cnt;

    const revenue = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM orders WHERE payment_status = 'confirmed'`).get().total;
    const monthlyRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM orders
      WHERE payment_status = 'confirmed' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get().total;

    res.json({
      totalAccs, availableAccs, soldAccs, totalOrders, totalUsers, openTickets,
      totalRevenue: revenue,
      monthlyRevenue: monthlyRevenue,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ACCOUNTS API
// ========================
app.get('/api/accounts', requireAuth, async (req, res) => {
  const { status, type, page = 1, limit = 20 } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  if (type) { where += ' AND type = ?'; params.push(type); }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  
  const accounts = db.prepare(`SELECT * FROM accounts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM accounts ${where}`).get(...params.slice(0, -2)).cnt;
  
  res.json({ accounts, total, pages: Math.ceil(total / parseInt(limit)) });
});

app.post('/api/accounts', requireAuth, async (req, res) => {
  const { type, price, accounts, description } = req.body;
  const lines = accounts.split('\n').map(l => l.trim()).filter(Boolean);
  const { addAccounts } = require('../src/modules/accManager');
  const result = await addAccounts(lines, type, price, 'dashboard', description || '');
  res.json(result);
});

app.delete('/api/accounts/:id', requireAuth, async (req, res) => {
  db.prepare(`DELETE FROM accounts WHERE account_id = ?`).run(req.params.id);
  res.json({ success: true });
});

// ========================
// ORDERS API
// ========================
app.get('/api/orders', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND payment_status = ?'; params.push(status); }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  
  const orders = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM orders ${where}`).get(...params.slice(0, -2)).cnt;
  
  res.json({ orders, total, pages: Math.ceil(total / parseInt(limit)) });
});

// ========================
// USERS API
// ========================
app.get('/api/users', requireAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const users = db.prepare(`SELECT * FROM users ORDER BY total_spent DESC LIMIT ? OFFSET ?`).all(parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get().cnt;
  res.json({ users, total, pages: Math.ceil(total / parseInt(limit)) });
});

// ========================
// STAFF API
// ========================
app.get('/api/staff', requireAuth, async (req, res) => {
  const staff = db.prepare(`SELECT * FROM staff ORDER BY monthly_earnings DESC`).all();
  res.json({ staff });
});

// ========================
// TICKETS API
// ========================
app.get('/api/tickets', requireAuth, async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  let where = 'WHERE 1=1';
  const params = [];
  if (status) { where += ' AND status = ?'; params.push(status); }
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  
  const tickets = db.prepare(`SELECT * FROM tickets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM tickets ${where}`).get(...params.slice(0, -2)).cnt;
  
  res.json({ tickets, total });
});

// ========================
// SETTINGS API
// ========================
const EDITABLE_SETTINGS = [
  'DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID',
  'SHOP_CHANNEL_ID', 'LOG_CHANNEL_ID', 'NOTIFY_CS_CHANNEL_ID',
  'TICKET_CATEGORY_ID', 'REVIEW_CHANNEL_ID', 'ANNOUNCEMENT_CHANNEL_ID',
  'CS_ROLE_ID', 'ADMIN_ROLE_ID', 'MOD_ROLE_ID',
];

app.get('/api/bot/status', requireAuth, (req, res) => {
  const status = getBotStatus();
  res.json({
    connected: status.connected,
    state: status.state,
    enabled: status.enabled,
    message: status.connected ? 'Bot đang online' : 'Bot đang offline',
  });
});

app.post('/api/bot/control', requireAuth, async (req, res) => {
  try {
    const { action, password } = req.body;
    if (!verifyDashboardPassword(password)) {
      return res.status(403).json({ error: 'Mật khẩu không đúng!' });
    }

    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Lệnh điều khiển không hợp lệ.' });
    }

    let result;
    if (action === 'start') result = await startDiscordBot();
    else if (action === 'stop') result = await stopDiscordBot();
    else result = await restartDiscordBot();

    const status = getBotStatus();
    res.json({ ...result, connected: status.connected, state: status.state });
  } catch (err) {
    logger.error('Bot control error:', err);
    res.status(500).json({ error: `Điều khiển bot thất bại: ${err.message}` });
  }
});

app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key IN (' + EDITABLE_SETTINGS.map(() => '?').join(',') + ')').all(...EDITABLE_SETTINGS);
  const settings = {};
  EDITABLE_SETTINGS.forEach(k => { settings[k] = ''; });
  rows.forEach(r => { settings[r.key] = r.value || ''; });
  res.json({ settings });
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const { password, settings } = req.body;

  // Verify current dashboard password before saving
  if (!verifyDashboardPassword(password)) {
    return res.status(403).json({ error: 'Mật khẩu không đúng!' });
  }

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
  }

  const upsert = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?,?,datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');
  const saveAll = db.transaction(() => {
    for (const key of EDITABLE_SETTINGS) {
      if (key in settings) {
        upsert.run(key, (settings[key] || '').trim());
      }
    }
  });
  try {
    saveAll();
    const restartResult = await restartDiscordBot();
    res.json({
      success: true,
      message: 'Thông tin đã được lưu lên database và đồng thời khởi động lại bot Discord.',
      bot: restartResult,
    });
  } catch (err) {
    logger.error('Save settings / restart bot error:', err);
    res.status(500).json({
      error: `Lưu cài đặt thành công nhưng khởi động lại bot thất bại: ${err.message}`,
    });
  }
});

// ========================
// CASSO WEBHOOK
// ========================
const { handleCassoWebhook } = require('../src/modules/payment');

app.post('/webhook/casso', express.json({
  verify: (req, res, buf) => {
    // Save raw body for signature verification (Webhook v2)
    req.rawBody = buf;
  }
}), async (req, res) => {
  const secureToken = req.headers['secure-token'] || req.headers['x-api-key'] || req.headers['x-casso-token'] || '';
  // Lấy channel shop
  let shopChannel = null;
  if (discordClient && discordClient.channels && config.channels.shop) {
    shopChannel = await discordClient.channels.fetch(config.channels.shop).catch(() => null);
  }
  const result = await handleCassoWebhook(req.body, secureToken, discordClient, shopChannel);
  if (result && result.success) {
    logger.info(`Casso webhook processed: order ${result.processed?.order?.order_id || result.processed?.orderId || 'unknown'}`);
    res.json({ success: true });
  } else if (result && result.error) {
    logger.warn(`Casso webhook error: ${result.error} - ${result.details}`);
    res.status(400).json({ success: false, error: result.error, details: result.details });
  } else {
    res.status(400).json({ success: false, message: 'Không tìm thấy giao dịch phù hợp hoặc signature không hợp lệ' });
  }
});

// ========================
// SERVE HTML
// ========================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================
// START
// ========================
app.listen(config.dashboard.port, () => {
  logger.info(`🌐 Dashboard running at http://localhost:${config.dashboard.port}`);
});

