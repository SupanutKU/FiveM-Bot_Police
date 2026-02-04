const { getLogsBetween } = require('../duty/dutyService');
const {
  calculateTotalTime,
  formatDuration
} = require('../duty/dutyCalculator');

function getWeekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

async function weeklyDutySummary() {
  const { start, end } = getWeekRange();
  const logs = await getLogsBetween(start, end);

  const byUser = {};
  for (const log of logs) {
    byUser[log.uid] ??= [];
    byUser[log.uid].push(log);
  }

  const result = [];
  for (const uid in byUser) {
    const total = calculateTotalTime(byUser[uid]);
    result.push({
      uid,
      name: byUser[uid][0].name,
      time: formatDuration(total)
    });
  }

  return result;
}

module.exports = weeklyDutySummary;
