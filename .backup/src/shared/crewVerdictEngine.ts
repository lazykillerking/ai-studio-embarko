import { ARCHETYPES, computePersonality } from './archetypes';
import {
  AXIS_OBSERVATIONS,
  CREW_AWARDS_BANK,
  CREW_SYNC_TIERS,
  FINAL_CREW_ROASTS,
  INDIVIDUAL_COMPLIMENTS,
  INDIVIDUAL_LABELS,
  INDIVIDUAL_ROASTS,
  PAIRWISE_RELATIONSHIP_TIERS,
} from './crewCommentaryBank';
import type {
  CompleteCrewVerdict,
  CrewAwardId,
  CrewAwardWinner,
  CrewPersonalityDynamics,
  CrewSyncTierDef,
  IndividualLabelId,
  PairRelationshipTierDef,
  PairwiseRelationshipAnalysis,
  PlayerVerdictAnalysis,
} from './crewVerdictTypes';
import { mulberry32 } from './scoring';
import type { ArchetypeId, PublicQuestion } from './types';

export interface CrewMemberVerdictInput {
  memberId: string;
  nickname: string;
  isMe: boolean;
  answers: Record<string, number>;
}

export interface QuestionWithAxes {
  id: string;
  prompt: string;
  options: {
    text: string;
    axes?: [number, number, number];
  }[];
}

/**
 * Deterministic hash of string to uint32 for seeding.
 */
export function hashStringToUint32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Determine the Crew Sync Tier based on crew sync percentage (0..100).
 */
export function getCrewSyncTier(sync: number): CrewSyncTierDef {
  const clamped = Math.max(0, Math.min(100, Math.round(sync)));
  const found = CREW_SYNC_TIERS.find((t) => clamped >= t.minSync && clamped <= t.maxSync);
  return found ?? CREW_SYNC_TIERS[CREW_SYNC_TIERS.length - 1];
}

/**
 * Determine the Pairwise Relationship Tier based on pair sync percentage (0..100).
 */
export function getPairRelationshipTier(sync: number): PairRelationshipTierDef {
  const clamped = Math.max(0, Math.min(100, Math.round(sync)));
  const found = PAIRWISE_RELATIONSHIP_TIERS.find((t) => clamped >= t.minSync && clamped <= t.maxSync);
  return found ?? PAIRWISE_RELATIONSHIP_TIERS[PAIRWISE_RELATIONSHIP_TIERS.length - 1];
}

/**
 * Compute the complete crew verdict and personality roast analysis.
 * Deterministic for the same session answers and questions.
 */
export function computeCompleteCrewVerdict(params: {
  sessionId: string;
  crewSyncPercent: number;
  questions: QuestionWithAxes[];
  members: CrewMemberVerdictInput[];
}): CompleteCrewVerdict {
  const { sessionId, crewSyncPercent, questions, members } = params;
  const k = members.length;
  if (k < 2) {
    throw new Error('Crew verdict requires at least 2 members');
  }

  // 1. Session-level deterministic PRNG
  const sessionSeed = hashStringToUint32(`session:${sessionId}:sync:${crewSyncPercent}`);
  const rng = mulberry32(sessionSeed);

  // Pick tier & verdict line
  const tier = getCrewSyncTier(crewSyncPercent);
  const verdictLineIdx = Math.floor(rng() * tier.verdictLines.length);
  const verdictLine = tier.verdictLines[verdictLineIdx];

  // 2. Compute individual personalities (axes & archetypes) using existing computePersonality
  const memberPersonalities = members.map((m) => {
    const chosenAxes: [number, number, number][] = [];
    for (const q of questions) {
      const optIdx = m.answers[q.id];
      if (optIdx !== undefined && q.options[optIdx]?.axes) {
        chosenAxes.push(q.options[optIdx].axes!);
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
      answers: m.answers,
    };
  });

  // 3. Question-level agreement & majority analysis
  const questionMajorities: { questionId: string; majorityOpt: number; isSplit: boolean }[] = [];
  const questionOptionVoters: Record<string, Record<number, string[]>> = {};

  for (const q of questions) {
    const counts: number[] = [0, 0, 0, 0];
    questionOptionVoters[q.id] = { 0: [], 1: [], 2: [], 3: [] };
    for (const m of members) {
      const opt = m.answers[q.id];
      if (opt !== undefined && opt >= 0 && opt <= 3) {
        counts[opt]++;
        questionOptionVoters[q.id][opt].push(m.memberId);
      }
    }
    const maxCount = Math.max(...counts);
    const majorityOpt = counts.indexOf(maxCount);
    // Is it a tie split?
    const hasTie = counts.filter((c) => c === maxCount).length > 1;
    questionMajorities.push({ questionId: q.id, majorityOpt, isSplit: hasTie });
  }

  // Count majority disagreements and lone choices per member
  const memberStats = members.map((m) => {
    let majorityDisagreementCount = 0;
    let loneChoiceCount = 0;
    let extremeAnswerCount = 0;

    for (let qIdx = 0; qIdx < questions.length; qIdx++) {
      const q = questions[qIdx];
      const opt = m.answers[q.id];
      const maj = questionMajorities[qIdx];
      if (opt !== undefined && opt >= 0 && opt <= 3) {
        if (!maj.isSplit && opt !== maj.majorityOpt) {
          majorityDisagreementCount++;
        }
        if (questionOptionVoters[q.id][opt]?.length === 1) {
          loneChoiceCount++;
        }
        // Extreme answers: options with high vector magnitude (|raw| >= 2 on any axis)
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
      extremeAnswerCount,
    };
  });

  // 4. Pairwise Analysis (Matrix & Relationships)
  const pairwiseRelationships: PairwiseRelationshipAnalysis[] = [];
  const pairSyncMap: Record<string, Record<string, number>> = {};
  for (const m of members) {
    pairSyncMap[m.memberId] = {};
  }

  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = members[i];
      const b = members[j];
      let matches = 0;
      for (const q of questions) {
        if (a.answers[q.id] !== undefined && a.answers[q.id] === b.answers[q.id]) {
          matches++;
        }
      }
      const percentage = questions.length > 0 ? Math.round((matches / questions.length) * 100) : 0;
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
        commentary,
      });
    }
  }

  pairwiseRelationships.sort((a, b) => b.percentage - a.percentage);

  // 5. Calculate Average Pairwise Sync per member
  const memberAvgSync: Record<string, { avg: number; strongest?: any; weakest?: any }> = {};
  for (const m of members) {
    const peers = members.filter((p) => p.memberId !== m.memberId);
    let sum = 0;
    let strongest: { memberId: string; nickname: string; percentage: number } | undefined;
    let weakest: { memberId: string; nickname: string; percentage: number } | undefined;

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

  // 6. Crew Personality Dynamics (3-axis breakdown & crew centroid)
  let sumP = 0;
  let sumS = 0;
  let sumL = 0;
  let leftPCount = 0;
  let rightPCount = 0;
  let leftSCount = 0;
  let rightSCount = 0;
  let leftLCount = 0;
  let rightLCount = 0;

  const archetypeCounts: Record<ArchetypeId, number> = {
    the_architect: 0,
    the_lone_oracle: 0,
    the_dispatcher: 0,
    the_anchor: 0,
    the_rogue_tactician: 0,
    the_free_agent: 0,
    the_plot_twister: 0,
    the_spark: 0,
  };

  for (const mp of memberPersonalities) {
    sumP += mp.axisResult.raw[0];
    sumS += mp.axisResult.raw[1];
    sumL += mp.axisResult.raw[2];

    if (mp.axisResult.poles[0] === 'PLAN') leftPCount++;
    else rightPCount++;

    if (mp.axisResult.poles[1] === 'SOLO') leftSCount++;
    else rightSCount++;

    if (mp.axisResult.poles[2] === 'LOGIC') leftLCount++;
    else rightLCount++;

    archetypeCounts[mp.axisResult.archetypeId] = (archetypeCounts[mp.axisResult.archetypeId] || 0) + 1;
  }

  const crewMeanRaw: [number, number, number] = [sumP / k, sumS / k, sumL / k];
  const toSlider = (raw: number) => Math.max(0, Math.min(100, Math.round(((raw + 14) / 28) * 100)));

  // Distance from crew centroid for each member
  const memberCentroidDistances: Record<string, number> = {};
  for (const mp of memberPersonalities) {
    const dp = mp.axisResult.raw[0] - crewMeanRaw[0];
    const ds = mp.axisResult.raw[1] - crewMeanRaw[1];
    const dl = mp.axisResult.raw[2] - crewMeanRaw[2];
    const dist = Math.sqrt(dp * dp + ds * ds + dl * dl);
    memberCentroidDistances[mp.memberId] = dist;
  }

  // Axis Consensus Scores (100 = all members on same pole, 0 = 50/50 split)
  const calcConsensus = (left: number, right: number) => {
    const diff = Math.abs(left - right);
    return Math.round((diff / k) * 100);
  };
  const consensusP = calcConsensus(leftPCount, rightPCount);
  const consensusS = calcConsensus(leftSCount, rightSCount);
  const consensusL = calcConsensus(leftLCount, rightLCount);

  // Axis commentary selection
  const pickAxisCommentary = (
    axis: 'plan_chaos' | 'solo_crew' | 'logic_instinct',
    left: number,
    right: number,
    consensus: number
  ) => {
    const axisRng = mulberry32(hashStringToUint32(`axis:${axis}:${sessionSeed}`));
    if (axis === 'plan_chaos') {
      if (consensus < 35) {
        return AXIS_OBSERVATIONS.plan_chaos_split[
          Math.floor(axisRng() * AXIS_OBSERVATIONS.plan_chaos_split.length)
        ];
      }
      return left >= right
        ? AXIS_OBSERVATIONS.plan_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.plan_dominant.length)]
        : AXIS_OBSERVATIONS.chaos_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.chaos_dominant.length)];
    }
    if (axis === 'solo_crew') {
      if (consensus < 35) {
        return AXIS_OBSERVATIONS.solo_crew_split[
          Math.floor(axisRng() * AXIS_OBSERVATIONS.solo_crew_split.length)
        ];
      }
      return left >= right
        ? AXIS_OBSERVATIONS.solo_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.solo_dominant.length)]
        : AXIS_OBSERVATIONS.crew_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.crew_dominant.length)];
    }
    // logic_instinct
    if (consensus < 35) {
      return AXIS_OBSERVATIONS.logic_instinct_split[
        Math.floor(axisRng() * AXIS_OBSERVATIONS.logic_instinct_split.length)
      ];
    }
    return left >= right
      ? AXIS_OBSERVATIONS.logic_dominant[Math.floor(axisRng() * AXIS_OBSERVATIONS.logic_dominant.length)]
      : AXIS_OBSERVATIONS.instinct_dominant[
          Math.floor(axisRng() * AXIS_OBSERVATIONS.instinct_dominant.length)
        ];
  };

  // Find axis outliers
  const findOutliers = (
    axisIdx: 0 | 1 | 2,
    leftCount: number,
    rightCount: number,
    leftPole: string,
    rightPole: string
  ) => {
    if (Math.abs(leftCount - rightCount) <= 1) return [];
    const minorityPole = leftCount < rightCount ? leftPole : rightPole;
    return memberPersonalities
      .filter((mp) => mp.axisResult.poles[axisIdx] === minorityPole)
      .map((mp) => mp.nickname);
  };

  const planAxisDetail = {
    axis: 'plan_chaos' as const,
    axisName: 'Plan vs Chaos',
    leftPole: 'PLAN',
    rightPole: 'CHAOS',
    leftCount: leftPCount,
    rightCount: rightPCount,
    crewAverageRaw: Math.round(crewMeanRaw[0] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[0]),
    dominantPole: leftPCount >= rightPCount ? 'PLAN' : 'CHAOS',
    consensusScore: consensusP,
    commentary: pickAxisCommentary('plan_chaos', leftPCount, rightPCount, consensusP),
    outlierMembers: findOutliers(0, leftPCount, rightPCount, 'PLAN', 'CHAOS'),
  };

  const soloAxisDetail = {
    axis: 'solo_crew' as const,
    axisName: 'Solo vs Crew',
    leftPole: 'SOLO',
    rightPole: 'CREW',
    leftCount: leftSCount,
    rightCount: rightSCount,
    crewAverageRaw: Math.round(crewMeanRaw[1] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[1]),
    dominantPole: leftSCount >= rightSCount ? 'SOLO' : 'CREW',
    consensusScore: consensusS,
    commentary: pickAxisCommentary('solo_crew', leftSCount, rightSCount, consensusS),
    outlierMembers: findOutliers(1, leftSCount, rightSCount, 'SOLO', 'CREW'),
  };

  const logicAxisDetail = {
    axis: 'logic_instinct' as const,
    axisName: 'Logic vs Instinct',
    leftPole: 'LOGIC',
    rightPole: 'INSTINCT',
    leftCount: leftLCount,
    rightCount: rightLCount,
    crewAverageRaw: Math.round(crewMeanRaw[2] * 10) / 10,
    crewAverageSlider: toSlider(crewMeanRaw[2]),
    dominantPole: leftLCount >= rightLCount ? 'LOGIC' : 'INSTINCT',
    consensusScore: consensusL,
    commentary: pickAxisCommentary('logic_instinct', leftLCount, rightLCount, consensusL),
    outlierMembers: findOutliers(2, leftLCount, rightLCount, 'LOGIC', 'INSTINCT'),
  };

  // Strongest agreement and biggest disagreement
  const axisList = [planAxisDetail, soloAxisDetail, logicAxisDetail].sort(
    (a, b) => b.consensusScore - a.consensusScore
  );

  const strongestAgreement =
    axisList[0].consensusScore >= 40
      ? {
          axisName: axisList[0].axisName,
          pole: axisList[0].dominantPole,
          description: `${axisList[0].dominantPole === axisList[0].leftPole ? axisList[0].leftCount : axisList[0].rightCount} of ${k} players aligned on ${axisList[0].dominantPole}.`,
        }
      : null;

  const biggestDisagreement =
    axisList[2].consensusScore < 70
      ? {
          axisName: axisList[2].axisName,
          splitDescription: `${axisList[2].leftCount} ${axisList[2].leftPole} vs ${axisList[2].rightCount} ${axisList[2].rightPole}`,
          description: `Split evenly down the middle with minimal consensus.`,
        }
      : null;

  // Dominant crew archetype
  let dominantArchetypeId: ArchetypeId = 'the_spark';
  let dominantCount = 0;
  for (const [aId, cnt] of Object.entries(archetypeCounts) as [ArchetypeId, number][]) {
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
    description: dominantDef.oneLineTrait,
  };

  const personalityDynamics: CrewPersonalityDynamics = {
    dominantCrewArchetype,
    axes: {
      plan_chaos: planAxisDetail,
      solo_crew: soloAxisDetail,
      logic_instinct: logicAxisDetail,
    },
    strongestAgreement,
    biggestDisagreement,
    crewArchetypeDistribution: archetypeCounts,
  };

  // 7. Crew Awards Calculation
  const awardWinners: CrewAwardWinner[] = [];

  // Helper to add award if winner exists
  const addAward = (
    awardId: CrewAwardId,
    winnerIds: string[],
    customExplanation?: string
  ) => {
    if (!winnerIds.length) return;
    const def = CREW_AWARDS_BANK.find((a) => a.id === awardId);
    if (!def) return;
    const nicknames = winnerIds.map(
      (id) => members.find((m) => m.memberId === id)?.nickname ?? 'Player'
    );
    awardWinners.push({
      awardId,
      title: def.title,
      icon: def.icon,
      winnerMemberIds: winnerIds,
      winnerNicknames: nicknames,
      explanation:
        customExplanation || `${nicknames.join(' & ')} earned this title through verified session choices.`,
    });
  };

  // 1. The Human Mirror: highest pairwise sync with another player
  if (pairwiseRelationships.length > 0) {
    const topPair = pairwiseRelationships[0];
    if (topPair.percentage >= 60) {
      addAward(
        'the_human_mirror',
        [topPair.memberAId, topPair.memberBId],
        `Synchronised at an astounding ${topPair.percentage}% with ${topPair.matches} identical answers.`
      );
    }
  }

  // 2. Walking Red Flag: highest extreme answers (>= 3 extreme answers)
  const sortedByExtreme = [...memberStats].sort(
    (a, b) => b.extremeAnswerCount - a.extremeAnswerCount
  );
  if (
    sortedByExtreme[0].extremeAnswerCount >= 3 &&
    (sortedByExtreme.length === 1 ||
      sortedByExtreme[0].extremeAnswerCount > sortedByExtreme[1].extremeAnswerCount)
  ) {
    addAward(
      'walking_red_flag',
      [sortedByExtreme[0].memberId],
      `Consistently locked in the most anomalous, high-risk answer options in the session.`
    );
  }

  // 3. The Voice of Reason: highest Plan + Logic score (raw[0] < 0 and raw[2] < 0)
  const voiceOfReasonCandidates = memberPersonalities
    .map((mp) => ({
      memberId: mp.memberId,
      score: -mp.axisResult.raw[0] + -mp.axisResult.raw[2], // positive if plan + logic
      pPole: mp.axisResult.poles[0],
      lPole: mp.axisResult.poles[2],
    }))
    .filter((c) => c.pPole === 'PLAN' && c.lPole === 'LOGIC')
    .sort((a, b) => b.score - a.score);
  if (voiceOfReasonCandidates.length > 0) {
    addAward(
      'the_voice_of_reason',
      [voiceOfReasonCandidates[0].memberId],
      `Anchored the room with cold logic and blueprint-first methodology.`
    );
  }

  // 4. The Main Character: highest centroid distance
  const sortedByDistance = Object.entries(memberCentroidDistances).sort((a, b) => b[1] - a[1]);
  if (sortedByDistance.length > 0 && sortedByDistance[0][1] > 3.0) {
    addAward(
      'the_main_character',
      [sortedByDistance[0][0]],
      `Possessed the most distinct, idiosyncratic personality vector relative to the entire crew.`
    );
  }

  // 5. The Diplomat: lowest centroid distance
  const sortedClosest = Object.entries(memberCentroidDistances).sort((a, b) => a[1] - b[1]);
  if (sortedClosest.length > 0) {
    addAward(
      'the_diplomat',
      [sortedClosest[0][0]],
      `Closest match to the crew's mathematical average on every axis.`
    );
  }

  // 6. The Wildcard: balanced poles & high variance across answers
  const wildcardCandidates = memberPersonalities
    .map((mp) => {
      const balance =
        Math.abs(mp.axisResult.sliders[0] - 50) +
        Math.abs(mp.axisResult.sliders[1] - 50) +
        Math.abs(mp.axisResult.sliders[2] - 50);
      return { memberId: mp.memberId, balance };
    })
    .sort((a, b) => a.balance - b.balance);
  if (wildcardCandidates.length > 0 && wildcardCandidates[0].balance <= 40) {
    addAward(
      'the_wildcard',
      [wildcardCandidates[0].memberId],
      `Refused to be boxed into predictable habits, keeping the squad guessing.`
    );
  }

  // 7. The Clone: lowest pairwise difference in 3-axis vectors
  let bestCloneDiff = Infinity;
  let clonePair: [string, string] | null = null;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const m1 = memberPersonalities[i];
      const m2 = memberPersonalities[j];
      const diff =
        Math.abs(m1.axisResult.sliders[0] - m2.axisResult.sliders[0]) +
        Math.abs(m1.axisResult.sliders[1] - m2.axisResult.sliders[1]) +
        Math.abs(m1.axisResult.sliders[2] - m2.axisResult.sliders[2]);
      if (diff < bestCloneDiff) {
        bestCloneDiff = diff;
        clonePair = [m1.memberId, m2.memberId];
      }
    }
  }
  if (clonePair && bestCloneDiff <= 25) {
    addAward(
      'the_clone',
      clonePair,
      `Shared nearly indistinguishable personality slider positions across all three axes.`
    );
  }

  // 8. The Contrarian: most majority disagreements
  const sortedContrarians = [...memberStats].sort(
    (a, b) => b.majorityDisagreementCount - a.majorityDisagreementCount
  );
  if (
    sortedContrarians[0].majorityDisagreementCount >= 3 &&
    (sortedContrarians.length === 1 ||
      sortedContrarians[0].majorityDisagreementCount >
        sortedContrarians[1].majorityDisagreementCount)
  ) {
    addAward(
      'the_contrarian',
      [sortedContrarians[0].memberId],
      `Broke away from the majority vote on ${sortedContrarians[0].majorityDisagreementCount} separate questions.`
    );
  }

  // 9. The Therapist: most balanced across all 3 axes (sum of |raw| lowest)
  const sortedTherapists = memberPersonalities
    .map((mp) => ({
      memberId: mp.memberId,
      totalDev:
        Math.abs(mp.axisResult.raw[0]) +
        Math.abs(mp.axisResult.raw[1]) +
        Math.abs(mp.axisResult.raw[2]),
    }))
    .sort((a, b) => a.totalDev - b.totalDev);
  if (sortedTherapists.length > 0 && sortedTherapists[0].totalDev <= 8) {
    addAward(
      'the_therapist',
      [sortedTherapists[0].memberId],
      `Remarkably centered without leaning into extreme poles on any axis.`
    );
  }

  // 10. The Instigator: highest Chaos + Instinct
  const instigatorCandidates = memberPersonalities
    .map((mp) => ({
      memberId: mp.memberId,
      score: mp.axisResult.raw[0] + mp.axisResult.raw[2], // positive if chaos + instinct
      pPole: mp.axisResult.poles[0],
      lPole: mp.axisResult.poles[2],
    }))
    .filter((c) => c.pPole === 'CHAOS' && c.lPole === 'INSTINCT')
    .sort((a, b) => b.score - a.score);
  if (instigatorCandidates.length > 0 && instigatorCandidates[0].score >= 6) {
    addAward(
      'the_instigator',
      [instigatorCandidates[0].memberId],
      `The first to embrace high-octane chaos and impulsive choices.`
    );
  }

  // 11. The Lone Wolf: lowest solo_crew raw (most negative raw[1])
  const sortedLoneWolf = memberPersonalities
    .map((mp) => ({ memberId: mp.memberId, soloRaw: mp.axisResult.raw[1] }))
    .sort((a, b) => a.soloRaw - b.soloRaw);
  if (sortedLoneWolf.length > 0 && sortedLoneWolf[0].soloRaw <= -4) {
    addAward(
      'the_lone_wolf',
      [sortedLoneWolf[0].memberId],
      `Consistently preferred independent agency over collective consensus.`
    );
  }

  // 12. The Glue: high crew orientation (raw[1] >= 2) and high avg pairwise sync
  const glueCandidates = memberPersonalities
    .map((mp) => ({
      memberId: mp.memberId,
      crewRaw: mp.axisResult.raw[1],
      avgSync: memberAvgSync[mp.memberId]?.avg ?? 0,
    }))
    .filter((c) => c.crewRaw >= 2 && c.avgSync >= 55)
    .sort((a, b) => b.avgSync - a.avgSync);
  if (glueCandidates.length > 0) {
    addAward(
      'the_glue',
      [glueCandidates[0].memberId],
      `United high collective loyalty with top-tier synchronization with fellow teammates.`
    );
  }

  // 8. Individual Player Analysis (Labels, Roasts, Compliments, Observations)
  const usedRoastIndices = new Set<number>();
  const usedCompIndices = new Set<number>();

  const playerAnalyses: PlayerVerdictAnalysis[] = members.map((m, mIdx) => {
    const mp = memberPersonalities.find((p) => p.memberId === m.memberId)!;
    const stats = memberStats.find((s) => s.memberId === m.memberId)!;
    const avgInfo = memberAvgSync[m.memberId];
    const centroidDist = memberCentroidDistances[m.memberId] ?? 0;

    // Determine individual label based on exact eligibility rules:
    let labelId: IndividualLabelId = 'the_unpredictable_one';
    if (avgInfo.avg >= 70 && mp.axisResult.poles[1] === 'CREW') {
      labelId = 'crew_glue';
    } else if (avgInfo.avg <= 35 && stats.loneChoiceCount >= 2) {
      labelId = 'the_outsider';
    } else if (stats.extremeAnswerCount >= 3 && mp.axisResult.poles[0] === 'CHAOS') {
      labelId = 'the_chaos_engine';
    } else if (centroidDist <= 2.2) {
      labelId = 'the_diplomat';
    } else if (mp.axisResult.poles[0] === 'PLAN' && mp.axisResult.poles[2] === 'LOGIC') {
      labelId = 'the_voice_of_reason';
    } else if (avgInfo.strongest && avgInfo.strongest.percentage >= 80) {
      labelId = 'the_human_mirror';
    } else if (stats.majorityDisagreementCount >= 3) {
      labelId = 'the_wildcard';
    } else {
      labelId = 'the_unpredictable_one';
    }

    const labelDef = INDIVIDUAL_LABELS[labelId];

    // Pick non-repeating Roast & Compliment deterministically
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

    // Personality observation based on archetype + axis tendency
    const arch = ARCHETYPES[mp.axisResult.archetypeId];
    const observation = `${arch.name}: ${arch.oneLineTrait}. ${
      mp.axisResult.poles[0] === 'PLAN' ? 'Favours planned structure' : 'Leans into spontaneous chaos'
    } and ${
      mp.axisResult.poles[2] === 'LOGIC' ? 'analytical clarity' : 'raw instinctive gut reads'
    }.`;

    // Awards won by this member
    const awardsReceived = awardWinners
      .filter((w) => w.winnerMemberIds.includes(m.memberId))
      .map((w) => ({
        id: w.awardId,
        title: w.title,
        icon: w.icon,
        explanation: w.explanation,
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
        description: labelDef.description,
      },
      roast,
      compliment,
      observation,
      awardsReceived,
      distanceFromCrewMean: Math.round(centroidDist * 10) / 10,
      loneChoiceCount: stats.loneChoiceCount,
      extremeAnswerCount: stats.extremeAnswerCount,
      majorityDisagreementCount: stats.majorityDisagreementCount,
    };
  });

  // 9. Final Crew Roast
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
      accentGlow: tier.accentGlow,
    },
    finalCrewRoast,
    personalityDynamics,
    playerAnalyses,
    pairwiseRelationships,
    awards: awardWinners,
  };
}
