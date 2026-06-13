/**
 * shoob-sync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Shoob.gg card import & sync engine.
 *
 * Shoob card shape (from browser inspection / React state):
 *   {
 *     _id: "6a1ccb80068f3100783eddbd",
 *     id:  "6a1ccb80068f3100783eddbd",
 *     name: "Easthies",
 *     tier: "1",                         ← numeric string "1"–"6", "S", "X"
 *     category: ["Witch Hat Atelier", "Easthies", "Batch Release "],
 *     file: "60ead3d6...ddd.png",         ← hash filename
 *     slug: "Easthies",
 *     claim_count: 2,
 *     authors: [],
 *     attributes: []
 *   }
 *
 * Card image URL:  https://api.shoob.gg/site/api/cardr/{_id}?size=400
 * Card list API:   https://api.shoob.gg/site/api/cards?page=N&limit=50
 *
 * Three bot commands:
 *   .pullcards   – full import (all pages, re-downloads images)
 *   .synccards   – incremental import (new cards only)
 *   .cardlogs    – show recent sync statistics
 *
 * Access: owner, guardian, mod (isModOrAbove)
 */

import type { CommandContext } from "../commands/index.js";
import { sendText } from "../connection.js";
import { getStaff } from "../db/queries.js";
import { logger } from "../../lib/logger.js";
import sharp from "sharp";

// ── Shoob API constants ──────────────────────────────────────────────────────
const SHOOB_API_BASE      = "https://api.shoob.gg";
const SHOOB_IMAGE_BASE    = `${SHOOB_API_BASE}/site/api/cardr`;
const SHOOB_CARDS_ENDPOINT = `${SHOOB_API_BASE}/site/api/cards`;

const VALID_SHOOB_TIERS = ["T1","T2","T3","T4","T5","T6","TS","TX","TZ"];

/**
 * Normalise Shoob's tier field to bot T-prefix format.
 * Shoob uses: "1"–"6" (numeric string), "S", "X", "Z"
 * Bot uses:   "T1"–"T6", "TS", "TX", "TZ"
 */
function normaliseTier(raw: string | number | undefined | null): string {
  if (raw === null || raw === undefined) return "T1";
  const s = String(raw).trim().toUpperCase();
  if (s.startsWith("T") && VALID_SHOOB_TIERS.includes(s)) return s;  // already T-prefixed
  if (/^\d$/.test(s)) return `T${s}`;                                  // "1"→"T1"
  if (s === "S") return "TS";
  if (s === "X") return "TX";
  if (s === "Z") return "TZ";
  return "T1";
}

/**
 * Extract the best series label from a Shoob card.
 * category[0] is the anime/series title; fall back to category[1], then "Shoob".
 */
function extractSeries(card: any): string {
  if (Array.isArray(card.category) && card.category.length > 0) {
    return (card.category[0] as string).trim() || "Shoob";
  }
  return (card.series || card.anime || "Shoob").trim() || "Shoob";
}

/** Build the Shoob card image URL from its _id. */
function shoobImageUrl(card: any): string {
  const id = card._id || card.id;
  if (!id) return "";
  return `${SHOOB_IMAGE_BASE}/${id}?size=400`;
}

/** True when a Shoob card has animated media (GIF, WebP, WebM). */
function isAnimatedCard(card: any): boolean {
  const file = String(card.file || "").toLowerCase();
  return (
    file.endsWith(".gif") ||
    file.endsWith(".webm") ||
    card.has_webp === true ||
    card.has_webm === true ||
    card.is_animated === true ||
    card.animated === true
  );
}

// ID character set for local card ID generation
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// ── Permission helper ────────────────────────────────────────────────────────

function isModOrAbove(ctx: CommandContext): boolean {
  if (ctx.isOwner) return true;
  const staff = getStaff(ctx.sender);
  return !!staff && ["owner", "guardian", "mod"].includes(staff.role);
}

// ── Core helpers ─────────────────────────────────────────────────────────────

async function genCardId(db: any): Promise<string> {
  const { randomBytes } = await import("crypto");
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = randomBytes(8);
    const candidate = Array.from(bytes as unknown as number[])
      .map((b: number) => ID_CHARS[b % ID_CHARS.length])
      .join("");
    if (!db.prepare("SELECT 1 FROM cards WHERE id = ?").get(candidate)) return candidate;
  }
  return "C" + Date.now().toString(36).toUpperCase();
}

/** Fetch and locally store one card image. Returns {buffer, isVideo} or null. */
async function downloadImage(url: string): Promise<{ buffer: Buffer; isVideo: boolean } | null> {
  const isVideo = /\.(webm|mp4|mov)(\?|$)/i.test(url);
  const isGif   = /\.gif(\?|$)/i.test(url);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)" },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    if (isVideo || isGif) return { buffer: raw, isVideo: true };
    try {
      const processed = await sharp(raw)
        .resize(800, 1100, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92 })
        .toBuffer();
      return { buffer: processed, isVideo: false };
    } catch {
      return { buffer: raw, isVideo: false };
    }
  } catch {
    return null;
  }
}

/** Fetch one page of cards from the Shoob public API. */
async function fetchShoobPage(page: number, limit = 50): Promise<any[]> {
  const url = `${SHOOB_CARDS_ENDPOINT}?page=${page}&limit=${limit}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Shoob API HTTP ${res.status} on page ${page}`);
  const data: any = await res.json();
  // Response may be: plain array, { cards: [...] }, { data: [...] }, { results: [...] }
  if (Array.isArray(data)) return data;
  return data.cards || data.data || data.results || [];
}

/**
 * Core import loop used by both .pullcards (full) and .synccards (incremental).
 *
 * @param db          SQLite instance
 * @param syncOnly    true = skip cards already in shoob_imported_ids
 * @param uploader    Phone number of the staff who triggered the run
 * @param progressCb  Called every 5 pages with a progress update
 */
async function runShoobImport(
  db: any,
  syncOnly: boolean,
  uploader: string,
  progressCb: (msg: string) => Promise<void>,
): Promise<{ imported: number; updated: number; skipped: number; errors: number; totalSeen: number; durationMs: number }> {
  const startTime = Date.now();
  let imported = 0, updated = 0, skipped = 0, errors = 0, totalSeen = 0;
  let page = 1;

  while (true) {
    let pageCards: any[];
    try {
      pageCards = await fetchShoobPage(page, 50);
    } catch (err: any) {
      logger.warn({ err, page }, "Shoob page fetch failed");
      break;
    }
    if (!pageCards.length) break;

    totalSeen += pageCards.length;

    for (const card of pageCards) {
      // Shoob uses both _id and id — prefer _id (MongoDB ObjectId)
      const shoobId: string = String(card._id || card.id || "").trim();
      if (!shoobId) { skipped++; continue; }

      // ── Sync mode: skip already-imported cards ──────────────────────────
      if (syncOnly) {
        const alreadyRow = db.prepare(
          "SELECT local_card_id FROM shoob_imported_ids WHERE shoob_id = ?"
        ).get(shoobId);
        if (alreadyRow) { skipped++; continue; }
      }

      // Derive fields from Shoob card shape
      const cardName: string = (card.name || card.slug || shoobId).trim().replace(/_/g, " ");
      const tier     = normaliseTier(card.tier);
      const series   = extractSeries(card);
      const animated = isAnimatedCard(card) ? 1 : 0;
      const imageUrl = shoobImageUrl(card);

      // ── Check if this shoob_id is already tracked ───────────────────────
      const existingByShoobId = db.prepare(
        "SELECT id FROM cards WHERE shoob_id = ?"
      ).get(shoobId) as any;

      if (existingByShoobId && syncOnly) {
        // Metadata refresh only (no image re-download in incremental mode)
        db.prepare(
          "UPDATE cards SET name = ?, tier = ?, series = ?, is_animated = ?, source = 'shoob' WHERE id = ?"
        ).run(cardName, tier, series, animated, existingByShoobId.id);
        db.prepare(
          "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
        ).run(shoobId, existingByShoobId.id);
        updated++;
        continue;
      }

      if (existingByShoobId && !syncOnly) {
        // Full pull: update metadata + re-download image
        let imageData: Buffer | null = null;
        if (imageUrl) {
          const dl = await downloadImage(imageUrl).catch(() => null);
          if (dl) imageData = dl.buffer;
          await new Promise(r => setTimeout(r, 120));
        }
        db.prepare(
          "UPDATE cards SET name = ?, tier = ?, series = ?, is_animated = ?, image_data = COALESCE(?, image_data), source = 'shoob' WHERE id = ?"
        ).run(cardName, tier, series, animated, imageData, existingByShoobId.id);
        db.prepare(
          "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
        ).run(shoobId, existingByShoobId.id);
        updated++;
        continue;
      }

      // ── New card — download image and insert ────────────────────────────
      let imageData: Buffer | null = null;
      if (imageUrl) {
        try {
          const dl = await downloadImage(imageUrl);
          if (dl) imageData = dl.buffer;
        } catch {
          errors++;
        }
        await new Promise(r => setTimeout(r, 120)); // rate-limit CDN calls
      }

      const localId = await genCardId(db);
      try {
        db.prepare(
          "INSERT INTO cards (id, name, series, tier, image_data, is_animated, uploaded_by, source, shoob_id) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, 'shoob', ?)"
        ).run(localId, cardName, series, tier, imageData, animated, uploader, shoobId);
        db.prepare(
          "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
        ).run(shoobId, localId);
        imported++;
      } catch (err: any) {
        logger.warn({ err, shoobId }, "Failed to insert Shoob card");
        errors++;
      }
    }

    // Progress update every 5 pages
    if (page % 5 === 0) {
      await progressCb(
        `⏳ Progress: page ${page} | +${imported} imported | ${updated} updated | ${skipped} skipped…`
      ).catch(() => {});
    }

    // Shoob returns < limit on the last page
    if (pageCards.length < 50) break;
    page++;
  }

  return { imported, updated, skipped, errors, totalSeen, durationMs: Date.now() - startTime };
}

// ── Command handlers ─────────────────────────────────────────────────────────

export async function handlePullCards(ctx: CommandContext): Promise<void> {
  const { from, sender } = ctx;

  if (!isModOrAbove(ctx)) {
    await sendText(from, "❌ Only mods, guardians, and owner can use .pullcards.");
    return;
  }

  await sendText(from,
    `🌐 *Starting full Shoob import…*\n\n` +
    `_Pulls ALL cards from Shoob.gg, re-downloads images, and refreshes metadata._\n` +
    `_This may take several minutes. Progress updates every 5 pages._`
  );

  const { getDb } = await import("../db/database.js");
  const db = getDb();
  const uploader = sender.split("@")[0].split(":")[0];
  const runStart = Math.floor(Date.now() / 1000);

  try {
    const stats = await runShoobImport(db, false, uploader, async (msg) => {
      await sendText(from, msg);
    });

    db.prepare(
      "INSERT INTO shoob_sync_log (run_type, started_by, imported, updated, skipped, errors, total_seen, duration_ms, ran_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("full", uploader, stats.imported, stats.updated, stats.skipped, stats.errors, stats.totalSeen, stats.durationMs, runStart);

    const dur = stats.durationMs >= 60000
      ? `${Math.floor(stats.durationMs / 60000)}m ${Math.floor((stats.durationMs % 60000) / 1000)}s`
      : `${Math.floor(stats.durationMs / 1000)}s`;

    await sendText(from,
      `✅ *Full Shoob import complete!*\n\n` +
      `🎴 Imported: *${stats.imported}* new cards\n` +
      `🔄 Updated:  *${stats.updated}* existing cards\n` +
      `⏭️ Skipped:  *${stats.skipped}*\n` +
      `⚠️ Errors:   *${stats.errors}*\n` +
      `📊 Total seen: *${stats.totalSeen}*\n` +
      `⏱️ Duration:  *${dur}*\n\n` +
      `_Run .cardlogs to see sync history._`
    );
  } catch (err: any) {
    await sendText(from, `❌ Full import failed: ${err?.message || "Unknown error"}`);
  }
}

export async function handleSyncCards(ctx: CommandContext): Promise<void> {
  const { from, sender } = ctx;

  if (!isModOrAbove(ctx)) {
    await sendText(from, "❌ Only mods, guardians, and owner can use .synccards.");
    return;
  }

  await sendText(from,
    `🔄 *Starting incremental Shoob sync…*\n\n` +
    `_Only importing cards not yet in your database. Existing cards get metadata updates._`
  );

  const { getDb } = await import("../db/database.js");
  const db = getDb();
  const uploader = sender.split("@")[0].split(":")[0];
  const runStart = Math.floor(Date.now() / 1000);

  try {
    const stats = await runShoobImport(db, true, uploader, async (msg) => {
      await sendText(from, msg);
    });

    db.prepare(
      "INSERT INTO shoob_sync_log (run_type, started_by, imported, updated, skipped, errors, total_seen, duration_ms, ran_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("incremental", uploader, stats.imported, stats.updated, stats.skipped, stats.errors, stats.totalSeen, stats.durationMs, runStart);

    const dur = stats.durationMs >= 60000
      ? `${Math.floor(stats.durationMs / 60000)}m ${Math.floor((stats.durationMs % 60000) / 1000)}s`
      : `${Math.floor(stats.durationMs / 1000)}s`;

    await sendText(from,
      `✅ *Sync complete!*\n\n` +
      `🎴 New cards imported: *${stats.imported}*\n` +
      `🔄 Metadata updated:   *${stats.updated}*\n` +
      `⏭️ Already had:        *${stats.skipped}*\n` +
      `⚠️ Errors:             *${stats.errors}*\n` +
      `📊 Total scanned:      *${stats.totalSeen}*\n` +
      `⏱️ Duration:           *${dur}*\n\n` +
      `_Run .pullcards for a full re-import._`
    );
  } catch (err: any) {
    await sendText(from, `❌ Sync failed: ${err?.message || "Unknown error"}`);
  }
}

export async function handleCardLogs(ctx: CommandContext): Promise<void> {
  const { from } = ctx;

  if (!isModOrAbove(ctx)) {
    await sendText(from, "❌ Only mods, guardians, and owner can view .cardlogs.");
    return;
  }

  const { getDb } = await import("../db/database.js");
  const db = getDb();

  const logs = db.prepare(
    "SELECT * FROM shoob_sync_log ORDER BY ran_at DESC LIMIT 10"
  ).all() as any[];

  const totalCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards").get() as any)?.cnt || 0;
  const shoobCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards WHERE source = 'shoob'").get() as any)?.cnt || 0;
  const trackedIds  = (db.prepare("SELECT COUNT(*) as cnt FROM shoob_imported_ids").get() as any)?.cnt || 0;

  if (!logs.length) {
    await sendText(from,
      `📊 *Card Sync Logs*\n\n` +
      `No sync runs yet.\n\n` +
      `🎴 Total cards in DB: *${totalCards}*\n` +
      `🌐 From Shoob: *${shoobCards}*\n\n` +
      `Run *.pullcards* for a full import or *.synccards* for incremental.`
    );
    return;
  }

  const fmtTs  = (ts: number) => new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const fmtDur = (ms: number) => ms >= 60000
    ? `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
    : `${Math.floor(ms / 1000)}s`;

  const rows = logs.map((r) => {
    const typeEmoji = r.run_type === "full" ? "📦" : "🔄";
    return (
      `   │✑ ${typeEmoji} *${r.run_type}* — ${fmtTs(r.ran_at)}\n` +
      `   │    +${r.imported} new · ${r.updated} upd · ${r.skipped} skip · ${r.errors} err · ${fmtDur(r.duration_ms)}`
    );
  }).join("\n");

  const header = `┌─❖\n│「 🆃🅴🅽🅺🆄 」\n└┬❖ 「 📊 𝗖𝗮𝗿𝗱 𝗦𝘆𝗻𝗰 𝗟𝗼𝗴𝘀 」\n`;
  const body   =
    `   │ 🎴 Total cards: *${totalCards}* (${shoobCards} from Shoob)\n` +
    `   │ 🔗 Tracked Shoob IDs: *${trackedIds}*\n` +
    `   ├────────────┈ ⳹\n` +
    `   │ Last ${logs.length} runs:\n` +
    rows + `\n` +
    `   └────────────┈ ⳹`;

  await sendText(from, header + body);
}
