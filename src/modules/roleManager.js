const config = require('../config');
const { Users } = require('../models/index');
const logger = require('../utils/logger');

async function updateSpendingAndRole(guild, discordId, username, amount) {
  const user = Users.addSpending(discordId, username, amount);
  const newTier = await updateTierRole(guild, discordId, user.total_spent);
  if (newTier) Users.updateTier(discordId, newTier.name);
  return user;
}

async function updateTierRole(guild, discordId, totalSpent) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return null;

  const tiers = [...config.roles.tiers].sort((a, b) => b.min - a.min);
  let newTier = null;
  for (const tier of tiers) {
    if (totalSpent >= tier.min && tier.id) { newTier = tier; break; }
  }

  for (const tier of config.roles.tiers) {
    if (tier.id && member.roles.cache.has(tier.id)) await member.roles.remove(tier.id).catch(() => {});
  }
  if (newTier?.id) {
    await member.roles.add(newTier.id).catch(() => {});
    logger.info(`Role updated: ${member.user.username} → ${newTier.name}`);
    return newTier;
  }
  return null;
}

async function resetMonthlySpending() {
  Users.resetMonthly();
  logger.info('Monthly spending reset for all users');
}

async function getMonthlyLeaderboard(limit = 10) {
  return Users.getMonthlyLeaderboard(limit);
}

module.exports = { updateSpendingAndRole, updateTierRole, resetMonthlySpending, getMonthlyLeaderboard };

