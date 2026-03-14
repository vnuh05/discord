const axios = require('axios');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const accManager = require('./accManager');
const { Orders } = require('../models/index');

// ========================
// CASSO - NGÂN HÀNG
// ========================
const pendingBankTransfers = new Map();

function generateTransferContent(orderId) {
  return `DH${orderId.replace(/[^0-9]/g, '').slice(-8)}`;
}

function waitForBankTransfer(orderId, accId, userId, amount) {
  return new Promise((resolve, reject) => {
    const content = generateTransferContent(orderId);
    const timeout = setTimeout(() => {
      pendingBankTransfers.delete(content);
      const err = new Error('TIMEOUT');
      err.orderId = orderId;
      err.accId = accId;
      err.userId = userId;
      reject(err);
    }, 15 * 60 * 1000);

    pendingBankTransfers.set(content, { orderId, accId, userId, amount, resolve, timeout });
    logger.info(`Waiting bank transfer: ${content} - Amount: ${amount}`);
  });
}

/**
 * Xử lý webhook từ Casso (chỉ hỗ trợ Webhook V2)
 * Header: "secure-token" chứa chữ ký HMAC SHA256
 * Body: { error: 0, data: { id, reference, description, amount, ... } }
 */
async function handleCassoWebhook(body, secureToken, client = null, channel = null) {
  const apiKey = config.casso.apiKey;

  // Chỉ sử dụng secureToken làm signature để xác thực cho Webhook V2
  let isSignatureValid = false;
  if (secureToken && body.data) {
    try {
      const dataString = JSON.stringify(body.data);
      const hmac = crypto.createHmac('sha256', apiKey);
      hmac.update(dataString);
      const expectedHex = hmac.digest('hex');
      const expectedBase64 = Buffer.from(expectedHex, 'hex').toString('base64');
      isSignatureValid = secureToken === expectedHex || secureToken === expectedBase64;
      logger.info(`Signature check: expected ${expectedHex}, received ${secureToken}`);
    } catch (err) {
      logger.warn('Casso webhook signature verification error', err.message);
      return { error: 'Signature verification failed', details: err.message };
    }
  }

  if (!isSignatureValid) {
    logger.warn('Invalid Casso webhook signature');
    return { error: 'Invalid signature', details: 'Signature does not match expected value' };
  }

  if (body.error !== 0) {
    logger.warn(`Casso webhook error: ${body.error}`);
    return { error: 'Webhook error', details: `Error code: ${body.error}` };
  }

  // Webhook V2 gửi data là object, không phải array
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    logger.warn('Invalid Casso webhook data format');
    return { error: 'Invalid data format', details: 'Data must be an object for Webhook V2' };
  }

  const tx = body.data;
  const { description, amount, id } = tx;

  if (!description || !amount || !id) {
    logger.warn('Missing required fields in Casso webhook data');
    return { error: 'Missing required fields', details: 'description, amount, and id are required' };
  }

  // Kiểm tra trùng lặp dựa trên id giao dịch
  // (Giả sử có một set để lưu các id đã xử lý)
  if (!global.processedTransactionIds) {
    global.processedTransactionIds = new Set();
  }
  if (global.processedTransactionIds.has(id)) {
    logger.warn(`Duplicate transaction id: ${id}`);
    return { error: 'Duplicate transaction', details: `Transaction id ${id} already processed` };
  }

  let processed = null;
  let matchedKey = null;
  let matchedPending = null;
  let matchedOrder = null;

  for (const [key, pending] of pendingBankTransfers.entries()) {
    if (description.toUpperCase().includes(key.toUpperCase())) {
      matchedKey = key;
      matchedPending = pending;
      if (parseInt(amount) >= pending.amount) {
        clearTimeout(pending.timeout);
        pendingBankTransfers.delete(key);
        global.processedTransactionIds.add(id);
        pending.resolve({ success: true, amount: parseInt(amount), content: description, transactionId: id });
        logger.info(`Casso payment confirmed: ${key} - ${amount}đ - Transaction ID: ${id}`);
        processed = pending;
        break;
      }
    }
  }

  // Nếu không khớp trong bộ nhớ, thử tìm trong DB (nếu bot restart hoặc order vẫn pending)
  if (!processed) {
    const pendingOrders = Orders.getAllPending();
    for (const order of pendingOrders) {
      const content = order.bank_content;
      if (content && description.toUpperCase().includes(content.toUpperCase())) {
        matchedKey = content;
        matchedOrder = order;
        matchedPending = { amount: order.amount };
        if (parseInt(amount) >= order.amount) {
          global.processedTransactionIds.add(id);
          // Confirm order in DB
          await accManager.confirmPendingOrder(order.order_id, 'bank');
          processed = { order };
          logger.info(`Casso payment confirmed from DB: ${content} - ${amount}đ - Transaction ID: ${id}`);
        }
        break;
      }
    }
  }

  if (!processed) {
    const pendingKeys = Array.from(pendingBankTransfers.keys());
    const details = [];
    if (!matchedKey) {
      details.push('Description did not match any pending transfer code.');
    } else {
      details.push(`Matched transfer code '${matchedKey}', but amount did not meet required value (${matchedPending?.amount}).`);
    }
    logger.warn(`No matching pending transfer for transaction: ${id}. description=${description}, amount=${amount}, matchedKey=${matchedKey}, pendingKeys=${pendingKeys.join(',')}`);
    return {
      error: 'No matching transfer',
      details: details.join(' '),
      description,
      amount,
      matchedKey,
      requiredAmount: matchedPending ? matchedPending.amount : null,
      pendingKeys,
    };
  }

  // Gửi EmbedBuilder lên channel và DM cho user
  if (client && channel && processed.order) {
    try {
      const order = processed.order;
      const db = require('../database');
      const acc = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(order.account_id);
      let user = null;
      if (client && client.users && order.user_id) {
        user = await client.users.fetch(order.user_id).catch(() => null);
      }
      const { EmbedBuilder } = require('discord.js');

      // Embed cho channel
      const channelEmbed = new EmbedBuilder()
        .setTitle('✅ Thanh toán thành công')
        .setDescription(`Đơn hàng **${order.order_id}** đã được xác nhận. <@${order.user_id}> đã thanh toán thành công và nhận acc.`)
        .setColor(0x57F287)
        .setTimestamp();
      await channel.send({ embeds: [channelEmbed] });

      // Embed cho DM
      if (user) {
        const dmEmbed = new EmbedBuilder()
          .setTitle('✅ Thông tin tài khoản đã mua')
          .setDescription([
            `🛒 **Đơn hàng:** **${order.order_id}**`,
            `📦 **Loại acc:** ${acc.type}`,
            `💰 **Giá:** ${Number(acc.price).toLocaleString('vi-VN')}đ`,
            `\n🔑 **Thông tin tài khoản:**`,
            `<<<${acc.data}>>>`,
            `\n⭐ Cảm ơn bạn đã mua hàng!`,
          ].join('\n'))
          .setColor(0x57F287)
          .setTimestamp();
        await user.send({ embeds: [dmEmbed] }).catch(() => {});
      }
    } catch (err) {
      logger.error('Casso webhook notify error:', err);
    }
  }

  return { success: true, processed };
}

function getBankTransferInfo(orderId, amount) {
  const content = generateTransferContent(orderId);
  return {
    bankName: config.casso.bankName,
    accountNumber: config.casso.bankAccount,
    amount,
    content,
    qrUrl: `https://img.vietqr.io/image/${config.casso.bankId}-${config.casso.bankAccount}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(config.casso.accountName || 'SHOP')}`,
  };
}

// ========================
// CARD API - GẠCH THẺ
// ========================
const TELCO_MAP = {
  'viettel': 'VIETTEL',
  'vinaphone': 'VINAPHONE',
  'mobifone': 'MOBIFONE',
  'vietnamobile': 'VIETNAMOBILE',
  'gmobile': 'GMOBILE',
  'zing': 'ZING',
  'garena': 'GARENA',
};

async function chargeCard({ telco, serial, pin, declaredAmount }) {
  try {
    const telcoCode = TELCO_MAP[telco.toLowerCase()];
    if (!telcoCode) return { success: false, message: 'Nhà mạng không hợp lệ!' };

    const sign = crypto
      .createHash('md5')
      .update(config.card.partnerKey + pin + serial)
      .digest('hex');

    const payload = {
      telco: telcoCode,
      code: pin,
      serial,
      amount: declaredAmount,
      partner_id: config.card.partnerId,
      sign,
      command: 'charging',
      request_id: `REQ_${Date.now()}`,
    };

    const response = await axios.post(config.card.apiUrl, payload, {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    const data = response.data;

    if (data.status === 1) {
      return { success: true, realAmount: data.value || declaredAmount, message: 'Gạch thẻ thành công!', transId: data.trans_id };
    } else if (data.status === 2) {
      return { success: false, pending: true, message: 'Thẻ đang được xử lý, vui lòng chờ...' };
    } else {
      return { success: false, message: data.message || 'Thẻ không hợp lệ hoặc đã sử dụng!' };
    }
  } catch (err) {
    logger.error('chargeCard error:', err.message);
    return { success: false, message: 'Lỗi kết nối API gạch thẻ!' };
  }
}

module.exports = { waitForBankTransfer, handleCassoWebhook, getBankTransferInfo, chargeCard };
