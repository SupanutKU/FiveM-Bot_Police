const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const exportExcel = require('../utils/excelExport');
const weeklySummary = require('../utils/weeklySummary');

const DATA_PATH = path.join(__dirname, '../data/cases.json');

/* ===== ตั้งค่า ROLE หัวหน้า ===== */
const HEAD_ROLE_ID = '1450344680670887987';

/* ===== โหลดข้อมูลเคส ===== */
function loadCases() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  return data.cases || [];
}

module.exports = async (interaction) => {
  if (!interaction.isButton()) return;

  /* 🔒 LOCK interaction ทันที ป้องกัน Interaction Failed */
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
  }

  const id = interaction.customId;
  const cases = loadCases();

  /* =========================
     เช็คเคสตัวเอง
     ========================= */
  if (id === 'check_my_case') {
    const myCases = cases.filter(c => c.officer === interaction.user.id);

    const count = { normal: 0, take2: 0, orange_red: 0 };

    for (const c of myCases) {
      if (c.type === 'normal' || c.type === 'คดีปกติ') count.normal++;
      else if (c.type === 'take2' || c.type === 'Take2') count.take2++;
      else if (c.type === 'orange_red' || c.type === 'คดีส้ม-แดง') count.orange_red++;
    }

    const embed = new EmbedBuilder()
      .setColor('#2b2d31')
      .setAuthor({
        name: `สรุปเคสของ ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .addFields(
        { name: '📁 คดีปกติ', value: `${count.normal} คดี`, inline: true },
        { name: '✌️ Take2', value: `${count.take2} คดี`, inline: true },
        { name: '🔴 คดีส้ม-แดง', value: `${count.orange_red} คดี`, inline: true },
        { name: '📊 รวมทั้งหมด', value: `${myCases.length} คดี` }
      );

    return interaction.editReply({ embeds: [embed] });
  }

  /* =========================
     🔍 เช็คเคสรายบุคคล (หัวหน้าเท่านั้น)
     ========================= */
  if (id === 'check_user_personal') {
    const member =
      interaction.member ??
      (await interaction.guild.members.fetch(interaction.user.id).catch(() => null));

    if (!member) {
      return interaction.editReply('❌ ไม่สามารถตรวจสอบสิทธิ์ได้');
    }

    if (!member.roles.cache.has(HEAD_ROLE_ID)) {
      return interaction.editReply('❌ ฟังก์ชันนี้สำหรับ **ยศหัวหน้าเท่านั้น**');
    }

    if (!cases || cases.length === 0) {
      return interaction.editReply('❌ ยังไม่มีข้อมูลคดีในระบบ');
    }

    const count = { normal: 0, take2: 0, orange_red: 0 };

    for (const c of cases) {
      if (c.type === 'normal' || c.type === 'คดีปกติ') count.normal++;
      else if (c.type === 'take2' || c.type === 'Take2') count.take2++;
      else if (c.type === 'orange_red' || c.type === 'คดีส้ม-แดง') count.orange_red++;
    }

    const embed = new EmbedBuilder()
      .setColor('#5865f2')
      .setTitle('📂 สรุปคดีทั้งหมดในระบบ')
      .addFields(
        { name: '📁 คดีปกติ', value: `${count.normal} คดี`, inline: true },
        { name: '✌️ Take2', value: `${count.take2} คดี`, inline: true },
        { name: '🔴 คดีส้ม-แดง', value: `${count.orange_red} คดี`, inline: true },
        { name: '📊 รวมทั้งหมด', value: `${cases.length} คดี` }
      );

    return interaction.editReply({ embeds: [embed] });
  }

  /* =========================
     เพิ่มชื่อตัวเองในเคส
     ========================= */
  if (id === 'add_helper') {
    const member = interaction.member;

    if (!member.roles.cache.has(HEAD_ROLE_ID)) {
      return interaction.editReply(
        '❌ ฟังก์ชันนี้อนุญาตเฉพาะ **ยศหัวหน้า** เท่านั้น'
      );
    }

    const modal = new ModalBuilder()
      .setCustomId('add_helper_modal')
      .setTitle('ขอเพิ่มชื่อตัวเองในเคส');

    const linkInput = new TextInputBuilder()
      .setCustomId('case_message_link')
      .setLabel('ลิงก์ข้อความจากห้องบันทึกคดี')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(linkInput)
    );

    return interaction.showModal(modal);
  }

  /* ===== Export Excel ===== */
  if (id === 'export_excel') {
    const file = await exportExcel(cases);
    return interaction.editReply({ files: [file] });
  }

  /* ===== Weekly Summary ===== */
  if (id === 'weekly_summary') {
    const summary = weeklySummary(cases);
    return interaction.editReply(
      `📊 เคสในสัปดาห์นี้ทั้งหมด ${summary.length} คดี`
    );
  }
};
