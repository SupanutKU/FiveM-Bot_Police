function calculateTotalTime(logs) {
  let totalMs = 0;
  let lastOn = null;

  for (const log of logs) {
    const time = new Date(log.timestamp);

    if (log.action === 'on') {
      lastOn = time;
    }

    if (log.action === 'off' && lastOn) {
      totalMs += time - lastOn;
      lastOn = null;
    }
  }

  return totalMs;
}

function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);

  return `${h} ชม. ${m} นาที`;
}

module.exports = {
  calculateTotalTime,
  formatDuration
};
