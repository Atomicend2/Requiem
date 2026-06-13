import type { CommandContext } from "./index.js";
import { sendText, sendMessage } from "../connection.js";
import { getUser, ensureUser, updateUser, getGroup } from "../db/queries.js";
import { formatNumber, coinFlip, rollDice, spin, checkSlotWin, getRouletteColor } from "../utils.js";
import type { WASocket } from "@whiskeysockets/baileys";

export async function handleGambling(ctx: CommandContext): Promise<void> {
  const { from, sender, args, command: cmd, sock } = ctx;
  const user = ensureUser(sender);
  const limit = await checkGamblingAccess(from, sender, user, cmd);
  if (!limit.allowed) return;

  if (cmd === "slots") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const result = spin();
    const multiplier = checkSlotWin(result);
    const slots = result.split(" | ");
    const SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"];
    const randSym = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    
    // Send initial spinning message
    const spinningMsg = await sock.sendMessage(from, {
      text: `🎰 *SPINNING...*\n\n⟦ 🎰 ⟧  ⟦ 🎰 ⟧  ⟦ 🎰 ⟧`
    });
    
    // Animate by editing the same message 8 times (no flood)
    const frames = [];
    for (let i = 0; i < 8; i++) {
      const reelRow = [randSym(), randSym(), randSym()].map((s) => `⟦ ${s} ⟧`).join("  ");
      frames.push(reelRow);
    }
    for (const frame of frames) {
      await sleep(300);
      if (spinningMsg?.key) {
        await sock.sendMessage(from, {
          text: `🎰 *SPINNING...*\n\n${frame}`,
          edit: spinningMsg.key,
        });
      }
    }
    
    // Final result
    const resultRow = slots.map((s) => `⟦ ${s} ⟧`).join("  ");
    const reelRow = () => [randSym(), randSym(), randSym()].map((s) => `⟦ ${s} ⟧`).join("  ");
    
    let winnings = 0;
    let outcome = "";
    if (multiplier === 3) {
      winnings = amount * 3;
      outcome = `🎉 JACKPOT! +$${formatNumber(winnings)} (3x)`;
    } else if (multiplier === 2) {
      winnings = amount * 2;
      outcome = `✨ Double Win! +$${formatNumber(winnings)} (2x)`;
    } else {
      winnings = -amount;
      outcome = `😭 No match. -$${formatNumber(amount)}`;
    }
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    const msg =
      `╭─❰ 🎰 𝐒𝐋𝐎𝐓 𝐌𝐀𝐂𝐇𝐈𝐍𝐄 ❱─╮\n` +
      `│\n` +
      `│  ${reelRow()}\n` +
      `│  ${reelRow()}\n` +
      `│━━━━━━━━━━━━━━━━━━━━━\n` +
      `│▶ ${resultRow} ◀\n` +
      `│━━━━━━━━━━━━━━━━━━━━━\n` +
      `│  ${reelRow()}\n` +
      `│  ${reelRow()}\n` +
      `│\n` +
      `│  🎲 ʙᴇᴛ: $${formatNumber(amount)}\n` +
      `│  ✨ ᴏᴜᴛᴄᴏᴍᴇ: ${outcome}\n` +
      `│  💰 ʙᴀʟᴀɴᴄᴇ: $${formatNumber((user.balance || 0) + winnings)}\n` +
      `╰──────────────────────╯`;
    await sendText(from, msg);
    return;
  }

  if (cmd === "dice") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const roll = rollDice();
    const win = roll >= 4;
    const winnings = win ? amount : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    await sendText(
      from,
      `🎲 Rolled: *${roll}* ${["⚀","⚁","⚂","⚃","⚄","⚅"][roll-1]}\n` +
      `${win ? `🎉 Win! +$${formatNumber(amount)}` : `😭 Lose. -$${formatNumber(amount)}`}\n` +
      `Balance: $${formatNumber((user.balance || 0) + winnings)}`
    );
    return;
  }

  if (cmd === "coinflip" || cmd === "cf") {
    const choice = args[0]?.toLowerCase();
    const amount = parseAmount(args[1] || args[0], user.balance);
    if (!choice || !["h","t","heads","tails"].includes(choice)) {
      await sendText(from, "❌ Usage: .cf [h/t] [amount]");
      return;
    }
    if (!(await checkBet(from, user, amount))) return;
    const result = coinFlip();
    const userPick = choice === "h" || choice === "heads" ? "heads" : "tails";
    const win = userPick === result;
    const winnings = win ? amount : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    const resultLabel = result === "heads" ? "Heads" : "Tails";
    await sendText(
      from,
      `🪙 Coin flip result: *${resultLabel}*!\n` +
      (win ? `You won $${formatNumber(amount)}` : `You lost $${formatNumber(amount)}`) +
      `\nBalance: $${formatNumber((user.balance || 0) + winnings)}`
    );
    return;
  }

  if (cmd === "casino") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const win = Math.random() < 0.45;
    const winnings = win ? amount : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    await sendText(
      from,
      `Outcome: ${win ? "Win" : "Lose"}! 💰You won ${win ? `$${formatNumber(amount * 2)} coins.` : `nothing.`}\n` +
      `Balance: $${formatNumber((user.balance || 0) + winnings)}`
    );
    return;
  }

  if (cmd === "doublebet" || cmd === "db") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const win = Math.random() < 0.45;
    const winnings = win ? amount : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    const resultText = win ? `🎯 𝗪𝗜𝗡` : `💀 𝗟𝗢𝗦𝗘`;
    const changeText = win ? `+$${formatNumber(amount * 2)}` : `-$${formatNumber(amount)}`;
    await sendText(
      from,
      `╭─❰ 🎲 ᴅᴏᴜʙʟᴇ ʙᴇᴛ ❱─╮\n` +
      `│\n` +
      `│  🎰 Result: ${resultText}\n` +
      `│  💰 Amount: $${formatNumber(amount)}\n` +
      `│  ✨ Outcome: ${changeText}\n` +
      `│  🏦 Balance: $${formatNumber((user.balance || 0) + winnings)}\n` +
      `╰──────────────╯`
    );
    return;
  }

  if (cmd === "doublepayout" || cmd === "dp") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const win = Math.random() < 0.4;
    const payout = win ? amount * 3 : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + payout }));
    await sendText(
      from,
      win ? `🎰 Triple payout! +$${formatNumber(amount * 3)}` : `😭 Lost. -$${formatNumber(amount)}`
    );
    return;
  }

  if (cmd === "roulette") {
    const color = args[0]?.toLowerCase();
    const amount = parseAmount(args[1], user.balance);
    if (!["red","black","green"].includes(color)) {
      await sendText(from, "❌ Usage: .roulette [red/black/green] [amount]");
      return;
    }
    if (!(await checkBet(from, user, amount))) return;
    const num = Math.floor(Math.random() * 37);
    const result = getRouletteColor(num);
    const win = result === color;
    const multiplier = color === "green" ? 14 : 2;
    const winnings = win ? amount * multiplier : -amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    await sendText(
      from,
      `🎡 Ball landed on *${num}* (${result})\n` +
      `${win ? `🎉 You picked ${color} — win! +$${formatNumber(amount * multiplier)}` : `😭 You picked ${color} — lose. -$${formatNumber(amount)}`}\n` +
      `Balance: $${formatNumber((user.balance || 0) + winnings)}`
    );
    return;
  }

  if (cmd === "horse") {
    const pick = parseInt(args[0]);
    const amount = parseAmount(args[1], user.balance);
    if (isNaN(pick) || pick < 1 || pick > 4) {
      await sendText(from, "❌ Usage: .horse [1-4] [amount]");
      return;
    }
    if (!(await checkBet(from, user, amount))) return;
    const winner = Math.ceil(Math.random() * 4);
    const win = pick === winner;
    const winnings = win ? amount * 4 : -amount;
    const horses = ["🐴", "🐎", "🏇", "🦄"];
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + winnings }));
    await sendText(
      from,
      `🏇 Race Results: ${horses.map((h, i) => `${h}${i === winner - 1 ? "🏆" : ""}`).join(" ")}\n\n` +
      `Winner: Horse #${winner}\n` +
      `${win ? `🎉 Correct! +$${formatNumber(amount * 4)}` : `😭 Wrong. -$${formatNumber(amount)}`}\n` +
      `Balance: $${formatNumber((user.balance || 0) + winnings)}`
    );
    return;
  }

  if (cmd === "spin") {
    const amount = parseAmount(args[0], user.balance);
    if (!(await checkBet(from, user, amount))) return;
    const outcomes = [
      { label: "💰 2x", multi: 2, chance: 0.2 },
      { label: "💸 1.5x", multi: 1.5, chance: 0.25 },
      { label: "❌ 0x", multi: 0, chance: 0.35 },
      { label: "💥 3x", multi: 3, chance: 0.1 },
      { label: "☠️ -0.5x", multi: -0.5, chance: 0.1 },
    ];
    let rand = Math.random();
    let outcome = outcomes[outcomes.length - 1];
    for (const o of outcomes) {
      if (rand < o.chance) { outcome = o; break; }
      rand -= o.chance;
    }
    const won = Math.floor(amount * outcome.multi);
    const diff = won - amount;
    updateUser(sender, gambleUpdate(limit, { balance: (user.balance || 0) + diff }));
    await sendText(
      from,
      `🌀 Spin result: *${outcome.label}*\n` +
      `${diff >= 0 ? `+$${formatNumber(diff)}` : `-$${formatNumber(-diff)}`}\n` +
      `Balance: $${formatNumber((user.balance || 0) + diff)}`
    );
    return;
  }
}

function parseAmount(val: string | undefined, balance: number): number {
  if (!val) return 100;
  if (val === "all") return balance;
  if (val === "half") return Math.floor(balance / 2);
  const n = parseInt(val);
  return isNaN(n) ? 100 : n;
}

async function checkBet(from: string, user: any, amount: number): Promise<boolean> {
  if (amount <= 0) {
    await sendText(from, "❌ Bet amount must be positive.");
    return false;
  }
  if (amount > (user.balance || 0)) {
    await sendText(from, `❌ Not enough money. You have $${formatNumber(user.balance || 0)}.`);
    return false;
  }
  return true;
}

const GAMBLE_DAILY_LIMIT = 20;
const GAMBLE_COOLDOWNS: Record<string, number> = {
  slots: 300,
  dice: 120,
  coinflip: 120,
  cf: 120,
  casino: 420,
  doublebet: 240,
  db: 240,
  doublepayout: 300,
  dp: 300,
  roulette: 300,
  horse: 240,
  spin: 180,
};

async function checkGamblingAccess(from: string, sender: string, user: any, cmd: string): Promise<{ allowed: boolean; now: number; day: string; count: number; field: string; label: string }> {
  const now = Math.floor(Date.now() / 1000);
  const day = new Date(now * 1000).toISOString().slice(0, 10);
  const count = user.gamble_date === day ? Number(user.gamble_uses || 0) : 0;

  if (from.endsWith("@g.us")) {
    const group = getGroup(from);
    if (group && (group.gambling_enabled || "on") === "off") {
      await sendText(from, "🎰 Gambling is currently *disabled* in this group.", [sender]);
      return { allowed: false, now, day, count, field: "", label: "" };
    }
  }

  const canonical = canonicalGambleCommand(cmd);
  const field = `last_${canonical}`;
  const label = canonical.replace(/^\w/, (c) => c.toUpperCase());
  if (count >= GAMBLE_DAILY_LIMIT) {
    await sendText(from, `⛔ Daily gambling limit reached (${GAMBLE_DAILY_LIMIT}/day). Try again tomorrow.`, [sender]);
    return { allowed: false, now, day, count, field, label };
  }
  const cooldown = GAMBLE_COOLDOWNS[cmd] || 120;
  const diff = now - Number(user[field] || 0);
  if (diff < cooldown) {
    await sendText(from, `⏳ ${label} cooldown: ${formatDuration(cooldown - diff)} left.`, [sender]);
    return { allowed: false, now, day, count, field, label };
  }
  return { allowed: true, now, day, count, field, label };
}

function gambleUpdate(limit: { now: number; day: string; count: number; field: string }, data: Record<string, any>): Record<string, any> {
  return {
    ...data,
    [limit.field]: limit.now,
    last_gamble: limit.now,
    gamble_uses: limit.count + 1,
    gamble_date: limit.day,
  };
}

function canonicalGambleCommand(cmd: string): string {
  if (cmd === "cf") return "coinflip";
  if (cmd === "db") return "doublebet";
  if (cmd === "dp") return "doublepayout";
  return cmd;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
