const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const config = require('../config');
const accManager = require('../modules/accManager');
const payment = require('../modules/payment');
const roleManager = require('../modules/roleManager');
const ticketManager = require('../modules/ticketManager');
const logger = require('../utils/logger');

const shopCommand = {
  data: new SlashCommandBuilder().setName('shop').setDescription('Hiển thị cửa hàng'),
  async execute(interaction) { await sendShopEmbed(interaction.channel, interaction); },
};

async function sendShopEmbed(channel, interaction = null) {
  const stock = await accManager.getAllStock();
  const availableTypes = stock.filter(s => s.status === 'available' && s.count > 0);

  const embed = new EmbedBuilder()
    .setTitle('🏪 CỬA HÀNG ACC')
    .setDescription([
      '> Chào mừng đến cửa hàng! Chọn loại acc bên dưới để mua.',
      '',
      '📦 **KHO HÀNG:**',
      availableTypes.length > 0
        ? availableTypes.map(s => `• **${s.type}** — ${s.count} acc còn — ${Number(s.price).toLocaleString('vi-VN')}đ`).join('\n')
        : '⚠️ Hiện tại chưa có hàng!',
      '',
      '💳 **PHƯƠNG THỨC THANH TOÁN:**',
      '> 🏦 Chuyển khoản ngân hàng (MBBANK)',
      '> 📱 Nạp thẻ cào (Tự động)',
    ].join('\n'))
    .setColor(0x5865F2).setTimestamp()
    .setFooter({ text: 'Powered by Shop Bot' });

  const options = availableTypes.slice(0, 25).map(s => ({
    label: `${s.type}`,
    description: `${s.count} còn | ${Number(s.price).toLocaleString('vi-VN')}đ/acc`,
    value: s.type,
  }));

  const rows = [];
  if (options.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('shop_select_type').setPlaceholder('📦 Chọn loại acc...').addOptions(options)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_check_stock').setLabel('📊 Xem Stock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_create_support').setLabel('🎫 Tạo Ticket').setStyle(ButtonStyle.Primary),
  ));

  if (interaction) await interaction.reply({ embeds: [embed], components: rows });
  else await channel.send({ embeds: [embed], components: rows });
}

async function handleSelectType(interaction, type) {
  const acc = await accManager.reserveAccount(type);
  if (!acc) return interaction.reply({ content: '❌ Hết hàng rùiii, đợi stock nha!', flags: 64 });

  const embed = new EmbedBuilder()
    .setTitle('💳 Chọn Phương Thức Thanh Toán')
    .setDescription([
      `📦 **Sản phẩm:** ${type}`,
      `💰 **Giá:** ${Number(acc.price).toLocaleString('vi-VN')}đ`,
      `\nChọn phương thức thanh toán bên dưới:`,
    ].join('\n'))
    .setColor(0x57F287);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`pay_bank_${acc.account_id}`).setLabel('🏦 Chuyển khoản').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`pay_card_${acc.account_id}`).setLabel('📱 Nạp thẻ cào').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`pay_cancel_${acc.account_id}`).setLabel('❌ Hủy').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
}

const db = require('../database');

async function handleBankPayment(interaction, accId) {
  const acc = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accId);
  if (!acc || acc.status !== 'reserved') return interaction.reply({ content: '❌ Phiên hết hạn!', flags: 64 });

  // Kiểm tra đơn pending cho acc/user
  const pendingOrder = db.prepare('SELECT * FROM orders WHERE account_id = ? AND user_id = ? AND payment_status = ? ORDER BY created_at DESC LIMIT 1').get(accId, interaction.user.id, 'pending');
  let orderId, bankInfo;
  if (pendingOrder) {
    orderId = pendingOrder.order_id;
    bankInfo = payment.getBankTransferInfo(orderId, acc.price);
  } else {
    orderId = `ORD-${Date.now()}`;
    bankInfo = payment.getBankTransferInfo(orderId, acc.price);
    await accManager.createPendingOrder(orderId, interaction.user.id, interaction.user.username, accId, acc.price, bankInfo.content);
  }

  const embed = new EmbedBuilder()
    .setTitle('🏦 Thông Tin Chuyển Khoản')
    .setDescription([
      `**Ngân hàng:** ${bankInfo.bankName}`,
      `**Số tài khoản:** \`${bankInfo.accountNumber}\``,
      `**Số tiền:** \`${Number(acc.price).toLocaleString('vi-VN')}đ\``,
      `**Nội dung CK:** \`${bankInfo.content}\``,
      `\n⚠️ **Nhập đúng nội dung để hệ thống tự xác nhận!**`,
      `⏳ Thời gian chờ: ** 15 phút**`,
    ].join('\n'))
    .setImage(bankInfo.qrUrl).setColor(0x5865F2).setTimestamp();

  await interaction.reply({ embeds: [embed], flags: 64 });

  try {
    const result = await payment.waitForBankTransfer(orderId, accId, interaction.user.id, acc.price);
    if (result.success) {
      const confirmedOrder = await accManager.confirmPendingOrder(orderId, 'bank');
      await roleManager.updateSpendingAndRole(interaction.guild, interaction.user.id, interaction.user.username, acc.price);
      await deliverAccount(interaction, acc, interaction.user, confirmedOrder);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Thanh toán thành công')
        .setDescription('Bạn đã thanh toán thành công. Vui lòng kiểm tra tin nhắn riêng để nhận thông tin tài khoản đã mua.')
        .setColor(0x57F287)
        .setTimestamp();
      await interaction.followUp({ embeds: [successEmbed], flags: 64 });
    }
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      await accManager.cancelPendingOrder(orderId);
      const cancelEmbed = new EmbedBuilder()
        .setTitle('❌ Đơn hàng đã bị hủy')
        .setDescription(`⏰ <@${interaction.user.id}> Hết giờ chờ thanh toán. Đơn hàng \`${orderId}\` đã được hủy.`)
        .setColor(0xED4245)
        .setTimestamp();
      await interaction.followUp({ embeds: [cancelEmbed], flags: 64 });
    }
  }
}

async function showCardModal(interaction, accId) {
  const modal = new ModalBuilder().setCustomId(`card_modal_${accId}`).setTitle('📱 Nạp Thẻ Cào');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_telco').setLabel('Nhà mạng (Viettel/Vinaphone/Mobifone)').setStyle(TextInputStyle.Short).setPlaceholder('Viettel').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_serial').setLabel('Serial thẻ').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_pin').setLabel('Mã thẻ (PIN)').setStyle(TextInputStyle.Short).setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('card_amount').setLabel('Mệnh giá (VNĐ)').setStyle(TextInputStyle.Short).setPlaceholder('100000').setRequired(true)),
  );
  await interaction.showModal(modal);
}

async function handleCardSubmit(interaction, accId) {
  const telco = interaction.fields.getTextInputValue('card_telco');
  const serial = interaction.fields.getTextInputValue('card_serial');
  const pin = interaction.fields.getTextInputValue('card_pin');
  const declaredAmount = parseInt(interaction.fields.getTextInputValue('card_amount'));

  const db = require('../database');
  const acc = db.prepare('SELECT * FROM accounts WHERE account_id = ?').get(accId);
  if (!acc || acc.status !== 'reserved') return interaction.reply({ content: '❌ Phiên hết hạn!', flags: 64 });

  await interaction.deferReply({ flags: 64 });
  const result = await payment.chargeCard({ telco, serial, pin, declaredAmount });

  if (result.success && result.realAmount >= acc.price) {
    await deliverAccount(interaction, acc, interaction.user, 'card');
  } else if (result.pending) {
    await interaction.editReply({ content: '⏳ Thẻ đang xử lý, vui lòng chờ...' });
  } else {
    await accManager.cancelReserve(accId);
    await interaction.editReply({ content: `❌ ${result.message}` });
  }
}

async function deliverAccount(interaction, acc, user, orderOrPaymentMethod) {
  try {
    let order;
    if (orderOrPaymentMethod && typeof orderOrPaymentMethod === 'object') {
      // Đơn đã xác nhận sẵn (bank transfer) - không tạo đơn mới
      order = orderOrPaymentMethod;
    } else {
      // Thanh toán thẻ cào - tạo đơn mới
      const result = await accManager.completeAccSale(acc.account_id, user.id, user.username, orderOrPaymentMethod);
      order = result.order;
      await roleManager.updateSpendingAndRole(interaction.guild, user.id, user.username, acc.price);
    }

    const accEmbed = new EmbedBuilder()
      .setTitle('✅ Thanh Toán Thành Công!')
      .setDescription([
        `🛒 **Đơn hàng:** \`${order.order_id}\``,
        `📦 **Loại acc:** ${acc.type}`,
        `💰 **Giá:** ${Number(acc.price).toLocaleString('vi-VN')}đ`,
        `\n🔑 **Thông tin tài khoản:**`,
        `\`\`\`${acc.data}\`\`\``,
        `\n⭐ Cảm ơn bạn đã mua hàng!`,
      ].join('\n'))
      .setColor(0x57F287).setTimestamp();

    await user.send({ embeds: [accEmbed] }).catch(async () => {
      const opts = { embeds: [accEmbed], flags: 64 };
      if (interaction.replied || interaction.deferred) await interaction.followUp(opts);
      else await interaction.reply(opts);
    });

    await ticketManager.createTicket(interaction.guild, interaction.member, order.order_id, `Hỗ trợ đơn ${order.order_id} - ${acc.type}`);
    logger.info(`Delivered: ${acc.account_id} → ${user.username}`);
  } catch (err) {
    logger.error('deliverAccount error:', err);
  }
}

module.exports = { shopCommand, sendShopEmbed, handleSelectType, handleBankPayment, showCardModal, handleCardSubmit };
