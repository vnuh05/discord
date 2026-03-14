const ticketManager = require('../modules/ticketManager');
const shop = require('../commands/shop');
const { logModAction } = require('../modules/antiSpamRaid');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const db = require('../database');

function isBotEnabled() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'BOT_ENABLED'").get();
    return row ? row.value !== '0' : true;
  } catch {
    return true;
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      if (!isBotEnabled()) {
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '⛔ Bot đang tạm tắt. Vui lòng thử lại sau.', flags: 64 }).catch(() => {});
        }
        return;
      }

      // =================== SLASH COMMANDS ===================
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, client);
        return;
      }

      // =================== BUTTONS ===================
      if (interaction.isButton()) {
        const { customId } = interaction;

        // --- TICKET: Accept ---
        if (customId.startsWith('ticket_accept_')) {
          const ticketId = customId.replace('ticket_accept_', '');
          await ticketManager.acceptTicket(interaction, ticketId);
          return;
        }

        // --- TICKET: Close ---
        if (customId.startsWith('ticket_close_')) {
          const ticketId = customId.replace('ticket_close_', '');
          await ticketManager.closeTicket(interaction, ticketId);
          return;
        }

        // --- TICKET: Create from support button ---
        if (customId === 'ticket_create_support') {
          const { createTicket } = ticketManager;
          const { ticket, channel } = await createTicket(
            interaction.guild, interaction.member, null, 'Hỗ trợ chung'
          );
          await interaction.reply({ content: `✅ Đã tạo ticket: ${channel}`, flags: 64 });
          return;
        }

        // --- SHOP: Check stock ---
        if (customId === 'shop_check_stock') {
          const accManager = require('../modules/accManager');
          const allStock = await accManager.getAllStock();
          // Sửa lỗi: s.status thay vì s._id.status
          const available = allStock.filter(s => s.status === 'available' && s.count > 0);
          const text = available.length > 0
            ? available.map(s => `• **${s.type}**: ${s.count} còn — ${s.price?.toLocaleString('vi-VN')}đ`).join('\n')
            : 'Hết hàng!';
          await interaction.reply({ content: `📦 **Kho hàng:**\n${text}`, flags: 64 });
          return;
        }

        // --- PAY: Bank ---
        if (customId.startsWith('pay_bank_')) {
          const accId = customId.replace('pay_bank_', '');
          await shop.handleBankPayment(interaction, accId);
          return;
        }

        // --- PAY: Card ---
        if (customId.startsWith('pay_card_')) {
          const accId = customId.replace('pay_card_', '');
          await shop.showCardModal(interaction, accId);
          return;
        }

        // --- PAY: Cancel ---
        if (customId.startsWith('pay_cancel_')) {
          const accId = customId.replace('pay_cancel_', '');
          const accManager = require('../modules/accManager');
          const order = await accManager.findPendingOrderByAccId(accId);
          if (order) {
            await accManager.cancelPendingOrder(order.order_id);
            const embed = new EmbedBuilder()
              .setTitle('❌ Đơn hàng đã bị hủy')
              .setDescription(`⏹️ <@${interaction.user.id}> Đơn hàng ${order.order_id} đã được hủy theo yêu cầu.`)
              .setColor(0xED4245)
              .setTimestamp();
            await interaction.update({ embeds: [embed], components: [] });
            return;
          }

          await accManager.cancelReserve(accId);
          await interaction.update({ content: '❌ Đã hủy đơn hàng.', embeds: [], components: [] });
          return;
        }
      }

      // =================== SELECT MENUS ===================
      if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;

        // --- SHOP: Chọn loại acc ---
        if (customId === 'shop_select_type') {
          await shop.handleSelectType(interaction, values[0]);
          return;
        }

        // --- TICKET: Rating ---
        if (customId.startsWith('ticket_rate_')) {
          const ticketId = customId.replace('ticket_rate_', '');
          await ticketManager.saveRating(interaction, ticketId, values[0]);
          return;
        }
      }

      // =================== MODALS ===================
      if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        // --- Card payment modal ---
        if (customId.startsWith('card_modal_')) {
          const accId = customId.replace('card_modal_', '');
          await shop.handleCardSubmit(interaction, accId);
          return;
        }
      }

    } catch (err) {
      logger.error(`Interaction error [${interaction.customId || interaction.commandName}]:`, err);
      const msg = { content: '❌ Có lỗi xảy ra!', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  },
};

