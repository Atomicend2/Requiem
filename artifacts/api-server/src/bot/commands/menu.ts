import type { CommandContext } from "./index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "../db/database.js";
import { getMentionName } from "../db/queries.js";
import { mentionTag } from "../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function handleMenu(ctx: CommandContext): Promise<void> {
  const { from, sender, sock } = ctx;
  // Use phone number in text for a real WhatsApp mention tag
  const senderTag = mentionTag(sender);   // e.g. @2348012345678
  const senderName = getMentionName(sender); // display name for profile line

  const menuText =
`🌸━━━『 𝗧𝗘𝗡𝗞𝗨 反逆 』━━━🌸

✦ Where Stars Touch The Sky ✦

🎐 𝗣𝗥𝗢𝗙𝗜𝗟𝗘

┌──────────────
│ 👋 Hey       : ${senderTag}
│ 🌌 Bot       : Requiem Order
│ 👑 Creator   : Eᴍᴘᴇʀᴏʀ Lᴇʟᴏᴜᴄʜ
│ 🔹 Prefix    : [ . ]
└──────────────

❀━━━━━━━━━━━━━━❀
            📋 𝗠𝗔𝗜𝗡
❀━━━━━━━━━━━━━━❀
➺ .menu
➺ .ping
➺ .website
➺ .community
➺ .bots
➺ .afk
➺ .help / .info
➺ .uptime

❀━━━━━━━━━━━━━━❀
            ⚙️ 𝗔𝗗𝗠𝗜𝗡
❀━━━━━━━━━━━━━━❀
➺ .kick
➺ .delete / .del / .d
➺ .antilink set [action]
➺ .warn @user [reason]
➺ .resetwarn
➺ .groupinfo / .gi
➺ .welcome on/off
➺ .setwelcome / .setleave
➺ .promote / .demote
➺ .mute / .unmute
➺ .hidetag / .tagall
➺ .open / .close
➺ .purge [code]
➺ .antism on/off
➺ .blacklist add/remove/list
➺ .groupstats / .gs

❀━━━━━━━━━━━━━━❀
        💰 𝗘𝗖𝗢𝗡𝗢𝗠𝗬
❀━━━━━━━━━━━━━━❀
➺ .bal / .balance
➺ .gems
➺ .premium / .membership
➺ .daily
➺ .withdraw / .deposit
➺ .donate [amount]
➺ .richlist / .richlg
➺ .register / .reg
➺ .setname <name>
➺ .setpp / .setbg
➺ .profile / .p
➺ .bio [text] / .setage [age]
➺ .inventory / .shop / .buy
➺ .leaderboard / .lb
➺ .work / .dig / .fish / .beg
➺ .steal / .roast
➺ .stats / .cds

❀━━━━━━━━━━━━━━❀
           🎴 𝗖𝗔𝗥𝗗𝗦
❀━━━━━━━━━━━━━━❀
➺ .collection / .coll
➺ .deck / .sdi
➺ .card [index]
➺ .cardinfo / .ci <name>
➺ .si <name>
➺ .slb <series>
➺ .cs <series>
➺ .mycollectionseries
➺ .cardleaderboard / .cardlb
➺ .cardshop / .stardust
➺ .get [id]
➺ .vs @user
➺ .auction / .myauc
➺ .listauc / .bid [id] [amt]
➺ .cg @user
➺ .ctd / .lcd / .retrieve
➺ .sellc / .tc
➺ .accept / .decline

❀━━━━━━━━━━━━━━❀
           🎮 𝗚𝗔𝗠𝗘𝗦
❀━━━━━━━━━━━━━━❀
➺ .tictactoe / .ttt
➺ .connectfour / .c4
➺ .wcg / .wordchain
➺ .startbattle
➺ .truthordare / .td
➺ .stopgame

❀━━━━━━━━━━━━━━❀
              🃏 𝗨𝗡𝗢
❀━━━━━━━━━━━━━━❀
➺ .uno / .startuno
➺ .unoplay / .unodraw
➺ .unohand

❀━━━━━━━━━━━━━━❀
            🎲 𝗚𝗔𝗠𝗕𝗟𝗘
❀━━━━━━━━━━━━━━❀
➺ .slots / .dice / .casino
➺ .coinflip / .cf
➺ .doublebet / .doublepayout
➺ .roulette / .horse / .spin

❀━━━━━━━━━━━━━━❀
            🎭 𝗙𝗨𝗡
❀━━━━━━━━━━━━━━❀
➺ .fancy <1-35> <text>
➺ .gay / .lesbian / .simp
➺ .match / .ship / .relation
➺ .character / .psize / .pp
➺ .skill / .duality / .gen
➺ .pov / .social
➺ .wouldyourather / .wyr
➺ .joke

❀━━━━━━━━━━━━━━❀
      👤 𝗜𝗡𝗧𝗘𝗥𝗔𝗖𝗧𝗜𝗢𝗡
❀━━━━━━━━━━━━━━❀
➺ .hug / .kiss / .slap
➺ .wave / .pat / .dance
➺ .sad / .smile / .laugh
➺ .punch / .kill / .hit
➺ .kidnap / .lick / .bonk
➺ .tickle / .shrug

✨ ━━━━━━━━━━━━━━✨
♣️ The sky is not the limit
⭐ It is the beginning. 反逆
✨ ━━━━━━━━━━━━━━✨`;

  try {
    const db = getDb();
    const bot = db.prepare("SELECT menu_image_url FROM bots WHERE is_primary = 1").get() as any;
    const imageUrl = bot?.menu_image_url;

    if (imageUrl && fs.existsSync(imageUrl)) {
      const imageBuffer = fs.readFileSync(imageUrl);
      await sock.sendMessage(from, {
        image: imageBuffer,
        caption: menuText,
        mentions: [sender],
      });
    } else {
      await sock.sendMessage(from, {
        text: menuText,
        mentions: [sender],
      });
    }
  } catch {
    await sock.sendMessage(from, {
      text: menuText,
      mentions: [sender],
    });
  }
}

// .help — light per-command descriptions
export async function handleHelp(ctx: CommandContext): Promise<void> {
  const { from, sock } = ctx;
  const help = `📖 *Requiem Order 反逆 — Command Guide*\n\n` +
    `*📋 MAIN*\n` +
    `• *.menu* — Shows the full command list\n` +
    `• *.ping* — Checks if bot is online\n` +
    `• *.afk [reason]* — Sets you as Away From Keyboard\n` +
    `• *.uptime* — Shows how long the bot has been running\n` +
    `• *.website* — Bot website link\n` +
    `• *.community* — Join the community group\n\n` +
    `*⚙️ ADMIN*\n` +
    `• *.kick @user* — Removes a member\n` +
    `• *.warn @user [reason]* — Warns a member (5 = kick)\n` +
    `• *.antilink set [delete/warn/kick]* — Auto-remove links\n` +
    `• *.antism on/off* — Deletes status-mention messages\n` +
    `• *.blacklist add/remove [number]* — Block a phone number from the group\n` +
    `• *.purge [country_code]* — Remove all non-admins from a country code\n` +
    `• *.welcome on/off / .setwelcome [msg]* — New member message\n` +
    `• *.hidetag [text]* — Silently tag all members\n\n` +
    `*💰 ECONOMY*\n` +
    `• *.reg <phone>* — Register / link your WhatsApp account\n` +
    `• *.bal* — Wallet & bank balance\n` +
    `• *.daily* — Collect daily reward\n` +
    `• *.deposit / .withdraw [amount]* — Move money\n` +
    `• *.shop / .buy [item]* — Browse and buy items\n` +
    `• *.gems* — Card draw currency (used for getting cards)\n\n` +
    `*🎴 CARDS*\n` +
    `• *.coll* — View your card collection\n` +
    `• *.ci [name]* — Card info lookup\n` +
    `• *.cs [series]* — View cards from a specific series\n` +
    `• *.vs @user* — Battle another player's deck\n` +
    `• *.auction / .bid [id] [amt]* — Auction cards\n\n` +
    `*🎮 GAMES*\n` +
    `• *.ttt @user* — Tic Tac Toe\n` +
    `• *.c4 @user* — Connect Four\n` +
    `• *.wcg start* — Word Chain Game (real words only!)\n` +
    `• *.td* — Truth or Dare\n\n` +
    `> _Use .info for bot stats. Use .menu for full command list._`;

  await sock.sendMessage(from, { text: help });
}

// .info — bot stats and info
export async function handleInfo(ctx: CommandContext): Promise<void> {
  const { from, sender, sock } = ctx;
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const uptimeStr = d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`;

  const db = getDb();
  const groupCount = (db.prepare("SELECT COUNT(*) as c FROM groups").get() as any)?.c || 0;
  const userCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE registered = 1 AND COALESCE(is_bot, 0) = 0").get() as any)?.c || 0;
  const cardCount = (db.prepare("SELECT COUNT(*) as c FROM cards").get() as any)?.c || 0;

  const info = `🌌 *Requiem Order Bot — 反逆*\n\n` +
    `🌌 Bot: ${ctx.sock.user?.name || "Requiem Order"}\n` +
    `👑 Creator: Eᴍᴘᴇʀᴏʀ Lᴇʟᴏᴜᴄʜ\n` +
    `🔹 Prefix: [ . ]\n` +
    `📡 Status: Online ✅\n` +
    `⏱️ Uptime: ${uptimeStr}\n` +
    `🏘️ Active Groups: ${groupCount}\n` +
    `👥 Registered Users: ${userCount}\n` +
    `🎴 Cards in Database: ${cardCount}\n` +
    `\n_🌌 Requiem Order — Heavenly Sky_`;

  await sock.sendMessage(from, { text: info, mentions: [sender] });
}
