const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = () => {
  const modal = new ModalBuilder()
    .setCustomId('add_case')
    .setTitle('เพิ่มคดีใหม่');

  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('ชื่อคดี')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const officer = new TextInputBuilder()
    .setCustomId('officer')
    .setLabel('ชื่อเจ้าหน้าที่')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(officer)
  );

  return modal;
};
