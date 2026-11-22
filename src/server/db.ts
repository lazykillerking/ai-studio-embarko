import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { ArchetypeId, PackId, QuestionRecord, RarityBand, VerdictEntry } from '../shared/types';
import type { SquadRoastTable } from '../shared/scoring';

export interface PackFileSchema {
  pack: {
    id: PackId;
    slug: string;
    name: string;
    description: string;
    visual_theme: PackId;
    status: 'published' | 'draft';
    sort_order: number;
  };
  questions: QuestionRecord[];
}

export interface VerdictsFileSchema {
  soloVerdicts: Record<ArchetypeId, Record<RarityBand, VerdictEntry>>;
  packLines: Partial<Record<PackId, Record<ArchetypeId, string>>>;
  squadRoasts: SquadRoastTable;
}

export function resolveProjectRoot(): string {
  return process.cwd();
}

export function getDbPath(): string {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(resolveProjectRoot(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'brainprint.db');
}

export function openDatabase(customPath?: string): Database.Database {
  const dbPath = customPath ?? getDbPath();
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db);
  return db;
}

/**
 * Applies SQL migrations in /migrations idempotently in filename order.
 * Never drops or alters Embarko's _litestream_seq or _litestream_lock tables.
 */
export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _bp_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = path.resolve(resolveProjectRoot(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const isApplied = db.prepare('SELECT 1 FROM _bp_migrations WHERE filename = ?');
  const markApplied = db.prepare('INSERT OR IGNORE INTO _bp_migrations (filename, applied_at) VALUES (?, ?)');

  for (const file of files) {
    const existing = isApplied.get(file);
    if (existing) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const tx = db.transaction(() => {
      db.exec(sql);
      markApplied.run(file, new Date().toISOString());
    });
    tx();
  }
}

export function loadPackFiles(): PackFileSchema[] {
  const packsDir = path.resolve(resolveProjectRoot(), 'data', 'packs');
  if (!fs.existsSync(packsDir)) return [];
  const files = fs
    .readdirSync(packsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(packsDir, file), 'utf8');
    return JSON.parse(raw) as PackFileSchema;
  });
}

let cachedVerdicts: VerdictsFileSchema | null = null;
export function loadVerdicts(): VerdictsFileSchema {
  if (cachedVerdicts) return cachedVerdicts;
  const verdictsPath = path.resolve(resolveProjectRoot(), 'data', 'verdicts.json');
  const raw = fs.readFileSync(verdictsPath, 'utf8');
  cachedVerdicts = JSON.parse(raw) as VerdictsFileSchema;
  return cachedVerdicts;
}

/**
 * Idempotently upserts all packs and questions from /data/packs/*.json.
 * Preserves existing votes, daily sets, solo runs, and crews.
 */
export function seedPacksAndQuestions(db: Database.Database): { packs: number; questions: number } {
  const packFiles = loadPackFiles();
  const now = new Date().toISOString();

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
    for (const pf of packFiles) {
      upsertPack.run({
        ...pf.pack,
        created_at: now,
      });
      packCount += 1;
      pf.questions.forEach((q, idx) => {
        upsertQuestion.run({
          id: q.id,
          pack_id: q.pack_id,
          prompt: q.prompt,
          options: JSON.stringify(q.options),
          tags: JSON.stringify(q.tags ?? []),
          difficulty: q.difficulty ?? 'medium',
          status: q.status ?? 'published',
          version: q.version ?? 1,
          sort_order: idx + 1,
          created_at: now,
        });
        questionCount += 1;
      });
    }
  });
  tx();

  return { packs: packCount, questions: questionCount };
}
