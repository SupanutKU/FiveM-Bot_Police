function parseDutyEmbed(embed) {
  const text = embed.description || '';

  const uidMatch = text.match(/UID\s*:\s*(\d+)/i);
  const nameMatch = text.match(/เจ้าหน้าที่\s*:\s*(.+)/i);
  const timeMatch = text.match(
    /(\d{2}-\d{2}-\d{4}\s\d{2}:\d{2}:\d{2})/
  );

  if (!uidMatch || !nameMatch || !timeMatch) return null;

  const action = text.includes('เข้าเวร')
    ? 'on'
    : text.includes('ออกเวร')
    ? 'off'
    : null;

  if (!action) return null;

  return {
    uid: uidMatch[1],
    name: nameMatch[1].trim(),
    action,
    timestamp: timeMatch[1]
  };
}

module.exports = { parseDutyEmbed };
