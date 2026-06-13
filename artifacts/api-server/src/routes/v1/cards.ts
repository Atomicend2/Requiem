import { Router } from "express";
import multer from "multer";
import { requireAuth, optionalAuth, type AuthRequest } from "./middleware.js";
import { getDb } from "../../bot/db/database.js";
import { getSocket, isSocketConnected } from "../../bot/connection.js";
import { getStaff } from "../../bot/db/queries.js";
import { logger } from "../../lib/logger.js";

const router = Router();
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ANIMATED_TIERS = new Set(["T6", "TS", "TX", "TZ"]); // must match VIDEO_TIERS in utils.ts
const VALID_TIERS = ["T1","T2","T3","T4","T5","T6","TS","TX","TZ"];

// Shoob.gg public card API
const SHOOB_API = "https://api.shoob.gg";

// Serve card media BLOB from the database (image or video for animated tiers)
router.get("/:id/image", (req, res) => {
  const db = getDb();
  const card = db.prepare("SELECT image_data, tier FROM cards WHERE id = ?").get(req.params.id) as any;
  if (!card?.image_data) {
    res.status(404).end();
    return;
  }
  const isAnimated = ANIMATED_TIERS.has(card.tier);
  const contentType = isAnimated ? "video/mp4" : "image/jpeg";
  const buf: Buffer = Buffer.isBuffer(card.image_data) ? card.image_data : Buffer.from(card.image_data);
  const total = buf.length;

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Accept-Ranges", "bytes");

  const rangeHeader = req.headers["range"];
  if (isAnimated && rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", chunkSize);
      res.end(buf.slice(start, end + 1));
      return;
    }
  }

  res.setHeader("Content-Length", total);
  res.end(buf);
});

function getCardCopyCount(db: any, cardId: string): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM user_cards WHERE card_id = ?").get(cardId) as any;
  return row?.cnt || 0;
}

function getCardOwner(db: any, cardId: string): { name: string; id: string } | null {
  const row = db.prepare(`
    SELECT u.id, u.name FROM user_cards uc
    JOIN users u ON u.id = uc.user_id
    WHERE uc.card_id = ?
    ORDER BY uc.obtained_at ASC LIMIT 1
  `).get(cardId) as any;
  return row ? { id: row.id, name: row.name || "Unknown" } : null;
}

router.get("/", optionalAuth, (req, res) => {
  const db = getDb();
  const { tier, series } = req.query as { tier?: string; series?: string };

  let query = "SELECT * FROM cards";
  const params: any[] = [];
  const conditions: string[] = [];

  if (tier) {
    conditions.push("tier = ?");
    params.push(tier);
  }
  if (series) {
    conditions.push("LOWER(series) LIKE LOWER(?)");
    params.push(`%${series}%`);
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " ORDER BY tier, name";

  const cards = db.prepare(query).all(...params) as any[];

  const result = cards.map((card: any) => {
    const owner = getCardOwner(db, card.id);
    const totalCopies = getCardCopyCount(db, card.id);
    const owners = db.prepare(`
      SELECT DISTINCT u.id, u.name FROM user_cards uc
      JOIN users u ON u.id = uc.user_id
      WHERE uc.card_id = ?
      LIMIT 5
    `).all(card.id) as any[];
    const isAnimated = ANIMATED_TIERS.has(card.tier);
    return {
      id: card.id,
      name: card.name,
      tier: card.tier,
      series: card.series || "General",
      description: card.description || "",
      imageUrl: card.image_data ? `/api/v1/cards/${card.id}/image` : (card.image_url || ""),
      isAnimated,
      totalCopies,
      ownerName: owner?.name || "Unclaimed",
      ownerId: owner?.id || null,
      owners: owners.map((o: any) => ({ id: o.id, name: o.name || "Shadow" })),
    };
  });

  res.json({ cards: result, total: result.length });
});

router.get("/my", requireAuth, (req: AuthRequest, res) => {
  const db = getDb();
  const userCards = db.prepare(`
    SELECT uc.id as user_card_id, uc.obtained_at, c.*
    FROM user_cards uc
    JOIN cards c ON c.id = uc.card_id
    WHERE uc.user_id = ?
    ORDER BY uc.obtained_at DESC
  `).all(req.userId!) as any[];

  const result = userCards.map((uc: any) => {
    const totalCopies = getCardCopyCount(db, uc.id);
    const owners = db.prepare(`
      SELECT DISTINCT u.id, u.name FROM user_cards ucc
      JOIN users u ON u.id = ucc.user_id
      WHERE ucc.card_id = ?
      LIMIT 5
    `).all(uc.id) as any[];
    const isAnimated = ANIMATED_TIERS.has(uc.tier);
    return {
      userCardId: uc.user_card_id,
      card: {
        id: uc.id,
        name: uc.name,
        tier: uc.tier,
        series: uc.series || "General",
        description: uc.description || "",
        imageUrl: uc.image_data ? `/api/v1/cards/${uc.id}/image` : (uc.image_url || ""),
        isAnimated,
        totalCopies,
        ownerName: req.user?.name || "You",
        ownerId: req.userId,
        owners: owners.map((o: any) => ({ id: o.id, name: o.name || "Shadow" })),
      },
      obtainedAt: uc.obtained_at || 0,
    };
  });

  res.json({ cards: result, total: result.length });
});

router.post("/wishlist", requireAuth, async (req: AuthRequest, res) => {
  const { cardId } = req.body as { cardId?: string };
  if (!cardId) {
    res.status(400).json({ success: false, message: "cardId is required" });
    return;
  }

  const db = getDb();
  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId) as any;
  if (!card) {
    res.status(404).json({ success: false, message: "Card not found" });
    return;
  }

  const owner = getCardOwner(db, cardId);
  if (!owner) {
    res.json({ success: true, message: "Card is unclaimed — no owner to notify" });
    return;
  }

  const sock = getSocket();
  if (sock && isSocketConnected() && owner.id !== req.userId) {
    try {
      const requesterName = req.user?.name || "Someone";
      await sock.sendMessage(owner.id, {
        text: `*Requiem Order 反逆 — Trade Alert*\n\n${requesterName} wants to trade for your *${card.name}* (${card.tier} - ${card.series || "General"}).\n\nReply with .trade to negotiate.`,
      });
    } catch (err) {
      logger.error({ err }, "Failed to send wishlist notification");
    }
  }

  res.json({ success: true, message: "Trade notification sent to card owner" });
});

// ── Web card upload (staff only) ────────────────────────────────────────────
// POST /api/v1/cards/upload  — multipart: file (image or video), tier, name, series
router.post("/upload", requireAuth, uploadMem.single("file"), async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }

    // Check staff / mod permission
    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_LID"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) {
      res.status(403).json({ success: false, message: "Only staff can upload cards." });
      return;
    }

    if (!req.file) { res.status(400).json({ success: false, message: "No file provided" }); return; }

    const tier = (req.body?.tier || "").toUpperCase().trim();
    const name = (req.body?.name || "").trim();
    const series = (req.body?.series || "").trim();

    if (!VALID_TIERS.includes(tier)) {
      res.status(400).json({ success: false, message: `Invalid tier. Valid: ${VALID_TIERS.join(", ")}` });
      return;
    }
    if (!name || name.length < 2) {
      res.status(400).json({ success: false, message: "Card name is required (min 2 chars)" });
      return;
    }
    if (!series || series.length < 2) {
      res.status(400).json({ success: false, message: "Series name is required" });
      return;
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM cards WHERE LOWER(name) = LOWER(?)").get(name) as any;
    if (existing) {
      res.status(409).json({ success: false, message: `A card named "${name}" already exists (ID: ${existing.id}).` });
      return;
    }

    const isAnimated = ANIMATED_TIERS.has(tier);
    const mimeType = req.file.mimetype;
    const isVideo = mimeType.startsWith("video/");

    if (isAnimated && !isVideo && !mimeType.startsWith("image/")) {
      res.status(400).json({ success: false, message: "Animated tier cards require a video or image file." });
      return;
    }
    if (!isAnimated && isVideo) {
      res.status(400).json({ success: false, message: `Tier ${tier} is not animated. Please upload an image.` });
      return;
    }

    let imageData: Buffer = req.file.buffer;

    if (!isVideo) {
      try {
        const sharp = (await import("sharp")).default;
        imageData = await sharp(req.file.buffer)
          .resize(800, 1100, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 92 })
          .toBuffer();
      } catch { /* sharp not available or unsupported format — use raw */ }
    }

    const result = db.prepare(
      "INSERT INTO cards (name, series, tier, image_data, is_animated, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(name, series, tier, imageData, isAnimated ? 1 : 0, userId);

    const cardId = result.lastInsertRowid;

    res.json({
      success: true,
      message: `Card uploaded! 🎴 ${name} (${tier}) — ${series}`,
      card: { id: cardId, name, series, tier, isAnimated },
    });
  } catch (err: any) {
    logger.error({ err }, "Card upload error");
    res.status(500).json({ success: false, message: err?.message || "Upload failed" });
  }
});


// ── Shoob.gg card import (staff only) ────────────────────────────────────────
// POST /api/v1/cards/fetch-cards
// Body: { tier?, series?, limit? }
//
// Fetches cards from the Shoob.gg public API (https://api.shoob.gg).
// Shoob card shape: { _id, id, name, slug, tier, category[], file, claim_count }
//
// Body params:
//   tier   - "T1"–"T6", "TS", "TX", "TZ" to filter by tier (optional)
//   series - override series label for all imported cards (optional)
//   limit  - max cards to import, 1–200 (default 20)

// Normalise Shoob tier field ("1"→"T1", "S"→"TS", etc.)
function normaliseShoobTier(raw: string | number | undefined, fallback = "T1"): string {
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim().toUpperCase();
  if (s.startsWith("T") && ["T1","T2","T3","T4","T5","T6","TS","TX","TZ"].includes(s)) return s;
  if (/^\d$/.test(s)) return `T${s}`;
  if (s === "S") return "TS";
  if (s === "X") return "TX";
  if (s === "Z") return "TZ";
  return fallback;
}

// Sync-log stats route: shows recent .pullcards / .synccards run history
router.get("/sync-log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }
    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_PHONE"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) { res.status(403).json({ success: false, message: "Only staff can view sync logs." }); return; }

    const db = getDb();
    const logs = db.prepare("SELECT * FROM shoob_sync_log ORDER BY ran_at DESC LIMIT 20").all();
    const totalCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards").get() as any)?.cnt || 0;
    const shoobCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards WHERE source = 'shoob'").get() as any)?.cnt || 0;
    const trackedIds  = (db.prepare("SELECT COUNT(*) as cnt FROM shoob_imported_ids").get() as any)?.cnt || 0;
    res.json({ success: true, logs, totalCards, shoobCards, trackedIds });
  } catch (err: any) {
    logger.error({ err }, "Sync log error");
    res.status(500).json({ success: false, message: err?.message || "Failed to fetch sync log" });
  }
});

router.post("/fetch-cards", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }

    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_PHONE"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) { res.status(403).json({ success: false, message: "Only staff can import cards." }); return; }

    const rawTier = (req.body?.tier as string | undefined)?.toUpperCase().trim() || "";
    const tier = rawTier || "";

    if (tier && !VALID_TIERS.includes(tier)) {
      res.status(400).json({ success: false, message: `Invalid tier. Valid: ${VALID_TIERS.join(", ")} (or leave blank for all tiers)` });
      return;
    }

    const seriesOverride = ((req.body?.series || "") as string).trim();
    const limit = Math.min(parseInt(req.body?.limit || "20", 10) || 20, 200);

    const db = getDb();

    // Paginate Shoob until we collect enough matching cards
    const collected: any[] = [];
    let page = 1;
    while (collected.length < limit) {
      const url = `${SHOOB_API}/site/api/cards?page=${page}&limit=50`;
      logger.info({ url }, "Fetching Shoob card page");
      const apiRes = await fetch(url, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)" },
        signal: AbortSignal.timeout(20000),
      });
      if (!apiRes.ok) {
        res.status(502).json({ success: false, message: `Shoob API returned ${apiRes.status}. Try again.` });
        return;
      }
      const apiData: any = await apiRes.json();
      const pageCards: any[] = Array.isArray(apiData) ? apiData : (apiData.cards || apiData.data || apiData.results || []);
      if (!pageCards.length) break;

      for (const c of pageCards) {
        const cardTier = normaliseShoobTier(c.tier);
        if (tier && cardTier !== tier) continue;
        collected.push(c);
        if (collected.length >= limit) break;
      }
      if (pageCards.length < 50) break;
      page++;
    }

    if (!collected.length) {
      res.status(502).json({
        success: false,
        message: tier
          ? `No ${tier} cards found on Shoob right now. Try a different tier.`
          : "No cards returned from Shoob. Try again later.",
      });
      return;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const sc of collected) {
      // Shoob shape: { _id, id, name, slug, tier, category[], file }
      const shoobId: string = String(sc._id || sc.id || "").trim();
      const cardName: string = (sc.name || sc.slug || shoobId).trim().replace(/_/g, " ");
      if (!cardName || cardName.length < 2) { skipped++; continue; }

      // Skip if already in DB by shoob_id or name
      const existsByShoobId = shoobId ? db.prepare("SELECT 1 FROM cards WHERE shoob_id = ?").get(shoobId) : null;
      const existsByName = db.prepare("SELECT 1 FROM cards WHERE LOWER(name) = LOWER(?)").get(cardName);
      if (existsByShoobId || existsByName) { skipped++; continue; }

      const cardTier = normaliseShoobTier(sc.tier, tier || "T1");
      const cardSeries: string = seriesOverride ||
        (Array.isArray(sc.category) && sc.category[0] ? String(sc.category[0]).trim() : (sc.series || sc.anime || "Shoob"));

      const imageUrl = shoobId ? `${SHOOB_API}/site/api/cardr/${shoobId}?size=400` : "";
      const isVideo = /\.(webm|mp4|mov)(\?|$)/i.test(imageUrl);
      const isGif   = /\.gif(\?|$)/i.test(String(sc.file || ""));
      const cardIsAnimated = (isVideo || isGif || ANIMATED_TIERS.has(cardTier)) ? 1 : 0;

      // Generate unique local card ID
      const { randomBytes } = await import("crypto");
      const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let localId = "C" + Date.now().toString(36).toUpperCase();
      for (let a = 0; a < 50; a++) {
        const bytes = randomBytes(8);
        const candidate = Array.from(bytes as Buffer).map((b: number) => idChars[b % idChars.length]).join("");
        if (!db.prepare("SELECT 1 FROM cards WHERE id = ?").get(candidate)) { localId = candidate; break; }
      }

      let imageData: Buffer | null = null;
      if (imageUrl) {
        try {
          const mediaRes = await fetch(imageUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)" },
            signal: AbortSignal.timeout(20000),
          });
          if (mediaRes.ok) {
            const buf = Buffer.from(await mediaRes.arrayBuffer());
            if (!isVideo && !isGif) {
              try {
                const sharp = (await import("sharp")).default;
                imageData = await sharp(buf)
                  .resize(800, 1100, { fit: "inside", withoutEnlargement: true })
                  .jpeg({ quality: 92 })
                  .toBuffer();
              } catch { imageData = buf; }
            } else {
              imageData = buf;
            }
          }
        } catch (e: any) {
          errors.push(`${cardName}: ${e?.message || "fetch failed"}`);
        }
      }

      db.prepare(
        "INSERT INTO cards (id, name, series, tier, image_data, is_animated, uploaded_by, source, shoob_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'shoob', ?)"
      ).run(localId, cardName, cardSeries, cardTier, imageData, cardIsAnimated, userId, shoobId || null);

      if (shoobId) {
        db.prepare(
          "INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?, ?)"
        ).run(shoobId, localId);
      }
      imported++;
    }

    res.json({
      success: true,
      message: `Import complete: ${imported} imported, ${skipped} skipped${errors.length ? ` (${errors.length} image errors)` : ""}.`,
      imported,
      skipped,
      total_available: collected.length,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    logger.error({ err }, "Card fetch error");
    res.status(500).json({ success: false, message: err?.message || "Fetch failed" });
  }
});

export { router as cardsRouter };


// ── Shoob Sync Log routes ────────────────────────────────────────────────────
// GET /api/v1/cards/scraper/status  — returns Shoob sync summary & DB counts
// GET /api/v1/cards/scraper/history — returns last 20 sync run records
// POST /api/v1/cards/scraper/run    — triggers an incremental Shoob sync

router.get("/scraper/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }
    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_PHONE"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) { res.status(403).json({ success: false, message: "Only staff can view sync status." }); return; }

    const db = getDb();
    const totalCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards").get() as any)?.cnt ?? 0;
    const shoobCards  = (db.prepare("SELECT COUNT(*) as cnt FROM cards WHERE source = 'shoob'").get() as any)?.cnt ?? 0;
    const trackedIds  = (db.prepare("SELECT COUNT(*) as cnt FROM shoob_imported_ids").get() as any)?.cnt ?? 0;
    const lastRun     = db.prepare("SELECT ran_at, run_type FROM shoob_sync_log ORDER BY ran_at DESC LIMIT 1").get() as any;

    res.json({
      source: "shoob.gg",
      status: "ready",
      total_cards: totalCards,
      shoob_cards: shoobCards,
      tracked_ids: trackedIds,
      last_run: lastRun ? new Date(lastRun.ran_at * 1000).toISOString() : null,
      last_run_type: lastRun?.run_type ?? null,
    });
  } catch (err: any) {
    logger.error({ err }, "Scraper status error");
    res.status(500).json({ success: false, message: err?.message || "Failed to fetch status" });
  }
});

router.get("/scraper/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }
    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_PHONE"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) { res.status(403).json({ success: false, message: "Only staff can view sync history." }); return; }

    const db = getDb();
    const logs = db.prepare("SELECT * FROM shoob_sync_log ORDER BY ran_at DESC LIMIT 20").all() as any[];
    const result = logs.map((r: any) => ({
      timestamp: new Date(r.ran_at * 1000).toISOString(),
      run_type: r.run_type,
      cards_added: r.imported,
      updated: r.updated,
      skipped: r.skipped,
      errors: r.errors,
      total_seen: r.total_seen,
      duration_ms: r.duration_ms,
      started_by: r.started_by,
      success: r.errors === 0,
    }));
    res.json(result);
  } catch (err: any) {
    logger.error({ err }, "Scraper history error");
    res.status(500).json({ success: false, message: err?.message || "Failed to fetch history" });
  }
});

router.post("/scraper/run", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ success: false, message: "Not authenticated" }); return; }
    const staffRow = getStaff(userId);
    const BOT_OWNER = (process.env["OWNER_NUMBERS"] || process.env["BOT_OWNER_PHONE"] || "2348144550593").split(",")[0].replace(/\D/g, "");
    const isStaff = !!staffRow || userId.replace(/\D/g, "") === BOT_OWNER;
    if (!isStaff) { res.status(403).json({ success: false, message: "Only staff can trigger sync." }); return; }

    const db = getDb();
    const runMode = (req.body?.mode === "full") ? "full" : "incremental";
    const runStart = Math.floor(Date.now() / 1000);
    const uploader = userId.replace(/\D/g, "");

    // Inline incremental import (mirrors shoob-sync.ts logic)
    let imported = 0, updated = 0, skipped = 0, errors = 0, totalSeen = 0;
    let page = 1;
    const idChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const normTier = (raw: any, fb = "T1"): string => {
      if (!raw) return fb;
      const s = String(raw).trim().toUpperCase();
      if (s.startsWith("T") && ["T1","T2","T3","T4","T5","T6","TS","TX","TZ"].includes(s)) return s;
      if (/^\d$/.test(s)) return `T${s}`;
      if (s === "S") return "TS";
      if (s === "X") return "TX";
      if (s === "Z") return "TZ";
      return fb;
    };

    const startMs = Date.now();
    try {
      while (true) {
        const url = `${SHOOB_API}/site/api/cards?page=${page}&limit=50`;
        const apiRes = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)" },
          signal: AbortSignal.timeout(20000),
        });
        if (!apiRes.ok) break;
        const apiData: any = await apiRes.json();
        const pageCards: any[] = Array.isArray(apiData) ? apiData : (apiData.cards || apiData.data || apiData.results || []);
        if (!pageCards.length) break;
        totalSeen += pageCards.length;

        for (const sc of pageCards) {
          const shoobId = String(sc._id || sc.id || "").trim();
          if (!shoobId) { skipped++; continue; }

          if (runMode === "incremental") {
            const already = db.prepare("SELECT local_card_id FROM shoob_imported_ids WHERE shoob_id = ?").get(shoobId);
            if (already) { skipped++; continue; }
          }

          const cardName = (sc.name || sc.slug || shoobId).trim().replace(/_/g, " ");
          const tier = normTier(sc.tier);
          const series = (Array.isArray(sc.category) && sc.category[0]) ? String(sc.category[0]).trim() : "Shoob";
          const animated = (["T6","TS","TX","TZ"].includes(tier) || /\.(gif|webm)$/i.test(String(sc.file||""))) ? 1 : 0;
          const imageUrl = `${SHOOB_API}/site/api/cardr/${shoobId}?size=400`;

          const existingByShoobId = db.prepare("SELECT id FROM cards WHERE shoob_id = ?").get(shoobId) as any;
          if (existingByShoobId) {
            db.prepare("UPDATE cards SET name=?,tier=?,series=?,is_animated=?,source='shoob' WHERE id=?")
              .run(cardName, tier, series, animated, existingByShoobId.id);
            db.prepare("INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?,?)")
              .run(shoobId, existingByShoobId.id);
            updated++;
            continue;
          }

          let imageData: Buffer | null = null;
          try {
            const mRes = await fetch(imageUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; RequiemOrderBot/1.0)" },
              signal: AbortSignal.timeout(20000),
            });
            if (mRes.ok) {
              const buf = Buffer.from(await mRes.arrayBuffer());
              if (!animated) {
                try {
                  const sharp = (await import("sharp")).default;
                  imageData = await sharp(buf).resize(800,1100,{fit:"inside",withoutEnlargement:true}).jpeg({quality:92}).toBuffer();
                } catch { imageData = buf; }
              } else { imageData = buf; }
            }
          } catch { errors++; }

          const { randomBytes } = await import("crypto");
          let localId = "C" + Date.now().toString(36).toUpperCase();
          for (let a = 0; a < 50; a++) {
            const bytes = randomBytes(8);
            const cand = Array.from(bytes as Buffer).map((b: number) => idChars[b % idChars.length]).join("");
            if (!db.prepare("SELECT 1 FROM cards WHERE id = ?").get(cand)) { localId = cand; break; }
          }

          try {
            db.prepare("INSERT INTO cards (id,name,series,tier,image_data,is_animated,uploaded_by,source,shoob_id) VALUES (?,?,?,?,?,?,?,'shoob',?)")
              .run(localId, cardName, series, tier, imageData, animated, uploader, shoobId);
            db.prepare("INSERT OR IGNORE INTO shoob_imported_ids (shoob_id, local_card_id) VALUES (?,?)").run(shoobId, localId);
            imported++;
          } catch { errors++; }

          await new Promise(r => setTimeout(r, 100));
        }
        if (pageCards.length < 50) break;
        page++;
        if (runMode === "incremental" && imported + updated >= 200) break; // cap web-triggered runs
      }
    } catch (loopErr: any) {
      logger.warn({ loopErr }, "Shoob sync loop error");
    }

    const durationMs = Date.now() - startMs;
    db.prepare(
      "INSERT INTO shoob_sync_log (run_type, started_by, imported, updated, skipped, errors, total_seen, duration_ms, ran_at) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(runMode, uploader, imported, updated, skipped, errors, totalSeen, durationMs, runStart);

    res.json({
      success: true,
      message: `Shoob ${runMode} sync complete: ${imported} imported, ${updated} updated, ${skipped} skipped.`,
      imported, updated, skipped, errors, total_seen: totalSeen,
      duration_ms: durationMs,
    });
  } catch (err: any) {
    logger.error({ err }, "Scraper run error");
    res.status(500).json({ success: false, message: err?.message || "Sync failed" });
  }
});
