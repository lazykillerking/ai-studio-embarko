import type {
  CrewBoardPayload,
  CrewPairScore,
  CrewQuestionBreakdown,
  PublicQuestion,
  RarityBand,
  SampleGate,
  StatRevealPayload,
  TierName,
} from './types';

export const SCORING_VERSION = 1;

export const TIER_META: Record<TierName, { color: string; points: number; label: string }> = {
  PROVISIONAL: { color: '#94A3B8', points: 20, label: 'PROVISIONAL' },
  FAMILIAR: { color: '#38BDF8', points: 5, label: 'FAMILIAR' },
  UNUSUAL: { color: '#34D399', points: 20, label: 'UNUSUAL' },
  OUTLIER: { color: '#FBBF24', points: 45, label: 'OUTLIER' },
  WILDCARD: { color: '#F43F5E', points: 80, label: 'WILDCARD' },
};

const TIER_ONE_LINERS: Record<TierName, string[]> = {
  PROVISIONAL: [
    'Early beacon locked. You are calibrating this signal for the next wave.',
    'Fresh frequency logged. The crowd map is still forming around you.',
    'First-wave transmission recorded. Pure signal, zero herd noise.',
  ],
  FAMILIAR: [
    'Right on the main frequency. Plenty of minds took this exact turn.',
    'Classic instinct. You and the crowd share a well-paved shortcut.',
    'High-traffic choice. Reliable signal with zero friction.',
  ],
  UNUSUAL: [
    'Nice detour. You stepped off the default path without going off-grid.',
    'Distinctive call. Most players walked right past that door.',
    'Sharp side-channel pick. Definitely not the autopilot answer.',
  ],
  OUTLIER: [
    'Rare frequency detected. Only a sliver of minds went this route.',
    'Bold zig while the lobby zagged. Certified contrarian radar.',
    'Deep-cut decision. Almost nobody saw that line coming.',
  ],
  WILDCARD: [
    'Total anomaly! Barely anyone on Earth pressed that button.',
    'Off-the-charts signal. You practically own this wavelength solo.',
    'Pure wildcard energy. You broke away from the entire crowd.',
  ],
};

/**
 * Mulberry32 deterministic PRNG.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic Fisher-Yates shuffle returning a new array.
 */
export function fisherYatesShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Compute daily set exclusion window: min(3, floor(poolSize/7) - 1), clamped at >= 0.
 */
export function getDailyExclusionWindow(poolSize: number): number {
  return Math.max(0, Math.min(3, Math.floor(poolSize / 7) - 1));
}

/**
 * Selects 7 question IDs deterministically given sorted published IDs, seed,
 * recently used IDs from previous days, and optional launchSetMode.
 */
export function selectDailyQuestionIds(params: {
  publishedIdsSortedAsc: string[];
  publishedIdsBySortOrder: string[];
  seedUint32: number;
  excludedIds: Set<string>;
  launchSetMode: boolean;
}): string[] {
  const {
    publishedIdsSortedAsc,
    publishedIdsBySortOrder,
    seedUint32,
    excludedIds,
    launchSetMode,
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

/**
 * Selects 7 question IDs for The Mix (aggregate selection mode across all eligible published packs):
 * - Balances across available packs (avoids picking all 7 from one theme)
 * - Allows multiple questions per pack (capped at balanced threshold)
 * - Deterministic given seedUint32
 * - Never repeats a question in the same session
 * - Avoids recently seen questions where sufficient inventory exists
 */
export function selectTheMixQuestionIds(params: {
  publishedQuestions: { id: string; pack_id: string; sort_order: number }[];
  seedUint32: number;
  excludedIds: Set<string>;
  launchSetMode: boolean;
}): string[] {
  const { publishedQuestions, seedUint32, excludedIds, launchSetMode } = params;

  if (launchSetMode) {
    const packs = [...new Set(publishedQuestions.map((q) => q.pack_id))].sort();
    const byPack = new Map<string, typeof publishedQuestions>();
    for (const p of packs) {
      byPack.set(
        p,
        publishedQuestions
          .filter((q) => q.pack_id === p)
          .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      );
    }
    const picked: string[] = [];
    let round = 0;
    while (picked.length < 7) {
      let addedInRound = 0;
      for (const p of packs) {
        if (picked.length >= 7) break;
        const list = byPack.get(p) ?? [];
        if (round < list.length) {
          picked.push(list[round].id);
          addedInRound++;
        }
      }
      if (addedInRound === 0) break;
      round++;
    }
    return picked.slice(0, 7);
  }

  const rng = mulberry32(seedUint32);
  const byPack = new Map<string, typeof publishedQuestions>();
  for (const q of publishedQuestions) {
    if (!byPack.has(q.pack_id)) byPack.set(q.pack_id, []);
    byPack.get(q.pack_id)!.push(q);
  }

  const packIds = [...byPack.keys()].sort();
  if (packIds.length === 0) return [];

  const shuffledByPack = new Map<string, typeof publishedQuestions>();
  for (const [p, list] of byPack.entries()) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    shuffledByPack.set(p, fisherYatesShuffle(sorted, rng));
  }

  // Balance cap: e.g. for 4 packs, ceil(7/4) = 2. Max 2 questions per pack on initial pass.
  // For 2 packs, ceil(7/2) = 4.
  const maxPerPack = Math.max(2, Math.ceil(7 / packIds.length));
  const picked: string[] = [];
  const pickedSet = new Set<string>();
  const packCounts: Record<string, number> = {};
  for (const p of packIds) packCounts[p] = 0;

  // Pass 1: Fresh questions (not in excludedIds)
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

  // Pass 2: Fallback to excluded questions if inventory runs low
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

  // Pass 3: If still under 7 (e.g. strict maxPerPack blocked it), relax maxPerPack
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

/**
 * Smoothed share p = (c_i + 1) / (N + 4).
 */
export function computeSmoothedShare(chosenVotes: number, totalVotes: number): number {
  return (chosenVotes + 1) / (totalVotes + 4);
}

/**
 * Classifies a Solo answer respecting mandatory sample-size gates:
 * - N < 5: PROVISIONAL (20 pts), no percentages, no Wildcard
 * - 5 <= N < 15: EARLY_SIGNAL, smoothed p capped at OUTLIER (max 45 pts)
 * - N >= 15: FULL, observed percentages + all 4 tiers unlocked
 */
export function evaluateSoloAnswer(params: {
  questionId: string;
  optionTexts: string[];
  chosenIndex: number;
  voteCounts: [number, number, number, number];
}): StatRevealPayload {
  const { questionId, optionTexts, chosenIndex, voteCounts } = params;
  const totalVotes = voteCounts[0] + voteCounts[1] + voteCounts[2] + voteCounts[3];
  const chosenVotes = voteCounts[chosenIndex] ?? 0;
  const smoothedP = computeSmoothedShare(chosenVotes, totalVotes);

  let gate: SampleGate;
  let tier: TierName;
  let statusLine: string;
  let showPercentages: boolean;

  if (totalVotes < 5) {
    gate = 'FIRST_WAVE';
    tier = 'PROVISIONAL';
    statusLine = `FIRST WAVE SIGNAL — Building the crowd picture (${totalVotes} of 5 needed)`;
    showPercentages = false;
  } else if (totalVotes < 15) {
    gate = 'EARLY_SIGNAL';
    if (smoothedP >= 0.35) tier = 'FAMILIAR';
    else if (smoothedP >= 0.22) tier = 'UNUSUAL';
    else tier = 'OUTLIER'; // Capped at OUTLIER below N = 15
    statusLine = `EARLY SIGNAL — Based on ${totalVotes} players`;
    showPercentages = false;
  } else {
    gate = 'FULL';
    if (smoothedP >= 0.35) tier = 'FAMILIAR';
    else if (smoothedP >= 0.22) tier = 'UNUSUAL';
    else if (smoothedP >= 0.12) tier = 'OUTLIER';
    else tier = 'WILDCARD';
    statusLine = `Based on ${totalVotes} players`;
    showPercentages = true;
  }

  const meta = TIER_META[tier];
  const lines = TIER_ONE_LINERS[tier];
  // Deterministic pick based on questionId + chosenIndex
  let hash = chosenIndex;
  for (let i = 0; i < questionId.length; i++) {
    hash = (hash * 31 + questionId.charCodeAt(i)) >>> 0;
  }
  const oneLiner = lines[hash % lines.length];

  const bars = [0, 1, 2, 3].map((idx) => {
    const votes = voteCounts[idx] ?? 0;
    const pct = showPercentages && totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : null;
    const approxRatio =
      totalVotes > 0 ? computeSmoothedShare(votes, totalVotes) : 0.25;
    return {
      optionIndex: idx,
      text: optionTexts[idx] ?? `Option ${idx + 1}`,
      votes,
      percentage: pct,
      approxRatio,
      isChosen: idx === chosenIndex,
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
    bars,
  };
}

export function getScoreTitle(totalPoints: number): string {
  if (totalPoints <= 95) return 'The Familiar Mind';
  if (totalPoints <= 165) return 'The Steady Signal';
  if (totalPoints <= 245) return 'The Unconventional';
  if (totalPoints <= 335) return 'The Maverick';
  return 'The Wildcard Mind';
}

export function getRarityBand(totalPoints: number): RarityBand {
  if (totalPoints <= 165) return 'low';
  if (totalPoints <= 245) return 'mid';
  return 'high';
}

export interface CrewScoringMemberInput {
  memberId: string;
  nickname: string;
  isMe: boolean;
  answers: Record<string, number>;
}

export interface SquadRoastTable {
  high: { title: string; line: string };
  mid: { title: string; line: string };
  low: { title: string; line: string };
}

/**
 * Server-side Crew scoring engine for k >= 2 completed members.
 */
export function computeCrewBoard(params: {
  questions: PublicQuestion[];
  completedMembers: CrewScoringMemberInput[];
  squadRoasts: SquadRoastTable;
}): CrewBoardPayload {
  const { questions, completedMembers, squadRoasts } = params;
  const k = completedMembers.length;
  if (k < 2) {
    throw new Error('Crew scoring requires at least 2 completed members');
  }

  const totalPairs = (k * (k - 1)) / 2;
  const perQuestionScoresByMember: Record<string, number[]> = {};
  const loneCountByMember: Record<string, number> = {};
  for (const m of completedMembers) {
    perQuestionScoresByMember[m.memberId] = [];
    loneCountByMember[m.memberId] = 0;
  }

  const questionBreakdowns: CrewQuestionBreakdown[] = [];
  const questionAgreements: number[] = [];

  for (const q of questions) {
    const buckets: CrewScoringMemberInput[][] = [[], [], [], []];
    for (const m of completedMembers) {
      const opt = m.answers[q.id];
      if (opt !== undefined && opt >= 0 && opt <= 3) {
        buckets[opt].push(m);
      }
    }

    let matchingPairs = 0;
    for (let optIdx = 0; optIdx < 4; optIdx++) {
      const n = buckets[optIdx].length;
      matchingPairs += (n * (n - 1)) / 2;
    }

    const agreement = totalPairs > 0 ? (matchingPairs / totalPairs) * 100 : 0;
    questionAgreements.push(agreement);

    for (const m of completedMembers) {
      const opt = m.answers[q.id];
      if (opt === undefined || opt < 0 || opt > 3) {
        perQuestionScoresByMember[m.memberId].push(0);
        continue;
      }
      const groupSize = buckets[opt].length;
      const othersSame = groupSize - 1;
      const qScore = Math.round((100 * othersSame) / (k - 1));
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
          isMe: m.isMe,
        })),
      })),
    });
  }

  const meanAgreement =
    questionAgreements.length > 0
      ? questionAgreements.reduce((s, v) => s + v, 0) / questionAgreements.length
      : 0;
  const crewSyncPercent = Math.round(meanAgreement);

  const roast =
    crewSyncPercent >= 70
      ? squadRoasts.high
      : crewSyncPercent >= 40
        ? squadRoasts.mid
        : squadRoasts.low;

  const members = completedMembers
    .map((m) => {
      const scores = perQuestionScoresByMember[m.memberId];
      const totalScore = scores.reduce((a, b) => a + b, 0);
      return {
        memberId: m.memberId,
        nickname: m.nickname,
        isMe: m.isMe,
        totalScore,
        maxScore: questions.length * 100,
        perQuestionScores: scores,
        loneCount: loneCountByMember[m.memberId],
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname));

  // Pairwise matrix
  const pairwise: CrewPairScore[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = completedMembers[i];
      const b = completedMembers[j];
      let matches = 0;
      for (const q of questions) {
        if (a.answers[q.id] !== undefined && a.answers[q.id] === b.answers[q.id]) {
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
        percentage: questions.length > 0 ? Math.round((matches / questions.length) * 100) : 0,
      });
    }
  }
  pairwise.sort((a, b) => b.matches - a.matches);

  // Awards: k = 2 vs k >= 3
  let twoPlayerSummary: CrewBoardPayload['twoPlayerSummary'] = null;
  let awards: CrewBoardPayload['awards'] = null;

  if (k === 2) {
    const perfectSyncQuestions: { index: number; prompt: string; chosenText: string }[] = [];
    const splitDecisionQuestions: {
      index: number;
      prompt: string;
      choices: { nickname: string; text: string }[];
    }[] = [];

    questions.forEach((q, idx) => {
      const m0 = completedMembers[0];
      const m1 = completedMembers[1];
      const a0 = m0.answers[q.id];
      const a1 = m1.answers[q.id];
      if (a0 !== undefined && a0 === a1) {
        perfectSyncQuestions.push({
          index: idx + 1,
          prompt: q.prompt,
          chosenText: q.options[a0]?.text ?? '',
        });
      } else {
        splitDecisionQuestions.push({
          index: idx + 1,
          prompt: q.prompt,
          choices: [
            { nickname: m0.nickname, text: q.options[a0]?.text ?? '—' },
            { nickname: m1.nickname, text: q.options[a1]?.text ?? '—' },
          ],
        });
      }
    });

    twoPlayerSummary = {
      perfectSyncQuestions,
      splitDecisionQuestions,
    };
  } else {
    // k >= 3 awards
    const maxMatches = Math.max(...pairwise.map((p) => p.matches));
    const topPairs = pairwise.filter((p) => p.matches === maxMatches);
    const mindTwins = {
      matches: maxMatches,
      percentage: questions.length > 0 ? Math.round((maxMatches / questions.length) * 100) : 0,
      pairs: topPairs.map((p) => ({
        memberAName: p.memberAName,
        memberBName: p.memberBName,
      })),
    };

    // Common Ground: highest A (first in order on ties)
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
      isPerfectSync: Math.abs(bestA - 100) < 1e-9,
    };

    // Civil War: lowest A, only if strictly < 100
    let worstIdx = 0;
    for (let i = 1; i < questionAgreements.length; i++) {
      if (questionAgreements[i] < questionAgreements[worstIdx]) {
        worstIdx = i;
      }
    }
    const worstA = questionAgreements[worstIdx];
    const civilWar =
      worstA < 100 - 1e-9
        ? {
            questionIndex: worstIdx + 1,
            prompt: questions[worstIdx].prompt,
            agreementPercent: Math.round(worstA),
          }
        : null;

    // Lone Signal: strictly unique max loneCount > 0
    const sortedLone = [...completedMembers]
      .map((m) => ({ nickname: m.nickname, loneCount: loneCountByMember[m.memberId] }))
      .sort((a, b) => b.loneCount - a.loneCount);
    const loneSignal =
      sortedLone.length >= 2 &&
      sortedLone[0].loneCount > 0 &&
      sortedLone[0].loneCount > sortedLone[1].loneCount
        ? sortedLone[0]
        : null;

    awards = {
      mindTwins,
      commonGround,
      civilWar,
      loneSignal,
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
    awards,
  };
}
