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
  /* ================= ROW 1 ================= */
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('case_normal')
      .setLabel('📁 ลงคดีปกติ')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('case_take2')
      .setLabel('✌️ ลง Take2')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('case_store')
      .setLabel('🏪 ลงงัดร้าน')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('case_red')
      .setLabel('🔴 ลงคดีส้ม-แดง')
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('check_my_case')
      .setLabel('☑️ เช็คเคสตัวเอง')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('add_helper')
      .setLabel('🧑‍🤝‍🧑 เพิ่มชื่อในเคส')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('edit_case')
      .setLabel('✏️ ขอแก้ไขคดี')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('export_excel')
      .setLabel('📊 สรุปเคสทั้งหมด (Excel)')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('check_user_personal')
      .setLabel('👤 เช็คเคสรายบุคคล')
      .setStyle(ButtonStyle.Secondary),
  );
 /* const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin_clear_all_cases')
      .setLabel('🧹 ลบเคสทั้งหมด (Admin)')
      .setStyle(ButtonStyle.Danger)
  );*/
  // ✅ reply ครั้งเดียว จบ
  return interaction.reply({
    content: 'เลือกปุ่มด้านล่างเพื่อดำเนินการ:',
    components: [row1, row2, row3, /*row4*/]
  });
}

};
