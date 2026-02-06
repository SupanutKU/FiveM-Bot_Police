require('dotenv').config();

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot Police is running');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Web server ready');
});

/* ================= CONFIG ================= */
const LOG_CHANNEL_ID = '1469342649319162081';
const APPROVE_CHANNEL_ID = '1461296754916851889';
const CASE_LEADER_ROLE_ID = '1464250545924739207';
const ALLOWED_ROLES = [
  '1461318666741092495',
  '1464250545924739207',
];

/* ================= DISCORD ================= */
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');

const { dutyExportButton } = require('./interactions/buttons');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const getDutyRows = require('./duty/exportDutyExcel');
async function getMemberName(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName; // ชื่อในเซิร์ฟเวอร์
  } catch {
    return `ไม่พบผู้ใช้ (${userId})`;
  }
}
function getThaiISOString() {
  const now = new Date();
  const thaiTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  );
  return thaiTime.toISOString();
}


/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers // ✅ เพิ่ม
  ]
});
const dutyListener = require('./duty/dutyListener');
dutyListener(client);

async function safeReply(interaction, options) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(options);
  }
  return interaction.reply(options);
}

async function safeEdit(interaction, options) {
  if (interaction.replied || interaction.deferred) {
    return interaction.editReply(options);
  } else {
    return interaction.reply(options);
  }
}

/* ✅ FIX 1: INIT COMMANDS */
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

/* ================= DATA ================= */
const DATA_PATH = path.join(__dirname, 'data/cases.json');

function loadCases() {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).cases || [];
}
function getThisWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0 = อาทิตย์

  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}


function parseThaiDate(str) {
  if (!str || typeof str !== 'string') return null;

  // ตัดทุกอย่างที่ไม่ใช่ตัวเลขกับ /
  const clean = str.trim().match(/\d{1,2}\/\d{1,2}\/\d{4}/);
  if (!clean) return null;

  const [d, m, y] = clean[0].split('/').map(Number);
  return new Date(y - 543, m - 1, d);
}



function saveCases(cases) {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ cases }, null, 2));
}

/* ================= MEMORY ================= */
const caseRooms = new Map();

/* ================= READY ================= */
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= CREATE CASE CHANNEL ================= */
async function createCaseChannel(interaction, caseType) {
  const guild = interaction.guild;
  const user = interaction.user;

  const CATEGORY_ID = '1461297109088075947'; // 🔴 สำคัญมาก

  let channel;
  try {
    channel = await guild.channels.create({
      name: `📁-คดี-${user.username}`,
      type: ChannelType.GuildText,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ]
        },
        {
          id: guild.members.me.id, // 🤖 บอท
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks
          ]
        }
      ]
    });
  } catch (err) {
    console.error('CREATE CHANNEL ERROR:', err);
    return interaction.editReply('❌ สร้างห้องไม่สำเร็จ (permission)');
  }

  caseRooms.set(channel.id, {
    ownerId: user.id,
    hasImage: false,
    imageUrl: null,
    tagged: new Map(),
    caseType
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('submit_case')
      .setLabel('📨 ส่งคดี')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('delete_case')
      .setLabel('🗑 ลบห้อง')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply(`✅ สร้างห้อง ${channel} เรียบร้อย`);

  try {
    await channel.send({
      content:
        `👤 เจ้าของห้อง: <@${user.id}>\n` +
        `📂 ประเภทคดี: ${caseType}\n\n` +
        `📸 กรุณาส่งรูปหลักฐาน\n🏷️ แท็กผู้ช่วยได้`,
      components: [row]
    });
  } catch (err) {
    console.error('SEND MESSAGE ERROR:', err);
    await interaction.followUp({
      content: '⚠️ สร้างห้องแล้ว แต่บอทส่งข้อความไม่ได้ (permission)',
      ephemeral: true
    });
  }
}


/* ================= MESSAGE TRACK ================= */
client.on(Events.MessageCreate, msg => {
  if (msg.author.bot || !msg.guild) return;
  const room = caseRooms.get(msg.channel.id);
  if (!room) return;

  if (msg.attachments.size) {
    const att = msg.attachments.first();
    if (att?.contentType?.startsWith('image/')) {
      room.hasImage = true;
      room.imageUrl = att.url;
    }
  }

  for (const u of msg.mentions.users.values()) {
    if (u.id !== msg.author.id) room.tagged.set(u.id, true);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    /* ===== SLASH ===== */
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) return await cmd.execute(interaction);
      return;
    }

    const i = interaction;

    /* ===== MAP CUSTOM ID ===== */
    const caseMap = {
      case_normal: 'normal',
      case_take2: 'take2',
      case_red: 'orange_red',
      case_store: 'store'
    };

    /* ===== CREATE CASE ===== */
    if (caseMap[i.customId]) {
      await i.deferReply({ ephemeral: true });
      return createCaseChannel(i, caseMap[i.customId]);
    }
    /* ===== SUBMIT CASE (PREVIEW) ===== */
if (i.isButton() && i.customId === 'submit_case') {
  await i.deferUpdate();

  const room = caseRooms.get(i.channel.id);
  if (!room) {
    return i.channel.send('❌ ห้องนี้ไม่ใช่ห้องคดี');
  }

  // 🔐 CHECK PERMISSION
  const isOwner = i.user.id === room.ownerId;
  const isHelper = room.tagged.has(i.user.id);

  if (!isOwner && !isHelper) {
    return i.channel.send('❌ เฉพาะเจ้าของคดีหรือผู้ช่วยเท่านั้นที่ส่งคดีได้');
  }

  if (!room.hasImage) {
    return i.channel.send('❌ ต้องส่งรูปก่อนถึงจะส่งคดีได้');
  }
  const helpers =
    room.tagged.size > 0
      ? [...room.tagged.keys()].map(id => `<@${id}>`).join(', ')
      : 'ไม่มี';

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('📋 ตรวจทานข้อมูลคดี')
    .addFields(
      { name: '📂 ประเภทคดี', value: room.caseType, inline: true },
      { name: '👮 คนลงคดี', value: `<@${room.ownerId}>`, inline: true },
      { name: '🛠 ผู้ช่วย', value: helpers },
      { name: '🕒 เวลา', value: new Date().toLocaleString('th-TH') }
    )
    .setImage(room.imageUrl)
    .setFooter({ text: 'กรุณาตรวจสอบก่อนยืนยันส่งคดี' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_submit')
      .setLabel('✅ ยืนยันส่งคดี')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('cancel_submit')
      .setLabel('❌ ยกเลิก')
      .setStyle(ButtonStyle.Danger)
  );

  return i.channel.send({ embeds: [embed], components: [row] });
}
/* ===== CONFIRM SUBMIT ===== */
if (i.isButton() && i.customId === 'confirm_submit') {
  await i.deferUpdate();

  const room = caseRooms.get(i.channel.id);
  if (!room) return;

  // 🔐 CHECK PERMISSION (ซ้ำอีกชั้น)
  const isOwner = i.user.id === room.ownerId;
  const isHelper = room.tagged.has(i.user.id);

  if (!isOwner && !isHelper) {
    return i.channel.send('❌ คุณไม่มีสิทธิ์ยืนยันส่งคดีนี้');
  }

  const cases = loadCases();

const newCase = {
  id: Date.now(),
  officer: room.ownerId,
  type: room.caseType,
  helpers: [...room.tagged.keys()],
  createdAt: getThaiISOString(), // ✅ เวลาไทย
  imageUrl: room.imageUrl
};


  const helpersText =
    newCase.helpers.length > 0
      ? newCase.helpers.map(id => `<@${id}>`).join(', ')
      : 'ไม่มี';

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('✅ บันทึกการส่งคดี')
    .setDescription(
      `📁 คดี-${newCase.type}-${newCase.id}\n\n` +
      `👮 คนลงคดี\n<@${newCase.officer}>\n\n` +
      `🛠 ผู้ช่วย\n${helpersText}\n\n` +
      `🕒 เวลา\n${new Date().toLocaleString('th-TH')}`
    )
    .setImage(newCase.imageUrl)
    .setFooter({ text: 'ระบบ Bot Police' });

  const logChannel = i.guild.channels.cache.get(LOG_CHANNEL_ID);
  const msg = await logChannel.send({ embeds: [embed] });

  newCase.logMessageId = msg.id;
  cases.push(newCase);
  saveCases(cases);

  caseRooms.delete(i.channel.id);
  await i.channel.send('✅ ส่งคดีเรียบร้อย กำลังปิดห้อง...');

  setTimeout(() => {
    i.channel.delete().catch(() => {});
  }, 2000);
}
/* ===== CANCEL SUBMIT ===== */
if (i.isButton() && i.customId === 'cancel_submit') {
  await i.deferUpdate();
  return i.channel.send('❌ ยกเลิกการส่งคดี');
}

/* ===== DELETE CASE ROOM ===== */
if (i.isButton() && i.customId === 'delete_case') {
  await i.deferUpdate();

  const room = caseRooms.get(i.channel.id);
  if (!room) {
    return i.channel.send('❌ ห้องนี้ไม่ใช่ห้องคดี');
  }

  if (i.user.id !== room.ownerId) {
    return i.channel.send('❌ เฉพาะเจ้าของคดีเท่านั้นที่ลบห้องได้');
  }

  caseRooms.delete(i.channel.id);
  return i.channel.delete().catch(() => {});
}


    /* ===== เช็คเคสตัวเอง ===== */
if (i.customId === 'check_my_case') {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mycase_this_week')
      .setLabel('📆 สัปดาห์นี้ (อาทิตย์ - เสาร์)')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('mycase_all')
      .setLabel('📂 เช็คทั้งหมดของตัวเอง')
      .setStyle(ButtonStyle.Secondary)
  );

  return safeReply(i,{
    content: 'กรุณาเลือกรูปแบบการเช็คเคส:',
    components: [row],
    ephemeral: true
  });
}
if (i.customId === 'mycase_this_week') {
  await i.deferReply({ ephemeral: true });

  const { start, end } = getThisWeekRange();
  const cases = loadCases();

const myCases = cases.filter(c => {
  if (c.officer !== i.user.id) return false;
  if (!c.createdAt) return false;

  const caseDate = new Date(c.createdAt);
  return caseDate >= start && caseDate <= end;
});

  const count = {
    normal: 0,
    take2: 0,
    orange_red: 0,
    store: 0
  };

  for (const c of myCases) {
    if (count[c.type] !== undefined) count[c.type]++;
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📆 เคสของคุณ (สัปดาห์นี้)`)
    .setAuthor({
      name: i.user.username,
      iconURL: i.user.displayAvatarURL()
    })
    .addFields(
      { name: '📁 คดีปกติ', value: `${count.normal}`, inline: true },
      { name: '✌️ Take2', value: `${count.take2}`, inline: true },
      { name: '🔴 ส้ม-แดง', value: `${count.orange_red}`, inline: true },
      { name: '🏪 งัดร้าน', value: `${count.store}`, inline: true },
      { name: '📊 รวมทั้งหมด', value: `${myCases.length}` }
    );

  return safeEdit(i, { embeds: [embed] });
}
if (i.customId === 'mycase_all') {
  await i.deferReply({ ephemeral: true });

  const cases = loadCases();
  const myCases = cases.filter(c => c.officer === i.user.id);

  const count = {
    normal: 0,
    take2: 0,
    orange_red: 0,
    store: 0
  };

  for (const c of myCases) {
    if (count[c.type] !== undefined) count[c.type]++;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📂 เคสทั้งหมดของคุณ')
    .setAuthor({
      name: i.user.username,
      iconURL: i.user.displayAvatarURL()
    })
    .addFields(
      { name: '📁 คดีปกติ', value: `${count.normal}`, inline: true },
      { name: '✌️ Take2', value: `${count.take2}`, inline: true },
      { name: '🔴 ส้ม-แดง', value: `${count.orange_red}`, inline: true },
      { name: '🏪 งัดร้าน', value: `${count.store}`, inline: true },
      { name: '📊 รวมทั้งหมด', value: `${myCases.length}` }
    );

  return i.editReply({ embeds: [embed] });
}

    /* ===== ADD HELPER BUTTON ===== */
if (interaction.isButton() && interaction.customId === 'add_helper') {
  const modal = new ModalBuilder()
    .setCustomId('add_helper_modal')
    .setTitle('ขอเพิ่มชื่อตัวเองในเคส');

  const input = new TextInputBuilder()
    .setCustomId('case_link')
    .setLabel('ลิงก์ข้อความบันทึกคดี')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return interaction.showModal(modal);
}
/* ===== ADD HELPER MODAL SUBMIT ===== */
if (interaction.isModalSubmit() && interaction.customId === 'add_helper_modal') {
  const link = interaction.fields.getTextInputValue('case_link');

  const match = link.match(
    /https?:\/\/(?:canary\.|ptb\.)?discord\.com\/channels\/\d+\/\d+\/(\d+)/
  );

  if (!match) {
    return interaction.reply({
      content: '❌ ลิงก์ไม่ถูกต้อง',
      ephemeral: true
    });
  }

  const messageId = match[1];
  const cases = loadCases();
  const targetCase = cases.find(c => c.logMessageId === messageId);

  if (!targetCase) {
    return interaction.reply({
      content: '❌ ไม่พบคดีนี้ในระบบ',
      ephemeral: true
    });
  }

  const approveChannel =
    interaction.guild.channels.cache.get(APPROVE_CHANNEL_ID);

  if (!approveChannel) {
    return interaction.reply({
      content: '❌ ไม่พบห้องอนุมัติ',
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('📣 คำขอเพิ่มชื่อในคดี')
    .addFields(
      { name: '👮 คนลงคดี', value: `<@${targetCase.officer}>` },
      { name: '🙋 ผู้ขอเพิ่มชื่อ', value: `<@${interaction.user.id}>` },
      { name: '🔗 ลิงก์คดี', value: link },
      { name: '🆔 Case ID', value: String(targetCase.id) }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_add_${targetCase.id}_${interaction.user.id}`)
      .setLabel('อนุมัติ')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_add_${targetCase.id}_${interaction.user.id}`)
      .setLabel('ปฏิเสธ')
      .setStyle(ButtonStyle.Danger)
  );

  await approveChannel.send({ embeds: [embed], components: [row] });

  return interaction.reply({
    content: '📨 ส่งคำขอเพิ่มชื่อเรียบร้อยแล้ว',
    ephemeral: true
  });
}
if (
  interaction.isButton() &&
  interaction.customId.startsWith('approve_add_')
) {
  await interaction.deferReply({ ephemeral: true });

  const [, , caseId, userId] = interaction.customId.split('_');

  const cases = loadCases();
  const targetCase = cases.find(c => String(c.id) === caseId);

  if (!targetCase) {
    return interaction.editReply('❌ ไม่พบคดีนี้');
  }

  /* ===== ADD HELPER ===== */
  targetCase.helpers ??= [];
  if (!targetCase.helpers.includes(userId)) {
    targetCase.helpers.push(userId);
  }
  saveCases(cases);

  /* ===== UPDATE CASE LOG EMBED ===== */
  const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
  const logMessage = await logChannel.messages.fetch(targetCase.logMessageId);

  const helpersText =
    targetCase.helpers.length > 0
      ? targetCase.helpers.map(id => `<@${id}>`).join(', ')
      : 'ไม่มี';

  const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
    .spliceFields(2, 1, {
      name: '🛠 ผู้ช่วยเหลือ',
      value: helpersText
    })
    .setFooter({
      text: `อัปเดตผู้ช่วยโดย ${interaction.user.username}`
    });

  await logMessage.edit({ embeds: [updatedEmbed] });

  /* ===== HISTORY LOG ===== */
  const historyEmbed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('✅ อนุมัติเพิ่มชื่อในคดี')
    .addFields(
      { name: '👤 ผู้ถูกเพิ่ม', value: `<@${userId}>`, inline: true },
      { name: '👮 เจ้าของคดี', value: `<@${targetCase.officer}>`, inline: true },
      { name: '📝 อนุมัติโดย', value: `<@${interaction.user.id}>` }
    )
    .setTimestamp();

  await logMessage.reply({ embeds: [historyEmbed] });

  /* ===== LOCK BUTTON ===== */
  await interaction.message.edit({
    components: []
  });

  return interaction.editReply('✅ เพิ่มชื่อและอัปเดตคดีเรียบร้อย');
}

/* ===== REJECT ADD HELPER ===== */
if (
  interaction.isButton() &&
  interaction.customId.startsWith('reject_add_')
) {
  await interaction.deferReply({ ephemeral: true });

  await interaction.message.edit({
    components: [],
    embeds: interaction.message.embeds.map(e =>
      EmbedBuilder.from(e).setFooter({
        text: `❌ ปฏิเสธโดย ${interaction.user.username}`
      })
    )
  });

  return interaction.editReply('❌ ปฏิเสธคำขอแล้ว');
}
/* ===== EDIT CASE MODAL SUBMIT ===== */
if (interaction.isButton() && interaction.customId === 'edit_case') {
  const modal = new ModalBuilder()
    .setCustomId('edit_case_modal')
    .setTitle('ขอแก้ไขคดี');

  const input = new TextInputBuilder()
    .setCustomId('case_link')
    .setLabel('ลิงก์ข้อความบันทึกคดี')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return interaction.showModal(modal);
}
if (interaction.isModalSubmit() && interaction.customId === 'edit_case_modal') {
  const link = interaction.fields.getTextInputValue('case_link');

  const match = link.match(
    /discord\.com\/channels\/\d+\/\d+\/(\d+)/
  );
  if (!match) {
    return interaction.reply({ content: '❌ ลิงก์ไม่ถูกต้อง', ephemeral: true });
  }

  const messageId = match[1];
  const cases = loadCases();
  const targetCase = cases.find(c => c.logMessageId === messageId);

  if (!targetCase) {
    return interaction.reply({ content: '❌ ไม่พบคดีนี้', ephemeral: true });
  }

  targetCase.editRequester = interaction.user.id;
  saveCases(cases);

  const select = new UserSelectMenuBuilder()
    .setCustomId(`edit_case_select_${targetCase.id}`)
    .setMinValues(1)
    .setMaxValues(10);

  return interaction.reply({
    content: '🛠 เลือกผู้ช่วยใหม่',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true
  });
}
if (
  interaction.isUserSelectMenu() &&
  interaction.customId.startsWith('edit_case_select_')
) {
  const caseId = interaction.customId.split('_').pop();
  const cases = loadCases();
  const targetCase = cases.find(c => String(c.id) === caseId);

  if (!targetCase) {
    return interaction.reply({ content: '❌ ไม่พบคดี', ephemeral: true });
  }

  targetCase.pendingEdit = {
    helpers: interaction.values,
    requester: interaction.user.id
  };
  saveCases(cases);

  const approveChannel =
    interaction.guild.channels.cache.get(APPROVE_CHANNEL_ID);

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('✏️ ขอแก้ไขคดี')
    .addFields(
      { name: '👮 คนลงคดี', value: `<@${targetCase.officer}>` },
      { name: '🙋 ผู้ขอแก้ไข', value: `<@${interaction.user.id}>` },
      {
        name: '🛠 ผู้ช่วยใหม่',
        value: interaction.values.map(id => `<@${id}>`).join(', ')
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_edit_${targetCase.id}`)
      .setLabel('อนุมัติ')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_edit_${targetCase.id}`)
      .setLabel('ปฏิเสธ')
      .setStyle(ButtonStyle.Danger)
  );

  await approveChannel.send({ embeds: [embed], components: [row] });

  return interaction.update({
    content: '📨 ส่งคำขอแก้ไขเรียบร้อย',
    components: []
  });
}
if (
  interaction.isButton() &&
  interaction.customId.startsWith('approve_edit_')
) {
  if (!interaction.member.roles.cache.has(CASE_LEADER_ROLE_ID)) {
    return interaction.reply({ content: '❌ เฉพาะหัวหน้าคดี', ephemeral: true });
  }

  const caseId = interaction.customId.split('_').pop();
  const cases = loadCases();
  const targetCase = cases.find(c => String(c.id) === caseId);

  if (!targetCase?.pendingEdit) {
    return interaction.reply({ content: '❌ ไม่มีคำขอแก้ไข', ephemeral: true });
  }

  /* APPLY EDIT */
  targetCase.helpers = targetCase.pendingEdit.helpers;
  delete targetCase.pendingEdit;
  delete targetCase.editRequester;
  saveCases(cases);

  /* UPDATE LOG */
  const logChannel =
    await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
  const logMessage =
    await logChannel.messages.fetch(targetCase.logMessageId);

  const helpersText =
    targetCase.helpers.length
      ? targetCase.helpers.map(id => `<@${id}>`).join(', ')
      : 'ไม่มี';

  const updatedEmbed = EmbedBuilder.from(logMessage.embeds[0])
    .spliceFields(2, 1, {
      name: '🛠 ผู้ช่วยเหลือ',
      value: helpersText
    })
    .setFooter({ text: 'แก้ไขคดีแล้ว' });

  await logMessage.edit({ embeds: [updatedEmbed] });
  await interaction.message.edit({ components: [] });

  return interaction.reply({
    content: '✅ อนุมัติและแก้ไขคดีเรียบร้อย',
    ephemeral: true
  });
}
/* ===== EXPORT ALL CASES TO EXCEL (FULL VERSION) ===== */
if (interaction.isButton() && interaction.customId === 'export_excel') {
  await interaction.deferReply({ ephemeral: true });

  try {
    const cases = loadCases();
    if (!cases.length) {
      return interaction.editReply('❌ ยังไม่มีข้อมูลคดี');
    }

    const workbook = XLSX.utils.book_new();
    // ===== EXPORT DUTY (เข้า-ออกเวร) =====
const dutyRows = await getDutyRows();

if (dutyRows.length > 0) {
  const wsDuty = XLSX.utils.json_to_sheet(dutyRows);

  wsDuty['!cols'] = [
    { wch: 8 },   // ลำดับ
    { wch: 20 },  // เจ้าหน้าที่
    { wch: 15 },  // สถานะ
    { wch: 25 }   // เวลา
  ];

  XLSX.utils.book_append_sheet(
    workbook,
    wsDuty,
    'เข้า-ออกเวร'
  );
}
    /* ================= GROUP DATA ================= */
    const groupedByType = {
      normal: [],
      take2: [],
      orange_red: [],
      store: []
    };

    const countByOfficer = {};
    const weeklySummary = {};
    const monthlySummary = {};

    for (const c of cases) {
      const officerName = await getMemberName(interaction.guild, c.officer);

      /* helpers */
      let helperNames = 'ไม่มี';
      if (c.helpers?.length) {
        const arr = [];
        for (const id of c.helpers) {
          arr.push(await getMemberName(interaction.guild, id));
        }
        helperNames = arr.join(', ');
      }

      const created = new Date(c.createdAt);
      const weekKey = `${created.getFullYear()}-W${Math.ceil(created.getDate() / 7)}`;
      const monthKey = `${created.getFullYear()}-${created.getMonth() + 1}`;

      /* ---------- Sheet by type ---------- */
      groupedByType[c.type]?.push({
        เลขคดี: `คดี-${c.type}-${c.id}`,
        คนลงคดี: officerName,
        ผู้ช่วยเหลือ: helperNames,
        วันที่บันทึก: created.toLocaleString('th-TH'),
        ลิงก์คดี: `https://discord.com/channels/${interaction.guild.id}/${LOG_CHANNEL_ID}/${c.logMessageId}`
      });

      /* ---------- Count by officer ---------- */
      if (!countByOfficer[officerName]) {
      countByOfficer[officerName] = {
        normal: 0,
        take2: 0,
        orange_red: 0,
        store: 0,
        total: 0
        };
        }

        countByOfficer[officerName][c.type]++;
        countByOfficer[officerName].total++;


      /* ---------- Weekly ---------- */
      weeklySummary[weekKey] ??= 0;
      weeklySummary[weekKey]++;

      /* ---------- Monthly ---------- */
      monthlySummary[monthKey] ??= 0;
      monthlySummary[monthKey]++;
    }

    /* ================= DASHBOARD ================= */
    const dashboard = [
      { หัวข้อ: 'จำนวนคดีทั้งหมด', ค่า: cases.length },
      { หัวข้อ: 'คดีปกติ', ค่า: groupedByType.normal.length },
      { หัวข้อ: 'Take2', ค่า: groupedByType.take2.length },
      { หัวข้อ: 'คดีส้ม-แดง', ค่า: groupedByType.orange_red.length },
      { หัวข้อ: 'งัดร้าน', ค่า: groupedByType.store.length }
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(dashboard),
      'Dashboard'
    );

    /* ================= BY TYPE ================= */
    const typeNames = {
      normal: 'คดีปกติ',
      take2: 'Take2',
      orange_red: 'คดีส้ม-แดง',
      store: 'งัดร้าน'
    };

    for (const [type, rows] of Object.entries(groupedByType)) {
      if (!rows.length) continue;
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(rows),
        typeNames[type]
      );
    }

    /* ================= COUNT BY OFFICER ================= */
    const officerRows = Object.entries(countByOfficer).map(([name, data]) => ({
  เจ้าหน้าที่: name,
  คดีปกติ: data.normal,
  Take2: data.take2,
  'คดีส้ม-แดง': data.orange_red,
  งัดร้าน: data.store,
  รวมทั้งหมด: data.total
}));


    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(officerRows),
      'สรุปตามเจ้าหน้าที่'
    );

    /* ================= WEEKLY ================= */
    const weeklyRows = Object.entries(weeklySummary).map(([week, total]) => ({
      สัปดาห์: week,
      จำนวนคดี: total
    }));

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(weeklyRows),
      'รายสัปดาห์'
    );

    /* ================= MONTHLY ================= */
    const monthlyRows = Object.entries(monthlySummary).map(([month, total]) => ({
      เดือน: month,
      จำนวนคดี: total
    }));

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(monthlyRows),
      'รายเดือน'
    );

    /* ================= SAVE FILE ================= */
    const filePath = path.join(__dirname, `cases-${Date.now()}.xlsx`);
    XLSX.writeFile(workbook, filePath);

    const files = [filePath];


await interaction.editReply({
  content: '📊 สรุปเคสทั้งหมด + เวร (DB)',
  files
});


    setTimeout(() => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }, 5000);

  } catch (err) {
    console.error('EXPORT EXCEL ERROR:', err);
    await interaction.editReply('❌ เกิดข้อผิดพลาดในการสร้าง Excel');
  }
}


/* ===== เช็คเคสรายบุคคล (เจ้าหน้าที่) ===== */
if (i.customId === 'check_user_personal') {
  await i.deferReply({ ephemeral: true });

  const member = await i.guild.members.fetch(i.user.id);
  const allowed = member.roles.cache.some(r =>
    ALLOWED_ROLES.includes(r.id)
  );

  if (!allowed) {
    return i.editReply('❌ ฟังก์ชันนี้สำหรับเจ้าหน้าที่เท่านั้น');
  }

  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('select_user_to_check')
      .setPlaceholder('👤 เลือกเจ้าหน้าที่ที่ต้องการเช็คเคส')
      .setMinValues(1)
      .setMaxValues(1)
  );

  return i.editReply({
    content: '📂 กรุณาเลือกเจ้าหน้าที่ที่ต้องการเช็คเคส',
    components: [row]
  });
}
if (i.isUserSelectMenu() && i.customId === 'select_user_to_check') {
  await i.deferReply({ ephemeral: true });

  const targetUserId = i.values[0];
  const targetMember = await i.guild.members.fetch(targetUserId);

  const cases = loadCases();
  const userCases = cases.filter(c => c.officer === targetUserId);

  const count = {
    normal: 0,
    take2: 0,
    orange_red: 0,
    store: 0
  };

  for (const c of userCases) {
    if (count[c.type] !== undefined) {
      count[c.type]++;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `สรุปเคสของ ${targetMember.user.username}`,
      iconURL: targetMember.user.displayAvatarURL()
    })
    .addFields(
      { name: '📁 คดีปกติ', value: `${count.normal}`, inline: true },
      { name: '✌️ Take2', value: `${count.take2}`, inline: true },
      { name: '🔴 คดีส้ม-แดง', value: `${count.orange_red}`, inline: true },
      { name: '🏪 วังร้าน', value: `${count.store}`, inline: true },
      { name: '📊 รวมทั้งหมด', value: `${userCases.length}` }
    )
    .setFooter({ text: `ID: ${targetUserId}` });

  return i.editReply({ embeds: [embed] });
}

  } catch (err) {
    console.error('INTERACTION ERROR:', err);
    if (interaction.isRepliable()) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true });
    } else {
      await interaction.editReply({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true });
    }
  } catch {}
}

  }
});

/* ================= LOGIN ================= */
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
