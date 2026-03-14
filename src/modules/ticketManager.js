const {
  ChannelType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../config');
const { Tickets, Staff } = require('../models/index');
const logger = require('../utils/logger');

let ticketCounter = 0;
function generateTicketId() {
  ticketCounter++;
  return `TKT-${Date.now()}-${ticketCounter}`;
}

// ════════════════════════════
//  TẠO TICKET
// ════════════════════════════
async function createTicket(guild, member, orderId = null, reason = 'Hỗ trợ chung') {
  try {
    const ticketId = generateTicketId();
    const allTickets = Tickets.getAll({}, 9999, 0);
    const ticketNumber = allTickets.total + 1;
    const channelName = `ticket-${String(ticketNumber).padStart(4, '0')}`;

    // Xây dựng permissionOverwrites
    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ];

    // Thêm quyền admin
    if (config.roles.admin) {
      permissionOverwrites.push({ id: config.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] });
    }

    // Tạo channel options
    const channelOptions = {
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites,
    };

    // Chỉ thêm parent nếu là category hợp lệ
    if (config.channels.ticketCategory) {
      const categoryChannel = await guild.channels.fetch(config.channels.ticketCategory).catch(() => null);
      if (categoryChannel && categoryChannel.type === ChannelType.GuildCategory) {
        channelOptions.parent = config.channels.ticketCategory;
      } else {
        logger.warn('Ticket category ID is not a valid category channel, creating without category');
      }
    }

    const channel = await guild.channels.create(channelOptions);

    Tickets.create({ ticketId, channelId: channel.id, userId: member.id, username: member.user.username, orderId });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, '0')}`)
      .setDescription([
        `Xin chào ${member}! 👋`,
        ``,
        `📋 **Lý do:** ${reason}`,
        orderId ? `🛒 **Đơn hàng:** \`${orderId}\`` : '',
        ``,
        `⏳ Vui lòng chờ nhân viên tiếp nhận. Tối đa **5 phút**.`,
      ].filter(Boolean).join('\n'))
      .setColor(0x5865F2).setTimestamp()
      .setFooter({ text: `ID: ${ticketId}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('🔒 Đóng Ticket').setStyle(ButtonStyle.Danger)
    );

    await channel.send({ content: `${member}`, embeds: [embed], components: [row] });
    await notifyCSStaff(guild, member, { ticketId }, ticketNumber, channel, reason);

    logger.info(`Ticket ${ticketId} created for ${member.user.username}`);
    return { ticket: Tickets.find(ticketId), channel };
  } catch (err) {
    logger.error('createTicket error:', err);
    throw err;
  }
}

// ════════════════════════════
//  THÔNG BÁO CSKH
// ════════════════════════════
async function notifyCSStaff(guild, member, ticket, ticketNumber, ticketChannel, reason) {
  const notifyChannel = guild.channels.cache.get(config.channels.notifyCS);
  if (!notifyChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('🔔 Ticket Mới Cần Tiếp Nhận!')
    .setDescription([
      `👤 **Khách:** ${member.user.username} (${member.id})`,
      `📋 **Lý do:** ${reason}`,
      `🎫 **Ticket:** #${String(ticketNumber).padStart(4, '0')}`,
      `📍 **Kênh:** ${ticketChannel}`,
      ``,
      `⚠️ Sau **5 phút** không nhận → tự random sang người khác!`,
    ].join('\n'))
    .setColor(0xFEE75C).setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_accept_${ticket.ticketId}`).setLabel('✅ Nhận Ticket').setStyle(ButtonStyle.Success)
  );

  const msg = await notifyChannel.send({
    content: config.roles.cs ? `<@&${config.roles.cs}> - Có ticket mới!` : 'Có ticket mới!',
    embeds: [embed], components: [row],
  });

  startTicketTimeout(guild, ticket, msg, member, ticketNumber, ticketChannel, reason, []);
}

// ════════════════════════════
//  TIMER 5 PHÚT
// ════════════════════════════
const ticketTimers = new Map();

function startTicketTimeout(guild, ticket, notifyMsg, member, ticketNumber, ticketChannel, reason, excludedStaff) {
  if (ticketTimers.has(ticket.ticketId)) clearTimeout(ticketTimers.get(ticket.ticketId));

  const timer = setTimeout(async () => {
    try {
      const current = Tickets.find(ticket.ticketId);
      if (!current || current.status !== 'open') return;

      // Kiểm tra role CS có tồn tại không
      if (!config.roles.cs) return;
      const csRole = guild.roles.cache.get(config.roles.cs);
      if (!csRole) return;

      const available = csRole.members.filter(m => !m.user.bot && !excludedStaff.includes(m.id));
      if (available.size === 0) {
        startTicketTimeout(guild, ticket, notifyMsg, member, ticketNumber, ticketChannel, reason, []);
        return;
      }

      const randomCS = available.random();
      const embed = new EmbedBuilder()
        .setTitle('⏰ Hết giờ - Chuyển nhân viên!')
        .setDescription([
          `👤 **Khách:** ${member.user.username}`,
          `🎫 **Ticket:** #${String(ticketNumber).padStart(4, '0')}`,
          `🔄 Đã random sang: ${randomCS}`,
        ].join('\n'))
        .setColor(0xED4245).setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket_accept_${ticket.ticketId}`).setLabel('✅ Nhận Ticket').setStyle(ButtonStyle.Success)
      );

      await notifyMsg.edit({ content: `${randomCS} - Bạn được random nhận ticket này!`, embeds: [embed], components: [row] });
      startTicketTimeout(guild, ticket, notifyMsg, member, ticketNumber, ticketChannel, reason, [...excludedStaff, randomCS.id]);
    } catch (err) {
      logger.error('Ticket timeout error:', err);
    }
  }, config.cs.ticketTimeout || 300000);

  ticketTimers.set(ticket.ticketId, timer);
}

// ════════════════════════════
//  NHẬN TICKET
// ════════════════════════════
async function acceptTicket(interaction, ticketId) {
  const ticket = Tickets.find(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket!', flags: 64 });
  if (ticket.status !== 'open') return interaction.reply({ content: '❌ Ticket đã được nhận rồi!', flags: 64 });

  Tickets.assign(ticketId, interaction.user.id, interaction.user.username);

  if (ticketTimers.has(ticketId)) { clearTimeout(ticketTimers.get(ticketId)); ticketTimers.delete(ticketId); }

  const ticketChannel = interaction.guild.channels.cache.get(ticket.channel_id);
  if (ticketChannel) {
    await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    const embed = new EmbedBuilder()
      .setTitle('✅ Nhân viên đã tiếp nhận!')
      .setDescription(`${interaction.user} sẽ hỗ trợ bạn ngay! Vui lòng mô tả vấn đề.`)
      .setColor(0x57F287).setTimestamp();
    await ticketChannel.send({ embeds: [embed] });
  }

  await interaction.update({ content: `✅ ${interaction.user.username} đã nhận ticket!`, components: [] });
}

// ════════════════════════════
//  ĐÓNG TICKET + ĐÁNH GIÁ
// ════════════════════════════
async function closeTicket(interaction, ticketId) {
  const ticket = Tickets.find(ticketId);
  if (!ticket) return interaction.reply({ content: '❌ Không tìm thấy ticket!', flags: 64 });
  if (ticket.status === 'closed') return interaction.reply({ content: '❌ Ticket đã đóng rồi!', flags: 64 });

  const embed = new EmbedBuilder()
    .setTitle('⭐ Đánh Giá Dịch Vụ')
    .setDescription('Hãy đánh giá trải nghiệm hỗ trợ lần này!')
    .setColor(0xFEE75C);

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_rate_${ticketId}`)
      .setPlaceholder('Chọn số sao...')
      .addOptions([
        { label: '⭐ 1 sao - Rất tệ',        value: '1', emoji: '😡' },
        { label: '⭐⭐ 2 sao - Tệ',           value: '2', emoji: '😞' },
        { label: '⭐⭐⭐ 3 sao - Bình thường', value: '3', emoji: '😐' },
        { label: '⭐⭐⭐⭐ 4 sao - Tốt',       value: '4', emoji: '😊' },
        { label: '⭐⭐⭐⭐⭐ 5 sao - Xuất sắc', value: '5', emoji: '🤩' },
      ])
  );

  const ch = interaction.guild.channels.cache.get(ticket.channel_id);
  if (ch) await ch.send({ content: `<@${ticket.user_id}> - Đánh giá trước khi đóng nhé!`, embeds: [embed], components: [row] });
  await interaction.reply({ content: '⏳ Đã gửi form đánh giá. Ticket tự đóng sau 2 phút nếu không đánh giá.', flags: 64 });
  setTimeout(() => forceCloseTicket(interaction.guild, ticket), 120000);
}

async function forceCloseTicket(guild, ticket) {
  try {
    Tickets.close(ticket.ticket_id);
    const channel = guild.channels.cache.get(ticket.channel_id);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Đã Đóng')
        .setDescription('Cảm ơn bạn đã sử dụng dịch vụ!')
        .setColor(0x99AAB5).setTimestamp();
      await channel.send({ embeds: [embed] });
      setTimeout(() => channel.delete().catch(() => {}), 5000);
    }

    // Cộng lương cho CSKH
    if (ticket.cs_staff_id) {
      Staff.addOrder(ticket.cs_staff_id, ticket.cs_staff_name, config.cs.commissionPerOrder);
    }
  } catch (err) {
    logger.error('forceCloseTicket error:', err);
  }
}

// ════════════════════════════
//  LƯU ĐÁNH GIÁ
// ════════════════════════════
async function saveRating(interaction, ticketId, rating) {
  const ticket = Tickets.find(ticketId);
  if (!ticket) {
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({ content: '❌ Không tìm thấy ticket!', flags: 64 });
    }
    return;
  }

  Tickets.rate(ticketId, parseInt(rating));
  const stars = '⭐'.repeat(parseInt(rating));

  if (interaction.isRepliable() && !interaction.replied) {
    await interaction.reply({ content: `Cảm ơn bạn đã đánh giá ${stars} (${rating}/5)!` });
  }

  const reviewChannel = interaction.guild.channels.cache.get(config.channels.review);
  if (reviewChannel) {
    const embed = new EmbedBuilder()
      .setTitle('📝 Đánh Giá Mới')
      .setDescription([
        `👤 **Khách:** <@${ticket.user_id}>`,
        ticket.cs_staff_id ? `🧑‍💼 **CSKH:** <@${ticket.cs_staff_id}>` : '',
        `⭐ **Đánh giá:** ${stars} (${rating}/5)`,
      ].filter(Boolean).join('\n'))
      .setColor(rating >= 4 ? 0x57F287 : rating >= 3 ? 0xFEE75C : 0xED4245)
      .setTimestamp();
    await reviewChannel.send({ embeds: [embed] });
  }

  setTimeout(() => forceCloseTicket(interaction.guild, Tickets.find(ticketId)), 3000);
}

module.exports = { createTicket, acceptTicket, closeTicket, saveRating };

