const { Accounts, Orders } = require('../models/index');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');

async function addAccounts(lines, type, price, addedBy, description = '') {
  return Accounts.addBulk(lines, type, price, addedBy, description);
}

async function getStock(type = null) {
  const all = Accounts.getStock();
  const available = all.filter(s => s.status === 'available');
  if (type) return available.filter(s => s.type === type).reduce((sum, s) => sum + s.count, 0);
  return available;
}

async function getAllStock() {
  return Accounts.getStock();
}

async function reserveAccount(type) {
  const acc = Accounts.findAvailable(type);
  if (!acc) return null;
  Accounts.reserve(acc.account_id);
  return acc;
}

async function createPendingOrder(orderId, userId, username, accId, amount, bankContent, csStaffId = null) {
  const db = require('../database');
  const acc = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accId);
  if (!acc) throw new Error('Account not found');

  Orders.create({
    orderId, userId, username,
    accountId: accId, accountType: acc.type,
    amount, paymentMethod: 'bank',
    paymentStatus: 'pending', bankContent, csStaffId,
  });
  return Orders.find(orderId);
}

async function confirmPendingOrder(orderId, paymentMethod = 'bank') {
  const order = Orders.find(orderId);
  if (!order) throw new Error('Order not found');
  if (order.payment_status === 'confirmed') return order;

  Orders.confirm(orderId);
  Accounts.markSold(order.account_id, order.user_id, orderId);
  return Orders.find(orderId);
}

async function cancelPendingOrder(orderId) {
  const order = Orders.find(orderId);
  if (!order) return null;
  if (order.payment_status !== 'pending') return order;

  Orders.cancel(orderId);
  Accounts.cancelReserve(order.account_id);
  return Orders.find(orderId);
}

async function cancelStalePendingOrders(client, minutes = 15) {
  const staleOrders = Orders.getPendingOlderThan(minutes);
  for (const order of staleOrders) {
    await cancelPendingOrder(order.order_id);
    try {
      const user = await client.users.fetch(order.user_id);
      const embed = new EmbedBuilder()
        .setTitle('⏰ Đơn hàng đã bị hủy (quá thời gian)')
        .setDescription(`Xin chào <@${order.user_id}>, đơn hàng \`${order.order_id}\` đã bị hủy do không nhận được xác nhận trong vòng ${minutes} phút.`)
        .setColor(0xED4245)
        .setTimestamp();
      await user.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      // ignore send errors
    }
  }
}

async function completeAccSale(accId, userId, username, paymentMethod, csStaffId = null) {
  const orderId = Orders.genId();

  // Lấy acc
  const db = require('../database');
  const acc = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accId);
  if (!acc) throw new Error('Account not found');

  // Tạo order
  Orders.create({
    orderId, userId, username,
    accountId: accId, accountType: acc.type,
    amount: acc.price, paymentMethod,
    paymentStatus: 'confirmed', csStaffId,
  });

  // Đánh dấu acc đã bán
  Accounts.markSold(accId, userId, orderId);
  Orders.confirm(orderId);

  const order = Orders.find(orderId);
  return { order, acc };
}

async function findPendingOrderByAccId(accId) {
  return Orders.findPendingByAccountId(accId);
}

async function cancelReserve(accId) {
  Accounts.cancelReserve(accId);
}

async function listAccounts(filter = {}, limit = 20, skip = 0) {
  return Accounts.getAll(filter, limit, skip);
}

async function getAccountStats() {
  return Accounts.getStats();
}

function generateOrderId() {
  return Orders.genId();
}

module.exports = {
  addAccounts, getStock, getAllStock, reserveAccount,
  createPendingOrder, confirmPendingOrder, cancelPendingOrder, findPendingOrderByAccId, cancelStalePendingOrders,
  completeAccSale, cancelReserve, listAccounts, getAccountStats, generateOrderId,
};

