const sqlite3 = require('sqlite3').verbose();
const ExcelJS = require('exceljs');
const path = require('path');

module.exports = async function exportDutyExcel() {
  const dbPath = path.join(__dirname, '../data/duty.db');
  const db = new sqlite3.Database(dbPath);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Duty Logs');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Steam ID', key: 'steam_id', width: 25 },
    { header: 'UID', key: 'uid', width: 10 },
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Action', key: 'action', width: 15 },
    { header: 'Time', key: 'time', width: 25 },
  ];

  db.all(`SELECT * FROM duty_logs ORDER BY time ASC`, async (err, rows) => {
    if (err) {
      console.error('❌ DB error:', err);
      return;
    }

    rows.forEach(row => sheet.addRow(row));

    const fileName = `duty_export_${Date.now()}.xlsx`;
    await workbook.xlsx.writeFile(fileName);

    console.log(`✅ Exported Excel: ${fileName}`);
    db.close();
  });
};
