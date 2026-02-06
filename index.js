const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  UserSelectMenuBuilder
} = require('discord.js');

require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* ================= CONFIG ================= */
const CASE_CATEGORY_ID = '1461297109088075947'; // หมวดหมู่คดี
const ADMIN_ROLE_ID = ['1461318666741092495','1464250545924739207'];

/* ================= READY ================= */
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ================= CREATE CASE CHANNEL ================= */
async function createCaseChannel(interaction, caseType) {
  const guild = interaction.guild;
  const user = interaction.user;

  const channel = await guild.channels.create({
    name: `📁-คดี-${user.username}`,
    type: ChannelType.GuildText,

    permissionOverwrites: [
      // 👀 ทุกคนเห็นได้ (เพื่อแท็กได้)
      {
        id: guild.roles.everyone.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },

      // 👮 POLICE เห็น + แท็กได้ แต่ห้ามพิมพ์
      {
        id: POLICE_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages
        ]
      },

      // 👤 เจ้าของคดี (พิมพ์ได้)
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages
        ]
      }
    ]
  });

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

  await interaction.editReply({
    content: `✅ สร้างห้องคดีเรียบร้อย ${channel}`,
    ephemeral: true
  });

  await channel.send({
    content:
      `👤 **เจ้าของคดี:** <@${user.id}>\n` +
      `📂 **ประเภทคดี:** ${caseType}\n\n` +
      `📸 ส่งรูปหลักฐาน\n` +
      `🏷️ แท็กผู้ช่วย (พิมพ์ได้เฉพาะเจ้าของ/ผู้ช่วย)`,
    components: [row]
  });
}

/* ================= INTERACTION ================= */
client.on('interactionCreate', async (interaction) => {
  try {

    /* ===== ปุ่มสร้างคดี ===== */
    if (interaction.isButton() && interaction.customId === 'create_case') {
      return createCaseChannel(interaction);
    }

    /* ===== เปิด modal เพิ่มผู้ช่วย ===== */
    if (interaction.isButton() && interaction.customId === 'add_helper') {
      const modal = new ModalBuilder()
        .setCustomId('add_helper_modal')
        .setTitle('เพิ่มผู้ช่วยในคดี');

      const input = new TextInputBuilder()
        .setCustomId('note')
        .setLabel('เลือกผู้ช่วยในขั้นตอนถัดไป')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    /* ===== เลือกผู้ช่วย ===== */
    if (interaction.isModalSubmit() && interaction.customId === 'add_helper_modal') {
      const select = new UserSelectMenuBuilder()
        .setCustomId('select_helper')
        .setPlaceholder('เลือกผู้ช่วย')
        .setMaxValues(5);

      return interaction.reply({
        content: 'เลือกผู้ช่วยที่จะเพิ่มในคดี',
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true
      });
    }

    /* ===== เพิ่มสิทธิ์ผู้ช่วย ===== */
    if (interaction.isUserSelectMenu() && interaction.customId === 'select_helper') {
      const channel = interaction.channel;

      for (const userId of interaction.values) {
        await channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true
        });
      }

      return interaction.reply({
        content: `✅ เพิ่มผู้ช่วยแล้ว: ${interaction.values.map(id => `<@${id}>`).join(', ')}`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) {
      interaction.reply({ content: '❌ เกิดข้อผิดพลาด', ephemeral: true }).catch(() => {});
    }
  }
});

/* ================= LOGIN ================= */
client.login(process.env.BOT_TOKEN);
