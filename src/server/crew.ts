import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { computeCrewBoard, fisherYatesShuffle, mulberry32 } from '../shared/scoring';
import type {
  CrewStateResponse,
  PackId,
  VisualTheme,
} from '../shared/types';
import { loadVerdicts } from './db';
import { sanitizeUserText } from './security';
import { fetchQuestionsByIds, toPublicQuestions } from './solo';

// Uppercase alphabet strictly excluding 0, O, 1, I
const CREW_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateCrewCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CREW_CODE_ALPHABET[bytes[i] % CREW_CODE_ALPHABET.length];
  }
  return code;
}

interface DbCrewRow {
  id: string;
  code: string;
  name: string | null;
  pack_id: PackId | null;
  mode: 'themed' | 'mixed';
  question_ids: string;
  creator_device_id: string;
  max_players: number;
  status: string;
  created_at: string;
}

interface DbCrewMemberRow {
  id: string;
  crew_id: string;
  device_id: string;
  nickname: string | null;
  answers: string;
  completed_at: string | null;
  created_at: string;
}

/**
 * Selects 7 crew question IDs:
 * - Themed mode: from the chosen pack
 * - Mixed mode: across all published packs, at most 3 from any one pack
 * Prefers questions not in excludeQuestionIds (last 21 seen); tops up from oldest-seen if pool runs out.
 */
function selectCrewQuestions(
  db: Database.Database,
  mode: 'themed' | 'mixed',
  packId: PackId | null,
  excludeQuestionIds: string[]
): string[] {
  const seed = crypto.randomBytes(4).readUInt32BE(0);
  const rng = mulberry32(seed);

  // Order of recency: index 0 = oldest seen, last = most recently seen
  const recentOrder = excludeQuestionIds.slice(-21);
  const excludeSet = new Set(recentOrder);

  if (mode === 'themed' && packId) {
    const rows = db
      .prepare(
        `SELECT id FROM questions WHERE pack_id = ? AND status = 'published' ORDER BY id ASC`
      )
      .all(packId) as { id: string }[];
    const allIds = rows.map((r) => r.id);
    const fresh = fisherYatesShuffle(
      allIds.filter((id) => !excludeSet.has(id)),
      rng
    );
    if (fresh.length >= 7) {
      return fresh.slice(0, 7);
    }
    // Top up from oldest-seen first
    const seenOldestFirst = recentOrder.filter((id) => allIds.includes(id) && !fresh.includes(id));
    const remaining = allIds.filter((id) => !fresh.includes(id) && !seenOldestFirst.includes(id));
    return [...fresh, ...seenOldestFirst, ...remaining].slice(0, 7);
  }

  // Mixed mode: across all published packs, max 3 from any one pack
  const rows = db
    .prepare(
      `SELECT id, pack_id FROM questions WHERE status = 'published' ORDER BY id ASC`
    )
    .all() as { id: string; pack_id: PackId }[];

  const freshRows = fisherYatesShuffle(
    rows.filter((r) => !excludeSet.has(r.id)),
    rng
  );
  const seenOldestRows = recentOrder
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is { id: string; pack_id: PackId } => Boolean(r));
  const candidates = [...freshRows, ...seenOldestRows];

  const picked: string[] = [];
  const pickedSet = new Set<string>();
  const packCounts: Record<string, number> = {};

  for (const row of candidates) {
    if (picked.length >= 7) break;
    if (pickedSet.has(row.id)) continue;
    const currentCount = packCounts[row.pack_id] ?? 0;
    if (currentCount >= 3) continue;
    picked.push(row.id);
    pickedSet.add(row.id);
    packCounts[row.pack_id] = currentCount + 1;
  }

  // Fallback if fewer than 7 (should never happen with 3 packs x 15 Qs)
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

export function createCrew(
  db: Database.Database,
  params: {
    deviceId: string;
    mode: 'themed' | 'mixed';
    packId: PackId | null;
    name?: string;
    nickname?: string;
    excludeQuestionIds?: string[];
  }
): { code: string; invitePath: string; crewId: string; questionIds: string[] } {
  const { deviceId, mode, packId, excludeQuestionIds = [] } = params;
  const cleanName = sanitizeUserText(params.name, 24) || null;
  const cleanNickname = sanitizeUserText(params.nickname, 18) || 'Player 1';

  if (mode === 'themed') {
    if (!packId) {
      throw Object.assign(new Error('packId is required for themed crews'), { statusCode: 400 });
    }
    const exists = db
      .prepare(`SELECT 1 FROM packs WHERE id = ? AND status = 'published'`)
      .get(packId);
    if (!exists) {
      throw Object.assign(new Error('Selected pack does not exist'), { statusCode: 404 });
    }
  }

  const questionIds = selectCrewQuestions(db, mode, mode === 'themed' ? packId : null, excludeQuestionIds);
  if (questionIds.length < 7) {
    throw Object.assign(new Error('Not enough published questions available'), { statusCode: 500 });
  }

  const now = new Date().toISOString();
  const crewId = crypto.randomUUID();
  const memberId = crypto.randomUUID();

  const tx = db.transaction(() => {
    let code = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateCrewCode();
      const collision = db.prepare('SELECT 1 FROM crews WHERE code = ?').get(candidate);
      if (!collision) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw Object.assign(new Error('Failed to generate unique crew code'), { statusCode: 500 });
    }

    db.prepare(
      `INSERT INTO crews (id, code, name, pack_id, mode, question_ids, creator_device_id, max_players, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 12, 'open', ?)`
    ).run(
      crewId,
      code,
      cleanName,
      mode === 'themed' ? packId : null,
      mode,
      JSON.stringify(questionIds),
      deviceId,
      now
    );

    // Creator is auto-joined
    db.prepare(
      `INSERT INTO crew_members (id, crew_id, device_id, nickname, answers, created_at)
       VALUES (?, ?, ?, ?, '{}', ?)`
    ).run(memberId, crewId, deviceId, cleanNickname, now);

    return code;
  });

  const code = tx();
  return {
    code,
    invitePath: `/crew/${code}`,
    crewId,
    questionIds,
  };
}

export function getCrewState(
  db: Database.Database,
  codeInput: string,
  deviceId: string
): CrewStateResponse | null {
  const code = codeInput.trim().toUpperCase();
  const crew = db.prepare('SELECT * FROM crews WHERE code = ?').get(code) as DbCrewRow | undefined;
  if (!crew) return null;

  const members = db
    .prepare('SELECT * FROM crew_members WHERE crew_id = ? ORDER BY created_at ASC')
    .all(crew.id) as DbCrewMemberRow[];

  const questionIds = JSON.parse(crew.question_ids) as string[];
  const qRows = fetchQuestionsByIds(db, questionIds);
  const publicQuestions = toPublicQuestions(qRows);

  const meRow = members.find((m) => m.device_id === deviceId);
  const meAnswers: Record<string, number> = meRow
    ? (JSON.parse(meRow.answers) as Record<string, number>)
    : {};
  const meCompleted = Boolean(meRow?.completed_at);

  const completedMembers = members.filter((m) => Boolean(m.completed_at));
  const visualTheme: VisualTheme =
    crew.mode === 'mixed' || !crew.pack_id ? 'the_mix' : crew.pack_id;

  const displayName = (m: DbCrewMemberRow, index: number) =>
    m.nickname && m.nickname.trim().length > 0 ? m.nickname : `Player ${index + 1}`;

  const publicMembers = members.map((m, idx) => ({
    memberId: m.id,
    nickname: displayName(m, idx),
    completed: Boolean(m.completed_at),
    isMe: m.device_id === deviceId,
  }));

  // BLIND RULE ENFORCEMENT (server-side):
  // Never compute or return anyone else's answers, splits, scores, awards, or roast
  // until THIS device has finished all 7 questions AND at least 2 members have finished.
  let board = null;
  if (meCompleted && completedMembers.length >= 2) {
    const verdicts = loadVerdicts();
    const scoringInputs = completedMembers.map((m) => {
      const idx = members.findIndex((x) => x.id === m.id);
      return {
        memberId: m.id,
        nickname: displayName(m, idx),
        isMe: m.device_id === deviceId,
        answers: JSON.parse(m.answers) as Record<string, number>,
      };
    });
    board = computeCrewBoard({
      questions: publicQuestions,
      completedMembers: scoringInputs,
      squadRoasts: verdicts.squadRoasts,
    });
  }

  return {
    crew: {
      id: crew.id,
      code: crew.code,
      name: crew.name || `${crew.mode === 'mixed' ? 'MIXED' : crew.pack_id?.replace('_', ' ').toUpperCase()} CREW`,
      packId: crew.pack_id,
      mode: crew.mode,
      visualTheme,
      maxPlayers: crew.max_players,
      memberCount: members.length,
      completedCount: completedMembers.length,
      isFull: members.length >= crew.max_players && !meRow,
      invitePath: `/crew/${crew.code}`,
      createdAt: crew.created_at,
    },
    me: {
      joined: Boolean(meRow),
      nickname: meRow?.nickname ?? '',
      answers: meAnswers,
      answeredCount: Object.keys(meAnswers).length,
      completed: meCompleted,
    },
    members: publicMembers,
    questions: publicQuestions,
    board,
  };
}

export function submitCrewAnswer(
  db: Database.Database,
  params: {
    code: string;
    deviceId: string;
    questionId?: string;
    optionIndex?: number;
    nickname?: string;
  }
): CrewStateResponse {
  const code = params.code.trim().toUpperCase();
  const crew = db.prepare('SELECT * FROM crews WHERE code = ?').get(code) as DbCrewRow | undefined;
  if (!crew) {
    throw Object.assign(new Error('Crew not found'), { statusCode: 404 });
  }

  const questionIds = JSON.parse(crew.question_ids) as string[];
  const cleanNickname = sanitizeUserText(params.nickname, 18);

  if (params.questionId !== undefined) {
    if (!questionIds.includes(params.questionId)) {
      throw Object.assign(new Error('Question does not belong to this crew'), { statusCode: 400 });
    }
    if (
      params.optionIndex === undefined ||
      !Number.isInteger(params.optionIndex) ||
      params.optionIndex < 0 ||
      params.optionIndex > 3
    ) {
      throw Object.assign(new Error('optionIndex must be an integer between 0 and 3'), {
        statusCode: 400,
      });
    }
  }

  const tx = db.transaction(() => {
    const members = db
      .prepare('SELECT * FROM crew_members WHERE crew_id = ? ORDER BY created_at ASC')
      .all(crew.id) as DbCrewMemberRow[];

    let me = members.find((m) => m.device_id === params.deviceId);
    const now = new Date().toISOString();

    if (!me) {
      if (members.length >= crew.max_players) {
        throw Object.assign(
          new Error(`This crew is full (maximum ${crew.max_players} players).`),
          { statusCode: 409 }
        );
      }
      const fallbackName = cleanNickname || `Player ${members.length + 1}`;
      const memberId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO crew_members (id, crew_id, device_id, nickname, answers, created_at)
         VALUES (?, ?, ?, ?, '{}', ?)`
      ).run(memberId, crew.id, params.deviceId, fallbackName, now);
      me = db.prepare('SELECT * FROM crew_members WHERE id = ?').get(memberId) as DbCrewMemberRow;
    } else if (cleanNickname && cleanNickname !== me.nickname) {
      db.prepare('UPDATE crew_members SET nickname = ? WHERE id = ?').run(cleanNickname, me.id);
      me = { ...me, nickname: cleanNickname };
    }

    if (params.questionId !== undefined && params.optionIndex !== undefined) {
      // Once completed, lock answers so board remains consistent
      if (!me.completed_at) {
        const currentAnswers = JSON.parse(me.answers) as Record<string, number>;
        currentAnswers[params.questionId] = params.optionIndex;
        const allAnswered = questionIds.every((qid) => currentAnswers[qid] !== undefined);
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
    throw Object.assign(new Error('Crew not found'), { statusCode: 404 });
  }
  return state;
}

export function getCrewMetaForOg(
  db: Database.Database,
  codeInput: string
): { code: string; name: string; mode: 'themed' | 'mixed'; packId: PackId | null; memberCount: number } | null {
  const code = codeInput.trim().toUpperCase();
  const crew = db
    .prepare('SELECT id, code, name, mode, pack_id FROM crews WHERE code = ?')
    .get(code) as { id: string; code: string; name: string | null; mode: 'themed' | 'mixed'; pack_id: PackId | null } | undefined;
  if (!crew) return null;
  const { cnt } = db
    .prepare('SELECT COUNT(*) as cnt FROM crew_members WHERE crew_id = ?')
    .get(crew.id) as { cnt: number };
  return {
    code: crew.code,
    name: crew.name || `Crew ${crew.code}`,
    mode: crew.mode,
    packId: crew.pack_id,
    memberCount: cnt,
  };
}
