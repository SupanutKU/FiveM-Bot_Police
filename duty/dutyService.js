const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(
  path.join(__dirname, '../data/duty.db')
);

db.run(`
  CREATE TABLE IF NOT EXISTS duty_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT,
    name TEXT,
    action TEXT,
    timestamp DATETIME
  )
`);

function insertLog({ uid, name, action, timestamp }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO duty_logs (uid, name, action, timestamp)
       VALUES (?, ?, ?, ?)`,
      [uid, name, action, timestamp],
      err => (err ? reject(err) : resolve())
    );
  });
}

function getLogsBetween(start, end) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM duty_logs
       WHERE timestamp BETWEEN ? AND ?
       ORDER BY timestamp ASC`,
      [start, end],
      (err, rows) => (err ? reject(err) : resolve(rows))
    );
  });
}

module.exports = {
  insertLog,
  getLogsBetween
};
