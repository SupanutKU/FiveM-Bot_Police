const db = require('./dutyDB');

function insertDutyLog({ uid, name, action, time }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO duty_logs (uid, name, action, time)
       VALUES (?, ?, ?, ?)`,
      [uid, name, action, time],
      err => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = { insertDutyLog };
