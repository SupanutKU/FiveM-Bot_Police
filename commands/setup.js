const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('เปิดเมนูระบบคดี'),

  async execute(interaction) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('case_normal').setLabel('📁 ลงคดีปกติ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('case_take2').setLabel('✌️ ลง Take2').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('case_store').setLabel('🏪 ลงงัดร้าน').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('case_red').setLabel('🔴 ลงคดีส้ม-แดง').setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('check_my_case').setLabel('☑️ เช็คเคสตัวเอง').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('add_helper').setLabel('🧑‍🤝‍🧑 เพิ่มชื่อในเคส').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('edit_case').setLabel('✏️ ขอแก้ไขคดี').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('export_excel').setLabel('📊 สรุปเคสทั้งหมด (Excel)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('check_user_personal').setLabel('👤 เช็คเคสรายบุคคล').setStyle(ButtonStyle.Secondary)
    );

    // ❗ index.js จะ deferReply ให้แล้ว → ใช้ editReply อย่างเดียว
    await interaction.editReply({
      content: 'เลือกปุ่มด้านล่างเพื่อดำเนินการ:',
      components: [row1, row2, row3]
    });
  }
};
