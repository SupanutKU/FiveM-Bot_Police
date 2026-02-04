module.exports = function weeklySummary(cases) {
  const now = new Date();

  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return cases.filter(c => {
    const d = new Date(c.createdAt);
    return d >= start && d < end;
  });
};
