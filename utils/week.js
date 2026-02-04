function getWeekKey(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day;
  const start = new Date(d.setDate(diff));
  start.setHours(0,0,0,0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${start.toISOString().slice(0,10)}_${end.toISOString().slice(0,10)}`;
}

module.exports = { getWeekKey };
