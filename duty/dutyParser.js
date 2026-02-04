function parseDutyEmbed(embed) {
  if (!embed?.fields?.length) return null;

  const get = name =>
    embed.fields.find(f => f.name.includes(name))?.value;

  const uid = get('ID');
  const name = get('ชื่อ');
  const actionRaw = embed.title || '';
  const time = embed.timestamp || new Date().toISOString();

  let action = null;
  if (actionRaw.includes('เข้าเวร')) action = 'on';
  if (actionRaw.includes('ออกเวร')) action = 'off';

  if (!uid || !name || !action) return null;

  return {
    uid: uid.replace(/\D/g, ''),
    name: name.replace(/[*_`]/g, ''),
    action,
    time
  };
}

module.exports = { parseDutyEmbed };
