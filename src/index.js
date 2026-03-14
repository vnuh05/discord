require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
// Khởi động SQLite ngay khi import
require('./database');
const logger = require('./utils/logger');

if (!fs.existsSync('logs')) fs.mkdirSync('logs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

client.commands = new Collection();

// Load commands
const { shopCommand } = require('./commands/shop');
const { commands: adminCommands } = require('./commands/admin');
const allCommands = [shopCommand, ...adminCommands];
for (const cmd of allCommands) client.commands.set(cmd.data.name, cmd);
logger.info(`📋 Loaded ${allCommands.length} commands`);

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else client.on(event.name, (...args) => event.execute(...args, client));
  logger.info(`📡 Event: ${event.name}`);
}

client.on('error', err => logger.error('Client error:', err));
process.on('unhandledRejection', err => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', err => { logger.error('Uncaught exception:', err); process.exit(1); });

if (!config.discord.token) {
  console.error("❌ Lỗi: thiếu bot token trong config!");
} else {
  client.login(config.discord.token)
    .then(() => logger.info('🚀 Bot đã khởi động!'))
    .catch(err => {
      console.error("❌ Không thể đăng nhập bot:", err.message);
    });
}
module.exports = client;
