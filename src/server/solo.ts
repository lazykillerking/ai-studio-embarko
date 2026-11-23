import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { ARCHETYPES, computePersonality } from '../shared/archetypes';
import {
  SCORING_VERSION,
  TIER_META,
  computeSmoothedShare,
  evaluateSoloAnswer,
  getDailyExclusionWindow,
  getRarityBand,
  getScoreTitle,
  selectDailyQuestionIds,
  selectTheMixQuestionIds,
} from '../shared/scoring';
import type {
  AnswerRecord,
  ArchetypeId,
  PackId,
  PackSummary,
  PublicQuestion,
  QuestionBreakdownItem,
  QuestionBreakdownOption,
  QuestionOption,
  SoloDailyResponse,
  SoloFinalResult,
  StatRevealPayload,
  TierName,
} from '../shared/types';
import { loadVerdicts } from './db';

export function getUtcDateString(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function getNextUtcResetIso(date = new Date()): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0));
  return next.toISOString();
}

export function isLaunchSetMode(): boolean {
  return process.env.LAUNCH_SET_MODE === 'true';
}

export function computeDailySeedUint32(packId: string, challengeDate: string): number {
  const hash = crypto.createHash('sha256').update(`${packId}:${challengeDate}`).digest();
  return hash.readUInt32BE(0);
}

function getPreviousUtcDates(dateStr: string, count: number): string[] {
  const out: string[] = [];
  const base = new Date(`${dateStr}T00:00:00.000Z`);
  for (let i = 1; i <= count; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

interface DbQuestionRow {
  id: string;
  pack_id: PackId;
  prompt: string;
  options: string;
  sort_order: number;
}

interface DbPackRow {
  id: PackId;
  slug: string;
  name: string;
  description: string;
  visual_theme: PackId;
  sort_order: number;
}

interface DbSoloRunRow {
  id: string;
  device_id: string;
  pack_id: PackId;
  challenge_date: string;
  question_ids: string;
  answer_records: string;
  axis_totals: string | null;
  archetype_id: ArchetypeId | null;
  total_points: number;
  score_title: string | null;
  verdict_id: string | null;
  scoring_version: number;
  completed_at: string | null;
}

/**
 * Ensures today's daily set for (packId, challengeDate) is persisted via INSERT OR IGNORE
 * and reads the authoritative stored row back.
 */
export function getOrCreateDailySet(
  db: Database.Database,
  packId: PackId,
  challengeDate: string,
  launchSetMode = isLaunchSetMode()
): string[] {
  // If The Mix is selected, aggregate across all eligible published packs
  if (packId === 'the_mix') {
    const existing = db
      .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
      .get(packId, challengeDate) as { question_ids: string } | undefined;

    if (existing) {
      return JSON.parse(existing.question_ids) as string[];
    }

    const allPublished = db
      .prepare(
        `SELECT q.id, q.pack_id, q.sort_order
         FROM questions q
         JOIN packs p ON p.id = q.pack_id
         WHERE q.status = 'published' AND p.status = 'published' AND p.id != 'the_mix'
         ORDER BY q.id ASC`
      )
      .all() as { id: string; pack_id: string; sort_order: number }[];

    if (launchSetMode) {
      const selectedIds = selectTheMixQuestionIds({
        publishedQuestions: allPublished,
        seedUint32: computeDailySeedUint32(packId, challengeDate),
        excludedIds: new Set<string>(),
        launchSetMode: true,
      });

      db.prepare(
        `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds), new Date().toISOString());

      const authoritative = db
        .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
        .get(packId, challengeDate) as { question_ids: string };
      return JSON.parse(authoritative.question_ids) as string[];
    }

    const exclusionWindow = getDailyExclusionWindow(allPublished.length);
    const excludedIds = new Set<string>();

    if (exclusionWindow > 0) {
      const prevDates = getPreviousUtcDates(challengeDate, exclusionWindow);
      const placeholders = prevDates.map(() => '?').join(',');
      const prevSets = db
        .prepare(
          `SELECT question_ids FROM daily_sets
           WHERE pack_id = ? AND challenge_date IN (${placeholders})`
        )
        .all(packId, ...prevDates) as { question_ids: string }[];
      for (const row of prevSets) {
        const ids = JSON.parse(row.question_ids) as string[];
        ids.forEach((id) => excludedIds.add(id));
      }
    }

    const seedUint32 = computeDailySeedUint32(packId, challengeDate);
    const selectedIds = selectTheMixQuestionIds({
      publishedQuestions: allPublished,
      seedUint32,
      excludedIds,
      launchSetMode: false,
    });

    db.prepare(
      `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds), new Date().toISOString());

    const authoritative = db
      .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
      .get(packId, challengeDate) as { question_ids: string };

    return JSON.parse(authoritative.question_ids) as string[];
  }

  // Dedicated single pack selection
  if (launchSetMode) {
    const existing = db
      .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
      .get(packId, challengeDate) as { question_ids: string } | undefined;

    if (existing) {
      return JSON.parse(existing.question_ids) as string[];
    }

    const rows = db
      .prepare(
        `SELECT id FROM questions
         WHERE pack_id = ? AND status = 'published'
         ORDER BY sort_order ASC, id ASC
         LIMIT 7`
      )
      .all(packId) as { id: string }[];
    const selectedIds = rows.map((r) => r.id);

    db.prepare(
      `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds), new Date().toISOString());

    const authoritative = db
      .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
      .get(packId, challengeDate) as { question_ids: string };
    return JSON.parse(authoritative.question_ids) as string[];
  }

  const existing = db
    .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
    .get(packId, challengeDate) as { question_ids: string } | undefined;

  if (existing) {
    return JSON.parse(existing.question_ids) as string[];
  }

  const publishedRows = db
    .prepare(
      `SELECT id, sort_order FROM questions
       WHERE pack_id = ? AND status = 'published'
       ORDER BY id ASC`
    )
    .all(packId) as { id: string; sort_order: number }[];

  const publishedIdsSortedAsc = publishedRows.map((r) => r.id);
  const publishedIdsBySortOrder = [...publishedRows]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((r) => r.id);

  const exclusionWindow = getDailyExclusionWindow(publishedIdsSortedAsc.length);
  const excludedIds = new Set<string>();

  if (exclusionWindow > 0) {
    const prevDates = getPreviousUtcDates(challengeDate, exclusionWindow);
    const placeholders = prevDates.map(() => '?').join(',');
    const prevSets = db
      .prepare(
        `SELECT question_ids FROM daily_sets
         WHERE pack_id = ? AND challenge_date IN (${placeholders})`
      )
      .all(packId, ...prevDates) as { question_ids: string }[];
    for (const row of prevSets) {
      const ids = JSON.parse(row.question_ids) as string[];
      ids.forEach((id) => excludedIds.add(id));
    }
  }

  const seedUint32 = computeDailySeedUint32(packId, challengeDate);
  const selectedIds = selectDailyQuestionIds({
    publishedIdsSortedAsc,
    publishedIdsBySortOrder,
    seedUint32,
    excludedIds,
    launchSetMode: false,
  });

  db.prepare(
    `INSERT OR IGNORE INTO daily_sets (id, pack_id, challenge_date, question_ids, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), packId, challengeDate, JSON.stringify(selectedIds), new Date().toISOString());

  const authoritative = db
    .prepare('SELECT question_ids FROM daily_sets WHERE pack_id = ? AND challenge_date = ?')
    .get(packId, challengeDate) as { question_ids: string };

  return JSON.parse(authoritative.question_ids) as string[];
}

export function fetchQuestionsByIds(db: Database.Database, ids: string[]): DbQuestionRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, pack_id, prompt, options, sort_order FROM questions WHERE id IN (${placeholders})`)
    .all(...ids) as DbQuestionRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is DbQuestionRow => Boolean(r));
}

export function toPublicQuestions(rows: DbQuestionRow[]): PublicQuestion[] {
  return rows.map((row) => {
    const opts = JSON.parse(row.options) as QuestionOption[];
    return {
      id: row.id,
      pack_id: row.pack_id,
      prompt: row.prompt,
      options: opts.map((o) => ({ text: o.text })),
    };
  });
}

function buildFinalResultFromRun(
  db: Database.Database,
  run: DbSoloRunRow
): SoloFinalResult | null {
  if (!run.completed_at || !run.archetype_id) return null;
  const questionIds = JSON.parse(run.question_ids) as string[];
  const answerRecords = JSON.parse(run.answer_records) as AnswerRecord[];
  const qRows = fetchQuestionsByIds(db, questionIds);
  const qRowMap = new Map(qRows.map((r) => [r.id, r]));
  const recMap = new Map(answerRecords.map((r) => [r.question_id, r]));

  const chosenAxes: [number, number, number][] = answerRecords.map((rec) => {
    const qRow = qRowMap.get(rec.question_id);
    if (!qRow) return [0, 0, 0];
    const opts = JSON.parse(qRow.options) as QuestionOption[];
    const chosen = opts?.[rec.option_index];
    return chosen ? chosen.axes : [0, 0, 0];
  });

  const axisResult = computePersonality(chosenAxes);
  const archetypeDef = ARCHETYPES[run.archetype_id];
  const verdicts = loadVerdicts();
  const band = getRarityBand(run.total_points);
  const verdict = verdicts.soloVerdicts[run.archetype_id][band];
  const packLine = verdicts.packLines[run.pack_id]?.[run.archetype_id] ?? null;

  // Build question breakdown with points potential for all options
  const questionBreakdown: QuestionBreakdownItem[] = questionIds.map((qid) => {
    const qRow = qRowMap.get(qid);
    const rec = recMap.get(qid);
    const chosenIdx = rec ? rec.option_index : 0;
    const voteCounts = getVoteCounts(db, qid);
    const totalVotes = voteCounts[0] + voteCounts[1] + voteCounts[2] + voteCounts[3];
    const qOptions = qRow ? (JSON.parse(qRow.options) as QuestionOption[]) : [];

    const options: QuestionBreakdownOption[] = qOptions.map((opt, idx) => {
      const votes = voteCounts[idx] ?? 0;
      const smoothedP = computeSmoothedShare(votes, totalVotes);
      let tier: TierName;
      if (totalVotes < 5) {
        tier = 'PROVISIONAL';
      } else if (totalVotes < 15) {
        if (smoothedP >= 0.35) tier = 'FAMILIAR';
        else if (smoothedP >= 0.22) tier = 'UNUSUAL';
        else tier = 'OUTLIER';
      } else {
        if (smoothedP >= 0.35) tier = 'FAMILIAR';
        else if (smoothedP >= 0.22) tier = 'UNUSUAL';
        else if (smoothedP >= 0.12) tier = 'OUTLIER';
        else tier = 'WILDCARD';
      }
      const meta = TIER_META[tier];
      const points = (idx === chosenIdx && rec?.points != null) ? rec.points : meta.points;
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : null;

      return {
        optionIndex: idx,
        text: opt.text,
        points,
        tier: (idx === chosenIdx && rec?.tier) ? rec.tier : tier,
        tierColor: meta.color,
        percentage,
        votes,
        isChosen: idx === chosenIdx,
      };
    });

    return {
      questionId: qid,
      prompt: qRow ? qRow.prompt : '',
      chosenIndex: chosenIdx,
      chosenPoints: rec?.points ?? options[chosenIdx]?.points ?? 0,
      chosenTier: rec?.tier ?? options[chosenIdx]?.tier ?? 'FAMILIAR',
      options,
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
      oneLineTrait: archetypeDef.oneLineTrait,
    },
    verdict,
    packLine,
    answerRecords,
    questionBreakdown,
  };
}

export function listPublishedPacks(
  db: Database.Database,
  deviceId: string,
  dateStr = getUtcDateString()
): PackSummary[] {
  const packs = db
    .prepare(
      `SELECT id, slug, name, description, visual_theme, sort_order
       FROM packs WHERE status = 'published' ORDER BY sort_order ASC`
    )
    .all() as DbPackRow[];

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
    const cnt =
      p.id === 'the_mix'
        ? (totalQuestionsStmt.get() as { cnt: number }).cnt
        : (countStmt.get(p.id) as { cnt: number }).cnt;
    const run = runStmt.get(deviceId, p.id, dateStr) as
      | {
          answer_records: string;
          completed_at: string | null;
          total_points: number;
          archetype_id: ArchetypeId | null;
          score_title: string | null;
        }
      | undefined;
    const records = run ? (JSON.parse(run.answer_records) as AnswerRecord[]) : [];
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
        scoreTitle: run?.completed_at ? run.score_title : null,
      },
    };
  });
}

export function getDailySoloState(
  db: Database.Database,
  packId: PackId,
  deviceId: string,
  dateStr = getUtcDateString()
): SoloDailyResponse | null {
  const pack = db
    .prepare(
      `SELECT id, name, description, visual_theme FROM packs WHERE id = ? AND status = 'published'`
    )
    .get(packId) as { id: PackId; name: string; description: string; visual_theme: PackId } | undefined;

  if (!pack) return null;

  const existingRun = db
    .prepare(
      `SELECT * FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?`
    )
    .get(deviceId, packId, dateStr) as DbSoloRunRow | undefined;

  const questionIds = existingRun
    ? (JSON.parse(existingRun.question_ids) as string[])
    : getOrCreateDailySet(db, packId, dateStr);

  const qRows = fetchQuestionsByIds(db, questionIds);
  const publicQuestions = toPublicQuestions(qRows);
  const answerRecords = existingRun
    ? (JSON.parse(existingRun.answer_records) as AnswerRecord[])
    : [];

  return {
    pack,
    date: dateStr,
    nextResetIso: getNextUtcResetIso(),
    launchSetMode: isLaunchSetMode(),
    questions: publicQuestions,
    answerRecords,
    completed: Boolean(existingRun?.completed_at),
    finalResult: existingRun ? buildFinalResultFromRun(db, existingRun) : null,
  };
}

function getVoteCounts(db: Database.Database, questionId: string): [number, number, number, number] {
  const rows = db
    .prepare(
      `SELECT option_index, COUNT(*) as cnt
       FROM population_votes
       WHERE question_id = ?
       GROUP BY option_index`
    )
    .all(questionId) as { option_index: number; cnt: number }[];
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const r of rows) {
    if (r.option_index >= 0 && r.option_index <= 3) {
      counts[r.option_index] = r.cnt;
    }
  }
  return counts;
}

export interface SoloAnswerSubmitResult {
  reveal: StatRevealPayload;
  answerRecords: AnswerRecord[];
  completed: boolean;
  finalResult: SoloFinalResult | null;
}

/**
 * Atomically records a Solo answer inside a single SQLite transaction:
 * 1. Confirms question is in today's daily set
 * 2. Idempotently returns existing record if already answered in today's run
 * 3. INSERT OR IGNORE into population_votes (never double-counts across days)
 * 4. Computes tier & points server-side with sample-size gates
 * 5. Stores immutable AnswerRecord in solo_runs and finalizes on Q7
 */
export function submitSoloAnswer(
  db: Database.Database,
  params: {
    deviceId: string;
    packId: PackId;
    date: string;
    questionId: string;
    optionIndex: number;
    overthinker?: boolean;
  }
): SoloAnswerSubmitResult {
  const { deviceId, packId, date, questionId, optionIndex, overthinker } = params;

  const packExists = db
    .prepare(`SELECT 1 FROM packs WHERE id = ? AND status = 'published'`)
    .get(packId);
  if (!packExists) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  const todaySetIds = getOrCreateDailySet(db, packId, date);

  const tx = db.transaction((): SoloAnswerSubmitResult => {
    let run = db
      .prepare(
        `SELECT * FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?`
      )
      .get(deviceId, packId, date) as DbSoloRunRow | undefined;

    const activeQuestionIds = run ? (JSON.parse(run.question_ids) as string[]) : todaySetIds;

    if (!activeQuestionIds.includes(questionId)) {
      throw Object.assign(new Error('Question is not part of today’s daily set'), {
        statusCode: 400,
      });
    }

    const qRow = db
      .prepare('SELECT id, pack_id, prompt, options, sort_order FROM questions WHERE id = ?')
      .get(questionId) as DbQuestionRow | undefined;
    if (!qRow) {
      throw Object.assign(new Error('Question not found'), { statusCode: 404 });
    }
    const qOptions = JSON.parse(qRow.options) as QuestionOption[];
    const optionTexts = qOptions.map((o) => o.text);

    const existingRecords: AnswerRecord[] = run
      ? (JSON.parse(run.answer_records) as AnswerRecord[])
      : [];

    // Idempotent handling: if already answered in this run, preserve immutable record!
    const existingRec = existingRecords.find((r) => r.question_id === questionId);
    if (existingRec && run) {
      const counts = getVoteCounts(db, questionId);
      const currentReveal = evaluateSoloAnswer({
        questionId,
        optionTexts,
        chosenIndex: existingRec.option_index,
        voteCounts: counts,
      });
      // Preserve immutable tier & points from when the player answered
      const immutableReveal: StatRevealPayload = {
        ...currentReveal,
        tier: existingRec.tier,
        points: existingRec.points,
      };
      return {
        reveal: immutableReveal,
        answerRecords: existingRecords,
        completed: Boolean(run.completed_at),
        finalResult: buildFinalResultFromRun(db, run),
      };
    }

    const now = new Date().toISOString();

    // Insert real Solo vote with INSERT OR IGNORE (UNIQUE(device_id, question_id))
    db.prepare(
      `INSERT OR IGNORE INTO population_votes (id, device_id, question_id, option_index, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), deviceId, questionId, optionIndex, now);

    const voteCounts = getVoteCounts(db, questionId);
    const reveal = evaluateSoloAnswer({
      questionId,
      optionTexts,
      chosenIndex: optionIndex,
      voteCounts,
    });

    const newRecord: AnswerRecord = {
      question_id: questionId,
      option_index: optionIndex,
      tier: reveal.tier,
      points: reveal.points,
      sample_size_at_answer: reveal.sampleSize,
      scoring_version: SCORING_VERSION,
      ...(overthinker ? { overthinker: true } : {}),
    };

    const updatedRecords = [...existingRecords, newRecord];
    const totalPoints = updatedRecords.reduce((sum, r) => sum + r.points, 0);

    if (!run) {
      const runId = crypto.randomUUID();
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
      run = db.prepare('SELECT * FROM solo_runs WHERE id = ?').get(runId) as DbSoloRunRow;
    } else {
      db.prepare(
        `UPDATE solo_runs SET answer_records = ?, total_points = ? WHERE id = ?`
      ).run(JSON.stringify(updatedRecords), totalPoints, run.id);
    }

    const isComplete = updatedRecords.length >= activeQuestionIds.length;
    if (isComplete && !run.completed_at) {
      const qRows = fetchQuestionsByIds(db, activeQuestionIds);
      const qMap = new Map(qRows.map((r) => [r.id, JSON.parse(r.options) as QuestionOption[]]));
      // Order records according to activeQuestionIds so Q7 is truly index 6 for tie-breaks
      const recordByQ = new Map(updatedRecords.map((r) => [r.question_id, r]));
      const orderedRecords = activeQuestionIds
        .map((qid) => recordByQ.get(qid))
        .filter((r): r is AnswerRecord => Boolean(r));

      const chosenAxes: [number, number, number][] = orderedRecords.map((rec) => {
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

      run = db.prepare('SELECT * FROM solo_runs WHERE id = ?').get(run.id) as DbSoloRunRow;
      return {
        reveal,
        answerRecords: orderedRecords,
        completed: true,
        finalResult: buildFinalResultFromRun(db, run),
      };
    }

    return {
      reveal,
      answerRecords: updatedRecords,
      completed: false,
      finalResult: null,
    };
  });

  return tx();
}
