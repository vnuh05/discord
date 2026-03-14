const { handleAntiSpam } = require('../modules/antiSpamRaid');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    await handleAntiSpam(message);
  },
};

