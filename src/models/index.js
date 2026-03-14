const db = require('../database');
const crypto = require('crypto');

// ════════════════════════════
//  USERS
// ════════════════════════════
const Users = {
  findOrCreate(discordId, username) {
    const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
    if (existing) return existing;
    db.prepare(`INSERT INTO users (discord_id, username) VALUES (?, ?)`).run(discordId, username || null);
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  },

  find(discordId) {
    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId);
  },

  addSpending(discordId, username, amount) {
    const user = this.findOrCreate(discordId, username);

    // Reset tháng nếu cần
    const now = new Date();
    const resetDate = new Date(user.monthly_reset);
    const needReset = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

    if (needReset) {
      db.prepare(`
        UPDATE users SET monthly_spent = ?, monthly_reset = date('now'),
        total_spent = total_spent + ?, total_orders = total_orders + 1, username = ?
        WHERE discord_id = ?
      `).run(amount, amount, username, discordId);
    } else {
      db.prepare(`
        UPDATE users SET monthly_spent = monthly_spent + ?, total_spent = total_spent + ?,
        total_orders = total_orders + 1, username = ? WHERE discord_id = ?
      `).run(amount, amount, username, discordId);
    }
    return this.find(discordId);
  },

  updateTier(discordId, tier) {
    db.prepare('UPDATE users SET current_tier = ? WHERE discord_id = ?').run(tier, discordId);
  },

  getMonthlyLeaderboard(limit = 10) {
    return db.prepare('SELECT * FROM users WHERE monthly_spent > 0 ORDER BY monthly_spent DESC LIMIT ?').all(limit);
  },

  resetMonthly() {
    db.prepare(`UPDATE users SET monthly_spent = 0, monthly_reset = date('now')`).run();
  },

  getAll(limit = 20, offset = 0) {
    const rows = db.prepare('SELECT * FROM users ORDER BY total_spent DESC LIMIT ? OFFSET ?').all(limit, offset);
    const total = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
    return { users: rows, total };
  },
};

// ════════════════════════════
//  ACCOUNTS
// ════════════════════════════
const Accounts = {
  genId() {
    return `ACC-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  },

  add(type, data, price, addedBy, description = '') {
    const id = this.genId();
    db.prepare(`
      INSERT INTO accounts (account_id, type, data, price, description, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, type, data, price, description, addedBy);
    return id;
  },

  addBulk(lines, type, price, addedBy, description = '') {
    const insert = db.prepare(`
      INSERT INTO accounts (account_id, type, data, price, description, added_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    let success = 0, failed = 0;
    const insertMany = db.transaction((items) => {
      for (const line of items) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { insert.run(this.genId(), type, trimmed, price, description, addedBy); success++; }
        catch { failed++; }
      }
    });
    insertMany(lines);
    return { success, failed };
  },

  findAvailable(type) {
    return db.prepare(`SELECT * FROM accounts WHERE type = ? AND status = 'available' LIMIT 1`).get(type);
  },

  reserve(accountId) {
    db.prepare(`UPDATE accounts SET status = 'reserved' WHERE account_id = ?`).run(accountId);
  },

  cancelReserve(accountId) {
    db.prepare(`UPDATE accounts SET status = 'available' WHERE account_id = ? AND status = 'reserved'`).run(accountId);
  },

  markSold(accountId, userId, orderId) {
    db.prepare(`
      UPDATE accounts SET status = 'sold', sold_to = ?, sold_at = datetime('now'), order_id = ?
      WHERE account_id = ?
    `).run(userId, orderId, accountId);
  },

  delete(accountId) {
    db.prepare(`DELETE FROM accounts WHERE account_id = ?`).run(accountId);
  },

  getStock() {
    return db.prepare(`
      SELECT type, status, COUNT(*) as count, MIN(price) as price
      FROM accounts GROUP BY type, status ORDER BY type
    `).all();
  },

  getStats() {
    const total     = db.prepare(`SELECT COUNT(*) as cnt FROM accounts`).get().cnt;
    const available = db.prepare(`SELECT COUNT(*) as cnt FROM accounts WHERE status = 'available'`).get().cnt;
    const sold      = db.prepare(`SELECT COUNT(*) as cnt FROM accounts WHERE status = 'sold'`).get().cnt;
    return { total, available, sold, reserved: total - available - sold };
  },

  getAll(filter = {}, limit = 20, offset = 0) {
    let where = 'WHERE 1=1';
    const params = [];
    if (filter.status) { where += ' AND status = ?'; params.push(filter.status); }
    if (filter.type)   { where += ' AND type = ?';   params.push(filter.type); }
    params.push(limit, offset);
    const rows  = db.prepare(`SELECT * FROM accounts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM accounts ${where.replace('LIMIT ? OFFSET ?','')}`).get(...params.slice(0,-2)).cnt;
    return { accounts: rows, total };
  },
};

// ════════════════════════════
//  ORDERS
// ════════════════════════════
const Orders = {
  genId() {
    return `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  },

  create(data) {
    const id = data.orderId || this.genId();
    db.prepare(`
      INSERT INTO orders (order_id, user_id, username, account_id, account_type, amount, payment_method,
        payment_status, card_telco, card_serial, card_pin, card_declared, bank_content, cs_staff_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId, data.username || null, data.accountId || null, data.accountType || null,
      data.amount, data.paymentMethod, data.paymentStatus || 'pending',
      data.cardTelco || null, data.cardSerial || null, data.cardPin || null, data.cardDeclared || null,
      data.bankContent || null, data.csStaffId || null
    );
    return id;
  },

  confirm(orderId) {
    db.prepare(`UPDATE orders SET payment_status = 'confirmed', completed_at = datetime('now') WHERE order_id = ?`).run(orderId);
  },

  cancel(orderId) {
    db.prepare(`UPDATE orders SET payment_status = 'cancelled', completed_at = datetime('now') WHERE order_id = ?`).run(orderId);
  },

  find(orderId) {
    return db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
  },

  findPendingByAccountId(accountId) {
    return db.prepare('SELECT * FROM orders WHERE account_id = ? AND payment_status = ? ORDER BY created_at DESC LIMIT 1').get(accountId, 'pending');
  },

  findPendingByBankContent(bankContent) {
    return db.prepare('SELECT * FROM orders WHERE bank_content = ? AND payment_status = ? ORDER BY created_at DESC LIMIT 1').get(bankContent, 'pending');
  },

  getPendingOlderThan(minutes = 15) {
    return db.prepare(`SELECT * FROM orders WHERE payment_status = 'pending' AND datetime(created_at, '+' || ? || ' minutes') <= datetime('now')`).all(minutes);
  },

  getAllPending() {
    return db.prepare(`SELECT * FROM orders WHERE payment_status = 'pending'`).all();
  },

  getAll(filter = {}, limit = 20, offset = 0) {
    let where = 'WHERE 1=1';
    const params = [];
    if (filter.status) { where += ' AND payment_status = ?'; params.push(filter.status); }
    params.push(limit, offset);
    const rows  = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM orders ${where}`).get(...params.slice(0,-2)).cnt;
    return { orders: rows, total };
  },

  getRevenue() {
    const total   = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM orders WHERE payment_status = 'confirmed'`).get().total;
    const monthly = db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM orders
      WHERE payment_status = 'confirmed' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).get().total;
    return { total, monthly };
  },
};

// ════════════════════════════
//  TICKETS
// ════════════════════════════
const Tickets = {
  create(data) {
    db.prepare(`
      INSERT INTO tickets (ticket_id, channel_id, user_id, username, order_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.ticketId, data.channelId, data.userId, data.username || null, data.orderId || null);
  },

  find(ticketId) {
    return db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId);
  },

  assign(ticketId, csStaffId, csStaffName) {
    db.prepare(`
      UPDATE tickets SET cs_staff_id = ?, cs_staff_name = ?, status = 'assigned', assigned_at = datetime('now')
      WHERE ticket_id = ?
    `).run(csStaffId, csStaffName, ticketId);
  },

  close(ticketId) {
    db.prepare(`UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE ticket_id = ?`).run(ticketId);
  },

  rate(ticketId, rating, feedback = null) {
    db.prepare(`UPDATE tickets SET rating = ?, rating_feedback = ?, rated_at = datetime('now') WHERE ticket_id = ?`).run(rating, feedback, ticketId);
  },

  countOpen() {
    return db.prepare(`SELECT COUNT(*) as cnt FROM tickets WHERE status IN ('open','assigned')`).get().cnt;
  },

  getAll(filter = {}, limit = 30, offset = 0) {
    let where = 'WHERE 1=1';
    const params = [];
    if (filter.status) { where += ' AND status = ?'; params.push(filter.status); }
    params.push(limit, offset);
    const rows  = db.prepare(`SELECT * FROM tickets ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM tickets ${where}`).get(...params.slice(0,-2)).cnt;
    return { tickets: rows, total };
  },
};

// ════════════════════════════
//  STAFF
// ════════════════════════════
const Staff = {
  findOrCreate(discordId, username) {
    const existing = db.prepare('SELECT * FROM staff WHERE discord_id = ?').get(discordId);
    if (existing) return existing;
    db.prepare('INSERT INTO staff (discord_id, username) VALUES (?, ?)').run(discordId, username || null);
    return db.prepare('SELECT * FROM staff WHERE discord_id = ?').get(discordId);
  },

  addOrder(discordId, username, commission) {
    this.findOrCreate(discordId, username);
    db.prepare(`
      UPDATE staff SET
        total_orders = total_orders + 1, total_earnings = total_earnings + ?,
        monthly_orders = monthly_orders + 1, monthly_earnings = monthly_earnings + ?,
        username = ?
      WHERE discord_id = ?
    `).run(commission, commission, username, discordId);
  },

  resetMonthly() {
    db.prepare(`UPDATE staff SET monthly_orders = 0, monthly_earnings = 0, monthly_reset = date('now')`).run();
  },

  getAll() {
    return db.prepare('SELECT * FROM staff ORDER BY monthly_earnings DESC').all();
  },
};

module.exports = { Users, Accounts, Orders, Tickets, Staff };

