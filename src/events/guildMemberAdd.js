const { handleAntiRaid } = require('../modules/antiSpamRaid');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    await handleAntiRaid(member);
  },
};
