/* ===== EXPORT ALL CASES TO EXCEL (FORMAT) ===== */
if (i.isButton() && i.customId === 'export_excel') {
  try {
    const cases = loadCases();
    const guild = i.guild;

    if (!cases.length) {
      return i.reply({ content: '❌ ไม่มีข้อมูลคดี', ephemeral: true });
    }

    const rows = cases.map(c => {
      const officerMember = guild.members.cache.get(c.officer);

      const helperMembers = (c.helpers || []).map(id => {
        const m = guild.members.cache.get(id);
        return {
          name: m ? m.user.username : 'Unknown',
          id
        };
      });

      return {
        'เลขคดี': `คดี-${c.type}-${c.id}`,
        'ประเภทคดี': c.type,
        'คนลงคดี (ชื่อ)': officerMember?.user.username || 'Unknown',
        'คนลงคดี (ID)': c.officer,
        'ผู้ช่วยเหลือ (ชื่อ)': helperMembers.map(h => h.name).join(', ') || 'ไม่มี',
        'ผู้ช่วยเหลือ (ID)': helperMembers.map(h => h.id).join(', ') || '-',
        'วันที่บันทึก': new Date(c.createdAt).toLocaleString('th-TH'),
        'ลิงก์บันทึกคดี':
          `https://discord.com/channels/${guild.id}/${LOG_CHANNEL_ID}/${c.logMessageId}`
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    /* ปรับความกว้าง column */
    worksheet['!cols'] = [
      { wch: 20 }, // เลขคดี
      { wch: 12 }, // ประเภท
      { wch: 22 }, // คนลงคดีชื่อ
      { wch: 20 }, // คนลงคดี ID
      { wch: 35 }, // ผู้ช่วยชื่อ
      { wch: 30 }, // ผู้ช่วย ID
      { wch: 22 }, // วันที่
      { wch: 50 }  // ลิงก์
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'สรุปคดีทั้งหมด');

    const filePath = path.join(__dirname, `cases-${Date.now()}.xlsx`);
    XLSX.writeFile(workbook, filePath);

    return i.reply({
      content: '📊 ส่งออก Excel เรียบร้อย',
      files: [filePath],
      ephemeral: true
    });

  } catch (err) {
    console.error(err);
    return i.reply({
      content: '❌ เกิดข้อผิดพลาดในการสร้าง Excel',
      ephemeral: true
    });
  }
}
