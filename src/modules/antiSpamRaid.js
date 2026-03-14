const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');

// ========================
// ANTI SPAM LINK
// ========================
const BLOCKED_PATTERNS = [
  /discord\.gg\/[a-zA-Z0-9]+/gi,
  /discord\.com\/invite\/[a-zA-Z0-9]+/gi,
  /bit\.ly\/[a-zA-Z0-9]+/gi,
  /tinyurl\.com\/[a-zA-Z0-9]+/gi,
  /t\.me\/[a-zA-Z0-9]+/gi,
];

const messageCache = new Map(); // userId => [timestamps]
const SPAM_THRESHOLD = 5;  // 5 tin nhắn
const SPAM_WINDOW = 5000;  // trong 5 giây

async function handleAntiSpam(message) {
  if (!message.guild) return false;
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const userId = message.author.id;
  const now = Date.now();

  // Kiểm tra link bậy
  const hasBlockedLink = BLOCKED_PATTERNS.some(p => p.test(message.content));
  if (hasBlockedLink) {
    await message.delete().catch(() => {});
    const warn = await message.channel.send({
      content: `⚠️ ${message.author} - **Không được gửi link mời Discord hoặc link rút gọn!**`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 5000);
    await logModAction(message.guild, 'SPAM_LINK', message.author, null, `Link bị chặn trong #${message.channel.name}`);
    return true;
  }

  // Kiểm tra spam tin nhắn
  if (!messageCache.has(userId)) messageCache.set(userId, []);
  const timestamps = messageCache.get(userId).filter(t => now - t < SPAM_WINDOW);
  timestamps.push(now);
  messageCache.set(userId, timestamps);

  if (timestamps.length >= SPAM_THRESHOLD) {
    // Timeout 10 phút
    await message.member.timeout(10 * 60 * 1000, 'Spam tin nhắn quá nhiều').catch(() => {});
    messageCache.delete(userId);
    const warn = await message.channel.send({
      content: `🔇 ${message.author} đã bị mute 10 phút do spam!`,
    });
    setTimeout(() => warn.delete().catch(() => {}), 8000);
    await logModAction(message.guild, 'AUTO_MUTE', message.author, null, 'Spam tin nhắn');
    return true;
  }

  return false;
}

// ========================
// ANTI RAID
// ========================
const joinLog = new Map(); // guildId => [timestamps]
const RAID_THRESHOLD = 10; // 10 người join
const RAID_WINDOW = 10000; // trong 10 giây
const raidLockdowns = new Set();

async function handleAntiRaid(member) {
  const guildId = member.guild.id;
  const now = Date.now();

  if (!joinLog.has(guildId)) joinLog.set(guildId, []);
  const joins = joinLog.get(guildId).filter(t => now - t < RAID_WINDOW);
  joins.push(now);
  joinLog.set(guildId, joins);

  if (joins.length >= RAID_THRESHOLD && !raidLockdowns.has(guildId)) {
    // Bật lockdown
    raidLockdowns.add(guildId);
    logger.warn(`🚨 RAID DETECTED in guild ${guildId}`);

    const logChannel = member.guild.channels.cache.get(config.channels.log);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 RAID PHÁT HIỆN!')
        .setDescription(`${joins.length} thành viên join trong 10 giây!\n\n⚠️ Đã bật chế độ lockdown tạm thời!`)
        .setColor(0xED4245)
        .setTimestamp();
      await logChannel.send({ content: `<@&${config.roles.admin}>`, embeds: [embed] });
    }

    // Tự tắt lockdown sau 5 phút
    setTimeout(() => {
      raidLockdowns.delete(guildId);
      joinLog.set(guildId, []);
      logger.info(`Raid lockdown lifted for ${guildId}`);
    }, 5 * 60 * 1000);

    return true;
  }

  // Nếu đang lockdown - kick thành viên mới
  if (raidLockdowns.has(guildId)) {
    await member.kick('Anti-raid: Server đang lockdown').catch(() => {});
    return true;
  }

  return false;
}

// ========================
// LOG MOD ACTIONS
// ========================
async function logModAction(guild, action, target, moderator, reason) {
  const logChannel = guild.channels.cache.get(config.channels.log);
  if (!logChannel) return;

  const colors = {
    BAN: 0xED4245, KICK: 0xFEA500, MUTE: 0xFEE75C,
    UNMUTE: 0x57F287, DELETE: 0x99AAB5, SPAM_LINK: 0xEB459E,
    AUTO_MUTE: 0xFEA500,
  };

  const embed = new EmbedBuilder()
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: 'Đối tượng', value: target ? `${target.tag || target.username} (${target.id})` : 'N/A', inline: true },
      { name: 'Moderator', value: moderator ? `${moderator.tag || moderator.username}` : 'Bot', inline: true },
      { name: 'Lý do', value: reason || 'Không có lý do', inline: false },
    )
    .setColor(colors[action] || 0x5865F2)
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

module.exports = { handleAntiSpam, handleAntiRaid, logModAction };
