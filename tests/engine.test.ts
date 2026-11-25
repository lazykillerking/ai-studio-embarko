import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { computePersonality } from '../src/shared/archetypes';
import {
  SCORING_VERSION,
  computeCrewBoard,
  computeSmoothedShare,
  evaluateSoloAnswer,
  getScoreTitle,
} from '../src/shared/scoring';
import type { PublicQuestion } from '../src/shared/types';
import { loadVerdicts, openDatabase, seedPacksAndQuestions } from '../src/server/db';
import {
  getDailySoloState,
  getOrCreateDailySet,
  getVoteCounts,
  submitSoloAnswer,
} from '../src/server/solo';
import { createCrew, getCrewState, submitCrewAnswer } from '../src/server/crew';
import { AnswerRateLimiter, escapeHtml, sanitizeUserText } from '../src/server/security';

function makeTestDb(options?: { withBaseStats?: boolean }) {
  const db = openDatabase(':memory:');
  seedPacksAndQuestions(db, { skipBaseStats: !options?.withBaseStats });
  return db;
}

describe('1. Daily determinism, exclusion window & LAUNCH_SET_MODE', () => {
  it('returns identical 7 questions in the same order across devices on the same UTC date', () => {
    const db = makeTestDb();
    const devA = crypto.randomUUID();
    const devB = crypto.randomUUID();

    const stateA = getDailySoloState(db, 'the_mix', devA, '2026-11-22');
    const stateB = getDailySoloState(db, 'the_mix', devB, '2026-11-22');
    expect(stateA?.questions.map((q) => q.id)).toEqual(stateB?.questions.map((q) => q.id));
    expect(stateA?.questions).toHaveLength(7);
    db.close();
  });

  it('excludes previous day questions and differs across consecutive UTC dates', () => {
    const db = makeTestDb();
    // Pool size = 15 -> min(3, floor(15/7)-1) = 1 day exclusion window
    const day1 = getOrCreateDailySet(db, 'neon_coast', '2026-11-20', false);
    const day2 = getOrCreateDailySet(db, 'neon_coast', '2026-11-21', false);

    expect(day1).toHaveLength(7);
    expect(day2).toHaveLength(7);
    const day1Set = new Set(day1);
    // With 15 questions and 1-day exclusion (8 eligible), day2 must have 0 overlap with day1!
    for (const id of day2) {
      expect(day1Set.has(id)).toBe(false);
    }
    db.close();
  });

  it('LAUNCH_SET_MODE=true pins the first 7 published questions for every date', () => {
    const db = makeTestDb();
    const d1 = getOrCreateDailySet(db, 'campus_chaos', '2026-11-20', true);
    const d2 = getOrCreateDailySet(db, 'campus_chaos', '2026-12-05', true);
    expect(d1).toEqual(['cc_001', 'cc_002', 'cc_003', 'cc_004', 'cc_005', 'cc_006', 'cc_007']);
    expect(d2).toEqual(d1);
    db.close();
  });
});

describe('2. Sample-size gates (N = 0 to 20), tiers & immutability', () => {
  const optTexts = ['A', 'B', 'C', 'D'];

  it('enforces FIRST_WAVE (N < 5), EARLY_SIGNAL (5..14, OUTLIER cap), and FULL (N >= 15)', () => {
    // N = 1..4 -> PROVISIONAL, 20 pts, no percentages, never WILDCARD
    for (let n = 1; n <= 4; n++) {
      const res = evaluateSoloAnswer({
        questionId: 'tm_001',
        optionTexts: optTexts,
        chosenIndex: 0,
        voteCounts: [1, n - 1, 0, 0],
      });
      expect(res.gate).toBe('FIRST_WAVE');
      expect(res.tier).toBe('PROVISIONAL');
      expect(res.points).toBe(20);
      expect(res.showPercentages).toBe(false);
      expect(res.bars.every((b) => b.percentage === null)).toBe(true);
      expect(res.statusLine).toContain(`${n} of 5 needed`);
    }

    // N = 5..14 -> EARLY_SIGNAL, capped at OUTLIER even if p < 0.12
    for (let n = 5; n <= 14; n++) {
      const rare = evaluateSoloAnswer({
        questionId: 'tm_001',
        optionTexts: optTexts,
        chosenIndex: 0,
        voteCounts: [1, n - 1, 0, 0],
      });
      expect(rare.gate).toBe('EARLY_SIGNAL');
      expect(rare.tier).not.toBe('WILDCARD');
      expect(rare.showPercentages).toBe(false);
      expect(rare.statusLine).toContain(`Based on ${n} players`);

      // At N=14 with c_0=1, p = 2/18 = 0.111 < 0.12, STILL capped at OUTLIER!
      if (n === 14) {
        expect(computeSmoothedShare(1, 14)).toBeLessThan(0.12);
        expect(rare.tier).toBe('OUTLIER');
        expect(rare.points).toBe(45);
      }
    }

    // N = 15..20 -> FULL, observed percentages shown, WILDCARD unlocked when p < 0.12
    for (let n = 15; n <= 20; n++) {
      const wildcard = evaluateSoloAnswer({
        questionId: 'tm_001',
        optionTexts: optTexts,
        chosenIndex: 0,
        voteCounts: [1, n - 1, 0, 0],
      });
      expect(wildcard.gate).toBe('FULL');
      expect(wildcard.tier).toBe('WILDCARD');
      expect(wildcard.points).toBe(80);
      expect(wildcard.showPercentages).toBe(true);
      expect(wildcard.bars[0].percentage).toBe(Math.round((1 / n) * 100));

      const familiar = evaluateSoloAnswer({
        questionId: 'tm_001',
        optionTexts: optTexts,
        chosenIndex: 1,
        voteCounts: [1, n - 1, 0, 0],
      });
      expect(familiar.tier).toBe('FAMILIAR');
      expect(familiar.points).toBe(5);
    }
  });

  it('keeps finished Solo runs immutable when crowd shifts later, and deduplicates population_votes', () => {
    const db = makeTestDb();
    const date = '2026-11-22';
    const qIds = getOrCreateDailySet(db, 'the_mix', date, true);

    // Player 1 completes when N = 1 (all PROVISIONAL -> 7 * 20 = 140 pts)
    const p1 = crypto.randomUUID();
    for (const qid of qIds) {
      submitSoloAnswer(db, { deviceId: p1, packId: 'the_mix', date, questionId: qid, optionIndex: 0 });
    }
    const p1Before = getDailySoloState(db, 'the_mix', p1, date);
    expect(p1Before?.completed).toBe(true);
    expect(p1Before?.finalResult?.totalPoints).toBe(140);
    expect(p1Before?.finalResult?.scoringVersion).toBe(SCORING_VERSION);
    expect(p1Before?.finalResult?.questionBreakdown).toHaveLength(7);
    expect(p1Before?.finalResult?.questionBreakdown?.[0].options).toHaveLength(4);
    expect(p1Before?.finalResult?.questionBreakdown?.[0].chosenIndex).toBe(0);
    expect(p1Before?.finalResult?.questionBreakdown?.[0].chosenPoints).toBe(20);

    // 20 more players vote option 1 on every question, shifting crowd heavily
    for (let i = 0; i < 20; i++) {
      const pid = crypto.randomUUID();
      for (const qid of qIds) {
        submitSoloAnswer(db, { deviceId: pid, packId: 'the_mix', date, questionId: qid, optionIndex: 1 });
      }
    }

    // Player 1's finished run must NOT change!
    const p1After = getDailySoloState(db, 'the_mix', p1, date);
    expect(p1After?.finalResult?.totalPoints).toBe(140);
    expect(p1After?.answerRecords.every((r) => r.tier === 'PROVISIONAL' && r.points === 20)).toBe(true);

    // Repeat submission on Q1 is idempotent
    const repeat = submitSoloAnswer(db, {
      deviceId: p1,
      packId: 'the_mix',
      date,
      questionId: qIds[0],
      optionIndex: 2,
    });
    expect(repeat.reveal.tier).toBe('PROVISIONAL');
    expect(repeat.reveal.points).toBe(20);
    expect(repeat.answerRecords).toHaveLength(7);

    // Same device playing same question on another day does NOT insert a second population_votes row
    const targetQid = qIds.find((id) => getOrCreateDailySet(db, 'the_mix', '2026-11-26').includes(id)) ?? qIds[0];
    submitSoloAnswer(db, {
      deviceId: p1,
      packId: 'the_mix',
      date: '2026-11-26',
      questionId: targetQid,
      optionIndex: 3,
    });
    const { cnt } = db
      .prepare('SELECT COUNT(*) as cnt FROM population_votes WHERE device_id = ? AND question_id = ?')
      .get(p1, targetQid) as { cnt: number };
    expect(cnt).toBe(1);

    // Score titles check
    expect(getScoreTitle(80)).toBe('The Familiar Mind');
    expect(getScoreTitle(140)).toBe('The Steady Signal');
    expect(getScoreTitle(200)).toBe('The Unconventional');
    expect(getScoreTitle(300)).toBe('The Maverick');
    expect(getScoreTitle(400)).toBe('The Wildcard Mind');
    db.close();
  });
});

describe('3. Personality engine & tie-breaks', () => {
  it('breaks raw === 0 ties using Question 7 sign, and defaults to right pole if Q7 is also 0', () => {
    // Sum is [0, 0, 0]; Q7 is [-1, 1, 0] -> PLAN, CREW, INSTINCT -> THE ANCHOR
    const res1 = computePersonality([
      [1, -1, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [-1, 1, 0],
    ]);
    expect(res1.raw).toEqual([0, 0, 0]);
    expect(res1.sliders).toEqual([50, 50, 50]);
    expect(res1.poles).toEqual(['PLAN', 'CREW', 'INSTINCT']);
    expect(res1.archetypeId).toBe('the_anchor');

    // Sum is [0, 0, 0]; Q7 is [0, 0, 0] -> CHAOS, CREW, INSTINCT -> THE SPARK
    const res2 = computePersonality([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(res2.poles).toEqual(['CHAOS', 'CREW', 'INSTINCT']);
    expect(res2.archetypeId).toBe('the_spark');

    // Extreme negative -> [-14, -14, -14] -> slider [0, 0, 0] -> THE ARCHITECT
    const res3 = computePersonality(Array.from({ length: 7 }, () => [-2, -2, -2]));
    expect(res3.sliders).toEqual([0, 0, 0]);
    expect(res3.archetypeId).toBe('the_architect');
  });
});

describe('4. Crew math hand-verified fixtures (k = 2, 3, 5) & blind rule', () => {
  const mockQuestions: PublicQuestion[] = Array.from({ length: 7 }, (_, i) => ({
    id: `q${i + 1}`,
    pack_id: 'the_mix',
    prompt: `Question ${i + 1}`,
    options: [{ text: 'O0' }, { text: 'O1' }, { text: 'O2' }, { text: 'O3' }],
  }));
  const squadRoasts = loadVerdicts().squadRoasts;

  it('k = 2: exact sync %, scores, Perfect Sync / Split Decisions, hides 3+ player awards', () => {
    // 5 matches out of 7 -> sync = round(5/7 * 100) = 71%, scores = 500 each, CO-OP SPEEDRUN SQUAD
    const board = computeCrewBoard({
      questions: mockQuestions,
      squadRoasts,
      completedMembers: [
        { memberId: 'a', nickname: 'Ada', isMe: true, answers: { q1: 0, q2: 1, q3: 2, q4: 3, q5: 0, q6: 1, q7: 2 } },
        { memberId: 'b', nickname: 'Ben', isMe: false, answers: { q1: 0, q2: 1, q3: 2, q4: 3, q5: 0, q6: 0, q7: 0 } },
      ],
    });
    expect(board.crewSyncPercent).toBe(71);
    expect(board.roast.title).toBe('CO-OP SPEEDRUN SQUAD');
    expect(board.members.map((m) => m.totalScore)).toEqual([500, 500]);
    expect(board.awards).toBeNull();
    expect(board.twoPlayerSummary?.perfectSyncQuestions).toHaveLength(5);
    expect(board.twoPlayerSummary?.splitDecisionQuestions).toHaveLength(2);
  });

  it('k = 3: exact pair agreement, Mind Twins ties, Perfect Sync badge, Civil War, and strictly unique Lone Signal', () => {
    // Q1: all 0 -> M=3, P=3 -> A=100% (Perfect Sync!)
    // Q2: A=0, B=0, C=1 -> M=1, P=3 -> A=33.33% (C is lone)
    // Q3: A=0, B=0, C=1 -> A=33.33% (C is lone)
    // Q4: A=0, B=1, C=2 -> M=0, P=3 -> A=0% (Civil War! all 3 lone)
    // Q5: A=1, B=1, C=1 -> A=100%
    // Q6: A=2, B=2, C=2 -> A=100%
    // Q7: A=3, B=3, C=3 -> A=100%
    // Mean A = (100 + 33.3333 + 33.3333 + 0 + 100 + 100 + 100) / 7 = 466.6667 / 7 = 66.6667 -> 67%
    // C loneCount = 3, A loneCount = 1, B loneCount = 1 -> strictly unique Lone Signal = C!
    const board = computeCrewBoard({
      questions: mockQuestions,
      squadRoasts,
      completedMembers: [
        { memberId: 'a', nickname: 'Ada', isMe: true, answers: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 1, q6: 2, q7: 3 } },
        { memberId: 'b', nickname: 'Ben', isMe: false, answers: { q1: 0, q2: 0, q3: 0, q4: 1, q5: 1, q6: 2, q7: 3 } },
        { memberId: 'c', nickname: 'Cy', isMe: false, answers: { q1: 0, q2: 1, q3: 1, q4: 2, q5: 1, q6: 2, q7: 3 } },
      ],
    });

    expect(board.crewSyncPercent).toBe(67);
    expect(board.roast.title).toBe('CHAOTIC HEIST LOBBY');
    expect(board.twoPlayerSummary).toBeNull();
    expect(board.awards?.mindTwins?.matches).toBe(6);
    expect(board.awards?.mindTwins?.pairs).toEqual([{ memberAName: 'Ada', memberBName: 'Ben' }]);
    expect(board.awards?.commonGround?.isPerfectSync).toBe(true);
    expect(board.awards?.civilWar?.questionIndex).toBe(4);
    expect(board.awards?.civilWar?.agreementPercent).toBe(0);
    expect(board.awards?.loneSignal).toEqual({ nickname: 'Cy', loneCount: 3 });

    // Check individual scores:
    // Ada: Q1=100, Q2=50, Q3=50, Q4=0, Q5=100, Q6=100, Q7=100 => 500
    // Cy:  Q1=100, Q2=0,  Q3=0,  Q4=0, Q5=100, Q6=100, Q7=100 => 400
    const ada = board.members.find((m) => m.nickname === 'Ada');
    const cy = board.members.find((m) => m.nickname === 'Cy');
    expect(ada?.totalScore).toBe(500);
    expect(cy?.totalScore).toBe(400);
  });

  it('k = 5: hand-verified agreement and suppresses Civil War when all 100%, suppresses tied Lone Signal', () => {
    const allZero = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 };
    // All 5 pick identical answers -> 100% sync, Civil War = null, Lone Signal = null
    const perfect = computeCrewBoard({
      questions: mockQuestions,
      squadRoasts,
      completedMembers: ['P1', 'P2', 'P3', 'P4', 'P5'].map((n, idx) => ({
        memberId: `m${idx}`,
        nickname: n,
        isMe: idx === 0,
        answers: allZero,
      })),
    });
    expect(perfect.crewSyncPercent).toBe(100);
    expect(perfect.awards?.civilWar).toBeNull();
    expect(perfect.awards?.loneSignal).toBeNull();
    expect(perfect.awards?.mindTwins?.pairs).toHaveLength(10); // all 10 pairs tied at 7/7

    // Now test 5 players with mixed splits:
    // On every Q: P1=0, P2=0, P3=1, P4=1, P5=2 -> M = 1 + 1 + 0 = 2, P = 10 -> A = 20%
    // Crew Sync = 20% -> PUBLIC LOBBY DISASTER
    // P5 is lone on all 7 Qs -> strictly unique Lone Signal (7)
    const split = computeCrewBoard({
      questions: mockQuestions,
      squadRoasts,
      completedMembers: [
        { memberId: 'm1', nickname: 'P1', isMe: true, answers: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 } },
        { memberId: 'm2', nickname: 'P2', isMe: false, answers: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 } },
        { memberId: 'm3', nickname: 'P3', isMe: false, answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1 } },
        { memberId: 'm4', nickname: 'P4', isMe: false, answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1 } },
        { memberId: 'm5', nickname: 'P5', isMe: false, answers: { q1: 2, q2: 2, q3: 2, q4: 2, q5: 2, q6: 2, q7: 2 } },
      ],
    });
    expect(split.crewSyncPercent).toBe(20);
    expect(split.roast.title).toBe('PUBLIC LOBBY DISASTER');
    // P1 matches only P2 (1 of 4 others = 25 per Q * 7 = 175)
    expect(split.members.find((m) => m.nickname === 'P1')?.totalScore).toBe(175);
    expect(split.members.find((m) => m.nickname === 'P5')?.totalScore).toBe(0);
    expect(split.awards?.loneSignal).toEqual({ nickname: 'P5', loneCount: 7 });
  });

  it('enforces server-side blind rule, 12-player cap, and mixed pack cap (<= 3 per pack)', () => {
    const db = makeTestDb();
    const creator = crypto.randomUUID();
    const created = createCrew(db, {
      deviceId: creator,
      mode: 'mixed',
      packId: null,
      name: '  <script>Squad</script>  ',
      nickname: 'Host\u0000Name',
    });

    // Code alphabet check: 6 chars, no 0, O, 1, I
    expect(created.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

    // Verify mixed mode has at most 3 questions from any single pack
    const packCounts: Record<string, number> = {};
    for (const qid of created.questionIds) {
      const prefix = qid.slice(0, 2);
      packCounts[prefix] = (packCounts[prefix] ?? 0) + 1;
      expect(packCounts[prefix]).toBeLessThanOrEqual(3);
    }

    // Creator finishes all 7
    for (const qid of created.questionIds) {
      submitCrewAnswer(db, { code: created.code, deviceId: creator, questionId: qid, optionIndex: 0 });
    }

    // Friend 2 answers only 3 questions -> MUST NOT see board yet (blind rule!)
    const friend2 = crypto.randomUUID();
    for (let i = 0; i < 3; i++) {
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: friend2,
        questionId: created.questionIds[i],
        optionIndex: 0,
        nickname: 'Friend 2',
      });
    }
    const f2MidState = getCrewState(db, created.code, friend2);
    expect(f2MidState?.me.answeredCount).toBe(3);
    expect(f2MidState?.me.completed).toBe(false);
    expect(f2MidState?.board).toBeNull();
    expect(Array.isArray(f2MidState?.crew.questions)).toBe(true);
    expect(f2MidState?.crew.questions).toHaveLength(7);
    expect(Array.isArray(f2MidState?.questions)).toBe(true);
    expect(f2MidState?.questions).toHaveLength(7);
    expect(f2MidState?.memberCount).toBe(2);
    expect(f2MidState?.completedCount).toBe(1);

    // Friend 2 finishes remaining 4 -> board unlocks for both!
    for (let i = 3; i < 7; i++) {
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: friend2,
        questionId: created.questionIds[i],
        optionIndex: 0,
      });
    }
    const f2DoneState = getCrewState(db, created.code, friend2);
    expect(f2DoneState?.board).not.toBeNull();
    expect(f2DoneState?.board?.crewSyncPercent).toBe(100);

    // Crew answers must NEVER pollute population_votes
    const { voteCount } = db.prepare('SELECT COUNT(*) as voteCount FROM population_votes').get() as {
      voteCount: number;
    };
    expect(voteCount).toBe(0);

    // Fill up to 12 players (2 already in -> add 10 more), then 13th must throw 409
    for (let p = 3; p <= 12; p++) {
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: crypto.randomUUID(),
        questionId: created.questionIds[0],
        optionIndex: 1,
        nickname: `Player ${p}`,
      });
    }
    expect(() =>
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: crypto.randomUUID(),
        questionId: created.questionIds[0],
        optionIndex: 1,
        nickname: 'Player 13',
      })
    ).toThrow(/full/i);

    db.close();
  });

  it('creates crew successfully in themed mode with the_mix and themed packs without throwing not enough questions', () => {
    const db = makeTestDb();
    const creator = crypto.randomUUID();

    // 1. Crew with the_mix (previously threw 'Not enough published questions available')
    const mixCrew = createCrew(db, {
      deviceId: creator,
      mode: 'themed',
      packId: 'the_mix',
      name: 'The Mix Crew',
    });
    expect(mixCrew.questionIds).toHaveLength(7);
    expect(mixCrew.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

    // 2. Themed crew with neon_coast
    const neonCrew = createCrew(db, {
      deviceId: creator,
      mode: 'themed',
      packId: 'neon_coast',
      name: 'Neon Squad',
    });
    expect(neonCrew.questionIds).toHaveLength(7);

    // 3. Themed crew with campus_chaos
    const campusCrew = createCrew(db, {
      deviceId: creator,
      mode: 'themed',
      packId: 'campus_chaos',
      name: 'Campus Crew',
    });
    expect(campusCrew.questionIds).toHaveLength(7);

    db.close();
  });
});

describe('5. Security utilities: sanitization, escaping & rate limiter', () => {
  it('sanitizes nicknames, escapes HTML, and enforces 60/min rate limit', () => {
    expect(sanitizeUserText('<b>Alex\x07\x00   Smith</b>   ExtraLongNameHere', 18)).toBe(
      'bAlex Smith/b Extr'
    );
    expect(escapeHtml(`"Tom & <Jerry>" 'hi'`)).toBe('&quot;Tom &amp; &lt;Jerry&gt;&quot; &#39;hi&#39;');

    const rl = new AnswerRateLimiter(3, 60_000);
    expect(rl.checkPair('1.2.3.4', 'dev1', 1000).allowed).toBe(true);
    expect(rl.checkPair('1.2.3.4', 'dev1', 1001).allowed).toBe(true);
    expect(rl.checkPair('1.2.3.4', 'dev1', 1002).allowed).toBe(true);
    expect(rl.checkPair('1.2.3.4', 'dev1', 1003).allowed).toBe(false);
    // After 60s window expires, allowed again
    expect(rl.checkPair('1.2.3.4', 'dev1', 62_000).allowed).toBe(true);
  });
});

describe('6. Question bank refactor: The Mix aggregate mode & dedicated packs', () => {
  it('dedicates packs strictly to their own questions', () => {
    const db = makeTestDb();
    const scDaily = getOrCreateDailySet(db, 'social_circuit', '2026-11-20', false);
    expect(scDaily).toHaveLength(7);
    const scRows = db.prepare(`SELECT id, pack_id FROM questions WHERE id IN (${scDaily.map(() => '?').join(',')})`).all(...scDaily) as { id: string; pack_id: string }[];
    for (const r of scRows) {
      expect(r.pack_id).toBe('social_circuit');
      expect(r.id.startsWith('lv_')).toBe(true);
    }

    const ncDaily = getOrCreateDailySet(db, 'neon_coast', '2026-11-20', false);
    expect(ncDaily).toHaveLength(7);
    const ncRows = db.prepare(`SELECT id, pack_id FROM questions WHERE id IN (${ncDaily.map(() => '?').join(',')})`).all(...ncDaily) as { id: string; pack_id: string }[];
    for (const r of ncRows) {
      expect(r.pack_id).toBe('neon_coast');
      expect(r.id.startsWith('nc_')).toBe(true);
    }

    const ccDaily = getOrCreateDailySet(db, 'campus_chaos', '2026-11-20', false);
    expect(ccDaily).toHaveLength(7);
    const ccRows = db.prepare(`SELECT id, pack_id FROM questions WHERE id IN (${ccDaily.map(() => '?').join(',')})`).all(...ccDaily) as { id: string; pack_id: string }[];
    for (const r of ccRows) {
      expect(r.pack_id).toBe('campus_chaos');
      expect(r.id.startsWith('cc_')).toBe(true);
    }

    const elDaily = getOrCreateDailySet(db, 'everyday_life', '2026-11-20', false);
    expect(elDaily).toHaveLength(7);
    const elRows = db.prepare(`SELECT id, pack_id FROM questions WHERE id IN (${elDaily.map(() => '?').join(',')})`).all(...elDaily) as { id: string; pack_id: string }[];
    for (const r of elRows) {
      expect(r.pack_id).toBe('everyday_life');
      expect(r.id.startsWith('tm_')).toBe(true);
    }
    db.close();
  });

  it('aggregates questions from multiple themed packs when The Mix is selected', () => {
    const db = makeTestDb();
    const mixDaily = getOrCreateDailySet(db, 'the_mix', '2026-11-25', false);
    expect(mixDaily).toHaveLength(7);

    // Verify no duplicates within session
    const uniqueIds = new Set(mixDaily);
    expect(uniqueIds.size).toBe(7);

    // Verify questions come from multiple packs (balanced)
    const rows = db.prepare(`SELECT id, pack_id FROM questions WHERE id IN (${mixDaily.map(() => '?').join(',')})`).all(...mixDaily) as { id: string; pack_id: string }[];
    const packCounts: Record<string, number> = {};
    for (const r of rows) {
      packCounts[r.pack_id] = (packCounts[r.pack_id] || 0) + 1;
    }

    // Must be selected from at least 3 distinct packs
    expect(Object.keys(packCounts).length).toBeGreaterThanOrEqual(3);

    // No single pack dominates all 7 questions
    for (const count of Object.values(packCounts)) {
      expect(count).toBeLessThanOrEqual(3);
    }
    db.close();
  });

  it('layers real player votes on top of question baseline stats (>55 players) while keeping organic votes separate', () => {
    const db = makeTestDb({ withBaseStats: true });
    const date = '2026-11-25';
    const qids = getOrCreateDailySet(db, 'campus_chaos', date, false);
    const qid = qids[0];

    // 1. Initial base counts should exist and sum > 55
    const baseCounts = getVoteCounts(db, qid);
    const totalBase = baseCounts[0] + baseCounts[1] + baseCounts[2] + baseCounts[3];
    expect(totalBase).toBeGreaterThan(55);

    // 2. Organic counts should initially be zero
    const organicInitial = getVoteCounts(db, qid, { organicOnly: true });
    expect(organicInitial).toEqual([0, 0, 0, 0]);

    // 3. When a real player answers Option 2
    const realPlayerId = crypto.randomUUID();
    const result = submitSoloAnswer(db, {
      deviceId: realPlayerId,
      packId: 'campus_chaos',
      date,
      questionId: qid,
      optionIndex: 2,
    });

    // Reveal shows percentages enabled and sample size > 55
    expect(result.reveal.showPercentages).toBe(true);
    expect(result.reveal.sampleSize).toBe(totalBase + 1);
    expect(result.reveal.bars[2].isChosen).toBe(true);

    // 4. Combined count incremented by 1 on Option 2
    const combinedAfter = getVoteCounts(db, qid);
    expect(combinedAfter[2]).toBe(baseCounts[2] + 1);

    // 5. Organic count only records the real answer
    const organicAfter = getVoteCounts(db, qid, { organicOnly: true });
    expect(organicAfter).toEqual([0, 0, 1, 0]);

    db.close();
  });

  it('supports independent quiz start and answers per player in crew mode', () => {
    const db = makeTestDb();
    const hostDevice = crypto.randomUUID();
    const guest1Device = crypto.randomUUID();
    const guest2Device = crypto.randomUUID();

    const crewCreated = createCrew(db, {
      deviceId: hostDevice,
      nickname: 'Captain Alex',
      mode: 'themed',
      packId: 'campus_chaos',
    });
    const code = crewCreated.code;

    // Check initial room state: 1 member connected
    const stateInitial = getCrewState(db, code, hostDevice);
    expect(stateInitial).not.toBeNull();
    expect(stateInitial?.members).toHaveLength(1);
    expect(stateInitial?.members[0].nickname).toBe('Captain Alex');
    expect(stateInitial?.members[0].isMe).toBe(true);
    expect(stateInitial?.memberCount).toBe(1);

    // Guest 1 joins room
    const stateGuest1 = submitCrewAnswer(db, {
      code,
      deviceId: guest1Device,
      nickname: 'Sammy',
    });
    expect(stateGuest1.members).toHaveLength(2);
    expect(stateGuest1.memberCount).toBe(2);

    // Guest 2 joins room
    const stateGuest2 = submitCrewAnswer(db, {
      code,
      deviceId: guest2Device,
      nickname: 'Taylor',
    });
    expect(stateGuest2.members).toHaveLength(3);
    expect(stateGuest2.memberCount).toBe(3);

    // Guest 1 answers questions independently at their own time without host having started
    const questions = stateGuest1.questions;
    expect(questions).toHaveLength(7);

    // Guest 1 answers 3 questions
    for (let i = 0; i < 3; i++) {
      submitCrewAnswer(db, {
        code,
        deviceId: guest1Device,
        questionId: questions[i].id,
        optionIndex: i % 4,
      });
    }

    // Host has answered 0 questions and is still in lobby
    const hostStateCheck = getCrewState(db, code, hostDevice);
    expect(hostStateCheck?.me.answeredCount).toBe(0);
    expect(hostStateCheck?.me.completed).toBe(false);

    // Guest 1 has answered 3 questions
    const guest1StateCheck = getCrewState(db, code, guest1Device);
    expect(guest1StateCheck?.me.answeredCount).toBe(3);
    expect(guest1StateCheck?.me.completed).toBe(false);

    // Guest 2 has answered 0 questions
    const guest2StateCheck = getCrewState(db, code, guest2Device);
    expect(guest2StateCheck?.me.answeredCount).toBe(0);
    expect(guest2StateCheck?.me.completed).toBe(false);

    db.close();
  });
});
