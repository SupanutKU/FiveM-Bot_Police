require('dotenv').config();

/* ================= WEB KEEP ALIVE ================= */
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
  '1464250545924739207'
];

// ✅ ใช้ตัวเดียวทั้งไฟล์
const CASE_CATEGORY_ID = '1461297109088075947';

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

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const getDutyRows = require('./duty/exportDutyExcel');
const dutyListener = require('./duty/dutyListener');

/* ================= CLIENT ================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

dutyListener(client);

/* ================= COMMANDS ================= */
client.commands = new Map();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

/* ================= DATA ================= */
const DATA_PATH = path.join(__dirname, 'data/cases.json');

function loadCases() {
  if (!fs.existsSync(DATA_PATH)) return [];
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')).cases || [];
}

function saveCases(cases) {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ cases }, null, 2));
}

function getThaiISOString() {
  const now = new Date();
  const thaiTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
  return thaiTime.toISOString();
}

/* ================= MEMORY ================= */
const caseRooms = new Map();

/* ================= READY ================= */
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= CREATE CASE CHANNEL (FIXED) ================= */
async function createCaseChannel(interaction, caseType) {
  try {
    const guild = interaction.guild;
    const user = interaction.user;

    const category = await guild.channels.fetch(CASE_CATEGORY_ID);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.editReply('❌ ไม่พบหมวดคดี');
    }

    // ✅ สร้างห้องเข้าหมวดทันที
    const channel = await guild.channels.create({
      name: `📁-คดี-${user.username}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: []
    });

    // ✅ ตั้ง permission ทีหลัง
    await channel.permissionOverwrites.set([
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: CASE_LEADER_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ]);

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

    await interaction.editReply(`✅ สร้างห้อง ${channel} ในหมวดเรียบร้อย`);
    await channel.send({
      content:
        `👤 เจ้าของห้อง: <@${user.id}>\n` +
        `📂 ประเภทคดี: ${caseType}\n\n` +
        `📸 กรุณาส่งรูปหลักฐาน\n🏷️ แท็กผู้ช่วย`,
      components: [row]
    });

  } catch (err) {
    console.error('CREATE CASE CHANNEL ERROR:', err);
    await interaction.editReply('❌ สร้างห้องไม่สำเร็จ');
  }
}

/* ================= INTERACTIONS ================= */
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (cmd) return cmd.execute(interaction);
      return;
    }

    const caseMap = {
      case_normal: 'normal',
      case_take2: 'take2',
      case_red: 'orange_red',
      case_store: 'store'
    };

    if (caseMap[interaction.customId]) {
      await interaction.deferReply({ ephemeral: true });
      return createCaseChannel(interaction, caseMap[interaction.customId]);
    }

  } catch (err) {
    console.error('INTERACTION ERROR:', err);
  }
});

/* ================= LOGIN ================= */
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is missing!');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
