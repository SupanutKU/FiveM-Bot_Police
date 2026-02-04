const weeklyDutySummary = require('../jobs/weeklyDutySummary');

module.exports = {
  name: 'weeklyduty',
  async execute(interaction) {
    const data = await weeklyDutySummary();

    if (!data.length) {
      return interaction.reply('ไม่มีข้อมูลสัปดาห์นี้');
    }

    const text = data
      .map(d => `👮 ${d.name} → ⏱ ${d.time}`)
      .join('\n');

    await interaction.reply({
      embeds: [{
        title: '📊 สรุปเวลาเข้าเวรประจำสัปดาห์',
        description: text
      }]
    });
  }
};
