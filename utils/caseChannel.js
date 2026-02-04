const { ChannelType, PermissionFlagsBits } = require('discord.js');

async function createCaseChannel(interaction, caseType) {
  const guild = interaction.guild;
  const user = interaction.user;

  const channel = await guild.channels.create({
    name: `📁-คดี-${user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
        ],
      },
    ],
  });

  await interaction.reply({
    content: `✅ สร้างห้อง ${channel} แล้ว`,
    ephemeral: true,
  });

  await channel.send({
    content:
`✅ **สร้างห้อง #${channel.name} เรียบร้อย**
📂 ประเภท: **${caseType}**

⏱️ **จำกัดเวลา: 30 นาที**
📸 **ต้องมีรูปภาพภายในเวลาที่กำหนด**`,
  });

  // ตั้งเวลา 30 นาที
  setTimeout(async () => {
    try {
      await channel.send('⏰ หมดเวลา 30 นาทีแล้ว');
      // จะเพิ่ม auto-close ทีหลังได้
    } catch (err) {}
  }, 30 * 60 * 1000);
}

module.exports = { createCaseChannel };
