const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(
  path.join(__dirname, 'duty.db')
);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS duty_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uid TEXT,
      name TEXT,
      action TEXT,
      time TEXT
    )
  `);
});

module.exports = db;
