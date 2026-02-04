const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

module.exports = (user) => {
  const filePath = path.join(__dirname, '../data/cases.json');
  const cases = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  const myCases = cases.filter(
    (c) => c.userId === user.id
  );

  const count = {
    normal: 0,
    take2: 0,
    red: 0,
    robbery5: 0,
  };

  for (const c of myCases) {
    if (c.type === 'normal') count.normal++;
    if (c.type === 'take2') count.take2++;
    if (c.type === 'red') count.red++;
    if (c.type === 'robbery5') count.robbery5++;
  }

  const total =
    count.normal +
    count.take2 +
    count.red +
    count.robbery5;

  return new EmbedBuilder()
    .setColor('#2b2d31')
    .setAuthor({
      name: `สรุปเคสของ ${user.username}`,
      iconURL: user.displayAvatarURL(),
    })
    .setDescription(
      'ช่วงเวลา: 25/01/2026 ถึง 31/01/2026'
    )
    .addFields(
      {
        name: 'คดีปกติ',
        value: `${count.normal} เคส`,
        inline: true,
      },
      {
        name: 'Take2',
        value: `${count.take2} เคส`,
        inline: true,
      },
      {
        name: 'คดีสีแดง',
        value: `${count.red} เคส`,
        inline: true,
      },
      {
        name: 'งัดร้าน 5+',
        value: `${count.robbery5} เคส`,
        inline: true,
      },
      {
        name: '📊 รวมทั้งหมด',
        value: `${total} เคส`,
      }
    )
    .setFooter({
      text: `ข้อมูลทั้งหมด ${cases.length} เคสในระบบ`,
    });
};
