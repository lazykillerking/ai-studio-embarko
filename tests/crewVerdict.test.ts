import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import {
  computeCompleteCrewVerdict,
  getCrewSyncTier,
  getPairRelationshipTier,
} from '../src/shared/crewVerdictEngine';
import {
  CREW_AWARDS_BANK,
  CREW_SYNC_TIERS,
  INDIVIDUAL_COMPLIMENTS,
  INDIVIDUAL_ROASTS,
  PAIRWISE_RELATIONSHIP_TIERS,
} from '../src/shared/crewCommentaryBank';
import { openDatabase, seedPacksAndQuestions } from '../src/server/db';
import { createCrew, getCrewState, submitCrewAnswer } from '../src/server/crew';

// Sample 7 questions with 3-axis vectors
const MOCK_QUESTIONS = [
  {
    id: 'q1',
    prompt: 'Weekend plan emerges out of nowhere.',
    options: [
      { text: 'Say yes instantly', axes: [2, 1, 2] as [number, number, number] },
      { text: 'Check itinerary first', axes: [-2, 0, -2] as [number, number, number] },
      { text: 'Only if friends go', axes: [0, 2, 0] as [number, number, number] },
      { text: 'Mute phone and nap', axes: [0, -2, 0] as [number, number, number] },
    ],
  },
  {
    id: 'q2',
    prompt: 'Group project workload distribution.',
    options: [
      { text: 'Do everything solo', axes: [-1, -2, -1] as [number, number, number] },
      { text: 'Coordinate the slides', axes: [-2, 2, -2] as [number, number, number] },
      { text: 'Bring moral support', axes: [2, 2, 1] as [number, number, number] },
      { text: 'Miss deadline together', axes: [2, 1, 2] as [number, number, number] },
    ],
  },
  {
    id: 'q3',
    prompt: 'Emergency road trip detour.',
    options: [
      { text: 'Stick to the GPS', axes: [-2, -1, -2] as [number, number, number] },
      { text: 'Follow the neon sign', axes: [2, 0, 2] as [number, number, number] },
      { text: 'Ask the group chat', axes: [0, 2, 0] as [number, number, number] },
      { text: 'Turn around immediately', axes: [-1, -2, -1] as [number, number, number] },
    ],
  },
  {
    id: 'q4',
    prompt: 'Late night snack run consensus.',
    options: [
      { text: 'Order the entire menu', axes: [2, 2, 2] as [number, number, number] },
      { text: 'Calculate the split bill', axes: [-2, 0, -2] as [number, number, number] },
      { text: 'Eat whatever arrives', axes: [1, 2, 0] as [number, number, number] },
      { text: 'Skip and sleep', axes: [-1, -2, 0] as [number, number, number] },
    ],
  },
  {
    id: 'q5',
    prompt: 'Unknown incoming phone call.',
    options: [
      { text: 'Answer with a fake voice', axes: [2, 0, 2] as [number, number, number] },
      { text: 'Let it ring out', axes: [0, -2, -1] as [number, number, number] },
      { text: 'Search number online', axes: [-2, 0, -2] as [number, number, number] },
      { text: 'Hand phone to friend', axes: [1, 2, 1] as [number, number, number] },
    ],
  },
  {
    id: 'q6',
    prompt: 'Board game rules dispute.',
    options: [
      { text: 'Read the manual aloud', axes: [-2, 0, -2] as [number, number, number] },
      { text: 'Flip the board', axes: [2, -1, 2] as [number, number, number] },
      { text: 'Compromise on a house rule', axes: [0, 2, 1] as [number, number, number] },
      { text: 'Walk away quietly', axes: [0, -2, 0] as [number, number, number] },
    ],
  },
  {
    id: 'q7',
    prompt: 'Final heist escape method.',
    options: [
      { text: 'Speedboat with fireworks', axes: [2, 2, 2] as [number, number, number] },
      { text: 'Stealth subway transfer', axes: [-2, -1, -2] as [number, number, number] },
      { text: 'Disperse into the crowd', axes: [0, -2, 1] as [number, number, number] },
      { text: 'Blend in as tourists', axes: [1, 1, -1] as [number, number, number] },
    ],
  },
];

describe('Crew Verdict & Personality Roast Engine', () => {
  it('correctly maps all 7 Crew Sync Tiers across boundary ranges', () => {
    expect(getCrewSyncTier(0).id).toBe('hostile_takeover');
    expect(getCrewSyncTier(24).id).toBe('hostile_takeover');
    expect(getCrewSyncTier(25).id).toBe('different_planets');
    expect(getCrewSyncTier(39).id).toBe('different_planets');
    expect(getCrewSyncTier(40).id).toBe('somehow_a_crew');
    expect(getCrewSyncTier(54).id).toBe('somehow_a_crew');
    expect(getCrewSyncTier(55).id).toBe('unlikely_alliance');
    expect(getCrewSyncTier(69).id).toBe('unlikely_alliance');
    expect(getCrewSyncTier(70).id).toBe('one_braincell');
    expect(getCrewSyncTier(84).id).toBe('one_braincell');
    expect(getCrewSyncTier(85).id).toBe('mind_meld');
    expect(getCrewSyncTier(94).id).toBe('mind_meld');
    expect(getCrewSyncTier(95).id).toBe('literally_same_person');
    expect(getCrewSyncTier(100).id).toBe('literally_same_person');
  });

  it('correctly maps all 7 Pairwise Relationship Tiers across boundary ranges', () => {
    expect(getPairRelationshipTier(0).id).toBe('natural_enemies');
    expect(getPairRelationshipTier(24).id).toBe('natural_enemies');
    expect(getPairRelationshipTier(25).id).toBe('unresolved_tension');
    expect(getPairRelationshipTier(39).id).toBe('unresolved_tension');
    expect(getPairRelationshipTier(40).id).toBe('acquaintances_at_best');
    expect(getPairRelationshipTier(54).id).toBe('acquaintances_at_best');
    expect(getPairRelationshipTier(55).id).toBe('decent_chemistry');
    expect(getPairRelationshipTier(69).id).toBe('decent_chemistry');
    expect(getPairRelationshipTier(70).id).toBe('same_wavelength');
    expect(getPairRelationshipTier(84).id).toBe('same_wavelength');
    expect(getPairRelationshipTier(85).id).toBe('shared_braincell');
    expect(getPairRelationshipTier(94).id).toBe('shared_braincell');
    expect(getPairRelationshipTier(95).id).toBe('suspicious_connection');
    expect(getPairRelationshipTier(100).id).toBe('suspicious_connection');
  });

  it('ensures substantial commentary library sizes as required', () => {
    // At least 8 crew-wide verdict lines per sync tier
    for (const tier of CREW_SYNC_TIERS) {
      expect(tier.verdictLines.length).toBeGreaterThanOrEqual(8);
    }
    // At least 40 individual roast lines
    expect(INDIVIDUAL_ROASTS.length).toBeGreaterThanOrEqual(40);
    // At least 40 individual compliment lines
    expect(INDIVIDUAL_COMPLIMENTS.length).toBeGreaterThanOrEqual(40);
    // At least 6 pairwise commentary lines per relationship tier
    for (const pairTier of PAIRWISE_RELATIONSHIP_TIERS) {
      expect(pairTier.lines.length).toBeGreaterThanOrEqual(6);
    }
    // At least 12 award descriptions
    expect(CREW_AWARDS_BANK.length).toBeGreaterThanOrEqual(12);
  });

  it('produces deterministic output for identical session inputs', () => {
    const members = [
      {
        memberId: 'm1',
        nickname: 'Alex',
        isMe: true,
        answers: { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 },
      },
      {
        memberId: 'm2',
        nickname: 'Sam',
        isMe: false,
        answers: { q1: 0, q2: 0, q3: 1, q4: 1, q5: 0, q6: 2, q7: 0 },
      },
      {
        memberId: 'm3',
        nickname: 'Jordan',
        isMe: false,
        answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 2, q6: 2, q7: 1 },
      },
    ];

    const v1 = computeCompleteCrewVerdict({
      sessionId: 'test_session_123',
      crewSyncPercent: 57,
      questions: MOCK_QUESTIONS,
      members,
    });

    const v2 = computeCompleteCrewVerdict({
      sessionId: 'test_session_123',
      crewSyncPercent: 57,
      questions: MOCK_QUESTIONS,
      members,
    });

    expect(v1).toEqual(v2);
    expect(v1.tier.id).toBe('unlikely_alliance');
    expect(v1.playerAnalyses).toHaveLength(3);
    expect(v1.pairwiseRelationships).toHaveLength(3);
  });

  it('prevents duplicate roasts and compliments within the same session', () => {
    const members = [
      { memberId: 'm1', nickname: 'P1', isMe: true, answers: { q1: 0, q2: 1, q3: 2 } },
      { memberId: 'm2', nickname: 'P2', isMe: false, answers: { q1: 1, q2: 2, q3: 0 } },
      { memberId: 'm3', nickname: 'P3', isMe: false, answers: { q1: 2, q2: 0, q3: 1 } },
      { memberId: 'm4', nickname: 'P4', isMe: false, answers: { q1: 0, q2: 2, q3: 3 } },
    ];

    const verdict = computeCompleteCrewVerdict({
      sessionId: 'no_duplicates_sess',
      crewSyncPercent: 45,
      questions: MOCK_QUESTIONS,
      members,
    });

    const roasts = verdict.playerAnalyses.map((p) => p.roast);
    const compliments = verdict.playerAnalyses.map((p) => p.compliment);

    expect(new Set(roasts).size).toBe(4);
    expect(new Set(compliments).size).toBe(4);
  });

  it('supports 2-player crews, 3-player crews, and 6-player crews gracefully', () => {
    for (const size of [2, 3, 6]) {
      const members = Array.from({ length: size }, (_, i) => ({
        memberId: `mem_${i}`,
        nickname: `Player ${i + 1}`,
        isMe: i === 0,
        answers: {
          q1: i % 4,
          q2: (i + 1) % 4,
          q3: (i + 2) % 4,
          q4: (i + 3) % 4,
          q5: i % 4,
          q6: (i + 1) % 4,
          q7: (i + 2) % 4,
        },
      }));

      const verdict = computeCompleteCrewVerdict({
        sessionId: `size_test_${size}`,
        crewSyncPercent: 50,
        questions: MOCK_QUESTIONS,
        members,
      });

      expect(verdict.playerAnalyses).toHaveLength(size);
      const expectedPairs = (size * (size - 1)) / 2;
      expect(verdict.pairwiseRelationships).toHaveLength(expectedPairs);
      expect(verdict.personalityDynamics.dominantCrewArchetype).toBeDefined();
    }
  });

  it('handles 100% sync and 0% sync extremes without errors', () => {
    // 100% Sync (all 7 questions matched)
    const allMatchingAnswers = { q1: 0, q2: 1, q3: 2, q4: 0, q5: 1, q6: 2, q7: 0 };
    const perfectMembers = [
      { memberId: 'p1', nickname: 'Twin 1', isMe: true, answers: allMatchingAnswers },
      { memberId: 'p2', nickname: 'Twin 2', isMe: false, answers: allMatchingAnswers },
    ];
    const perfectVerdict = computeCompleteCrewVerdict({
      sessionId: 'perfect_100',
      crewSyncPercent: 100,
      questions: MOCK_QUESTIONS,
      members: perfectMembers,
    });
    expect(perfectVerdict.tier.id).toBe('literally_same_person');
    expect(perfectVerdict.pairwiseRelationships[0].percentage).toBe(100);
    expect(perfectVerdict.pairwiseRelationships[0].tierId).toBe('suspicious_connection');

    // 0% Sync (zero questions matched out of 7)
    const zeroAnswers1 = { q1: 0, q2: 0, q3: 0, q4: 0, q5: 0, q6: 0, q7: 0 };
    const zeroAnswers2 = { q1: 1, q2: 1, q3: 1, q4: 1, q5: 1, q6: 1, q7: 1 };
    const splitMembers = [
      { memberId: 's1', nickname: 'Rival 1', isMe: true, answers: zeroAnswers1 },
      { memberId: 's2', nickname: 'Rival 2', isMe: false, answers: zeroAnswers2 },
    ];
    const zeroVerdict = computeCompleteCrewVerdict({
      sessionId: 'zero_0',
      crewSyncPercent: 0,
      questions: MOCK_QUESTIONS,
      members: splitMembers,
    });
    expect(zeroVerdict.tier.id).toBe('hostile_takeover');
    expect(zeroVerdict.pairwiseRelationships[0].percentage).toBe(0);
    expect(zeroVerdict.pairwiseRelationships[0].tierId).toBe('natural_enemies');
  });

  it('persists complete crew verdict in the database and preserves it across reloads', () => {
    const db = openDatabase(':memory:');
    seedPacksAndQuestions(db);

    const dev1 = crypto.randomUUID();
    const dev2 = crypto.randomUUID();

    const created = createCrew(db, {
      deviceId: dev1,
      mode: 'mixed',
      packId: null,
      nickname: 'Captain',
    });

    const qids = created.questionIds;

    // Dev 1 answers all 7 questions
    for (const qid of qids) {
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: dev1,
        questionId: qid,
        optionIndex: 0,
      });
    }

    // Dev 2 joins and answers all 7 questions
    submitCrewAnswer(db, { code: created.code, deviceId: dev2, nickname: 'Navigator' });
    for (const qid of qids) {
      submitCrewAnswer(db, {
        code: created.code,
        deviceId: dev2,
        questionId: qid,
        optionIndex: 0,
      });
    }

    // Fetch state for dev1
    const state1 = getCrewState(db, created.code, dev1);
    expect(state1?.board?.verdict).toBeDefined();
    expect(state1?.board?.verdict?.tier.title).toBe('Literally the Same Person');

    // Verify it was stored in the crews table
    const crewDbRow = db
      .prepare('SELECT verdict_payload FROM crews WHERE code = ?')
      .get(created.code) as { verdict_payload: string };
    expect(crewDbRow.verdict_payload).toBeTruthy();

    // Fetch again as dev2: returns the exact same cached verdict payload
    const state2 = getCrewState(db, created.code, dev2);
    expect(state2?.board?.verdict).toEqual(state1?.board?.verdict);

    db.close();
  });
});
