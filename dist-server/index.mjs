// src/server/index.ts
import "dotenv/config";
import express from "express";
import fs2 from "fs";
import path2 from "path";
import { z } from "zod";

// src/server/db.ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
function resolveProjectRoot() {
  return process.cwd();
}
function getDbPath() {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(resolveProjectRoot(), "data");
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "brainprint.db");
}
function openDatabase(customPath) {
  const dbPath = customPath ?? getDbPath();
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  applyMigrations(db);
  return db;
}
function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _bp_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const migrationsDir = path.resolve(resolveProjectRoot(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    return;
  }
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const isApplied = db.prepare("SELECT 1 FROM _bp_migrations WHERE filename = ?");
  const markApplied = db.prepare("INSERT OR IGNORE INTO _bp_migrations (filename, applied_at) VALUES (?, ?)");
  for (const file of files) {
    const existing = isApplied.get(file);
    if (existing) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      markApplied.run(file, (/* @__PURE__ */ new Date()).toISOString());
    });
    tx();
  }
}
function loadPackFiles() {
  const packsDir = path.resolve(resolveProjectRoot(), "data", "packs");
  if (!fs.existsSync(packsDir)) return [];
  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json")).sort();
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(packsDir, file), "utf8");
    return JSON.parse(raw);
  });
}
var cachedVerdicts = null;
function loadVerdicts() {
  if (cachedVerdicts) return cachedVerdicts;
  const verdictsPath = path.resolve(resolveProjectRoot(), "data", "verdicts.json");
  const raw = fs.readFileSync(verdictsPath, "utf8");
  cachedVerdicts = JSON.parse(raw);
  return cachedVerdicts;
}
function seedPacksAndQuestions(db) {
  const packFiles = loadPackFiles();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const upsertPack = db.prepare(`
    INSERT INTO packs (id, slug, name, description, visual_theme, status, sort_order, created_at)
    VALUES (@id, @slug, @name, @description, @visual_theme, @status, @sort_order, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      description = excluded.description,
      visual_theme = excluded.visual_theme,
      status = excluded.status,
      sort_order = excluded.sort_order
  `);
  const upsertQuestion = db.prepare(`
    INSERT INTO questions (id, pack_id, prompt, options, tags, difficulty, status, version, sort_order, created_at)
    VALUES (@id, @pack_id, @prompt, @options, @tags, @difficulty, @status, @version, @sort_order, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      pack_id = excluded.pack_id,
      prompt = excluded.prompt,
      options = excluded.options,
      tags = excluded.tags,
      difficulty = excluded.difficulty,
      status = excluded.status,
      version = excluded.version,
      sort_order = excluded.sort_order
  `);
  let packCount = 0;
  let questionCount = 0;
  const tx = db.transaction(() => {
    upsertPack.run({
      id: "the_mix",
      slug: "the-mix",
      name: "THE MIX",
      description: "Everyday dilemmas and instincts across all packs",
      visual_theme: "the_mix",
      status: "published",
      sort_order: 0,
      created_at: now
    });
    packCount += 1;
    for (const pf of packFiles) {
      upsertPack.run({
        ...pf.pack,
        created_at: now
      });
      packCount += 1;
      pf.questions.forEach((q, idx) => {
        upsertQuestion.run({
          id: q.id,
          pack_id: q.pack_id,
          prompt: q.prompt,
          options: JSON.stringify(q.options),
          tags: JSON.stringify(q.tags ?? []),
          difficulty: q.difficulty ?? "medium",
          status: q.status ?? "published",
          version: q.version ?? 1,
          sort_order: idx + 1,
          created_at: now
        });
        questionCount += 1;
      });
    }
  });
  tx();
  return { packs: packCount, questions: questionCount };
}

// src/server/crew.ts
import crypto3 from "crypto";

// src/shared/scoring.ts
var SCORING_VERSION = 1;
var TIER_META = {
  PROVISIONAL: { color: "#94A3B8", points: 20, label: "PROVISIONAL" },
  FAMILIAR: { color: "#38BDF8", points: 5, label: "FAMILIAR" },
  UNUSUAL: { color: "#34D399", points: 20, label: "UNUSUAL" },
  OUTLIER: { color: "#FBBF24", points: 45, label: "OUTLIER" },
  WILDCARD: { color: "#F43F5E", points: 80, label: "WILDCARD" }
};
var TIER_ONE_LINERS = {
  PROVISIONAL: [
    "Early beacon locked. You are calibrating this signal for the next wave.",
    "Fresh frequency logged. The crowd map is still forming around you.",
    "First-wave transmission recorded. Pure signal, zero herd noise."
  ],
  FAMILIAR: [
    "Right on the main frequency. Plenty of minds took this exact turn.",
    "Classic instinct. You and the crowd share a well-paved shortcut.",
    "High-traffic choice. Reliable signal with zero friction."
  ],
  UNUSUAL: [
    "Nice detour. You stepped off the default path without going off-grid.",
    "Distinctive call. Most players walked right past that door.",
    "Sharp side-channel pick. Definitely not the autopilot answer."
  ],
  OUTLIER: [
    "Rare frequency detected. Only a sliver of minds went this route.",
    "Bold zig while the lobby zagged. Certified contrarian radar.",
    "Deep-cut decision. Almost nobody saw that line coming."
  ],
  WILDCARD: [
    "Total anomaly! Barely anyone on Earth pressed that button.",
    "Off-the-charts signal. You practically own this wavelength solo.",
    "Pure wildcard energy. You broke away from the entire crowd."
  ]
};
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function fisherYatesShuffle(items, rng) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function getDailyExclusionWindow(poolSize) {
  return Math.max(0, Math.min(3, Math.floor(poolSize / 7) - 1));
}
function selectDailyQuestionIds(params) {
  const {
    publishedIdsSortedAsc,
    publishedIdsBySortOrder,
    seedUint32,
    excludedIds,
    launchSetMode
  } = params;
  if (launchSetMode) {
    return publishedIdsBySortOrder.slice(0, 7);
  }
  const rng = mulberry32(seedUint32);
  const shuffledAll = fisherYatesShuffle(publishedIdsSortedAsc, rng);
  const eligible = shuffledAll.filter((id) => !excludedIds.has(id));
  if (eligible.length >= 7) {
    return eligible.slice(0, 7);
  }
  const fallback = shuffledAll.filter((id) => excludedIds.has(id));
  return [...eligible, ...fallback].slice(0, 7);
}
function selectTheMixQuestionIds(params) {
  const { publishedQuestions, seedUint32, excludedIds, launchSetMode } = params;
  if (launchSetMode) {
    const packs = [...new Set(publishedQuestions.map((q) => q.pack_id))].sort();
    const byPack2 = /* @__PURE__ */ new Map();
    for (const p of packs) {
      byPack2.set(
        p,
        publishedQuestions.filter((q) => q.pack_id === p).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      );
    }
    const picked2 = [];
    let round = 0;
    while (picked2.length < 7) {
      let addedInRound = 0;
      for (const p of packs) {
        if (picked2.length >= 7) break;
        const list = byPack2.get(p) ?? [];
        if (round < list.length) {
          picked2.push(list[round].id);
          addedInRound++;
        }
      }
      if (addedInRound === 0) break;
      round++;
    }
    return picked2.slice(0, 7);
  }
  const rng = mulberry32(seedUint32);
  const byPack = /* @__PURE__ */ new Map();
  for (const q of publishedQuestions) {
    if (!byPack.has(q.pack_id)) byPack.set(q.pack_id, []);
    byPack.get(q.pack_id).push(q);
  }
  const packIds = [...byPack.keys()].sort();
  if (packIds.length === 0) return [];
  const shuffledByPack = /* @__PURE__ */ new Map();
  for (const [p, list] of byPack.entries()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    shuffledByPack.set(p, fisherYatesShuffle(sorted, rng));
  }
  const maxPerPack = Math.max(2, Math.ceil(7 / packIds.length));
  const picked = [];
  const pickedSet = /* @__PURE__ */ new Set();
  const packCounts = {};
  for (const p of packIds) packCounts[p] = 0;
  const packOrder = fisherYatesShuffle(packIds, rng);
  let changed = true;
  while (picked.length < 7 && changed) {
    changed = false;
    for (const p of packOrder) {
      if (picked.length >= 7) break;
      if (packCounts[p] >= maxPerPack) continue;
      const list = shuffledByPack.get(p) ?? [];
      const nextFresh = list.find((q) => !pickedSet.has(q.id) && !excludedIds.has(q.id));
      if (nextFresh) {
        picked.push(nextFresh.id);
        pickedSet.add(nextFresh.id);
        packCounts[p]++;
        changed = true;
      }
    }
  }
  if (picked.length < 7) {
    changed = true;
    while (picked.length < 7 && changed) {
      changed = false;
      for (const p of packOrder) {
        if (picked.length >= 7) break;
        if (packCounts[p] >= maxPerPack) continue;
        const list = shuffledByPack.get(p) ?? [];
        const nextQ = list.find((q) => !pickedSet.has(q.id));
        if (nextQ) {
          picked.push(nextQ.id);
          pickedSet.add(nextQ.id);
          packCounts[p]++;
          changed = true;
        }
      }
    }
  }
  if (picked.length < 7) {
    for (const q of publishedQuestions) {
      if (picked.length >= 7) break;
      if (!pickedSet.has(q.id)) {
        picked.push(q.id);
        pickedSet.add(q.id);
      }
    }
  }
  return fisherYatesShuffle(picked, rng);
}
function computeSmoothedShare(chosenVotes, totalVotes) {
  return (chosenVotes + 1) / (totalVotes + 4);
}
function evaluateSoloAnswer(params) {
  const { questionId, optionTexts, chosenIndex, voteCounts } = params;
  const totalVotes = voteCounts[0] + voteCounts[1] + voteCounts[2] + voteCounts[3];
  const chosenVotes = voteCounts[chosenIndex] ?? 0;
  const smoothedP = computeSmoothedShare(chosenVotes, totalVotes);
  let gate;
  let tier;
  let statusLine;
  let showPercentages;
  if (totalVotes < 5) {
    gate = "FIRST_WAVE";
    tier = "PROVISIONAL";
    statusLine = `FIRST WAVE SIGNAL \u2014 Building the crowd picture (${totalVotes} of 5 needed)`;
    showPercentages = false;
  } else if (totalVotes < 15) {
    gate = "EARLY_SIGNAL";
    if (smoothedP >= 0.35) tier = "FAMILIAR";
    else if (smoothedP >= 0.22) tier = "UNUSUAL";
    else tier = "OUTLIER";
    statusLine = `EARLY SIGNAL \u2014 Based on ${totalVotes} players`;
    showPercentages = false;
  } else {
    gate = "FULL";
    if (smoothedP >= 0.35) tier = "FAMILIAR";
    else if (smoothedP >= 0.22) tier = "UNUSUAL";
    else if (smoothedP >= 0.12) tier = "OUTLIER";
    else tier = "WILDCARD";
    statusLine = `Based on ${totalVotes} players`;
    showPercentages = true;
  }
  const meta = TIER_META[tier];
  const lines = TIER_ONE_LINERS[tier];
  let hash = chosenIndex;
  for (let i = 0; i < questionId.length; i++) {
    hash = hash * 31 + questionId.charCodeAt(i) >>> 0;
  }
  const oneLiner = lines[hash % lines.length];
  const bars = [0, 1, 2, 3].map((idx) => {
    const votes = voteCounts[idx] ?? 0;
    const pct = showPercentages && totalVotes > 0 ? Math.round(votes / totalVotes * 100) : null;
    const approxRatio = totalVotes > 0 ? computeSmoothedShare(votes, totalVotes) : 0.25;
    return {
      optionIndex: idx,
      text: optionTexts[idx] ?? `Option ${idx + 1}`,
      votes,
      percentage: pct,
      approxRatio,
      isChosen: idx === chosenIndex
    };
  });
  return {
    questionId,
    optionIndex: chosenIndex,
    tier,
    tierColor: meta.color,
    points: meta.points,
    gate,
    sampleSize: totalVotes,
    statusLine,
    oneLiner,
    showPercentages,
    bars
  };
}
function getScoreTitle(totalPoints) {
  if (totalPoints <= 95) return "The Familiar Mind";
  if (totalPoints <= 165) return "The Steady Signal";
  if (totalPoints <= 245) return "The Unconventional";
  if (totalPoints <= 335) return "The Maverick";
  return "The Wildcard Mind";
}
function getRarityBand(totalPoints) {
  if (totalPoints <= 165) return "low";
  if (totalPoints <= 245) return "mid";
  return "high";
}
function computeCrewBoard(params) {
  const { questions, completedMembers, squadRoasts } = params;
  const k = completedMembers.length;
  if (k < 2) {
    throw new Error("Crew scoring requires at least 2 completed members");
  }
  const totalPairs = k * (k - 1) / 2;
  const perQuestionScoresByMember = {};
  const loneCountByMember = {};
  for (const m of completedMembers) {
    perQuestionScoresByMember[m.memberId] = [];
    loneCountByMember[m.memberId] = 0;
  }
  const questionBreakdowns = [];
  const questionAgreements = [];
  for (const q of questions) {
    const buckets = [[], [], [], []];
    for (const m of completedMembers) {
      const opt = m.answers[q.id];
      if (opt !== void 0 && opt >= 0 && opt <= 3) {
        buckets[opt].push(m);
      }
    }
    let matchingPairs = 0;
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const n = buckets[optIdx].length;
      matchingPairs += n * (n - 1) / 2;
    }
    const agreement = totalPairs > 0 ? matchingPairs / totalPairs * 100 : 0;
    questionAgreements.push(agreement);
    for (const m of completedMembers) {
      const opt = m.answers[q.id];
      if (opt === void 0 || opt < 0 || opt > 3) {
        perQuestionScoresByMember[m.memberId].push(0);
        continue;
      }
      const groupSize = buckets[opt].length;
      const othersSame = groupSize - 1;
      const qScore = Math.round(100 * othersSame / (k - 1));
      perQuestionScoresByMember[m.memberId].push(qScore);
      if (groupSize === 1) {
        loneCountByMember[m.memberId] += 1;
      }
    }
    questionBreakdowns.push({
      questionId: q.id,
      prompt: q.prompt,
      agreementPercent: Math.round(agreement),
      isPerfectSync: matchingPairs === totalPairs && totalPairs > 0,
      options: q.options.map((opt, idx) => ({
        optionIndex: idx,
        text: opt.text,
        count: buckets[idx].length,
        voters: buckets[idx].map((m) => ({
          memberId: m.memberId,
          nickname: m.nickname,
          isMe: m.isMe
        }))
      }))
    });
  }
  const meanAgreement = questionAgreements.length > 0 ? questionAgreements.reduce((s, v) => s + v, 0) / questionAgreements.length : 0;
  const crewSyncPercent = Math.round(meanAgreement);
  const roast = crewSyncPercent >= 70 ? squadRoasts.high : crewSyncPercent >= 40 ? squadRoasts.mid : squadRoasts.low;
  const members = completedMembers.map((m) => {
    const scores = perQuestionScoresByMember[m.memberId];
    const totalScore = scores.reduce((a, b) => a + b, 0);
    return {
      memberId: m.memberId,
      nickname: m.nickname,
      isMe: m.isMe,
      totalScore,
      maxScore: questions.length * 100,
      perQuestionScores: scores,
      loneCount: loneCountByMember[m.memberId]
    };
  }).sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname));
  const pairwise = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = completedMembers[i];
      const b = completedMembers[j];
      let matches = 0;
      for (const q of questions) {
        if (a.answers[q.id] !== void 0 && a.answers[q.id] === b.answers[q.id]) {
          matches += 1;
        }
      }
      pairwise.push({
        memberAId: a.memberId,
        memberAName: a.nickname,
        memberBId: b.memberId,
        memberBName: b.nickname,
        matches,
        total: questions.length,
        percentage: questions.length > 0 ? Math.round(matches / questions.length * 100) : 0
      });
    }
  }
  pairwise.sort((a, b) => b.matches - a.matches);
  let twoPlayerSummary = null;
  let awards = null;
  if (k === 2) {
    const perfectSyncQuestions = [];
    const splitDecisionQuestions = [];
    questions.forEach((q, idx) => {
      const m0 = completedMembers[0];
      const m1 = completedMembers[1];
      const a0 = m0.answers[q.id];
      const a1 = m1.answers[q.id];
      if (a0 !== void 0 && a0 === a1) {
        perfectSyncQuestions.push({
          index: idx + 1,
          prompt: q.prompt,
          chosenText: q.options[a0]?.text ?? ""
        });
      } else {
        splitDecisionQuestions.push({
          index: idx + 1,
          prompt: q.prompt,
          choices: [
            { nickname: m0.nickname, text: q.options[a0]?.text ?? "\u2014" },
            { nickname: m1.nickname, text: q.options[a1]?.text ?? "\u2014" }
          ]
        });
      }
    });
    twoPlayerSummary = {
      perfectSyncQuestions,
      splitDecisionQuestions
    };
  } else {
    const maxMatches = Math.max(...pairwise.map((p) => p.matches));
    const topPairs = pairwise.filter((p) => p.matches === maxMatches);
    const mindTwins = {
      matches: maxMatches,
      percentage: questions.length > 0 ? Math.round(maxMatches / questions.length * 100) : 0,
      pairs: topPairs.map((p) => ({
        memberAName: p.memberAName,
        memberBName: p.memberBName
      }))
    };
    let bestIdx = 0;
    for (let i = 1; i < questionAgreements.length; i++) {
      if (questionAgreements[i] > questionAgreements[bestIdx]) {
        bestIdx = i;
      }
    }
    const bestA = questionAgreements[bestIdx];
    const commonGround = {
      questionIndex: bestIdx + 1,
      prompt: questions[bestIdx].prompt,
      agreementPercent: Math.round(bestA),
      isPerfectSync: Math.abs(bestA - 100) < 1e-9
    };
    let worstIdx = 0;
    for (let i = 1; i < questionAgreements.length; i++) {
      if (questionAgreements[i] < questionAgreements[worstIdx]) {
        worstIdx = i;
      }
    }
    const worstA = questionAgreements[worstIdx];
    const civilWar = worstA < 100 - 1e-9 ? {
      questionIndex: worstIdx + 1,
      prompt: questions[worstIdx].prompt,
      agreementPercent: Math.round(worstA)
    } : null;
    const sortedLone = [...completedMembers].map((m) => ({ nickname: m.nickname, loneCount: loneCountByMember[m.memberId] })).sort((a, b) => b.loneCount - a.loneCount);
    const loneSignal = sortedLone.length >= 2 && sortedLone[0].loneCount > 0 && sortedLone[0].loneCount > sortedLone[1].loneCount ? sortedLone[0] : null;
    awards = {
      mindTwins,
      commonGround,
      civilWar,
      loneSignal
    };
  }
  return {
    completedCount: k,
    crewSyncPercent,
    roast,
    members,
    pairwise,
    questionBreakdowns,
    twoPlayerSummary,
    awards
  };
}

// src/server/security.ts
import crypto from "crypto";
var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var DEVICE_COOKIE_NAME = "bp_device_id";
function escapeHtml(input) {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function sanitizeUserText(raw, maxLen) {
  if (!raw) return "";
  const cleaned = raw.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, maxLen);
}
function isValidUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}
function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}
function resolveDeviceId(req, res, explicitDeviceId) {
  const headerId = typeof req.headers["x-device-id"] === "string" ? req.headers["x-device-id"] : void 0;
  const cookies = parseCookies(req.headers.cookie);
  const cookieId = cookies[DEVICE_COOKIE_NAME];
  const candidate = [explicitDeviceId, headerId, cookieId].find((id) => isValidUuid(id));
  const deviceId = candidate ?? crypto.randomUUID();
  if (cookieId !== deviceId) {
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
    res.cookie(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: false,
      sameSite: "lax",
      secure: isHttps,
      maxAge: 365 * 24 * 60 * 60 * 1e3,
      path: "/"
    });
  }
  return deviceId;
}
function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}
var AnswerRateLimiter = class {
  constructor(limit = 60, windowMs = 6e4) {
    this.buckets = /* @__PURE__ */ new Map();
    this.limit = limit;
    this.windowMs = windowMs;
  }
  check(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }
    while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
      bucket.timestamps.shift();
    }
    if (bucket.timestamps.length >= this.limit) {
      const oldest = bucket.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1e3));
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    bucket.timestamps.push(now);
    if (this.buckets.size > 5e3) {
      for (const [k, b] of this.buckets.entries()) {
        if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] <= cutoff) {
          this.buckets.delete(k);
        }
      }
    }
    return { allowed: true, remaining: this.limit - bucket.timestamps.length, retryAfterSec: 0 };
  }
  checkPair(ip, deviceId, now = Date.now()) {
    const ipRes = this.check(`ip:${ip}`, now);
    if (!ipRes.allowed) return { allowed: false, retryAfterSec: ipRes.retryAfterSec };
    const devRes = this.check(`dev:${deviceId}`, now);
    if (!devRes.allowed) return { allowed: false, retryAfterSec: devRes.retryAfterSec };
    return { allowed: true, retryAfterSec: 0 };
  }
};

// src/server/solo.ts
import crypto2 from "crypto";

// src/shared/archetypes.ts
var ARCHETYPES = {
  the_architect: {
    id: "the_architect",
    name: "THE ARCHITECT",
    oneLineTrait: "Blueprints every exit before entering the room",
    poles: ["PLAN", "SOLO", "LOGIC"],
    accentColor: "#38BDF8",
    palette: {
      a: "#0F172A",
      // dark outline
      b: "#38BDF8",
      // blueprint cyan
      c: "#E0F2FE",
      // bright highlight
      d: "#1E3A8A",
      // navy visor
      e: "#F8FAFC",
      // chalk white
      f: "#FBBF24"
      // compass gold
    },
    grid: [
      "....aaaaaaaa....",
      "...abbbbbbbba...",
      "..abccccccccba..",
      "..abbbbbbbbbba..",
      "..abddddddddba..",
      "..abdeeddeedba..",
      "..abddddddddba..",
      "...abbbbbbbba...",
      "....aaffffaa....",
      "..aabbbbbbbbaa..",
      ".abbccbbbbccbba.",
      ".abbbbbffbbbbba.",
      ".abbbbfccfbBBba.".toLowerCase(),
      "..aabbbffbbbaa..",
      "...aaabbbbaaa...",
      "...aaa....aaa..."
    ]
  },
  the_lone_oracle: {
    id: "the_lone_oracle",
    name: "THE LONE ORACLE",
    oneLineTrait: "Quietly predicts the plot twist three scenes early",
    poles: ["PLAN", "SOLO", "INSTINCT"],
    accentColor: "#C084FC",
    palette: {
      a: "#120824",
      // dark outline
      b: "#6D28D9",
      // deep cloak
      c: "#C084FC",
      // mystic violet
      d: "#FDE047",
      // third-eye gold
      e: "#F8FAFC",
      // starlight
      f: "#312E81"
      // shadow hood
    },
    grid: [
      ".....aaaaaa.....",
      "...aabbbbbbaa...",
      "..abbccccccbba..",
      ".abbcffffffcbba.",
      ".abbfeeeeeeffba.",
      ".abbffddddffbba.",
      ".abbfefddfefbba.",
      ".abbffffffffbba.",
      "..abbcbbbbcbba..",
      "..aabbbbbbbbaa..",
      ".abbbccddccbbba.",
      ".abbccbbbbccbba.",
      ".abbbccccccbbba.",
      "..aabbbbbbbbaa..",
      "...aabbbbbbba...",
      "....aaa..aaa...."
    ]
  },
  the_dispatcher: {
    id: "the_dispatcher",
    name: "THE DISPATCHER",
    oneLineTrait: "Turns group chaos into an actual itinerary",
    poles: ["PLAN", "CREW", "LOGIC"],
    accentColor: "#34D399",
    palette: {
      a: "#062019",
      // dark outline
      b: "#10B981",
      // signal green
      c: "#6EE7B7",
      // mint highlight
      d: "#F8FAFC",
      // headset white
      e: "#FBBF24",
      // radio amber
      f: "#1E293B"
      // slate visor
    },
    grid: [
      "....aaaaaaaa....",
      "...adddddddda...",
      "..adbbbbbbbbda..",
      ".aedbffffffbdea.",
      ".aedbfceecfbdea.",
      ".aedbffffffbdea.",
      ".ae.abbbbbba.ea.",
      "....aaabbbba....",
      "..aabbbbbbbbaa..",
      ".abbccccccccbba.",
      ".abbeebbbbeebba.",
      ".abbbbbddbbbbba.",
      ".abbbddddddbbba.",
      "..aabbbbbbbbaa..",
      "...aaabbbbaaa...",
      "...aaa....aaa..."
    ]
  },
  the_anchor: {
    id: "the_anchor",
    name: "THE ANCHOR",
    oneLineTrait: "Reads the room and keeps the squad intact",
    poles: ["PLAN", "CREW", "INSTINCT"],
    accentColor: "#60A5FA",
    palette: {
      a: "#0C192C",
      // dark outline
      b: "#2563EB",
      // cobalt shield
      c: "#93C5FD",
      // soft sky
      d: "#F8FAFC",
      // warm pearl
      e: "#FBBF24",
      // beacon gold
      f: "#1E3A8A"
      // deep sea
    },
    grid: [
      ".....aaaaaa.....",
      "....aeeeeeeaa...",
      "...aeeeddeeea...",
      "...aeeeeeeeea...",
      "....aaaffaaa....",
      "..aabbbbbbbbaa..",
      ".abbccccccccbba.",
      ".abbbddddddbbba.",
      ".abbbddeeddbbba.",
      ".abbbddddddbbba.",
      ".abbccbbbbccbba.",
      "..abbbbbbbbbba..",
      "...abbbffbbba...",
      "...aabbbbbbaa...",
      "....aaabbaaa....",
      ".....aaaaaa....."
    ]
  },
  the_rogue_tactician: {
    id: "the_rogue_tactician",
    name: "THE ROGUE TACTICIAN",
    oneLineTrait: "Improvises absurd plans that somehow work",
    poles: ["CHAOS", "SOLO", "LOGIC"],
    accentColor: "#FBBF24",
    palette: {
      a: "#1C1305",
      // dark outline
      b: "#D97706",
      // tactical amber
      c: "#FDE047",
      // flash gold
      d: "#0F172A",
      // stealth mask
      e: "#F43F5E",
      // laser eye
      f: "#F8FAFC"
      // gleam
    },
    grid: [
      "...aa......aa...",
      "..abba....abba..",
      "..abcaaaaaacba..",
      "..abbbbbbbbbba..",
      ".abddddddddddba.",
      ".abddfeddefddba.",
      ".abddddddddddba.",
      "..abccccccccba..",
      "...aabbbbbbaa...",
      ".aaabbbbbbbbaaa.",
      "abbccbbbbbbccbba",
      "abbbbbccccbbbbba",
      ".aabbbccccbbbaa.",
      "..aabbbbbbbbaa..",
      "...aaa....aaa...",
      "..aaaa....aaaa.."
    ]
  },
  the_free_agent: {
    id: "the_free_agent",
    name: "THE FREE AGENT",
    oneLineTrait: "Follows pure curiosity off the map",
    poles: ["CHAOS", "SOLO", "INSTINCT"],
    accentColor: "#2DD4BF",
    palette: {
      a: "#071D1E",
      // dark outline
      b: "#14B8A6",
      // nomad teal
      c: "#99F6E4",
      // wind highlight
      d: "#FB7185",
      // scarf coral
      e: "#F8FAFC",
      // goggles white
      f: "#FBBF24"
      // compass sun
    },
    grid: [
      "....aaaaaaaa....",
      "...abccccccba...",
      "..abbffffffbba..",
      "..abbeebbeebba..",
      "..abbeebbeebba..",
      "..abbbbbbbbbba..",
      "...aaddddddaa...",
      "..adddddddddaa..",
      ".adddccccccbbba.",
      ".addabbbbbbbbba.",
      "..aaabbbffbbbba.",
      "...abbbffffbbba.",
      "...abbbbbbbbbba.",
      "...aaabbbbaaa...",
      "...aaa....aaa...",
      "..aaa......aaa.."
    ]
  },
  the_plot_twister: {
    id: "the_plot_twister",
    name: "THE PLOT TWISTER",
    oneLineTrait: "Engineers unforgettable group detours on purpose",
    poles: ["CHAOS", "CREW", "LOGIC"],
    accentColor: "#E879F9",
    palette: {
      a: "#1B0726",
      // dark outline
      b: "#C026D3",
      // neon magenta
      c: "#F5D0FE",
      // lilac highlight
      d: "#38BDF8",
      // electric cyan
      e: "#FDE047",
      // trickster grin
      f: "#1E1B4B"
      // dark mask
    },
    grid: [
      "..aa........aa..",
      ".adda......adda.",
      ".addaaaaaaaaada.",
      "..abccccccccba..",
      "..abffffffffba..",
      "..abfdffffdfba..",
      "..abffeffeffba..",
      "..abffeeeefbba..",
      "...abbbbbbbba...",
      "..aabddbbddbaa..",
      ".abbddddddddbba.",
      ".abbbbccccbbbba.",
      ".abbccbbbbccbba.",
      "..aabbbbbbbbaa..",
      "...aaa....aaa...",
      "..aaaa....aaaa.."
    ]
  },
  the_spark: {
    id: "the_spark",
    name: "THE SPARK",
    oneLineTrait: 'First to say "trust me" before an iconic bad decision',
    poles: ["CHAOS", "CREW", "INSTINCT"],
    accentColor: "#F43F5E",
    palette: {
      a: "#260611",
      // dark outline
      b: "#F43F5E",
      // blaze rose
      c: "#FB923C",
      // orange flare
      d: "#FDE047",
      // core bolt
      e: "#FFFBEB",
      // white hot
      f: "#1E1B4B"
      // shades
    },
    grid: [
      ".......aa.......",
      "......adda......",
      "....aaddddaa....",
      "...abccddccba...",
      "..abbbddddbbba..",
      ".abbffffffffbba.",
      ".abbfeeffeeffba.",
      ".abbffffffffbba.",
      "..abbbccccbbba..",
      "...aabddddbaa...",
      "..abbbdeedbbba..",
      ".abbccdeedccbba.",
      ".abbbbddddbbbba.",
      "..aabbbbbbbbaa..",
      "...aaa....aaa...",
      "...aa......aa..."
    ]
  }
};
var ARCHETYPE_LIST = Object.values(ARCHETYPES);
function resolveArchetypeId(pPole, sPole, lPole) {
  if (pPole === "PLAN" && sPole === "SOLO" && lPole === "LOGIC") return "the_architect";
  if (pPole === "PLAN" && sPole === "SOLO" && lPole === "INSTINCT") return "the_lone_oracle";
  if (pPole === "PLAN" && sPole === "CREW" && lPole === "LOGIC") return "the_dispatcher";
  if (pPole === "PLAN" && sPole === "CREW" && lPole === "INSTINCT") return "the_anchor";
  if (pPole === "CHAOS" && sPole === "SOLO" && lPole === "LOGIC") return "the_rogue_tactician";
  if (pPole === "CHAOS" && sPole === "SOLO" && lPole === "INSTINCT") return "the_free_agent";
  if (pPole === "CHAOS" && sPole === "CREW" && lPole === "LOGIC") return "the_plot_twister";
  return "the_spark";
}
function computePersonality(chosenAxes) {
  let r0 = 0;
  let r1 = 0;
  let r2 = 0;
  for (const [a0, a1, a2] of chosenAxes) {
    r0 += a0;
    r1 += a1;
    r2 += a2;
  }
  const q7 = chosenAxes[chosenAxes.length - 1] ?? [0, 0, 0];
  const pickPole = (raw, q7Val, left, right) => {
    if (raw < 0) return left;
    if (raw > 0) return right;
    if (q7Val < 0) return left;
    return right;
  };
  const pPole = pickPole(r0, q7[0], "PLAN", "CHAOS");
  const sPole = pickPole(r1, q7[1], "SOLO", "CREW");
  const lPole = pickPole(r2, q7[2], "LOGIC", "INSTINCT");
  const toSlider = (raw) => Math.max(0, Math.min(100, Math.round((raw + 14) / 28 * 100)));
  return {
    raw: [r0, r1, r2],
    sliders: [toSlider(r0), toSlider(r1), toSlider(r2)],
    poles: [pPole, sPole, lPole],
    archetypeId: resolveArchetypeId(pPole, sPole, lPole)
  };
}

// src/server/solo.ts
function getUtcDateString(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().slice(0, 10);
}
function getNextUtcResetIso(date = /* @__PURE__ */ new Date()) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}
function isLaunchSetMode() {
  return process.env.LAUNCH_SET_MODE === "true";
}
function computeDailySeedUint32(packId, challengeDate) {
  const hash = crypto2.createHash("sha256").update(`${packId}:${challengeDate}`).digest();
  return hash.readUInt32BE(0);
}
function getPreviousUtcDates(dateStr, count) {
  const out = [];
  const base = /* @__PURE__ */ new Date(`${dateStr}T00:00:00.000Z`);
  for (let i = 1; i <= count; i++) {
    const d = new Date(base.getTime() - i * 864e5);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
function getOrCreateDailySet(db, packId, challengeDate, launchSetMode = isLaunchSetMode()) {
  if (packId === "the_mix") {
    const existing2 = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
    if (existing2) {
      return JSON.parse(existing2.question_ids);
    }
    const allPublished = db.prepare(
      `SELECT q.id, q.pack_id, q.sort_order
         FROM questions q
         JOIN packs p ON p.id = q.pack_id
         WHERE q.status = 'published' AND p.status = 'published' AND p.id != 'the_mix'
         ORDER BY q.id ASC`
    ).all();
    if (launchSetMode) {
      const selectedIds3 = selectTheMixQuestionIds({
        publishedQuestions: allPublished,
        seedUint32: computeDailySeedUint32(packId, challengeDate),
        excludedIds: /* @__PURE__ */ new Set(),
        launchSetMode: true
      });
      db.prepare(
        `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(crypto2.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds3), (/* @__PURE__ */ new Date()).toISOString());
      const authoritative3 = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
      return JSON.parse(authoritative3.question_ids);
    }
    const exclusionWindow2 = getDailyExclusionWindow(allPublished.length);
    const excludedIds2 = /* @__PURE__ */ new Set();
    if (exclusionWindow2 > 0) {
      const prevDates = getPreviousUtcDates(challengeDate, exclusionWindow2);
      const placeholders = prevDates.map(() => "?").join(",");
      const prevSets = db.prepare(
        `SELECT question_ids FROM daily_sets
           WHERE pack_id = ? AND challenge_date IN (${placeholders})`
      ).all(packId, ...prevDates);
      for (const row of prevSets) {
        const ids = JSON.parse(row.question_ids);
        ids.forEach((id) => excludedIds2.add(id));
      }
    }
    const seedUint322 = computeDailySeedUint32(packId, challengeDate);
    const selectedIds2 = selectTheMixQuestionIds({
      publishedQuestions: allPublished,
      seedUint32: seedUint322,
      excludedIds: excludedIds2,
      launchSetMode: false
    });
    db.prepare(
      `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto2.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds2), (/* @__PURE__ */ new Date()).toISOString());
    const authoritative2 = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
    return JSON.parse(authoritative2.question_ids);
  }
  if (launchSetMode) {
    const existing2 = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
    if (existing2) {
      return JSON.parse(existing2.question_ids);
    }
    const rows = db.prepare(
      `SELECT id FROM questions
         WHERE pack_id = ? AND status = 'published'
         ORDER BY sort_order ASC, id ASC
         LIMIT 7`
    ).all(packId);
    const selectedIds2 = rows.map((r) => r.id);
    db.prepare(
      `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto2.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds2), (/* @__PURE__ */ new Date()).toISOString());
    const authoritative2 = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
    return JSON.parse(authoritative2.question_ids);
  }
  const existing = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
  if (existing) {
    return JSON.parse(existing.question_ids);
  }
  const publishedRows = db.prepare(
    `SELECT id, sort_order FROM questions
       WHERE pack_id = ? AND status = 'published'
       ORDER BY id ASC`
  ).all(packId);
  const publishedIdsSortedAsc = publishedRows.map((r) => r.id);
  const publishedIdsBySortOrder = [...publishedRows].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map((r) => r.id);
  const exclusionWindow = getDailyExclusionWindow(publishedIdsSortedAsc.length);
  const excludedIds = /* @__PURE__ */ new Set();
  if (exclusionWindow > 0) {
    const prevDates = getPreviousUtcDates(challengeDate, exclusionWindow);
    const placeholders = prevDates.map(() => "?").join(",");
    const prevSets = db.prepare(
      `SELECT question_ids FROM daily_sets
         WHERE pack_id = ? AND challenge_date IN (${placeholders})`
    ).all(packId, ...prevDates);
    for (const row of prevSets) {
      const ids = JSON.parse(row.question_ids);
      ids.forEach((id) => excludedIds.add(id));
    }
  }
  const seedUint32 = computeDailySeedUint32(packId, challengeDate);
  const selectedIds = selectDailyQuestionIds({
    publishedIdsSortedAsc,
    publishedIdsBySortOrder,
    seedUint32,
    excludedIds,
    launchSetMode: false
  });
  db.prepare(
    `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(crypto2.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds), (/* @__PURE__ */ new Date()).toISOString());
  const authoritative = db.prepare("SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?").get(packId, challengeDate);
  return JSON.parse(authoritative.question_ids);
}
function fetchQuestionsByIds(db, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id, pack_id, prompt, options, sort_order FROM questions WHERE id IN (${placeholders})`).all(...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r) => Boolean(r));
}
function toPublicQuestions(rows) {
  return rows.map((row) => {
    const opts = JSON.parse(row.options);
    return {
      id: row.id,
      pack_id: row.pack_id,
      prompt: row.prompt,
      options: opts.map((o) => ({ text: o.text }))
    };
  });
}
function buildFinalResultFromRun(db, run) {
  if (!run.completed_at || !run.archetype_id) return null;
  const questionIds = JSON.parse(run.question_ids);
  const answerRecords = JSON.parse(run.answer_records);
  const qRows = fetchQuestionsByIds(db, questionIds);
  const qMap = new Map(qRows.map((r) => [r.id, JSON.parse(r.options)]));
  const chosenAxes = answerRecords.map((rec) => {
    const opts = qMap.get(rec.question_id);
    const chosen = opts?.[rec.option_index];
    return chosen ? chosen.axes : [0, 0, 0];
  });
  const axisResult = computePersonality(chosenAxes);
  const archetypeDef = ARCHETYPES[run.archetype_id];
  const verdicts = loadVerdicts();
  const band = getRarityBand(run.total_points);
  const verdict = verdicts.soloVerdicts[run.archetype_id][band];
  const packLine = verdicts.packLines[run.pack_id]?.[run.archetype_id] ?? null;
  return {
    packId: run.pack_id,
    challengeDate: run.challenge_date,
    totalPoints: run.total_points,
    scoreTitle: run.score_title ?? getScoreTitle(run.total_points),
    scoringVersion: run.scoring_version,
    axisResult,
    archetype: {
      id: archetypeDef.id,
      name: archetypeDef.name,
      oneLineTrait: archetypeDef.oneLineTrait
    },
    verdict,
    packLine,
    answerRecords
  };
}
function listPublishedPacks(db, deviceId, dateStr = getUtcDateString()) {
  const packs = db.prepare(
    `SELECT id, slug, name, description, visual_theme, sort_order
       FROM packs WHERE status = 'published' ORDER BY sort_order ASC`
  ).all();
  const countStmt = db.prepare(
    `SELECT COUNT(*) as cnt FROM questions WHERE pack_id = ? AND status = 'published'`
  );
  const runStmt = db.prepare(
    `SELECT answer_records, completed_at, total_points, archetype_id, score_title
     FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?`
  );
  const totalQuestionsStmt = db.prepare(
    `SELECT COUNT(*) as cnt FROM questions WHERE status = 'published'`
  );
  return packs.map((p) => {
    const cnt = p.id === "the_mix" ? totalQuestionsStmt.get().cnt : countStmt.get(p.id).cnt;
    const run = runStmt.get(deviceId, p.id, dateStr);
    const records = run ? JSON.parse(run.answer_records) : [];
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      visual_theme: p.visual_theme,
      sort_order: p.sort_order,
      questionCount: cnt,
      todayStatus: {
        date: dateStr,
        answeredCount: records.length,
        completed: Boolean(run?.completed_at),
        totalPoints: run?.completed_at ? run.total_points : null,
        archetypeId: run?.completed_at ? run.archetype_id : null,
        scoreTitle: run?.completed_at ? run.score_title : null
      }
    };
  });
}
function getDailySoloState(db, packId, deviceId, dateStr = getUtcDateString()) {
  const pack = db.prepare(
    `SELECT id, name, description, visual_theme FROM packs WHERE id = ? AND status = 'published'`
  ).get(packId);
  if (!pack) return null;
  const existingRun = db.prepare(
    `SELECT * FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?`
  ).get(deviceId, packId, dateStr);
  const questionIds = existingRun ? JSON.parse(existingRun.question_ids) : getOrCreateDailySet(db, packId, dateStr);
  const qRows = fetchQuestionsByIds(db, questionIds);
  const publicQuestions = toPublicQuestions(qRows);
  const answerRecords = existingRun ? JSON.parse(existingRun.answer_records) : [];
  return {
    pack,
    date: dateStr,
    nextResetIso: getNextUtcResetIso(),
    launchSetMode: isLaunchSetMode(),
    questions: publicQuestions,
    answerRecords,
    completed: Boolean(existingRun?.completed_at),
    finalResult: existingRun ? buildFinalResultFromRun(db, existingRun) : null
  };
}
function getVoteCounts(db, questionId) {
  const rows = db.prepare(
    `SELECT option_index, COUNT(*) as cnt
       FROM population_votes
       WHERE question_id = ?
       GROUP BY option_index`
  ).all(questionId);
  const counts = [0, 0, 0, 0];
  for (const r of rows) {
    if (r.option_index >= 0 && r.option_index <= 3) {
      counts[r.option_index] = r.cnt;
    }
  }
  return counts;
}
function submitSoloAnswer(db, params) {
  const { deviceId, packId, date, questionId, optionIndex, overthinker } = params;
  const packExists = db.prepare(`SELECT 1 FROM packs WHERE id = ? AND status = 'published'`).get(packId);
  if (!packExists) {
    throw Object.assign(new Error("Pack not found"), { statusCode: 404 });
  }
  const todaySetIds = getOrCreateDailySet(db, packId, date);
  const tx = db.transaction(() => {
    let run = db.prepare(
      `SELECT * FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?`
    ).get(deviceId, packId, date);
    const activeQuestionIds = run ? JSON.parse(run.question_ids) : todaySetIds;
    if (!activeQuestionIds.includes(questionId)) {
      throw Object.assign(new Error("Question is not part of today\u2019s daily set"), {
        statusCode: 400
      });
    }
    const qRow = db.prepare("SELECT id, pack_id, prompt, options, sort_order FROM questions WHERE id = ?").get(questionId);
    if (!qRow) {
      throw Object.assign(new Error("Question not found"), { statusCode: 404 });
    }
    const qOptions = JSON.parse(qRow.options);
    const optionTexts = qOptions.map((o) => o.text);
    const existingRecords = run ? JSON.parse(run.answer_records) : [];
    const existingRec = existingRecords.find((r) => r.question_id === questionId);
    if (existingRec && run) {
      const counts = getVoteCounts(db, questionId);
      const currentReveal = evaluateSoloAnswer({
        questionId,
        optionTexts,
        chosenIndex: existingRec.option_index,
        voteCounts: counts
      });
      const immutableReveal = {
        ...currentReveal,
        tier: existingRec.tier,
        points: existingRec.points
      };
      return {
        reveal: immutableReveal,
        answerRecords: existingRecords,
        completed: Boolean(run.completed_at),
        finalResult: buildFinalResultFromRun(db, run)
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO population_votes (id, device_id, question_id, option_index, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto2.randomUUID(), deviceId, questionId, optionIndex, now);
    const voteCounts = getVoteCounts(db, questionId);
    const reveal = evaluateSoloAnswer({
      questionId,
      optionTexts,
      chosenIndex: optionIndex,
      voteCounts
    });
    const newRecord = {
      question_id: questionId,
      option_index: optionIndex,
      tier: reveal.tier,
      points: reveal.points,
      sample_size_at_answer: reveal.sampleSize,
      scoring_version: SCORING_VERSION,
      ...overthinker ? { overthinker: true } : {}
    };
    const updatedRecords = [...existingRecords, newRecord];
    const totalPoints = updatedRecords.reduce((sum, r) => sum + r.points, 0);
    if (!run) {
      const runId = crypto2.randomUUID();
      db.prepare(
        `INSERT INTO solo_runs (
          id, device_id, pack_id, challenge_date, question_ids, answer_records,
          total_points, scoring_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        runId,
        deviceId,
        packId,
        date,
        JSON.stringify(activeQuestionIds),
        JSON.stringify(updatedRecords),
        totalPoints,
        SCORING_VERSION,
        now
      );
      run = db.prepare("SELECT * FROM solo_runs WHERE id = ?").get(runId);
    } else {
      db.prepare(
        `UPDATE solo_runs SET answer_records = ?, total_points = ? WHERE id = ?`
      ).run(JSON.stringify(updatedRecords), totalPoints, run.id);
    }
    const isComplete = updatedRecords.length >= activeQuestionIds.length;
    if (isComplete && !run.completed_at) {
      const qRows = fetchQuestionsByIds(db, activeQuestionIds);
      const qMap = new Map(qRows.map((r) => [r.id, JSON.parse(r.options)]));
      const recordByQ = new Map(updatedRecords.map((r) => [r.question_id, r]));
      const orderedRecords = activeQuestionIds.map((qid) => recordByQ.get(qid)).filter((r) => Boolean(r));
      const chosenAxes = orderedRecords.map((rec) => {
        const opts = qMap.get(rec.question_id);
        return opts?.[rec.option_index]?.axes ?? [0, 0, 0];
      });
      const axisResult = computePersonality(chosenAxes);
      const scoreTitle = getScoreTitle(totalPoints);
      const band = getRarityBand(totalPoints);
      const verdicts = loadVerdicts();
      const verdict = verdicts.soloVerdicts[axisResult.archetypeId][band];
      db.prepare(
        `UPDATE solo_runs
         SET answer_records = ?,
             axis_totals = ?,
             archetype_id = ?,
             total_points = ?,
             score_title = ?,
             verdict_id = ?,
             scoring_version = ?,
             completed_at = ?
         WHERE id = ?`
      ).run(
        JSON.stringify(orderedRecords),
        JSON.stringify(axisResult.raw),
        axisResult.archetypeId,
        totalPoints,
        scoreTitle,
        verdict.id,
        SCORING_VERSION,
        now,
        run.id
      );
      run = db.prepare("SELECT * FROM solo_runs WHERE id = ?").get(run.id);
      return {
        reveal,
        answerRecords: orderedRecords,
        completed: true,
        finalResult: buildFinalResultFromRun(db, run)
      };
    }
    return {
      reveal,
      answerRecords: updatedRecords,
      completed: false,
      finalResult: null
    };
  });
  return tx();
}

// src/server/crew.ts
var CREW_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function generateCrewCode() {
  const bytes = crypto3.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CREW_CODE_ALPHABET[bytes[i] % CREW_CODE_ALPHABET.length];
  }
  return code;
}
function selectCrewQuestions(db, mode, packId, excludeQuestionIds) {
  const seed = crypto3.randomBytes(4).readUInt32BE(0);
  const rng = mulberry32(seed);
  const recentOrder = excludeQuestionIds.slice(-21);
  const excludeSet = new Set(recentOrder);
  if (mode === "themed" && packId) {
    const rows2 = db.prepare(
      `SELECT id FROM questions WHERE pack_id = ? AND status = 'published' ORDER BY id ASC`
    ).all(packId);
    const allIds = rows2.map((r) => r.id);
    const fresh = fisherYatesShuffle(
      allIds.filter((id) => !excludeSet.has(id)),
      rng
    );
    if (fresh.length >= 7) {
      return fresh.slice(0, 7);
    }
    const seenOldestFirst = recentOrder.filter((id) => allIds.includes(id) && !fresh.includes(id));
    const remaining = allIds.filter((id) => !fresh.includes(id) && !seenOldestFirst.includes(id));
    return [...fresh, ...seenOldestFirst, ...remaining].slice(0, 7);
  }
  const rows = db.prepare(
    `SELECT id, pack_id FROM questions WHERE status = 'published' ORDER BY id ASC`
  ).all();
  const freshRows = fisherYatesShuffle(
    rows.filter((r) => !excludeSet.has(r.id)),
    rng
  );
  const seenOldestRows = recentOrder.map((id) => rows.find((r) => r.id === id)).filter((r) => Boolean(r));
  const candidates = [...freshRows, ...seenOldestRows];
  const picked = [];
  const pickedSet = /* @__PURE__ */ new Set();
  const packCounts = {};
  for (const row of candidates) {
    if (picked.length >= 7) break;
    if (pickedSet.has(row.id)) continue;
    const currentCount = packCounts[row.pack_id] ?? 0;
    if (currentCount >= 3) continue;
    picked.push(row.id);
    pickedSet.add(row.id);
    packCounts[row.pack_id] = currentCount + 1;
  }
  if (picked.length < 7) {
    for (const row of rows) {
      if (picked.length >= 7) break;
      if (pickedSet.has(row.id)) continue;
      picked.push(row.id);
      pickedSet.add(row.id);
    }
  }
  return fisherYatesShuffle(picked, rng);
}
function createCrew(db, params) {
  const { deviceId, mode, packId, excludeQuestionIds = [] } = params;
  const cleanName = sanitizeUserText(params.name, 24) || null;
  const cleanNickname = sanitizeUserText(params.nickname, 18) || "Player 1";
  if (mode === "themed") {
    if (!packId) {
      throw Object.assign(new Error("packId is required for themed crews"), { statusCode: 400 });
    }
    const exists = db.prepare(`SELECT 1 FROM packs WHERE id = ? AND status = 'published'`).get(packId);
    if (!exists) {
      throw Object.assign(new Error("Selected pack does not exist"), { statusCode: 404 });
    }
  }
  const questionIds = selectCrewQuestions(db, mode, mode === "themed" ? packId : null, excludeQuestionIds);
  if (questionIds.length < 7) {
    throw Object.assign(new Error("Not enough published questions available"), { statusCode: 500 });
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const crewId = crypto3.randomUUID();
  const memberId = crypto3.randomUUID();
  const tx = db.transaction(() => {
    let code2 = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateCrewCode();
      const collision = db.prepare("SELECT 1 FROM crews WHERE code = ?").get(candidate);
      if (!collision) {
        code2 = candidate;
        break;
      }
    }
    if (!code2) {
      throw Object.assign(new Error("Failed to generate unique crew code"), { statusCode: 500 });
    }
    db.prepare(
      `INSERT INTO crews (id, code, name, pack_id, mode, question_ids, creator_device_id, max_players, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 12, 'open', ?)`
    ).run(
      crewId,
      code2,
      cleanName,
      mode === "themed" ? packId : null,
      mode,
      JSON.stringify(questionIds),
      deviceId,
      now
    );
    db.prepare(
      `INSERT INTO crew_members (id, crew_id, device_id, nickname, answers, created_at)
       VALUES (?, ?, ?, ?, '{}', ?)`
    ).run(memberId, crewId, deviceId, cleanNickname, now);
    return code2;
  });
  const code = tx();
  return {
    code,
    invitePath: `/crew/${code}`,
    crewId,
    questionIds
  };
}
function getCrewState(db, codeInput, deviceId) {
  const code = codeInput.trim().toUpperCase();
  const crew = db.prepare("SELECT * FROM crews WHERE code = ?").get(code);
  if (!crew) return null;
  const members = db.prepare("SELECT * FROM crew_members WHERE crew_id = ? ORDER BY created_at ASC").all(crew.id);
  const questionIds = JSON.parse(crew.question_ids);
  const qRows = fetchQuestionsByIds(db, questionIds);
  const publicQuestions = toPublicQuestions(qRows);
  const meRow = members.find((m) => m.device_id === deviceId);
  const meAnswers = meRow ? JSON.parse(meRow.answers) : {};
  const meCompleted = Boolean(meRow?.completed_at);
  const completedMembers = members.filter((m) => Boolean(m.completed_at));
  const visualTheme = crew.mode === "mixed" || !crew.pack_id ? "the_mix" : crew.pack_id;
  const displayName = (m, index) => m.nickname && m.nickname.trim().length > 0 ? m.nickname : `Player ${index + 1}`;
  const publicMembers = members.map((m, idx) => ({
    memberId: m.id,
    nickname: displayName(m, idx),
    completed: Boolean(m.completed_at),
    isMe: m.device_id === deviceId
  }));
  let board = null;
  if (meCompleted && completedMembers.length >= 2) {
    const verdicts = loadVerdicts();
    const scoringInputs = completedMembers.map((m) => {
      const idx = members.findIndex((x) => x.id === m.id);
      return {
        memberId: m.id,
        nickname: displayName(m, idx),
        isMe: m.device_id === deviceId,
        answers: JSON.parse(m.answers)
      };
    });
    board = computeCrewBoard({
      questions: publicQuestions,
      completedMembers: scoringInputs,
      squadRoasts: verdicts.squadRoasts
    });
  }
  return {
    crew: {
      id: crew.id,
      code: crew.code,
      name: crew.name || `${crew.mode === "mixed" ? "MIXED" : crew.pack_id?.replace("_", " ").toUpperCase()} CREW`,
      packId: crew.pack_id,
      mode: crew.mode,
      visualTheme,
      maxPlayers: crew.max_players,
      memberCount: members.length,
      completedCount: completedMembers.length,
      isFull: members.length >= crew.max_players && !meRow,
      invitePath: `/crew/${crew.code}`,
      createdAt: crew.created_at
    },
    me: {
      joined: Boolean(meRow),
      nickname: meRow?.nickname ?? "",
      answers: meAnswers,
      answeredCount: Object.keys(meAnswers).length,
      completed: meCompleted
    },
    members: publicMembers,
    questions: publicQuestions,
    board
  };
}
function submitCrewAnswer(db, params) {
  const code = params.code.trim().toUpperCase();
  const crew = db.prepare("SELECT * FROM crews WHERE code = ?").get(code);
  if (!crew) {
    throw Object.assign(new Error("Crew not found"), { statusCode: 404 });
  }
  const questionIds = JSON.parse(crew.question_ids);
  const cleanNickname = sanitizeUserText(params.nickname, 18);
  if (params.questionId !== void 0) {
    if (!questionIds.includes(params.questionId)) {
      throw Object.assign(new Error("Question does not belong to this crew"), { statusCode: 400 });
    }
    if (params.optionIndex === void 0 || !Number.isInteger(params.optionIndex) || params.optionIndex < 0 || params.optionIndex > 3) {
      throw Object.assign(new Error("optionIndex must be an integer between 0 and 3"), {
        statusCode: 400
      });
    }
  }
  const tx = db.transaction(() => {
    const members = db.prepare("SELECT * FROM crew_members WHERE crew_id = ? ORDER BY created_at ASC").all(crew.id);
    let me = members.find((m) => m.device_id === params.deviceId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (!me) {
      if (members.length >= crew.max_players) {
        throw Object.assign(
          new Error(`This crew is full (maximum ${crew.max_players} players).`),
          { statusCode: 409 }
        );
      }
      const fallbackName = cleanNickname || `Player ${members.length + 1}`;
      const memberId = crypto3.randomUUID();
      db.prepare(
        `INSERT INTO crew_members (id, crew_id, device_id, nickname, answers, created_at)
         VALUES (?, ?, ?, ?, '{}', ?)`
      ).run(memberId, crew.id, params.deviceId, fallbackName, now);
      me = db.prepare("SELECT * FROM crew_members WHERE id = ?").get(memberId);
    } else if (cleanNickname && cleanNickname !== me.nickname) {
      db.prepare("UPDATE crew_members SET nickname = ? WHERE id = ?").run(cleanNickname, me.id);
      me = { ...me, nickname: cleanNickname };
    }
    if (params.questionId !== void 0 && params.optionIndex !== void 0) {
      if (!me.completed_at) {
        const currentAnswers = JSON.parse(me.answers);
        currentAnswers[params.questionId] = params.optionIndex;
        const allAnswered = questionIds.every((qid) => currentAnswers[qid] !== void 0);
        const completedAt = allAnswered ? now : null;
        db.prepare(
          `UPDATE crew_members SET answers = ?, completed_at = ? WHERE id = ?`
        ).run(JSON.stringify(currentAnswers), completedAt, me.id);
      }
    }
  });
  tx();
  const state = getCrewState(db, code, params.deviceId);
  if (!state) {
    throw Object.assign(new Error("Crew not found"), { statusCode: 404 });
  }
  return state;
}
function getCrewMetaForOg(db, codeInput) {
  const code = codeInput.trim().toUpperCase();
  const crew = db.prepare("SELECT id, code, name, mode, pack_id FROM crews WHERE code = ?").get(code);
  if (!crew) return null;
  const { cnt } = db.prepare("SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?").get(crew.id);
  return {
    code: crew.code,
    name: crew.name || `Crew ${crew.code}`,
    mode: crew.mode,
    packId: crew.pack_id,
    memberCount: cnt
  };
}

// src/server/og.ts
function resolveAppBaseUrl(req) {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured) && !configured.includes("MY_APP_URL")) {
    return configured.replace(/\/+$/, "");
  }
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = typeof protoHeader === "string" && protoHeader.length > 0 ? protoHeader.split(",")[0].trim() : req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${Array.isArray(host) ? host[0] : host}`.replace(/\/+$/, "");
}
function replaceMetaTag(html, pattern, replacement) {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace("</head>", `  ${replacement}
  </head>`);
}
function injectOgMetaTags(htmlTemplate, req, db, crewCode) {
  const baseUrl = resolveAppBaseUrl(req);
  let title = "BRAINPRINT \u2014 Same questions. Different minds.";
  let description = "Solo: Think Rare. Crew: Think Alike. Play the 7-question retro 16-bit personality & social sync arcade game.";
  let imagePath = "/og/default.png";
  let canonicalUrl = `${baseUrl}/`;
  if (crewCode) {
    const meta = getCrewMetaForOg(db, crewCode);
    if (meta) {
      const packLabel = meta.mode === "mixed" ? "Mixed Pack" : meta.packId === "neon_coast" ? "Neon Coast" : meta.packId === "campus_chaos" ? "Campus Chaos" : meta.packId === "social_circuit" ? "Social Circuit" : meta.packId === "everyday_life" ? "Everyday Life" : "The Mix";
      title = `Join ${meta.name} on BRAINPRINT`;
      description = `Code ${meta.code} \xB7 ${packLabel} \xB7 ${meta.memberCount} joined. Answer 7 blind questions and see how synced your crew really is!`;
      imagePath = meta.mode === "mixed" || !meta.packId ? "/og/the_mix.png" : `/og/${meta.packId}.png`;
      canonicalUrl = `${baseUrl}/crew/${encodeURIComponent(meta.code)}`;
    }
  }
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImg = escapeHtml(`${baseUrl}${imagePath}`);
  const safeUrl = escapeHtml(canonicalUrl);
  let html = htmlTemplate;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  html = replaceMetaTag(
    html,
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${safeTitle}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${safeImg}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${safeUrl}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:card"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:card" content="summary_large_image" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${safeTitle}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${safeDesc}" />`
  );
  html = replaceMetaTag(
    html,
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${safeImg}" />`
  );
  return html;
}

// src/server/index.ts
var PackIdSchema = z.enum([
  "the_mix",
  "everyday_life",
  "social_circuit",
  "neon_coast",
  "campus_chaos",
  "leonida_vibe",
  "pop_culture",
  "moral_mayhem"
]);
var SoloAnswerBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  packId: PackIdSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  questionId: z.string().min(1).max(64),
  optionIndex: z.number().int().min(0).max(3),
  overthinker: z.boolean().optional()
});
var CreateCrewBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  mode: z.enum(["themed", "mixed"]),
  packId: PackIdSchema.nullable().optional(),
  name: z.string().max(48).optional(),
  nickname: z.string().max(40).optional(),
  excludeQuestionIds: z.array(z.string().max(64)).max(50).optional()
});
var CrewAnswerBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  questionId: z.string().min(1).max(64).optional(),
  optionIndex: z.number().int().min(0).max(3).optional(),
  nickname: z.string().max(40).optional()
});
function createApp(db, options) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "100kb" }));
  const rateLimiter = new AnswerRateLimiter(options?.rateLimitPerMin ?? 60, 6e4);
  app.get("/api/health", (_req, res) => {
    const bootMeta = db.prepare("SELECT value, updated_at FROM app_meta WHERE key = 'first_boot_at'").get();
    const { packCount } = db.prepare("SELECT COUNT(*) as packCount FROM packs WHERE status = 'published'").get();
    const { questionCount } = db.prepare("SELECT COUNT(*) as questionCount FROM questions WHERE status = 'published'").get();
    const { voteCount } = db.prepare("SELECT COUNT(*) as voteCount FROM population_votes").get();
    const { crewCount } = db.prepare("SELECT COUNT(*) as crewCount FROM crews").get();
    res.json({
      ok: true,
      launchSetMode: isLaunchSetMode(),
      firstBootAt: bootMeta?.value ?? null,
      packs: packCount,
      questions: questionCount,
      populationVotes: voteCount,
      crews: crewCount,
      utcDate: getUtcDateString()
    });
  });
  app.get("/api/packs", (req, res) => {
    const deviceId = resolveDeviceId(req, res);
    const packs = listPublishedPacks(db, deviceId);
    res.json({
      deviceId,
      utcDate: getUtcDateString(),
      launchSetMode: isLaunchSetMode(),
      packs
    });
  });
  app.get("/api/solo/daily", (req, res) => {
    const parsedPack = PackIdSchema.safeParse(req.query.packId);
    if (!parsedPack.success) {
      res.status(400).json({ error: "Invalid or missing packId" });
      return;
    }
    const deviceId = resolveDeviceId(req, res);
    const state = getDailySoloState(db, parsedPack.data, deviceId);
    if (!state) {
      res.status(404).json({ error: "Pack not found" });
      return;
    }
    res.json({ deviceId, ...state });
  });
  app.post("/api/solo/answer", (req, res) => {
    const parsed = SoloAnswerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request payload", details: parsed.error.flatten() });
      return;
    }
    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader("Retry-After", String(limitCheck.retryAfterSec));
      res.status(429).json({ error: "Too many submissions. Please slow down." });
      return;
    }
    const currentUtcDate = getUtcDateString();
    const targetDate = parsed.data.date;
    if (targetDate !== currentUtcDate) {
      const inProgress = db.prepare(
        "SELECT 1 FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?"
      ).get(deviceId, parsed.data.packId, targetDate);
      if (!inProgress) {
        res.status(409).json({
          error: "Daily set has reset for the new UTC day. Reloading today\u2019s questions.",
          currentUtcDate
        });
        return;
      }
    }
    try {
      const result = submitSoloAnswer(db, {
        deviceId,
        packId: parsed.data.packId,
        date: targetDate,
        questionId: parsed.data.questionId,
        optionIndex: parsed.data.optionIndex,
        overthinker: parsed.data.overthinker
      });
      res.json({ deviceId, ...result });
    } catch (err) {
      const status = err.statusCode ?? 500;
      const message = err instanceof Error ? err.message : "Failed to submit answer";
      res.status(status).json({ error: message });
    }
  });
  app.post("/api/crews", (req, res) => {
    const parsed = CreateCrewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid crew payload", details: parsed.error.flatten() });
      return;
    }
    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader("Retry-After", String(limitCheck.retryAfterSec));
      res.status(429).json({ error: "Too many requests. Please wait a moment." });
      return;
    }
    try {
      const created = createCrew(db, {
        deviceId,
        mode: parsed.data.mode,
        packId: parsed.data.packId ?? null,
        name: parsed.data.name,
        nickname: parsed.data.nickname,
        excludeQuestionIds: parsed.data.excludeQuestionIds
      });
      res.status(201).json({ deviceId, ...created });
    } catch (err) {
      const status = err.statusCode ?? 500;
      const message = err instanceof Error ? err.message : "Failed to create crew";
      res.status(status).json({ error: message });
    }
  });
  app.get("/api/crews/:code", (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).json({ error: "Invalid crew code" });
      return;
    }
    const deviceId = resolveDeviceId(req, res);
    const state = getCrewState(db, code, deviceId);
    if (!state) {
      res.status(404).json({ error: "Crew not found. Check the 6-character code." });
      return;
    }
    res.json({ deviceId, ...state });
  });
  app.post("/api/crews/:code/answer", (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).json({ error: "Invalid crew code" });
      return;
    }
    const parsed = CrewAnswerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid answer payload", details: parsed.error.flatten() });
      return;
    }
    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader("Retry-After", String(limitCheck.retryAfterSec));
      res.status(429).json({ error: "Too many submissions. Please slow down." });
      return;
    }
    try {
      const state = submitCrewAnswer(db, {
        code,
        deviceId,
        questionId: parsed.data.questionId,
        optionIndex: parsed.data.optionIndex,
        nickname: parsed.data.nickname
      });
      res.json({ deviceId, ...state });
    } catch (err) {
      const status = err.statusCode ?? 500;
      const message = err instanceof Error ? err.message : "Failed to save crew answer";
      res.status(status).json({ error: message });
    }
  });
  app.use((err, _req, res, _next) => {
    res.status(400).json({ error: err.message || "Bad request" });
  });
  return app;
}
async function startServer() {
  const db = openDatabase();
  const seeded = seedPacksAndQuestions(db);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES ('first_boot_at', ?, ?)`
  ).run(now, now);
  const app = createApp(db);
  const root = resolveProjectRoot();
  const isProd = process.env.NODE_ENV === "production";
  const publicOgDir = path2.resolve(root, "public", "og");
  if (fs2.existsSync(publicOgDir)) {
    app.use("/og", express.static(publicOgDir, { maxAge: "1d" }));
  }
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom"
    });
    app.use(vite.middlewares);
    app.get(["/", "/crew/:code", "*"], async (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      try {
        const rawHtml = fs2.readFileSync(path2.resolve(root, "index.html"), "utf8");
        const crewCode = typeof req.params.code === "string" ? req.params.code : void 0;
        const withOg = injectOgMetaTags(rawHtml, req, db, crewCode);
        const transformed = await vite.transformIndexHtml(req.originalUrl, withOg);
        res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(transformed);
      } catch (err) {
        vite.ssrFixStacktrace(err);
        next(err);
      }
    });
  } else {
    const distDir = path2.resolve(root, "dist");
    const indexHtmlPath = path2.resolve(distDir, "index.html");
    const indexHtmlTemplate = fs2.existsSync(indexHtmlPath) ? fs2.readFileSync(indexHtmlPath, "utf8") : '<!doctype html><html><head><title>BRAINPRINT</title></head><body><div id="root"></div></body></html>';
    app.use(express.static(distDir, { index: false, maxAge: "7d" }));
    app.get("/", (req, res) => {
      const html = injectOgMetaTags(indexHtmlTemplate, req, db);
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
    });
    app.get("/crew/:code", (req, res) => {
      const code = String(req.params.code || "");
      const html = injectOgMetaTags(indexHtmlTemplate, req, db, code);
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
    });
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        res.status(404).json({ error: "API route not found" });
        return;
      }
      if (req.path.includes(".")) {
        next();
        return;
      }
      const html = injectOgMetaTags(indexHtmlTemplate, req, db);
      res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send(html);
    });
  }
  const port = Number(process.env.PORT || 3e3);
  app.listen(port, "0.0.0.0", () => {
    console.log(
      `BRAINPRINT listening on http://0.0.0.0:${port} (env=${isProd ? "production" : "development"}, db=${getDbPath()}, seeded=${seeded.packs} packs/${seeded.questions} questions)`
    );
  });
}
var isDirectRun = process.argv[1] && (process.argv[1].endsWith("index.ts") || process.argv[1].endsWith("index.mjs"));
if (isDirectRun) {
  startServer().catch((err) => {
    console.error("Failed to start BRAINPRINT server:", err);
    process.exit(1);
  });
}
export {
  createApp
};
