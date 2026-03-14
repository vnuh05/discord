const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const accManager = require('../modules/accManager');
const { logModAction } = require('../modules/antiSpamRaid');
const { Users, Staff } = require('../models/index');
const { resetMonthlySpending, getMonthlyLeaderboard } = require('../modules/roleManager');
const logger = require('../utils/logger');

// ── /addacc ──
const addAccCommand = {
  data: new SlashCommandBuilder()
    .setName('addacc').setDescription('Thêm acc vào kho [Admin]')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('type').setDescription('Loại acc').setRequired(true))
    .addIntegerOption(o => o.setName('price').setDescription('Giá (VNĐ)').setRequired(true))
    .addStringOption(o => o.setName('accounts').setDescription('Danh sách acc, mỗi dòng 1 acc').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Mô tả').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ flags: 64 });
    const type = interaction.options.getString('type');
    const price = interaction.options.getInteger('price');
    const raw = interaction.options.getString('accounts');
    const description = interaction.options.getString('description') || '';
    const lines = raw.split(/[\n,]/).map(l => l.trim()).filter(Boolean);
    const result = await accManager.addAccounts(lines, type, price, interaction.user.id, description);
    await interaction.editReply({ content: `✅ Đã thêm **${result.success}** acc loại **${type}**!\n❌ Thất bại: ${result.failed}` });
  },
};

// ── /stock ──
const stockCommand = {
  data: new SlashCommandBuilder().setName('stock').setDescription('Xem stock acc hiện tại'),

  async execute(interaction) {
    await interaction.deferReply();
    const allStock = await accManager.getAllStock();
    const grouped = {};
    for (const item of allStock) {
      const t = item.type;
      if (!grouped[t]) grouped[t] = { available: 0, sold: 0, price: item.price };
      grouped[t][item.status] = (grouped[t][item.status] || 0) + item.count;
    }

    const embed = new EmbedBuilder().setTitle('📦 Kho Hàng Hiện Tại').setColor(0x5865F2).setTimestamp();
    if (Object.keys(grouped).length === 0) {
      embed.setDescription('Kho hiện tại trống!');
    } else {
      for (const [type, data] of Object.entries(grouped)) {
        embed.addFields({
          name: `📦 ${type}`,
          value: `✅ Còn: **${data.available || 0}** | ❌ Đã bán: **${data.sold || 0}** | 💰 ${Number(data.price).toLocaleString('vi-VN')}đ`,
          inline: false,
        });
      }
    }
    await interaction.editReply({ embeds: [embed] });
  },
};

// ── /ban ──
const banCommand = {
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban thành viên [Mod]')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false))
    .addIntegerOption(o => o.setName('days').setDescription('Xóa tin nhắn (ngày)').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'Không có lý do';
    const days = interaction.options.getInteger('days') || 0;
    if (!target?.bannable) return interaction.reply({ content: '❌ Không thể ban!', flags: 64 });
    await target.ban({ reason, deleteMessageSeconds: days * 86400 });
    await logModAction(interaction.guild, 'BAN', target.user, interaction.user, reason);
    await interaction.reply({ content: `✅ Đã ban **${target.user.username}** | Lý do: ${reason}` });
  },
};

// ── /kick ──
const kickCommand = {
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('Kick thành viên [Mod]')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') || 'Không có lý do';
    if (!target?.kickable) return interaction.reply({ content: '❌ Không thể kick!', flags: 64 });
    await target.kick(reason);
    await logModAction(interaction.guild, 'KICK', target.user, interaction.user, reason);
    await interaction.reply({ content: `✅ Đã kick **${target.user.username}**` });
  },
};

// ── /mute ──
const muteCommand = {
  data: new SlashCommandBuilder()
    .setName('mute').setDescription('Mute thành viên [Mod]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Số phút').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason') || 'Không có lý do';
    if (!target) return interaction.reply({ content: '❌ Không tìm thấy!', flags: 64 });
    await target.timeout(minutes * 60 * 1000, reason);
    await logModAction(interaction.guild, 'MUTE', target.user, interaction.user, `${minutes} phút - ${reason}`);
    await interaction.reply({ content: `🔇 Đã mute **${target.user.username}** ${minutes} phút` });
  },
};

// ── /purge ──
const purgeCommand = {
  data: new SlashCommandBuilder()
    .setName('purge').setDescription('Xóa tin nhắn của 1 user [Mod]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Số tin nhắn (tối đa 100)').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = Math.min(interaction.options.getInteger('amount'), 100);
    await interaction.deferReply({ flags: 64 });
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const userMessages = messages.filter(m => m.author.id === target.id).first(amount);
    let deleted = 0;
    for (const msg of userMessages.values()) { await msg.delete().catch(() => {}); deleted++; }
    await logModAction(interaction.guild, 'DELETE', target, interaction.user, `${deleted} tin nhắn`);
    await interaction.editReply({ content: `✅ Đã xóa **${deleted}** tin nhắn của ${target.username}` });
  },
};

// ── /salary ──
const salaryCommand = {
  data: new SlashCommandBuilder()
    .setName('salary').setDescription('Xem bảng lương CSKH [Admin]')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply();
    const staffList = Staff.getAll().filter(s => s.monthly_orders > 0);

    const embed = new EmbedBuilder().setTitle('💼 Bảng Lương CSKH Tháng Này').setColor(0x57F287).setTimestamp();
    if (staffList.length === 0) {
      embed.setDescription('Chưa có dữ liệu lương tháng này!');
    } else {
      embed.setDescription(staffList.map((s, i) =>
        `**${i + 1}.** <@${s.discord_id}> — ${s.monthly_orders} đơn — **${Number(s.monthly_earnings).toLocaleString('vi-VN')}đ**`
      ).join('\n'));
    }
    const total = staffList.reduce((sum, s) => sum + s.monthly_earnings, 0);
    embed.setFooter({ text: `Tổng chi phí lương: ${Number(total).toLocaleString('vi-VN')}đ | 7,000đ/đơn` });
    await interaction.editReply({ embeds: [embed] });
  },
};

// ── /leaderboard ──
const leaderboardCommand = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top khách hàng chi tiêu tháng này'),

  async execute(interaction) {
    await interaction.deferReply();
    const top = await getMonthlyLeaderboard(10);
    const medals = ['🥇', '🥈', '🥉'];
    const embed = new EmbedBuilder().setTitle('🏆 Bảng Xếp Hạng Chi Tiêu Tháng Này').setColor(0xFEE75C).setTimestamp();
    embed.setDescription(
      top.length > 0
        ? top.map((u, i) => `${medals[i] || `**${i + 1}.**`} <@${u.discord_id}> — **${Number(u.monthly_spent).toLocaleString('vi-VN')}đ**`).join('\n')
        : 'Chưa có dữ liệu!'
    );
    await interaction.editReply({ embeds: [embed] });
  },
};

// ── /ticket ──
const ticketCommand = {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Tạo ticket hỗ trợ'),

  async execute(interaction) {
    const ticketManager = require('../modules/ticketManager');
    const { channel } = await ticketManager.createTicket(interaction.guild, interaction.member, null, 'Hỗ trợ chung');
    await interaction.reply({ content: `✅ Ticket đã tạo: ${channel}`, flags: 64 });
  },
};

module.exports = {
  commands: [addAccCommand, stockCommand, banCommand, kickCommand, muteCommand, purgeCommand, salaryCommand, leaderboardCommand, ticketCommand],
};
