const path = require('path');
const XLSX = require('xlsx');
const sqlite3 = require('sqlite3').verbose();

module.exports = async function exportExcelFromDB() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, '../duty/duty.db');
    const db = new sqlite3.Database(dbPath);

    db.all(`SELECT * FROM duty_logs ORDER BY time ASC`, (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }

      const data = rows.map((r, i) => ({
        ลำดับ: i + 1,
        เจ้าหน้าที่: r.officer_id,
        สถานะ: r.action === 'IN' ? 'เข้าเวร' : 'ออกเวร',
        เวลา: new Date(r.time).toLocaleString('th-TH')
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      XLSX.utils.book_append_sheet(wb, ws, 'Duty Logs');

      const filePath = path.join(
        __dirname,
        `duty-${Date.now()}.xlsx`
      );

      XLSX.writeFile(wb, filePath);
      db.close();

      resolve(filePath);
    });
  });
};
