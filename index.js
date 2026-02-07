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
const APPROVE_CHANNEL_ID = '1469342758668992594';
const CASE_LEADER_ROLE_ID = '1464250545924739207';
const ALLOWED_ROLES = [
  '1461318666741092495',
  '1464250545924739207',
];
const POLICE_ROLE_ID = "1461296754916851889";
const POLICE_CATEGORY_ID = "1461297109088075947";

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

const exportDutyExcel = require('./duty/exportDutyExcel');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
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
async function lockPoliceCategory(guild) {
  const category = await guild.channels.fetch(POLICE_CATEGORY_ID);
  if (!category) return;

  console.log('🔒 POLICE category locked');
}

/* ================= CREATE CASE CHANNEL ================= */
async function createCaseChannel(interaction, caseType) {
  const guild = interaction.guild;
  const user = interaction.user;

  await lockPoliceCategory(guild);

  const channel = await guild.channels.create({
    name: `📁-คดี-${user.username}`,
    type: ChannelType.GuildText,
    parent: POLICE_CATEGORY_ID,
    permissionOverwrites: [
      // ❌ everyone
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },

      // ✅ POLICE role
      {
        id: POLICE_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },

      // ✅ เจ้าของคดี
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      },

      // 🤖 bot
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ]
  });

  // ✅ REGISTER ROOM
  caseRooms.set(channel.id, {
  ownerId: user.id,
  caseType,
  hasImage: false,
  tagged: new Set() // ✅ สำคัญมาก
});

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('submit_case')
      .setLabel('📤 ส่งคดี')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('delete_case')
      .setLabel('🗑️ ลบห้อง')
      .setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply(`✅ สร้างห้อง ${channel} เรียบร้อย`);

  await channel.send({
    content:
      `👤 เจ้าของห้อง: <@${user.id}>\n` +
      `📂 ประเภทคดี: ${caseType}\n\n` +
      `📸 ต้องส่งรูปก่อน\n🏷️ แท็กผู้ช่วย`,
    components: [row]
  });
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
    if (u.id !== msg.author.id) room.tagged.add(u.id);
  }
});
/* ======================
   INTERACTION HANDLER
====================== */
const i = interaction;
client.on(Events.InteractionCreate, async (interaction) => { 
  try {

    /* ===== SLASH COMMAND ===== */
    if (i.isChatInputCommand()) {
      const cmd = client.commands.get(i.commandName);
      if (cmd) return await cmd.execute(i);
      return;
    }

    /* ===== CREATE CASE ===== */
    const caseMap = {
      case_normal: 'normal',
      case_take2: 'take2',
      case_red: 'orange_red',
      case_store: 'store'
    };

    if (caseMap[i.customId]) {
      await i.deferReply({ ephemeral: true });
      return createCaseChannel(i, caseMap[i.customId]);
    }

    /* ===== SUBMIT CASE ===== */
if (i.isButton() && i.customId === 'submit_case') {
  const room = caseRooms.get(i.channel.id);
  if (!room) {
    return i.reply({ content: '❌ ห้องนี้ไม่ใช่ห้องคดี', ephemeral: true });
  }

  const isOwner = i.user.id === room.ownerId;
  const isHelper = room.tagged.has(i.user.id);

  if (!isOwner && !isHelper) {
    return i.reply({
      content: '❌ เฉพาะเจ้าของคดีหรือผู้ช่วยเท่านั้น',
      ephemeral: true
    });
  }

  if (!room.hasImage) {
    return i.reply({
      content: '❌ ต้องส่งรูปก่อนถึงจะส่งคดีได้',
      ephemeral: true
    });
  }

  // ✅ ตอบกลับก่อน
  await i.reply({
    content: '📤 ส่งคดีเรียบร้อย\n⏳ ห้องจะถูกลบอัตโนมัติใน 5 วินาที',
    ephemeral: true
  });

  // 🗑️ ลบห้องอัตโนมัติ
  setTimeout(async () => {
    if (i.channel && i.channel.deletable) {
      caseRooms.delete(i.channel.id);
      await i.channel.delete('Case submitted');
    }
  }, 5000);

  return;
}


    /* ===== DELETE CASE ===== */
    if (i.isButton() && i.customId === 'delete_case') {
      await i.deferReply({ ephemeral: true });

      const room = caseRooms.get(i.channel.id);
      if (!room) {
        return i.editReply('❌ ห้องนี้ไม่ใช่ห้องคดี');
      }

      const isOwner = i.user.id === room.ownerId;
      const isPolice = i.member.roles.cache.has(POLICE_ROLE_ID);

      if (!isOwner && !isPolice) {
        return i.editReply('❌ คุณไม่มีสิทธิ์ลบห้องนี้');
      }

      await i.editReply('🗑️ กำลังลบห้อง...');
      await i.channel.delete();
      return;
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
  const isOfficer = c.officer === i.user.id;
  const isHelper = c.helpers?.includes(i.user.id);

  if (!isOfficer && !isHelper) return false;
  if (!c.createdAt) return false;

  const caseDate = new Date(c.createdAt);
  return caseDate >= start && caseDate <= end;
});

const count = {
  normal: { officer: 0, helper: 0 },
  take2: { officer: 0, helper: 0 },
  orange_red: { officer: 0, helper: 0 },
  store: { officer: 0, helper: 0 }
};


  for (const c of myCases) {
  if (!count[c.type]) continue;

  if (c.officer === i.user.id) {
    count[c.type].officer++;
  }

  if (c.helpers?.includes(i.user.id)) {
    count[c.type].helper++;
  }
}


  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`📆 เคสของคุณ (สัปดาห์นี้)`)
    .setAuthor({
      name: i.user.username,
      iconURL: i.user.displayAvatarURL()
    })
    .addFields(
  {
    name: '📁 คดีปกติ',
    value: `👮 ${count.normal.officer} | 🛠 ${count.normal.helper}`,
    inline: true
  },
  {
    name: '✌️ Take2',
    value: `👮 ${count.take2.officer} | 🛠 ${count.take2.helper}`,
    inline: true
  },
  {
    name: '🔴 ส้ม-แดง',
    value: `👮 ${count.orange_red.officer} | 🛠 ${count.orange_red.helper}`,
    inline: true
  },
  {
    name: '🏪 งัดร้าน',
    value: `👮 ${count.store.officer} | 🛠 ${count.store.helper}`,
    inline: true
  },
  { name: '📊 รวมทั้งหมด', value: `${myCases.length}` }
);


  return safeEdit(i, { embeds: [embed] });
}
if (i.customId === 'mycase_all') {
  await i.deferReply({ ephemeral: true });

  const cases = loadCases();
  const myCases = cases.filter(c =>
  c.officer === i.user.id || c.helpers?.includes(i.user.id)
);


const count = {
  normal: { officer: 0, helper: 0 },
  take2: { officer: 0, helper: 0 },
  orange_red: { officer: 0, helper: 0 },
  store: { officer: 0, helper: 0 }
};

for (const c of myCases) {
  if (c.officer === i.user.id) {
    count[c.type].officer++;
  } else if (c.helpers?.includes(i.user.id)) {
    count[c.type].helper++;
  }
}

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📂 เคสทั้งหมดของคุณ')
    .setAuthor({
      name: i.user.username,
      iconURL: i.user.displayAvatarURL()
    })
    .addFields(
  {
    name: '📁 คดีปกติ',
    value: `👮 ${count.normal.officer} | 🛠 ${count.normal.helper}`,
    inline: true
  },
  {
    name: '✌️ Take2',
    value: `👮 ${count.take2.officer} | 🛠 ${count.take2.helper}`,
    inline: true
  },
  {
    name: '🔴 ส้ม-แดง',
    value: `👮 ${count.orange_red.officer} | 🛠 ${count.orange_red.helper}`,
    inline: true
  },
  {
    name: '🏪 งัดร้าน',
    value: `👮 ${count.store.officer} | 🛠 ${count.store.helper}`,
    inline: true
  },
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

// ดึง embed เดิม
const embed = EmbedBuilder.from(logMessage.embeds[0]);

let desc = embed.data.description || '';

// แปลงรายชื่อผู้ช่วยจากเคสจริง
const helpersText =
  targetCase.helpers.length > 0
    ? targetCase.helpers.map(id => `<@${id}>`).join('\n')
    : 'ไม่มี';

// แทนที่เฉพาะส่วน 🛠 ผู้ช่วย
desc = desc.replace(
  /🛠 ผู้ช่วย[\s\S]*?\n\n/,
  `🛠 ผู้ช่วย\n${helpersText}\n\n`
);

embed
  .setDescription(desc)
  .setFooter({
    text: `อัปเดตผู้ช่วยโดย ${interaction.user.username}`
  });

// แก้ embed ใน log
await logMessage.edit({ embeds: [embed] });

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

// คนลงคดี
countByOfficer[officerName][c.type]++;
countByOfficer[officerName].total++;

// 🔧 เพิ่ม: นับผู้ช่วยด้วย
if (c.helpers?.length) {
  for (const helperId of c.helpers) {
    const helperName = await getMemberName(interaction.guild, helperId);

    if (!countByOfficer[helperName]) {
      countByOfficer[helperName] = {
        normal: 0,
        take2: 0,
        orange_red: 0,
        store: 0,
        total: 0
      };
    }

    countByOfficer[helperName][c.type]++;
    countByOfficer[helperName].total++;
  }
}


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

    await interaction.editReply({
      content: '📊 สรุปเคสครบทุกมุม (แยก Sheet + Dashboard)',
      files: [filePath]
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
const userCases = cases.filter(c =>
  c.officer === targetUserId ||
  c.helpers?.includes(targetUserId)
);


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
      { name: '🏪 งัดร้าน', value: `${count.store}`, inline: true },
      { name: '📊 รวมทั้งหมด', value: `${userCases.length}` }
    )
    .setFooter({ text: `ID: ${targetUserId}` });

  return i.editReply({ embeds: [embed] });
}
/* ================= DATA ================= */
function exportDutyExcel() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(__dirname, 'duty.db');
    const db = new sqlite3.Database(dbPath);

    const sql = `
      SELECT 
        id AS 'ID',
        user_id AS 'User ID',
        action AS 'Action',
        position AS 'ตำแหน่ง',
        datetime(timestamp, 'localtime') AS 'เวลา'
      FROM duty_logs
      ORDER BY timestamp ASC
    `;

    db.all(sql, [], (err, rows) => {
      if (err) {
        db.close();
        return reject(err);
      }

      if (!rows.length) {
        db.close();
        return reject(new Error('ไม่มีข้อมูลใน duty_logs'));
      }

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Duty Logs');

      const filePath = path.join(
        __dirname,
        `duty_logs_${Date.now()}.xlsx`
      );

      XLSX.writeFile(workbook, filePath);

      db.close();
      resolve(filePath);
    });
  });
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
exportDutyExcel()
  .then(file => console.log('📊 Export สำเร็จ:', file))
  .catch(err => console.error('❌ Export ล้มเหลว:', err.message));
/* ================= LOGIN ================= */
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);