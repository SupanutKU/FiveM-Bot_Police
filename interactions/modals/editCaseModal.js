const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder
} = require('discord.js');

module.exports = (id) => {
  const modal = new ModalBuilder()
    .setCustomId(`edit_case_${id}`)
    .setTitle('แก้ไขคดี');

  const status = new TextInputBuilder()
    .setCustomId('status')
    .setLabel('สถานะคดี')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(status)
  );

  return modal;
};
