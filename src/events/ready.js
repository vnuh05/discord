const { REST, Routes } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const cron = require('node-cron');
const { resetMonthlySpending } = require('../modules/roleManager');
const { sendShopEmbed } = require('../commands/shop');
const accManager = require('../modules/accManager');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    logger.info(`✅ Bot online: ${client.user.tag}`);
    client.user.setActivity('🛒 Shop ACC | /shop', { type: 0 });

    // Register slash commands
    const rest = new REST().setToken(config.discord.token);
    const commands = [...client.commands.values()].map(cmd => cmd.data.toJSON());

    try {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      logger.info(`✅ Registered ${commands.length} slash commands`);
    } catch (err) {
      logger.error('Failed to register commands:', err);
    }

    // Gửi shop embed vào kênh shop lúc khởi động
    const shopChannel = client.channels.cache.get(config.channels.shop);
    if (shopChannel) {
      await sendShopEmbed(shopChannel).catch(() => {});
    }

    // Cron: Reset chi tiêu tháng vào ngày 1 hàng tháng lúc 0:00
    cron.schedule('0 0 1 * *', async () => {
      await resetMonthlySpending();
      logger.info('Monthly spending reset completed');

      // Thông báo lên kênh
      const logChannel = client.channels.cache.get(config.channels.log);
      if (logChannel) {
        await logChannel.send('🔄 **Reset chi tiêu tháng** đã được thực hiện! Bảng xếp hạng tháng mới bắt đầu.');
      }
    });

    // Cancel stale pending orders on startup and periodically
    await accManager.cancelStalePendingOrders(client);
    setInterval(() => accManager.cancelStalePendingOrders(client), 60 * 1000);

    logger.info('🕐 Cron jobs scheduled');
  },
};
