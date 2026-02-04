const { parseDutyEmbed } = require('./dutyParser');
const { insertDutyLog } = require('./dutyService');

module.exports = client => {
  console.log('✅ Duty listener loaded');

  client.on('messageCreate', async message => {
    if (message.channel.id !== String(process.env.DUTY_LOG_CHANNEL_ID)) return;
    if (!message.author.bot) return;
    if (!message.embeds.length) return;

    console.log('📩 Duty embed detected');

    const data = parseDutyEmbed(message.embeds[0]);
    console.log('🧠 Parsed data:', data);

    if (!data) return;

    try {
      await insertDutyLog(data);
      console.log('✅ Duty log saved');
    } catch (err) {
      console.error('❌ DB error:', err);
    }
  });
};
