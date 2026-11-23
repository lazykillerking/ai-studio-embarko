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

// src/shared/crewCommentaryBank.ts
var CREW_SYNC_TIERS = [
  {
    id: "hostile_takeover",
    minSync: 0,
    maxSync: 24,
    title: "The Hostile Takeover",
    shortDesc: "Pure anarchy. Nobody agreed on anything, and that was probably deliberate.",
    crewDiagnosis: "This is not a crew; this is a witness protection convoy where everyone suspects everyone else. Every single question became a diplomatic incident, and every choice felt like a personal veto. If you attempted an escape room together, the emergency exit would be smashed open within ninety seconds.",
    tone: "Savage, chaotic",
    badgeColor: "#EF4444",
    accentGlow: "rgba(239, 68, 68, 0.4)",
    verdictLines: [
      "You didn\u2019t form a squad. You signed an open-ended mutual restraining order.",
      "A lobby so fractured that even the loading screen is looking for a way out.",
      "If mutual distrust could generate electricity, you\u2019d power the entire coastline.",
      "Nobody agreed on anything, yet everyone feels entirely justified.",
      "Four GPS devices, six destination pins, zero passengers surviving the trip.",
      "A masterclass in peaceful coexistence failing before question three.",
      "Scientists study this level of disagreement to understand tectonic fault lines.",
      "You are all fundamentally distinct human beings who met by tragic coincidence.",
      "Not a single shared frequency in the room. Just pure, unadulterated static.",
      "This friendship is held together exclusively by screenshots and spite."
    ]
  },
  {
    id: "different_planets",
    minSync: 25,
    maxSync: 39,
    title: "Different Planets",
    shortDesc: "You share a group chat, but your brains live in different solar systems.",
    crewDiagnosis: "You occasionally wander onto the same wavelength by pure statistical accident before scattering to opposite corners of the map. Conversations require three layers of translation, and deciding where to eat probably takes forty-five minutes and an online poll.",
    tone: "Heavy teasing",
    badgeColor: "#F97316",
    accentGlow: "rgba(249, 115, 22, 0.4)",
    verdictLines: [
      "You don\u2019t share a braincell; you occasionally wave at each other from different orbits.",
      "Every choice felt like a coin flip that landed on its side.",
      "Proof that opposites attract, argue for an hour, and then order completely different takeout.",
      "You communicate via vibes and misunderstandings, and somehow that\u2019s working for you.",
      "A crew built on mutual bewilderment and occasional polite nods.",
      "One of you is living in 2085, one is in the 1990s, and the rest forgot the question.",
      "You agree just often enough to keep the group chat alive, but never enough to make plans.",
      "Every plan in this group requires a three-point turn and a written waiver.",
      "Your synchronisation is like intermittent Bluetooth in an underground car park.",
      "United by proximity, separated by basically every cognitive function."
    ]
  },
  {
    id: "somehow_a_crew",
    minSync: 40,
    maxSync: 54,
    title: "Somehow a Crew",
    shortDesc: "Chaotic equilibrium. Half the room plans, the other half improvise.",
    crewDiagnosis: "A textbook sitcom ensemble. When you agree, you move fast; when you disagree, the debates are legendary and completely unnecessary. You have just enough common sense to avoid disaster, but enough reckless energy to keep things spicy.",
    tone: "Playful roasting",
    badgeColor: "#FBBF24",
    accentGlow: "rgba(251, 191, 36, 0.4)",
    verdictLines: [
      "Somehow functional, completely unhinged, and miraculously intact.",
      "Half of you packed an emergency kit; the other half brought sunglasses and vibes.",
      "You survived the quiz the way you survive weekends: with zero consensus and maximum drama.",
      "A delicately balanced ecosystem of overthinkers and chaos enthusiasts.",
      "You shouldn\u2019t work as a team on paper, yet here you are defying workplace safety laws.",
      "Two people are holding the map, and two people are actively setting fire to the compass.",
      "The group project where one person wrote the bibliography and three gave the presentation.",
      "If this squad were an aircraft, the warning alarm would be playing lo-fi beats.",
      "You share enough logic to reach the car, but not enough to agree on the playlist.",
      "A fragile peace agreement that holds together as long as nobody mentions money or timing."
    ]
  },
  {
    id: "unlikely_alliance",
    minSync: 55,
    maxSync: 69,
    title: "The Unlikely Alliance",
    shortDesc: "Solid chemistry with just enough friction to stay interesting.",
    crewDiagnosis: "A very healthy friend group dynamic. You think alike on the major instincts while maintaining enough individuality to keep conversations from becoming an echo chamber. You could pull off an elaborate road trip with minimal screaming.",
    tone: "Balanced",
    badgeColor: "#34D399",
    accentGlow: "rgba(52, 211, 153, 0.4)",
    verdictLines: [
      "Good instincts, healthy disagreements, and zero casualties.",
      "You understand each other well enough to finish each other\u2019s complaints.",
      "A dependable squad that knows when to lock in and when to cause minor problems.",
      "You disagree on the method, but you always arrive at the same conclusion.",
      "The exact synchronisation sweet spot: compatible without being creepy.",
      "Capable of pulling off a heist, provided everyone gets their choice of snack.",
      "Strong co-op energy with occasional friendly fire for character development.",
      "You read each other\u2019s signals without needing an instructional manual.",
      "Reliable chemistry that survives bad traffic, missed turns, and split bills.",
      "Solid wavelength. You know exactly which friend to blame when things go sideways."
    ]
  },
  {
    id: "one_braincell",
    minSync: 70,
    maxSync: 84,
    title: "One Braincell, Shared",
    shortDesc: "Dangerous telepathy. You reach the same conclusions before the question finishes.",
    crewDiagnosis: "High-tier squad harmony. You share an unspoken shorthand that outsiders find mildly alarming. You finish each other\u2019s bad ideas before they can be questioned, and when one person suggests a terrible plan, everyone nods in immediate agreement.",
    tone: "Mostly compliments",
    badgeColor: "#38BDF8",
    accentGlow: "rgba(56, 189, 248, 0.4)",
    verdictLines: [
      "One braincell passed around like a shared hot potato.",
      "You don\u2019t need group meetings; you operate on shared peripheral vision.",
      "The kind of sync where eye contact across a crowded room counts as a full monologue.",
      "Alarmingly unified. You probably order the exact same drink without checking.",
      "A squad that makes questionable decisions together with Olympic-level synchrony.",
      "When one of you makes a bad call, the rest follow with total loyalty.",
      "High-bandwidth connection. Zero latency between instinct and execution.",
      "Outsiders feel like third wheels just standing near your group chat.",
      "Terrifyingly in tune. You could rob a convenience store on pure body language.",
      "The group hive mind is functioning at full capacity today."
    ]
  },
  {
    id: "mind_meld",
    minSync: 85,
    maxSync: 94,
    title: "Mind Meld",
    shortDesc: "Subconscious cloning. You are practically operating off a single central nervous system.",
    crewDiagnosis: "Elite synchronisation. There is virtually no daylight between your thought processes. You anticipate each other\u2019s moves, share identical radar for awkward situations, and would easily pass a government interrogation without rehearsing an alibi.",
    tone: "Strong compliments",
    badgeColor: "#818CF8",
    accentGlow: "rgba(129, 140, 248, 0.4)",
    verdictLines: [
      "Terrifyingly in sync. You are one matching jacket away from being a syndicate.",
      "Are you friends, or were you manufactured in the same test tube?",
      "If you were any more aligned, your phones would start charging each other by contact.",
      "You could swap seats halfway through the quiz and nobody would spot the difference.",
      "Zero hesitation, total telepathy, slightly unnerving compatibility.",
      "The authorities would classify this group as an unregistered distributed computer.",
      "A frequency lock so clean it makes twin telepathy look amateur.",
      "You could run a joint bank account and never argue about a single line item.",
      "Shared wavelength, identical biases, and complete mutual understanding.",
      "Co-op masterclass. You move through scenarios like choreographed dancers."
    ]
  },
  {
    id: "literally_same_person",
    minSync: 95,
    maxSync: 100,
    title: "Literally the Same Person",
    shortDesc: "Statistically suspicious. We suspect multiple tabs or identical DNA.",
    crewDiagnosis: "This level of synchronisation violates several natural laws. Either you have known each other since infancy and share identical sleep schedules, or one of you is a sentient holographic copy of the other. The algorithm is currently double-checking the database for duplicate submissions.",
    tone: "Legendary, suspicious",
    badgeColor: "#EC4899",
    accentGlow: "rgba(236, 72, 153, 0.4)",
    verdictLines: [
      "Statistically suspicious. Are you sure you didn\u2019t just pass one phone around?",
      "Identical brainwaves. We are checking the server logs for genetic cloning.",
      "You don\u2019t have a dynamic; you have a mirror and a shared Wi-Fi password.",
      "Literally zero variance. It\u2019s almost creepy how identical your neural wiring is.",
      "If you two ever disagree, the space-time continuum will file for unemployment.",
      "A hundred percent lock. Even your mistakes were made in perfect unison.",
      "You could take each other\u2019s driving tests and the examiner would suspect nothing.",
      "The rarest frequency in BRAINPRINT history. Uncanny, illegal, and iconic.",
      "We ran the numbers twice because nobody expects this level of mutual brain rot.",
      "One mind, multiple physical containers. A triumph of parallel computing."
    ]
  }
];
var PAIRWISE_RELATIONSHIP_TIERS = [
  {
    id: "natural_enemies",
    minSync: 0,
    maxSync: 24,
    label: "Natural Enemies",
    lines: [
      "Please do not put these two in charge of anything that requires consensus.",
      "Their ideas of a good weekend are mutually exclusive by international law.",
      "One builds the escape ladder; the other sells it for parts.",
      "They would split a two-door car right down the middle with an angle grinder.",
      "If one says north, the other is already packing winter coats for Antarctica.",
      "A rivalry so pure it could be packaged and sold as pre-workout powder.",
      "Every conversation is a covert operation to avoid agreeing on anything.",
      "Proof that two people can share air without sharing a single opinion."
    ]
  },
  {
    id: "unresolved_tension",
    minSync: 25,
    maxSync: 39,
    label: "Unresolved Tension",
    lines: [
      "They agree just often enough to make the next disagreement sting even more.",
      "One makes a three-point plan; the other quietly deletes step two.",
      "A polite standoff disguised as teamwork.",
      "They will smile, nod, and then immediately do the exact opposite behind each other\u2019s backs.",
      "You can hear the diplomatic sigh from three screens away.",
      "Coexisting on borrowed patience and very thin ice.",
      "They communicate through passive-aggressive calendar invites.",
      "Two different philosophies colliding in slow motion at a junction."
    ]
  },
  {
    id: "acquaintances_at_best",
    minSync: 40,
    maxSync: 54,
    label: "Acquaintances at Best",
    lines: [
      "Friendly enough in group settings, completely unpredictable one-on-one.",
      "They share about half a braincell, but neither has custody this weekend.",
      "They will agree on the destination, then fight over which route has fewer potholes.",
      "Safe, civilized, and capable of sharing an umbrella without incidents.",
      "Good balance: one provides the brakes, the other provides the accelerator.",
      "Occasional cognitive overlaps, separated by healthy chasms of common sense.",
      "They get along best when a third person is buffering the conversation.",
      "Compatible in small, controlled, well-ventilated doses."
    ]
  },
  {
    id: "decent_chemistry",
    minSync: 55,
    maxSync: 69,
    label: "Decent Chemistry",
    lines: [
      "A reliable duo. They read each other\u2019s playbooks with minimal confusion.",
      "They disagree on the seasoning, but they both like the meal.",
      "One starts the joke, the other adds the punchline thirty seconds later.",
      "They could co-pilot a road trip without throwing the aux cable out the window.",
      "Solid wavelength. Disagreements are settled with a coin toss and a laugh.",
      "They back each other up in public and roast each other in private.",
      "A dependable alliance that survives bad traffic and late arrivals.",
      "Natural conversational rhythm with plenty of room for banter."
    ]
  },
  {
    id: "same_wavelength",
    minSync: 70,
    maxSync: 84,
    label: "Same Wavelength",
    lines: [
      "Shared braincell. Ownership is disputed, but usage is frequent.",
      "They reach the punchline before the setup has even finished rendering.",
      "Dangerous co-op energy. They validate each other\u2019s worst impulses instantly.",
      "A glance across the table is equivalent to a fifteen-minute voice note.",
      "They operate on the exact same risk tolerance setting: high and irresponsible.",
      "When one gets a bad idea, the other is already fetching the props.",
      "High-bandwidth unspoken communication. Outsiders should be worried.",
      "They would split the bill to the exact cent without opening a calculator."
    ]
  },
  {
    id: "shared_braincell",
    minSync: 85,
    maxSync: 94,
    label: "Shared Braincell",
    lines: [
      "They understand each other a little too well. It\u2019s starting to concern the lobby.",
      "Basically operating as a dual-core processor in two separate bodies.",
      "They finish each other\u2019s snacks and sentences without asking.",
      "Separated at birth, reunited by an arcade algorithm.",
      "If you tell one of them a secret, both already know.",
      "The telepathy is so strong they probably get the same spam calls.",
      "Zero lag between thought, agreement, and terrible execution.",
      "They could swap characters mid-game and nobody would notice the playstyle change."
    ]
  },
  {
    id: "suspicious_connection",
    minSync: 95,
    maxSync: 100,
    label: "Suspicious Connection",
    lines: [
      "Statistically alarming. We are filing paperwork to check if they are the same person.",
      "Two bodies, one identical operating system. Unsettling and magnificent.",
      "Did you two rehearse this in a private lobby beforehand?",
      "If one sneezes, the other reaches for a handkerchief instinctively.",
      "A flawless match. Not a single disagreement detected across the entire run.",
      "They are legally prohibited from playing against each other in trivia.",
      "A cosmic glitch where two minds downloaded the exact same save file.",
      "Suspiciously identical. Even their wild guesses matched down to the millisecond."
    ]
  }
];
var INDIVIDUAL_LABELS = {
  crew_glue: {
    id: "crew_glue",
    title: "Crew Glue",
    description: "The social connective tissue holding this volatile mixture together."
  },
  the_outsider: {
    id: "the_outsider",
    title: "The Outsider",
    description: "Operating on a private encrypted frequency that nobody else can decode."
  },
  the_wildcard: {
    id: "the_wildcard",
    title: "The Wildcard",
    description: "Completely impossible to predict. You keep the squad guessing and sweating."
  },
  the_diplomat: {
    id: "the_diplomat",
    title: "The Diplomat",
    description: "Occupying the exact gravitational centre of the group\u2019s collective opinions."
  },
  the_chaos_engine: {
    id: "the_chaos_engine",
    title: "The Chaos Engine",
    description: "Every time a consensus starts forming, you hit the red button."
  },
  the_human_mirror: {
    id: "the_human_mirror",
    title: "The Human Mirror",
    description: "Adapting to the wavelength of whichever teammate is currently in front of you."
  },
  the_voice_of_reason: {
    id: "the_voice_of_reason",
    title: "The Voice of Reason",
    description: "Armed with logic and blueprints in a room full of fireworks."
  },
  the_unpredictable_one: {
    id: "the_unpredictable_one",
    title: "The Unpredictable One",
    description: "Never takes the expected route; turns every simple question into a detour."
  }
};
var CREW_AWARDS_BANK = [
  {
    id: "the_human_mirror",
    title: "The Human Mirror",
    icon: "\u{1FA9E}",
    tagline: "Highest Pairwise Sync",
    description: "Achieved the single highest synchronisation percentage with another player.",
    isShareable: true
  },
  {
    id: "walking_red_flag",
    title: "Walking Red Flag",
    icon: "\u{1F6A9}",
    tagline: "Most Extreme Answers",
    description: "Picked the most anomalous, high-risk, or rare answer options in the session."
  },
  {
    id: "the_voice_of_reason",
    title: "The Voice of Reason",
    icon: "\u{1F9E0}",
    tagline: "Plan & Logic Focused",
    description: "The highest combined score on the Plan and Logic poles across the squad."
  },
  {
    id: "the_main_character",
    title: "The Main Character",
    icon: "\u{1F451}",
    tagline: "Most Distinctive Profile",
    description: "Farthest Euclidean distance from the crew\u2019s average personality vector."
  },
  {
    id: "the_diplomat",
    title: "The Diplomat",
    icon: "\u{1F54A}\uFE0F",
    tagline: "Closest to Crew Mean",
    description: "Smallest personality distance from the squad\u2019s collective average."
  },
  {
    id: "the_wildcard",
    title: "The Wildcard",
    icon: "\u{1F0CF}",
    tagline: "Most Unpredictable Profile",
    description: "Most distributed pole balance with high answer variance across the session."
  },
  {
    id: "the_clone",
    title: "The Clone",
    icon: "\u{1F9EC}",
    tagline: "Strongest Similarity",
    description: "Nearly identical 3-axis slider profile to another teammate.",
    isShareable: true
  },
  {
    id: "the_contrarian",
    title: "The Contrarian",
    icon: "\u26A1",
    tagline: "Most Disagreements with Majority",
    description: "Voted against the squad majority option more than anyone else in the room."
  },
  {
    id: "the_therapist",
    title: "The Therapist",
    icon: "\u2615",
    tagline: "Most Balanced Across Axes",
    description: "Balanced closest to zero across Plan/Chaos, Solo/Crew, and Logic/Instinct."
  },
  {
    id: "the_instigator",
    title: "The Instigator",
    icon: "\u{1F9E8}",
    tagline: "Most Extreme Answer Tendencies",
    description: "Frequently selected extreme choices on the Chaos and Instinct poles."
  },
  {
    id: "the_lone_wolf",
    title: "The Lone Wolf",
    icon: "\u{1F43A}",
    tagline: "Strongest Solo Tendency",
    description: "The squad member leaning furthest toward the Solo pole."
  },
  {
    id: "the_glue",
    title: "The Glue",
    icon: "\u{1F9F2}",
    tagline: "High Sync & Crew Focus",
    description: "High crew-orientation score paired with top-tier average pairwise sync."
  }
];
var INDIVIDUAL_ROASTS = [
  "The only person here with a functioning plan. Unfortunately, nobody is listening.",
  "You didn\u2019t join a crew. You joined to make everyone\u2019s decision-making process harder.",
  "Somehow the only person keeping this group from becoming an investigative documentary.",
  "You read the terms and conditions before entering an arcade, and it shows.",
  "Your internal GPS recalculates every four seconds just to keep your anxiety company.",
  "You treat group chats like an emergency room briefing and wonder why people mute you.",
  "You make spontaneous decisions with all the speed of an international treaty negotiation.",
  "Your comfort zone has double-locked doors, emergency exits, and a fire marshal certificate.",
  "You could overthink a coin toss until the metal oxidises in mid-air.",
  'You agreed to join a crew, but your body language says "independent contractor with boundaries".',
  "You bring the energy of someone who brought a packed lunch to a music festival.",
  "You don\u2019t take shortcuts because shortcuts don\u2019t have laminated progress charts.",
  "If there were an award for second-guessing yourself in public, you\u2019d wonder if you deserved it.",
  "You trust your gut, which is terrifying because your gut has zero formal qualifications.",
  "You are one unverified rumour away from moving off-grid and raising free-range doubts.",
  "Your strategy was to wing it, miss the wing entirely, and land headfirst in the bushes.",
  "You treat warning signs as decorative roadside art.",
  "You pressed your answers with the calm confidence of a cat pushing a glass off a mantelpiece.",
  "You are the reason this group needs a designated sober thinker at all times.",
  "Your instinct is legendary. Unfortunately, your instinct was trained on cartoons.",
  "You don\u2019t need an alibi because even the police wouldn\u2019t believe you planned that.",
  "You are three bad decisions away from being an urban legend in your hometown.",
  "You operate with complete disregard for physics, statistics, and basic timetable etiquette.",
  "You volunteered for chaos and then acted surprised when things caught fire.",
  "Your logic is airtight, provided we ignore real-world consequences and human emotions.",
  "You would pause a high-speed chase to correct the getaway driver\u2019s pronunciation.",
  "You approach friendship like an Excel macro: efficient, unbending, and easily corrupted.",
  "You would rather be mathematically correct in a ditch than wrong in a warm car.",
  "You treat social interactions like a board game where only you have read the expansion pack.",
  "Your idea of compromise is explaining your original point again, but louder and slower.",
  "You entered this quiz with answers already pre-computed from last Tuesday.",
  "You don\u2019t have opinions; you have peer-reviewed hypotheses that nobody asked for.",
  "You possess the social grace of a sudden system reboot in the middle of a speech.",
  "You are the reason people check the group chat twice before answering a phone call.",
  "You joined this crew for the snacks and stayed purely to observe the inevitable collapse.",
  "Your presence here feels like a guest star who didn\u2019t read the script before filming.",
  "You answered every question like a spy trying not to blow their cover at a bake sale.",
  "You managed to disagree with everyone while maintaining complete eye contact.",
  "You radiate the energy of someone whose favourite hobby is leaving parties without saying goodbye.",
  "You are socially present, but emotionally running an ad blocker on the whole room.",
  "You treated this test as a personality audit and scored an immediate extension.",
  "You answered with pure aesthetic confidence and zero supporting documentation.",
  "You are the wild card that makes the dealer nervously shuffle the deck again.",
  "You think outside the box because you never figured out how to open the box.",
  "Your answers suggest you were raised by wolves who had very specific opinions on public transit."
];
var INDIVIDUAL_COMPLIMENTS = [
  "The genuine backbone of this crew. Without you, this lobby would have uninstalled itself.",
  "Remarkable instincts. You see the shortcut three turns before anyone else notices the road.",
  "Unshakeable calm. While the rest of the squad is screaming, you are casually solving the puzzle.",
  "The rare friend who brings both a backup plan and the aux cable.",
  "Razor-sharp intuition. You read the room faster than the room can read itself.",
  "Your logic is clean, grounded, and shockingly immune to peer pressure.",
  "The human anchor keeping this entire chaotic vessel from drifting out to sea.",
  "Effortlessly adaptable. You can vibe with the masterminds and the wildcards alike.",
  "A refreshing dose of sanity in a friend group that routinely tests the laws of probability.",
  "You make tough calls look easy and bad situations look like planned adventures.",
  "Quiet confidence that doesn\u2019t need to shout to take control of the situation.",
  "The friend everyone secretly hopes will take charge when plans start crumbling.",
  "Terrific radar for nonsense. You spot the trap before the door even begins to close.",
  "Pure social glue. You bridge the gap between people who have nothing else in common.",
  "Incredible loyalty. Even when the squad makes a dumb call, you back them up with style.",
  "You have that rare gift of being hilarious without having to force the punchline.",
  "Your instincts are so consistent they could be certified by an international standards board.",
  "The squad\u2019s secret weapon. Underestimate you at their own considerable risk.",
  "A master of improvised solutions. You turn disasters into memorable stories every time.",
  "You bring the exact right energy: bold enough to move forward, smart enough to survive.",
  "Genuinely authentic. You answer for yourself, not for the crowd, and it always pays off.",
  "The kind of friend who remembers the emergency contacts and the inside jokes equally well.",
  "Unfazed by chaos. You operate at room temperature even when the room is on fire.",
  "Great cognitive balance. You know when to think it through and when to trust the hunch.",
  "You keep your promises and your exit strategies equally sharp.",
  "Natural leadership that works through respect and humor rather than bossiness.",
  "The friend who actually reads the map so the rest of the car can look at the scenery.",
  "Sharp wit, zero malice. You keep the banter alive without ever punching down.",
  "A truly distinctive mind. You see angles and possibilities that everyone else walks right past.",
  "Reliable in the crunch. When the timer hits five seconds, your hand never shakes.",
  "The friend who turns an ordinary Tuesday night into an legendary anecdote.",
  "Fiercely independent, yet undeniably fun to have on the roster.",
  "You bring order to madness without draining the fun out of the room.",
  "A grounded presence that makes everyone around you feel ten percent more competent.",
  "You have an uncanny knack for being right while making everyone feel included.",
  "Authentic wildcard energy used exclusively for good and entertainment.",
  "The squad diplomat who can de-escalate an argument without taking sides.",
  "Terrific creative problem solver. You don\u2019t just pick an option; you redefine the premise.",
  "You make everyone around you feel like they are part of the winning team.",
  "Steady hands, clear head, and the patience of an Olympic archery coach.",
  "You possess the rarest squad trait: common sense deployed with a sense of humor.",
  "A genuinely memorable player whose answers gave the whole session its flavor.",
  "The glue that turns a collection of individuals into an actual crew.",
  "High emotional intelligence paired with sharp tactical instincts.",
  "You prove that being thoughtful and being spontaneous don\u2019t have to be enemies."
];
var AXIS_OBSERVATIONS = {
  plan_dominant: [
    "You could schedule an argument three weeks in advance and still send reminder emails.",
    "Everyone in this room has a Google Calendar, but only you treat it as sacred scripture.",
    "Spontaneity has to give you forty-eight hours of written notice to be considered.",
    "You blueprint your downtime with the intensity of an architectural firm.",
    "If a plan goes off course by five minutes, you initiate protocol alpha immediately.",
    "Your backup plans have backup plans that have been peer-reviewed."
  ],
  chaos_dominant: [
    "Nobody here has a plan. Somehow, against all odds, that became the plan.",
    "You treat agendas like suggestions and timetables like abstract poetry.",
    "Your philosophy is simple: why plan ahead when you can panic in real-time?",
    "A squad that operates purely on momentum, adrenaline, and lucky bounces.",
    "If predictability is an art form, you are currently finger-painting on the ceiling.",
    "You don\u2019t look before you leap; you leap, inspect the scenery, and negotiate landing."
  ],
  plan_chaos_split: [
    "Half the crew plans everything. The other half is the reason plans fail.",
    'A civil war between the itinerary enthusiasts and the "let\u2019s see what happens" brigade.',
    "One person is booking the tickets while the other is still debating if the trip exists.",
    "The classic friction: architects building walls, and sparks trying to jump over them.",
    "Every group outing is a delicate hostage negotiation between order and madness."
  ],
  solo_dominant: [
    "A group chat full of people who privately despise group projects.",
    "Everyone brought their own car to the meetup just so they could leave independently.",
    "United in our shared desire to be left alone by approximately ninety percent of humanity.",
    "A squad of lone wolves who occasionally share a clearing in the forest.",
    "You operate best with at least three feet of personal space between your thoughts."
  ],
  crew_dominant: [
    "Nobody here knows how to do anything alone. You operate as a single nervous system.",
    "You order food family-style even when everyone ordered the exact same thing.",
    "You would hold a committee meeting to decide which side of the pavement to walk on.",
    "High collective loyalty: you sink together, swim together, and get lost together.",
    "Separation anxiety sets in the moment someone goes to the counter alone."
  ],
  solo_crew_split: [
    "Two members are trying to coordinate matching outfits; two are actively turning off their location.",
    "A tug-of-war between the collective swarm and the fierce individual contractors.",
    "Half the squad wants a team huddle; the other half is already walking out the door.",
    "You have the team players and the independent operators sharing one tiny cockpit.",
    "A delicate alliance between people who need a crew and people who tolerate company."
  ],
  logic_dominant: [
    "You overthink things professionally and probably have spreadsheets for your hobbies.",
    "Half the crew reads instructions. The other half reads the footnotes of the instructions.",
    "Every decision requires a cost-benefit analysis and a brief moment of silence for math.",
    "You analyse the joke until it stops being funny, then agree that it was technically valid.",
    "High brainpower, heavy overthinking, and a collective allergy to reckless leaps of faith."
  ],
  instinct_dominant: [
    "One bad idea away from a legendary story that you will retell for twenty years.",
    "You don\u2019t read instructions; you become the instructions through trial and error.",
    "Your collective gut feeling is loud, immediate, and rarely backed by hard data.",
    "You run on pure animal instinct and the thrill of avoiding immediate consequences.",
    "If it feels right in the first two seconds, the debate is officially over."
  ],
  logic_instinct_split: [
    "Half the crew reads the map. The other half follows the smell of coffee.",
    "A permanent battle between the calculators and the hunch-followers.",
    'One person asks "what are the odds?" while the other person has already pressed the button.',
    "Brain vs gut: the eternal debate playing out live on every single question.",
    "A balanced tug-of-war between careful deduction and reckless enthusiasm."
  ]
};
var FINAL_CREW_ROASTS = [
  "Friendship is temporary. Group therapy is forever.",
  "You survived this session, but your group chat will never be the same.",
  "A collection of minds that makes perfect sense to nobody except yourselves.",
  "May your plans be as forgiving as your friendship.",
  "You are not a well-oiled machine; you are a shopping trolley with one squeaky wheel that everyone loves.",
  "Four distinct personalities, one shared emergency contact list.",
  "You shouldn\u2019t work as a team on paper, yet here you are defying workplace safety laws.",
  "Proof that you don\u2019t need common sense when you have common loyalty.",
  "Some crews conquer the world. This crew struggles to agree on parking.",
  "A masterclass in peaceful coexistence with occasional tactical insults.",
  "United by choice, divided by basically every question on this test.",
  "Take care of each other; the outside world is not ready for this combination."
];

// src/shared/crewVerdictEngine.ts
function hashStringToUint32(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function getCrewSyncTier(sync) {
  const clamped = Math.max(0, Math.min(100, Math.round(sync)));
  const found = CREW_SYNC_TIERS.find((t) => clamped >= t.minSync && clamped <= t.maxSync);
  return found ?? CREW_SYNC_TIERS[CREW_SYNC_TIERS.length - 1];
}
function getPairRelationshipTier(sync) {
  const clamped = Math.max(0, Math.min(100, Math.round(sync)));
  const found = PAIRWISE_RELATIONSHIP_TIERS.find((t) => clamped >= t.minSync && clamped <= t.maxSync);
  return found ?? PAIRWISE_RELATIONSHIP_TIERS[PAIRWISE_RELATIONSHIP_TIERS.length - 1];
}
function computeCompleteCrewVerdict(params) {
  const { sessionId, crewSyncPercent, questions, members } = params;
  const k = members.length;
  if (k < 2) {
    throw new Error("Crew verdict requires at least 2 members");
  }
  const sessionSeed = hashStringToUint32(`session:${sessionId}:sync:${crewSyncPercent}`);
  const rng = mulberry32(sessionSeed);
  const tier = getCrewSyncTier(crewSyncPercent);
  const verdictLineIdx = Math.floor(rng() * tier.verdictLines.length);
  const verdictLine = tier.verdictLines[verdictLineIdx];
  const memberPersonalities = members.map((m) => {
    const chosenAxes = [];
    for (const q of questions) {
      const optIdx = m.answers[q.id];
      if (optIdx !== void 0 && q.options[optIdx]?.axes) {
        chosenAxes.push(q.options[optIdx].axes);
      } else {
        chosenAxes.push([0, 0, 0]);
      }
    }
    const axisResult = computePersonality(chosenAxes);
    return {
      memberId: m.memberId,
      nickname: m.nickname,
      isMe: m.isMe,
      axisResult,
      answers: m.answers
    };
  });
  const questionMajorities = [];
  const questionOptionVoters = {};
  for (const q of questions) {
    const counts = [0, 0, 0, 0];
    questionOptionVoters[q.id] = { 0: [], 1: [], 2: [], 3: [] };
    for (const m of members) {
      const opt = m.answers[q.id];
      if (opt !== void 0 && opt >= 0 && opt <= 3) {
        counts[opt]++;
        questionOptionVoters[q.id][opt].push(m.memberId);
      }
    }
    const maxCount = Math.max(...counts);
    const majorityOpt = counts.indexOf(maxCount);
    const hasTie = counts.filter((c) => c === maxCount).length > 1;
    questionMajorities.push({ questionId: q.id, majorityOpt, isSplit: hasTie });
  }
  const memberStats = members.map((m) => {
    let majorityDisagreementCount = 0;
    let loneChoiceCount = 0;
    let extremeAnswerCount = 0;
    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
      const opt = m.answers[q.id];
      const maj = questionMajorities[qIdx];
      if (opt !== void 0 && opt >= 0 && opt <= 3) {
        if (!maj.isSplit && opt !== maj.majorityOpt) {
          majorityDisagreementCount++;
        }
        if (questionOptionVoters[q.id][opt]?.length === 1) {
          loneChoiceCount++;
        }
        const axes = q.options[opt]?.axes;
        if (axes && (Math.abs(axes[0]) >= 2 || Math.abs(axes[1]) >= 2 || Math.abs(axes[2]) >= 2)) {
          extremeAnswerCount++;
        }
      }
    }
    return {
      memberId: m.memberId,
      majorityDisagreementCount,
      loneChoiceCount,
      extremeAnswerCount
    };
  });
  const pairwiseRelationships = [];
  const pairSyncMap = {};
  for (const m of members) {
    pairSyncMap[m.memberId] = {};
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = members[i];
      const b = members[j];
      let matches = 0;
      for (const q of questions) {
        if (a.answers[q.id] !== void 0 && a.answers[q.id] === b.answers[q.id]) {
          matches++;
        }
      }
      const percentage = questions.length > 0 ? Math.round(matches / questions.length * 100) : 0;
      pairSyncMap[a.memberId][b.memberId] = percentage;
      pairSyncMap[b.memberId][a.memberId] = percentage;
      const pTier = getPairRelationshipTier(percentage);
      const pairRng = mulberry32(hashStringToUint32(`pair:${a.memberId}:${b.memberId}:${sessionSeed}`));
      const lineIdx = Math.floor(pairRng() * pTier.lines.length);
      const commentary = pTier.lines[lineIdx];
      pairwiseRelationships.push({
        memberAId: a.memberId,
        memberAName: a.nickname,
        memberBId: b.memberId,
        memberBName: b.nickname,
        matches,
        total: questions.length,
        percentage,
        tierId: pTier.id,
        tierLabel: pTier.label,
        commentary
      });
    }
  }
  pairwiseRelationships.sort((a, b) => b.percentage - a.percentage);
  const memberAvgSync = {};
  for (const m of members) {
    const peers = members.filter((p) => p.memberId !== m.memberId);
    let sum = 0;
    let strongest;
    let weakest;
    for (const p of peers) {
      const s = pairSyncMap[m.memberId][p.memberId] ?? 0;
      sum += s;
      if (!strongest || s > strongest.percentage) {
        strongest = { memberId: p.memberId, nickname: p.nickname, percentage: s };
      }
      if (!weakest || s < weakest.percentage) {
        weakest = { memberId: p.memberId, nickname: p.nickname, percentage: s };
      }
    }
    const avg = peers.length > 0 ? Math.round(sum / peers.length) : crewSyncPercent;
    memberAvgSync[m.memberId] = { avg, strongest, weakest };
  }
  let sumP = 0;
  let sumS = 0;
  let sumL = 0;
  let leftPCount = 0;
  let rightPCount = 0;
  let leftSCount = 0;
  let rightSCount = 0;
  let leftLCount = 0;
  let rightLCount = 0;
  const archetypeCounts = {
    the_architect: 0,
    the_lone_oracle: 0,
    the_dispatcher: 0,
    the_anchor: 0,
    the_rogue_tactician: 0,
    the_free_agent: 0,
    the_plot_twister: 0,
    the_spark: 0
  };
  for (const mp of memberPersonalities) {
    sumP += mp.axisResult.raw[0];
    sumS += mp.axisResult.raw[1];
    sumL += mp.axisResult.raw[2];
    if (mp.axisResult.poles[0] === "PLAN") leftPCount++;
    else rightPCount++;
    if (mp.axisResult.poles[1] === "SOLO") leftSCount++;
    else rightSCount++;
    if (mp.axisResult.poles[2] === "LOGIC") leftLCount++;
    else rightLCount++;
    archetypeCounts[mp.axisResult.archetypeId] = (archetypeCounts[mp.axisResult.archetypeId] || 0) + 1;
  }
  const crewMeanRaw = [sumP / k, sumS / k, sumL / k];
  const toSlider = (raw) => Math.max(0, Math.min(100, Math.round((raw + 14) / 28 * 100)));
  const memberCentroidDistances = {};
  for (const mp of memberPersonalities) {
    const dp = mp.axisResult.raw[0] - crewMeanRaw[0];
    const ds = mp.axisResult.raw[1] - crewMeanRaw[1];
    const dl = mp.axisResult.raw[2] - crewMeanRaw[2];
    const dist = Math.sqrt(dp * dp + ds * ds + dl * dl);
    memberCentroidDistances[mp.memberId] = dist;
  }
  const calcConsensus = (left, right) => {
    const diff = Math.abs(left - right);
    return Math.round(diff / k * 100);
  };
  const consensusP = calcConsensus(leftPCount, rightPCount);
  const consensusS = calcConsensus(leftSCount, rightSCount);
  const consensusL = calcConsensus(leftLCount, rightLCount);
  const pickAxisCommentary = (axis, left, right, consensus) => {
    const axisRng = mulberry32(hashStringToUint32(`axis:${axis}:${sessionSeed}`));
    if (axis === "plan_chaos") {
      if (consensus < 35) {
        return AXIS_OBSERVATIONS.plan_chaos_split[Math.floor(axisRng() * AXIS_OBSERVATIONS.plan_chaos_split.length)];
      }
      return left >= right ? AXIS_OBSERVATIONS.plan_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.plan_dominant.length)] : AXIS_OBSERVATIONS.chaos_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.chaos_dominant.length)];
    }
    if (axis === "solo_crew") {
      if (consensus < 35) {
        return AXIS_OBSERVATIONS.solo_crew_split[Math.floor(axisRng() * AXIS_OBSERVATIONS.solo_crew_split.length)];
      }
      return left >= right ? AXIS_OBSERVATIONS.solo_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.solo_dominant.length)] : AXIS_OBSERVATIONS.crew_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.crew_dominant.length)];
    }
    if (consensus < 35) {
      return AXIS_OBSERVATIONS.logic_instinct_split[Math.floor(axisRng() * AXIS_OBSERVATIONS.logic_instinct_split.length)];
    }
    return left >= right ? AXIS_OBSERVATIONS.logic_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.logic_dominant.length)] : AXIS_OBSERVATIONS.instinct_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.instinct_dominant.length)];
  };
  const findOutliers = (axisIdx, leftCount, rightCount, leftPole, rightPole) => {
    if (Math.abs(leftCount - rightCount) <= 1) return [];
    const minorityPole = leftCount < rightCount ? leftPole : rightPole;
    return memberPersonalities.filter((mp) => mp.axisResult.poles[axisIdx] === minorityPole).map((mp) => mp.nickname);
  };
  const planAxisDetail = {
    axis: "plan_chaos",
    axisName: "Plan vs Chaos",
    leftPole: "PLAN",
    rightPole: "CHAOS",
    leftCount: leftPCount,
    rightCount: rightPCount,
    crewAverageRaw: Math.round(crewMeanRaw[0] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[0]),
    dominantPole: leftPCount >= rightPCount ? "PLAN" : "CHAOS",
    consensusScore: consensusP,
    commentary: pickAxisCommentary("plan_chaos", leftPCount, rightPCount, consensusP),
    outlierMembers: findOutliers(0, leftPCount, rightPCount, "PLAN", "CHAOS")
  };
  const soloAxisDetail = {
    axis: "solo_crew",
    axisName: "Solo vs Crew",
    leftPole: "SOLO",
    rightPole: "CREW",
    leftCount: leftSCount,
    rightCount: rightSCount,
    crewAverageRaw: Math.round(crewMeanRaw[1] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[1]),
    dominantPole: leftSCount >= rightSCount ? "SOLO" : "CREW",
    consensusScore: consensusS,
    commentary: pickAxisCommentary("solo_crew", leftSCount, rightSCount, consensusS),
    outlierMembers: findOutliers(1, leftSCount, rightSCount, "SOLO", "CREW")
  };
  const logicAxisDetail = {
    axis: "logic_instinct",
    axisName: "Logic vs Instinct",
    leftPole: "LOGIC",
    rightPole: "INSTINCT",
    leftCount: leftLCount,
    rightCount: rightLCount,
    crewAverageRaw: Math.round(crewMeanRaw[2] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[2]),
    dominantPole: leftLCount >= rightLCount ? "LOGIC" : "INSTINCT",
    consensusScore: consensusL,
    commentary: pickAxisCommentary("logic_instinct", leftLCount, rightLCount, consensusL),
    outlierMembers: findOutliers(2, leftLCount, rightLCount, "LOGIC", "INSTINCT")
  };
  const axisList = [planAxisDetail, soloAxisDetail, logicAxisDetail].sort(
    (a, b) => b.consensusScore - a.consensusScore
  );
  const strongestAgreement = axisList[0].consensusScore >= 40 ? {
    axisName: axisList[0].axisName,
    pole: axisList[0].dominantPole,
    description: `${axisList[0].dominantPole === axisList[0].leftPole ? axisList[0].leftCount : axisList[0].rightCount} of ${k} players aligned on ${axisList[0].dominantPole}.`
  } : null;
  const biggestDisagreement = axisList[2].consensusScore < 70 ? {
    axisName: axisList[2].axisName,
    splitDescription: `${axisList[2].leftCount} ${axisList[2].leftPole} vs ${axisList[2].rightCount} ${axisList[2].rightPole}`,
    description: `Split evenly down the middle with minimal consensus.`
  } : null;
  let dominantArchetypeId = "the_spark";
  let dominantCount = 0;
  for (const [aId, cnt] of Object.entries(archetypeCounts)) {
    if (cnt > dominantCount) {
      dominantCount = cnt;
      dominantArchetypeId = aId;
    }
  }
  const dominantDef = ARCHETYPES[dominantArchetypeId];
  const dominantCrewArchetype = {
    id: dominantArchetypeId,
    name: dominantDef.name,
    count: dominantCount,
    description: dominantDef.oneLineTrait
  };
  const personalityDynamics = {
    dominantCrewArchetype,
    axes: {
      plan_chaos: planAxisDetail,
      solo_crew: soloAxisDetail,
      logic_instinct: logicAxisDetail
    },
    strongestAgreement,
    biggestDisagreement,
    crewArchetypeDistribution: archetypeCounts
  };
  const awardWinners = [];
  const addAward = (awardId, winnerIds, customExplanation) => {
    if (!winnerIds.length) return;
    const def = CREW_AWARDS_BANK.find((a) => a.id === awardId);
    if (!def) return;
    const nicknames = winnerIds.map(
      (id) => members.find((m) => m.memberId === id)?.nickname ?? "Player"
    );
    awardWinners.push({
      awardId,
      title: def.title,
      icon: def.icon,
      winnerMemberIds: winnerIds,
      winnerNicknames: nicknames,
      explanation: customExplanation || `${nicknames.join(" & ")} earned this title through verified session choices.`
    });
  };
  if (pairwiseRelationships.length > 0) {
    const topPair = pairwiseRelationships[0];
    if (topPair.percentage >= 60) {
      addAward(
        "the_human_mirror",
        [topPair.memberAId, topPair.memberBId],
        `Synchronised at an astounding ${topPair.percentage}% with ${topPair.matches} identical answers.`
      );
    }
  }
  const sortedByExtreme = [...memberStats].sort(
    (a, b) => b.extremeAnswerCount - a.extremeAnswerCount
  );
  if (sortedByExtreme[0].extremeAnswerCount >= 3 && (sortedByExtreme.length === 1 || sortedByExtreme[0].extremeAnswerCount > sortedByExtreme[1].extremeAnswerCount)) {
    addAward(
      "walking_red_flag",
      [sortedByExtreme[0].memberId],
      `Consistently locked in the most anomalous, high-risk answer options in the session.`
    );
  }
  const voiceOfReasonCandidates = memberPersonalities.map((mp) => ({
    memberId: mp.memberId,
    score: -mp.axisResult.raw[0] + -mp.axisResult.raw[2],
    // positive if plan + logic
    pPole: mp.axisResult.poles[0],
    lPole: mp.axisResult.poles[2]
  })).filter((c) => c.pPole === "PLAN" && c.lPole === "LOGIC").sort((a, b) => b.score - a.score);
  if (voiceOfReasonCandidates.length > 0) {
    addAward(
      "the_voice_of_reason",
      [voiceOfReasonCandidates[0].memberId],
      `Anchored the room with cold logic and blueprint-first methodology.`
    );
  }
  const sortedByDistance = Object.entries(memberCentroidDistances).sort((a, b) => b[1] - a[1]);
  if (sortedByDistance.length > 0 && sortedByDistance[0][1] > 3) {
    addAward(
      "the_main_character",
      [sortedByDistance[0][0]],
      `Possessed the most distinct, idiosyncratic personality vector relative to the entire crew.`
    );
  }
  const sortedClosest = Object.entries(memberCentroidDistances).sort((a, b) => a[1] - b[1]);
  if (sortedClosest.length > 0) {
    addAward(
      "the_diplomat",
      [sortedClosest[0][0]],
      `Closest match to the crew's mathematical average on every axis.`
    );
  }
  const wildcardCandidates = memberPersonalities.map((mp) => {
    const balance = Math.abs(mp.axisResult.sliders[0] - 50) + Math.abs(mp.axisResult.sliders[1] - 50) + Math.abs(mp.axisResult.sliders[2] - 50);
    return { memberId: mp.memberId, balance };
  }).sort((a, b) => a.balance - b.balance);
  if (wildcardCandidates.length > 0 && wildcardCandidates[0].balance <= 40) {
    addAward(
      "the_wildcard",
      [wildcardCandidates[0].memberId],
      `Refused to be boxed into predictable habits, keeping the squad guessing.`
    );
  }
  let bestCloneDiff = Infinity;
  let clonePair = null;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const m1 = memberPersonalities[i];
      const m2 = memberPersonalities[j];
      const diff = Math.abs(m1.axisResult.sliders[0] - m2.axisResult.sliders[0]) + Math.abs(m1.axisResult.sliders[1] - m2.axisResult.sliders[1]) + Math.abs(m1.axisResult.sliders[2] - m2.axisResult.sliders[2]);
      if (diff < bestCloneDiff) {
        bestCloneDiff = diff;
        clonePair = [m1.memberId, m2.memberId];
      }
    }
  }
  if (clonePair && bestCloneDiff <= 25) {
    addAward(
      "the_clone",
      clonePair,
      `Shared nearly indistinguishable personality slider positions across all three axes.`
    );
  }
  const sortedContrarians = [...memberStats].sort(
    (a, b) => b.majorityDisagreementCount - a.majorityDisagreementCount
  );
  if (sortedContrarians[0].majorityDisagreementCount >= 3 && (sortedContrarians.length === 1 || sortedContrarians[0].majorityDisagreementCount > sortedContrarians[1].majorityDisagreementCount)) {
    addAward(
      "the_contrarian",
      [sortedContrarians[0].memberId],
      `Broke away from the majority vote on ${sortedContrarians[0].majorityDisagreementCount} separate questions.`
    );
  }
  const sortedTherapists = memberPersonalities.map((mp) => ({
    memberId: mp.memberId,
    totalDev: Math.abs(mp.axisResult.raw[0]) + Math.abs(mp.axisResult.raw[1]) + Math.abs(mp.axisResult.raw[2])
  })).sort((a, b) => a.totalDev - b.totalDev);
  if (sortedTherapists.length > 0 && sortedTherapists[0].totalDev <= 8) {
    addAward(
      "the_therapist",
      [sortedTherapists[0].memberId],
      `Remarkably centered without leaning into extreme poles on any axis.`
    );
  }
  const instigatorCandidates = memberPersonalities.map((mp) => ({
    memberId: mp.memberId,
    score: mp.axisResult.raw[0] + mp.axisResult.raw[2],
    // positive if chaos + instinct
    pPole: mp.axisResult.poles[0],
    lPole: mp.axisResult.poles[2]
  })).filter((c) => c.pPole === "CHAOS" && c.lPole === "INSTINCT").sort((a, b) => b.score - a.score);
  if (instigatorCandidates.length > 0 && instigatorCandidates[0].score >= 6) {
    addAward(
      "the_instigator",
      [instigatorCandidates[0].memberId],
      `The first to embrace high-octane chaos and impulsive choices.`
    );
  }
  const sortedLoneWolf = memberPersonalities.map((mp) => ({ memberId: mp.memberId, soloRaw: mp.axisResult.raw[1] })).sort((a, b) => a.soloRaw - b.soloRaw);
  if (sortedLoneWolf.length > 0 && sortedLoneWolf[0].soloRaw <= -4) {
    addAward(
      "the_lone_wolf",
      [sortedLoneWolf[0].memberId],
      `Consistently preferred independent agency over collective consensus.`
    );
  }
  const glueCandidates = memberPersonalities.map((mp) => ({
    memberId: mp.memberId,
    crewRaw: mp.axisResult.raw[1],
    avgSync: memberAvgSync[mp.memberId]?.avg ?? 0
  })).filter((c) => c.crewRaw >= 2 && c.avgSync >= 55).sort((a, b) => b.avgSync - a.avgSync);
  if (glueCandidates.length > 0) {
    addAward(
      "the_glue",
      [glueCandidates[0].memberId],
      `United high collective loyalty with top-tier synchronization with fellow teammates.`
    );
  }
  const usedRoastIndices = /* @__PURE__ */ new Set();
  const usedCompIndices = /* @__PURE__ */ new Set();
  const playerAnalyses = members.map((m, mIdx) => {
    const mp = memberPersonalities.find((p) => p.memberId === m.memberId);
    const stats = memberStats.find((s) => s.memberId === m.memberId);
    const avgInfo = memberAvgSync[m.memberId];
    const centroidDist = memberCentroidDistances[m.memberId] ?? 0;
    let labelId = "the_unpredictable_one";
    if (avgInfo.avg >= 70 && mp.axisResult.poles[1] === "CREW") {
      labelId = "crew_glue";
    } else if (avgInfo.avg <= 35 && stats.loneChoiceCount >= 2) {
      labelId = "the_outsider";
    } else if (stats.extremeAnswerCount >= 3 && mp.axisResult.poles[0] === "CHAOS") {
      labelId = "the_chaos_engine";
    } else if (centroidDist <= 2.2) {
      labelId = "the_diplomat";
    } else if (mp.axisResult.poles[0] === "PLAN" && mp.axisResult.poles[2] === "LOGIC") {
      labelId = "the_voice_of_reason";
    } else if (avgInfo.strongest && avgInfo.strongest.percentage >= 80) {
      labelId = "the_human_mirror";
    } else if (stats.majorityDisagreementCount >= 3) {
      labelId = "the_wildcard";
    } else {
      labelId = "the_unpredictable_one";
    }
    const labelDef = INDIVIDUAL_LABELS[labelId];
    const playerSeed = hashStringToUint32(`player:${m.memberId}:${sessionSeed}`);
    const playerRng = mulberry32(playerSeed);
    let roastIdx = Math.floor(playerRng() * INDIVIDUAL_ROASTS.length);
    let attempts = 0;
    while (usedRoastIndices.has(roastIdx) && attempts < INDIVIDUAL_ROASTS.length) {
      roastIdx = (roastIdx + 1) % INDIVIDUAL_ROASTS.length;
      attempts++;
    }
    usedRoastIndices.add(roastIdx);
    const roast = INDIVIDUAL_ROASTS[roastIdx];
    let compIdx = Math.floor(playerRng() * INDIVIDUAL_COMPLIMENTS.length);
    attempts = 0;
    while (usedCompIndices.has(compIdx) && attempts < INDIVIDUAL_COMPLIMENTS.length) {
      compIdx = (compIdx + 1) % INDIVIDUAL_COMPLIMENTS.length;
      attempts++;
    }
    usedCompIndices.add(compIdx);
    const compliment = INDIVIDUAL_COMPLIMENTS[compIdx];
    const arch = ARCHETYPES[mp.axisResult.archetypeId];
    const observation = `${arch.name}: ${arch.oneLineTrait}. ${mp.axisResult.poles[0] === "PLAN" ? "Favours planned structure" : "Leans into spontaneous chaos"} and ${mp.axisResult.poles[2] === "LOGIC" ? "analytical clarity" : "raw instinctive gut reads"}.`;
    const awardsReceived = awardWinners.filter((w) => w.winnerMemberIds.includes(m.memberId)).map((w) => ({
      id: w.awardId,
      title: w.title,
      icon: w.icon,
      explanation: w.explanation
    }));
    return {
      memberId: m.memberId,
      nickname: m.nickname,
      isMe: m.isMe,
      archetypeId: mp.axisResult.archetypeId,
      archetypeName: arch.name,
      axisResult: mp.axisResult,
      averagePairSync: avgInfo.avg,
      strongestPartner: avgInfo.strongest,
      weakestPartner: avgInfo.weakest,
      individualLabel: {
        id: labelDef.id,
        title: labelDef.title,
        description: labelDef.description
      },
      roast,
      compliment,
      observation,
      awardsReceived,
      distanceFromCrewMean: Math.round(centroidDist * 10) / 10,
      loneChoiceCount: stats.loneChoiceCount,
      extremeAnswerCount: stats.extremeAnswerCount,
      majorityDisagreementCount: stats.majorityDisagreementCount
    };
  });
  const finalRoastIdx = Math.floor(rng() * FINAL_CREW_ROASTS.length);
  const finalCrewRoast = FINAL_CREW_ROASTS[finalRoastIdx];
  return {
    syncPercent: crewSyncPercent,
    tier: {
      id: tier.id,
      title: tier.title,
      shortDesc: tier.shortDesc,
      crewDiagnosis: tier.crewDiagnosis,
      verdictLine,
      tone: tier.tone,
      badgeColor: tier.badgeColor,
      accentGlow: tier.accentGlow
    },
    finalCrewRoast,
    personalityDynamics,
    playerAnalyses,
    pairwiseRelationships,
    awards: awardWinners
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
  const qRowMap = new Map(qRows.map((r) => [r.id, r]));
  const recMap = new Map(answerRecords.map((r) => [r.question_id, r]));
  const chosenAxes = answerRecords.map((rec) => {
    const qRow = qRowMap.get(rec.question_id);
    if (!qRow) return [0, 0, 0];
    const opts = JSON.parse(qRow.options);
    const chosen = opts?.[rec.option_index];
    return chosen ? chosen.axes : [0, 0, 0];
  });
  const axisResult = computePersonality(chosenAxes);
  const archetypeDef = ARCHETYPES[run.archetype_id];
  const verdicts = loadVerdicts();
  const band = getRarityBand(run.total_points);
  const verdict = verdicts.soloVerdicts[run.archetype_id][band];
  const packLine = verdicts.packLines[run.pack_id]?.[run.archetype_id] ?? null;
  const questionBreakdown = questionIds.map((qid) => {
    const qRow = qRowMap.get(qid);
    const rec = recMap.get(qid);
    const chosenIdx = rec ? rec.option_index : 0;
    const voteCounts = getVoteCounts(db, qid);
    const totalVotes = voteCounts[0] + voteCounts[1] + voteCounts[2] + voteCounts[3];
    const qOptions = qRow ? JSON.parse(qRow.options) : [];
    const options = qOptions.map((opt, idx) => {
      const votes = voteCounts[idx] ?? 0;
      const smoothedP = computeSmoothedShare(votes, totalVotes);
      let tier;
      if (totalVotes < 5) {
        tier = "PROVISIONAL";
      } else if (totalVotes < 15) {
        if (smoothedP >= 0.35) tier = "FAMILIAR";
        else if (smoothedP >= 0.22) tier = "UNUSUAL";
        else tier = "OUTLIER";
      } else {
        if (smoothedP >= 0.35) tier = "FAMILIAR";
        else if (smoothedP >= 0.22) tier = "UNUSUAL";
        else if (smoothedP >= 0.12) tier = "OUTLIER";
        else tier = "WILDCARD";
      }
      const meta = TIER_META[tier];
      const points = idx === chosenIdx && rec?.points != null ? rec.points : meta.points;
      const percentage = totalVotes > 0 ? Math.round(votes / totalVotes * 100) : null;
      return {
        optionIndex: idx,
        text: opt.text,
        points,
        tier: idx === chosenIdx && rec?.tier ? rec.tier : tier,
        tierColor: meta.color,
        percentage,
        votes,
        isChosen: idx === chosenIdx
      };
    });
    return {
      questionId: qid,
      prompt: qRow ? qRow.prompt : "",
      chosenIndex: chosenIdx,
      chosenPoints: rec?.points ?? options[chosenIdx]?.points ?? 0,
      chosenTier: rec?.tier ?? options[chosenIdx]?.tier ?? "FAMILIAR",
      options
    };
  });
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
    answerRecords,
    questionBreakdown
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
  if (mode === "themed" && packId && packId !== "the_mix") {
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
    const themedPicked = [...fresh, ...seenOldestFirst, ...remaining];
    if (themedPicked.length >= 7) {
      return themedPicked.slice(0, 7);
    }
    const fallbackRows = db.prepare(
      `SELECT id FROM questions WHERE status = 'published' AND id NOT IN (${themedPicked.map(() => "?").join(",") || "''"}) ORDER BY id ASC`
    ).all(...themedPicked);
    return [...themedPicked, ...fisherYatesShuffle(fallbackRows.map((r) => r.id), rng)].slice(0, 7);
  }
  const rows = db.prepare(
    `SELECT id, pack_id FROM questions WHERE status = 'published' AND pack_id != 'the_mix' ORDER BY id ASC`
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
    const rawBoard = computeCrewBoard({
      questions: publicQuestions,
      completedMembers: scoringInputs,
      squadRoasts: verdicts.squadRoasts
    });
    const mindTwinsList = rawBoard.awards?.mindTwins ? rawBoard.awards.mindTwins.pairs.map((p) => ({
      names: [p.memberAName, p.memberBName],
      matches: rawBoard.awards?.mindTwins?.matches ?? 0,
      percent: rawBoard.awards?.mindTwins?.percentage ?? 0
    })) : [];
    const commonGroundList = rawBoard.awards?.commonGround ? [
      {
        prompt: rawBoard.awards.commonGround.prompt,
        agreement: rawBoard.awards.commonGround.agreementPercent
      }
    ] : [];
    const civilWarList = rawBoard.awards?.civilWar ? [
      {
        prompt: rawBoard.awards.civilWar.prompt,
        agreement: rawBoard.awards.civilWar.agreementPercent
      }
    ] : [];
    const loneSignalObj = rawBoard.awards?.loneSignal ? {
      member: { nickname: rawBoard.awards.loneSignal.nickname },
      soloChoices: rawBoard.awards.loneSignal.loneCount
    } : null;
    let completeVerdict = null;
    try {
      if (crew.verdict_payload) {
        completeVerdict = JSON.parse(crew.verdict_payload);
      } else {
        const questionsWithAxes = qRows.map((q) => {
          const opts = JSON.parse(q.options);
          return {
            id: q.id,
            prompt: q.prompt,
            options: opts.map((opt) => ({
              text: opt.text,
              axes: opt.axes
            }))
          };
        });
        completeVerdict = computeCompleteCrewVerdict({
          sessionId: crew.id,
          crewSyncPercent: rawBoard.crewSyncPercent,
          questions: questionsWithAxes,
          members: scoringInputs.map((si) => ({
            memberId: si.memberId,
            nickname: si.nickname,
            isMe: si.isMe,
            answers: si.answers
          }))
        });
        db.prepare("UPDATE crews SET verdict_payload = ? WHERE id = ?").run(
          JSON.stringify(completeVerdict),
          crew.id
        );
      }
    } catch (verdictErr) {
      console.error("Failed to compute or cache crew verdict:", verdictErr);
    }
    board = {
      ...rawBoard,
      verdict: completeVerdict,
      sync: rawBoard.crewSyncPercent,
      roast: {
        ...rawBoard.roast,
        headline: completeVerdict?.tier.title || rawBoard.roast.title,
        line: completeVerdict?.tier.verdictLine || rawBoard.roast.line
      },
      members: rawBoard.members.map((m) => ({
        ...m,
        score: m.totalScore
      })),
      pairs: rawBoard.pairwise.map((p) => ({
        ...p,
        names: [p.memberAName, p.memberBName],
        percent: p.percentage
      })),
      questions: rawBoard.questionBreakdowns.map((q) => ({
        ...q,
        agreement: q.agreementPercent,
        counts: q.options.map((o) => o.count)
      })),
      mindTwins: mindTwinsList,
      commonGround: commonGroundList,
      civilWar: civilWarList,
      loneSignal: loneSignalObj,
      perfectSync: rawBoard.twoPlayerSummary?.perfectSyncQuestions ?? []
    };
  }
  return {
    completed: meCompleted,
    memberCount: members.length,
    completedCount: completedMembers.length,
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
      createdAt: crew.created_at,
      questions: publicQuestions,
      completed: meCompleted
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
  app.post("/api/crews/:code/join", (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).json({ error: "Invalid crew code" });
      return;
    }
    const deviceId = resolveDeviceId(req, res, req.body?.deviceId);
    const nickname = typeof req.body?.nickname === "string" ? req.body.nickname : void 0;
    try {
      const state = submitCrewAnswer(db, { code, deviceId, nickname });
      res.json({ deviceId, ...state });
    } catch (err) {
      const status = err.statusCode ?? 400;
      const message = err instanceof Error ? err.message : "Failed to join crew";
      res.status(status).json({ error: message });
    }
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
