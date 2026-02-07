const path = require("path");
const XLSX = require("xlsx");
const sqlite3 = require("sqlite3").verbose();

function exportDutyExcelLocal() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, "duty.db");
    const db = new sqlite3.Database(dbPath);

    const sql = `
      SELECT uid, action, time
      FROM duty
      ORDER BY time ASC
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }

      const data = rows.map((r, i) => ({
        ลำดับ: i + 1,
        เจ้าหน้าที่: r.uid,
        สถานะ: r.action === "IN" ? "เข้าเวร" : "ออกเวร",
        เวลา: new Date(r.time).toLocaleString("th-TH"),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      ws["!cols"] = [
        { wch: 8 },
        { wch: 20 },
        { wch: 15 },
        { wch: 25 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Duty Logs");

      const filePath = path.join(
        __dirname,
        `duty-${Date.now()}.xlsx`
      );

      XLSX.writeFile(wb, filePath);
      db.close();

      resolve(filePath);
    });
  });
}

module.exports = {
  exportDutyExcelLocal,
};
