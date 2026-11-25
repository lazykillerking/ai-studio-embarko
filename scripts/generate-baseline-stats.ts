import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { loadPackFiles, resolveProjectRoot } from '../src/server/db';
import type { QuestionRecord } from '../src/shared/types';

function hashString(str: string): number {
  const buf = crypto.createHash('sha256').update(str).digest();
  return buf.readUInt32BE(0);
}

export interface QuestionBaseline {
  questionId: string;
  packId: string;
  totalVotes: number;
  votes: [number, number, number, number];
  percentages: [number, number, number, number];
  tiers: string[];
}

const RECKLESS_WORDS = [
  'panic', 'freeze', 'shcream', 'scream', 'fight', 'chaos', 'dumb', 'reckless', 'confront',
  'punch', 'bribe', 'steal', 'shady', 'cheat', 'unbothered', 'ignore', 'blind', 'stragglers',
  'lie', 'fake', 'revenge', 'vanish', 'bail', 'run away', 'crime', 'overnight', 'wing'
];

const SENSIBLE_WORDS = [
  'plan', 'help', 'check', 'verify', 'ask', 'talk', 'team', 'carefully', 'prepare',
  'fastest', 'support', 'listen', 'map', 'resolve', 'protect', 'investigate', 'study',
  'call', 'discuss', 'organize', 'safety', 'friend', 'solution'
];

export function calculateQuestionBaseline(q: QuestionRecord): QuestionBaseline {
  const qHash = hashString(q.id);
  const absHash = Math.abs(qHash);
  // Total sample size strictly > 55 (between 65 and 220)
  const totalVotes = 65 + (absHash % 156);

  // Score each option
  const rawScores = q.options.map((opt, idx) => {
    let score = 100;
    const textLower = opt.text.toLowerCase();

    // Axes impact: plan/logic vs chaos/instinct
    const [planChaos, soloCrew, logicInstinct] = opt.axes || [0, 0, 0];
    
    // High chaos reduces probability
    score -= planChaos * 22;
    // High instinct/impulse reduces probability
    score -= logicInstinct * 14;
    // Positive crew increases probability
    score += soloCrew * 8;

    // Extreme axes magnitude penalty
    const magnitude = Math.abs(planChaos) + Math.abs(soloCrew) + Math.abs(logicInstinct);
    if (magnitude <= 3) score += 20; // Moderate responses are more widely chosen
    if (magnitude >= 6) score -= 25; // Extreme responses are picked by fewer people

    // Word cues
    for (const rw of RECKLESS_WORDS) {
      if (textLower.includes(rw)) score -= 25;
    }
    for (const sw of SENSIBLE_WORDS) {
      if (textLower.includes(sw)) score += 20;
    }

    // Small deterministic variation per option
    const optHash = Math.abs(hashString(q.id + ':' + idx));
    score += (optHash % 15) - 7;

    return Math.max(15, score);
  });

  // Rank the options from highest weight to lowest weight
  const indexed = rawScores.map((score, idx) => ({ idx, score }));
  indexed.sort((a, b) => b.score - a.score);

  // Target percentages based on ranks:
  // Rank 0 (Most probable): 44% - 50%
  // Rank 1 (Second probable): 26% - 31%
  // Rank 2 (Uncommon): 14% - 19%
  // Rank 3 (Rare / chaotic): 6% - 10%
  const rank3Pct = 6 + (absHash % 5); // 6% - 10%
  const rank2Pct = 14 + ((absHash >> 3) % 6); // 14% - 19%
  const rank1Pct = 26 + ((absHash >> 6) % 6); // 26% - 31%
  const rank0Pct = 100 - (rank1Pct + rank2Pct + rank3Pct); // 44% - 50%

  const targetPcts = [rank0Pct, rank1Pct, rank2Pct, rank3Pct];
  const votes: [number, number, number, number] = [0, 0, 0, 0];

  for (let r = 0; r < 4; r++) {
    const origIdx = indexed[r].idx;
    votes[origIdx] = Math.max(1, Math.round((totalVotes * targetPcts[r]) / 100));
  }

  // Ensure exact totalVotes sum by adjusting the highest rank (most probable)
  const currentSum = votes[0] + votes[1] + votes[2] + votes[3];
  const diff = totalVotes - currentSum;
  votes[indexed[0].idx] += diff;

  // Compute exact observed percentages
  const percentages: [number, number, number, number] = [
    Math.round((votes[0] / totalVotes) * 100),
    Math.round((votes[1] / totalVotes) * 100),
    Math.round((votes[2] / totalVotes) * 100),
    Math.round((votes[3] / totalVotes) * 100),
  ];

  // Derive tiers (FAMILIAR >= 35%, UNUSUAL >= 22%, OUTLIER >= 12%, WILDCARD < 12%)
  const tiers = percentages.map((p) => {
    if (p >= 35) return 'FAMILIAR';
    if (p >= 22) return 'UNUSUAL';
    if (p >= 12) return 'OUTLIER';
    return 'WILDCARD';
  });

  return {
    questionId: q.id,
    packId: q.pack_id,
    totalVotes,
    votes,
    percentages,
    tiers,
  };
}

export function generateAllBaselines(): Record<string, QuestionBaseline> {
  const packs = loadPackFiles();
  const allBaselines: Record<string, QuestionBaseline> = {};

  for (const p of packs) {
    for (const q of p.questions) {
      allBaselines[q.id] = calculateQuestionBaseline(q);
    }
  }

  return allBaselines;
}

if (process.argv[1]?.endsWith('generate-baseline-stats.ts')) {
  const baselines = generateAllBaselines();
  const count = Object.keys(baselines).length;
  const outPath = path.resolve(resolveProjectRoot(), 'data', 'question_baseline_stats.json');
  fs.writeFileSync(outPath, JSON.stringify(baselines, null, 2), 'utf8');
  console.log(`Successfully generated baseline stats for ${count} questions -> ${outPath}`);

  // Print sample check
  const sampleKeys = Object.keys(baselines).slice(0, 5);
  for (const k of sampleKeys) {
    const b = baselines[k];
    console.log(`\nQ [${b.questionId}] (${b.packId}) Total Players: ${b.totalVotes}`);
    for (let i = 0; i < 4; i++) {
      console.log(`  Opt ${i}: ${b.votes[i]} votes (${b.percentages[i]}%) [${b.tiers[i]}]`);
    }
  }
}
