import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { PackId } from '../shared/types';
import { getDbPath, openDatabase, resolveProjectRoot, seedPacksAndQuestions } from './db';
import { createCrew, getCrewState, submitCrewAnswer } from './crew';
import { injectOgMetaTags } from './og';
import { AnswerRateLimiter, getClientIp, resolveDeviceId } from './security';
import { getDailySoloState, getUtcDateString, isLaunchSetMode, listPublishedPacks, submitSoloAnswer } from './solo';

const PackIdSchema = z.enum(['the_mix', 'neon_coast', 'campus_chaos']);

const SoloAnswerBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  packId: PackIdSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  questionId: z.string().min(1).max(64),
  optionIndex: z.number().int().min(0).max(3),
  overthinker: z.boolean().optional(),
});

const CreateCrewBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  mode: z.enum(['themed', 'mixed']),
  packId: PackIdSchema.nullable().optional(),
  name: z.string().max(48).optional(),
  nickname: z.string().max(40).optional(),
  excludeQuestionIds: z.array(z.string().max(64)).max(50).optional(),
});

const CrewAnswerBodySchema = z.object({
  deviceId: z.string().uuid().optional(),
  questionId: z.string().min(1).max(64).optional(),
  optionIndex: z.number().int().min(0).max(3).optional(),
  nickname: z.string().max(40).optional(),
});

export function createApp(db: Database.Database, options?: { rateLimitPerMin?: number }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  const rateLimiter = new AnswerRateLimiter(options?.rateLimitPerMin ?? 60, 60_000);

  // Health & persistence verification endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    const bootMeta = db
      .prepare("SELECT value, updated_at FROM app_meta WHERE key = 'first_boot_at'")
      .get() as { value: string; updated_at: string } | undefined;
    const { packCount } = db
      .prepare("SELECT COUNT(*) as packCount FROM packs WHERE status = 'published'")
      .get() as { packCount: number };
    const { questionCount } = db
      .prepare("SELECT COUNT(*) as questionCount FROM questions WHERE status = 'published'")
      .get() as { questionCount: number };
    const { voteCount } = db
      .prepare('SELECT COUNT(*) as voteCount FROM population_votes')
      .get() as { voteCount: number };
    const { crewCount } = db
      .prepare('SELECT COUNT(*) as crewCount FROM crews')
      .get() as { crewCount: number };

    res.json({
      ok: true,
      launchSetMode: isLaunchSetMode(),
      firstBootAt: bootMeta?.value ?? null,
      packs: packCount,
      questions: questionCount,
      populationVotes: voteCount,
      crews: crewCount,
      utcDate: getUtcDateString(),
    });
  });

  // GET /api/packs
  app.get('/api/packs', (req: Request, res: Response) => {
    const deviceId = resolveDeviceId(req, res);
    const packs = listPublishedPacks(db, deviceId);
    res.json({
      deviceId,
      utcDate: getUtcDateString(),
      launchSetMode: isLaunchSetMode(),
      packs,
    });
  });

  // GET /api/solo/daily?packId=
  app.get('/api/solo/daily', (req: Request, res: Response) => {
    const parsedPack = PackIdSchema.safeParse(req.query.packId);
    if (!parsedPack.success) {
      res.status(400).json({ error: 'Invalid or missing packId' });
      return;
    }
    const deviceId = resolveDeviceId(req, res);
    const state = getDailySoloState(db, parsedPack.data, deviceId);
    if (!state) {
      res.status(404).json({ error: 'Pack not found' });
      return;
    }
    res.json({ deviceId, ...state });
  });

  // POST /api/solo/answer
  app.post('/api/solo/answer', (req: Request, res: Response) => {
    const parsed = SoloAnswerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request payload', details: parsed.error.flatten() });
      return;
    }

    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader('Retry-After', String(limitCheck.retryAfterSec));
      res.status(429).json({ error: 'Too many submissions. Please slow down.' });
      return;
    }

    // Confirm date matches current UTC date (or allow exact date if client already started a run on it)
    const currentUtcDate = getUtcDateString();
    const targetDate = parsed.data.date;
    if (targetDate !== currentUtcDate) {
      // Allow finishing an in-progress run started just before UTC midnight, otherwise reject stale dates
      const inProgress = db
        .prepare(
          'SELECT 1 FROM solo_runs WHERE device_id = ? AND pack_id = ? AND challenge_date = ?'
        )
        .get(deviceId, parsed.data.packId, targetDate);
      if (!inProgress) {
        res.status(409).json({
          error: 'Daily set has reset for the new UTC day. Reloading today’s questions.',
          currentUtcDate,
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
        overthinker: parsed.data.overthinker,
      });
      res.json({ deviceId, ...result });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to submit answer';
      res.status(status).json({ error: message });
    }
  });

  // POST /api/crews
  app.post('/api/crews', (req: Request, res: Response) => {
    const parsed = CreateCrewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid crew payload', details: parsed.error.flatten() });
      return;
    }

    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader('Retry-After', String(limitCheck.retryAfterSec));
      res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
      return;
    }

    try {
      const created = createCrew(db, {
        deviceId,
        mode: parsed.data.mode,
        packId: (parsed.data.packId ?? null) as PackId | null,
        name: parsed.data.name,
        nickname: parsed.data.nickname,
        excludeQuestionIds: parsed.data.excludeQuestionIds,
      });
      res.status(201).json({ deviceId, ...created });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to create crew';
      res.status(status).json({ error: message });
    }
  });

  // GET /api/crews/:code
  app.get('/api/crews/:code', (req: Request, res: Response) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).json({ error: 'Invalid crew code' });
      return;
    }
    const deviceId = resolveDeviceId(req, res);
    const state = getCrewState(db, code, deviceId);
    if (!state) {
      res.status(404).json({ error: 'Crew not found. Check the 6-character code.' });
      return;
    }
    res.json({ deviceId, ...state });
  });

  // POST /api/crews/:code/answer
  app.post('/api/crews/:code/answer', (req: Request, res: Response) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(404).json({ error: 'Invalid crew code' });
      return;
    }
    const parsed = CrewAnswerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid answer payload', details: parsed.error.flatten() });
      return;
    }

    const deviceId = resolveDeviceId(req, res, parsed.data.deviceId);
    const ip = getClientIp(req);
    const limitCheck = rateLimiter.checkPair(ip, deviceId);
    if (!limitCheck.allowed) {
      res.setHeader('Retry-After', String(limitCheck.retryAfterSec));
      res.status(429).json({ error: 'Too many submissions. Please slow down.' });
      return;
    }

    try {
      const state = submitCrewAnswer(db, {
        code,
        deviceId,
        questionId: parsed.data.questionId,
        optionIndex: parsed.data.optionIndex,
        nickname: parsed.data.nickname,
      });
      res.json({ deviceId, ...state });
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      const message = err instanceof Error ? err.message : 'Failed to save crew answer';
      res.status(status).json({ error: message });
    }
  });

  // Error handler for malformed JSON etc.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(400).json({ error: err.message || 'Bad request' });
  });

  return app;
}

async function startServer() {
  const db = openDatabase();
  const seeded = seedPacksAndQuestions(db);

  // Record first_boot_at once so persistence across Embarko redeploys is verifiable via /api/health
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES ('first_boot_at', ?, ?)`
  ).run(now, now);

  const app = createApp(db);
  const root = resolveProjectRoot();
  const isProd = process.env.NODE_ENV === 'production';

  // Always serve static OG images from /public/og
  const publicOgDir = path.resolve(root, 'public', 'og');
  if (fs.existsSync(publicOgDir)) {
    app.use('/og', express.static(publicOgDir, { maxAge: '1d' }));
  }

  if (!isProd) {
    // Development mode: mount Vite dev middleware inside Express
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    app.use(vite.middlewares);

    app.get(['/', '/crew/:code', '*'], async (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const rawHtml = fs.readFileSync(path.resolve(root, 'index.html'), 'utf8');
        const crewCode = typeof req.params.code === 'string' ? req.params.code : undefined;
        const withOg = injectOgMetaTags(rawHtml, req, db, crewCode);
        const transformed = await vite.transformIndexHtml(req.originalUrl, withOg);
        res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(transformed);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    // Production mode: serve built static assets from /dist and inject OG tags on HTML responses
    const distDir = path.resolve(root, 'dist');
    const indexHtmlPath = path.resolve(distDir, 'index.html');
    const indexHtmlTemplate = fs.existsSync(indexHtmlPath)
      ? fs.readFileSync(indexHtmlPath, 'utf8')
      : '<!doctype html><html><head><title>BRAINPRINT</title></head><body><div id="root"></div></body></html>';

    // Serve static assets (index: false so GET / goes through our OG injector!)
    app.use(express.static(distDir, { index: false, maxAge: '7d' }));

    app.get('/', (req: Request, res: Response) => {
      const html = injectOgMetaTags(indexHtmlTemplate, req, db);
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    });

    app.get('/crew/:code', (req: Request, res: Response) => {
      const code = String(req.params.code || '');
      const html = injectOgMetaTags(indexHtmlTemplate, req, db, code);
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    });

    // SPA fallback for all other client routes
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API route not found' });
        return;
      }
      if (req.path.includes('.')) {
        next();
        return;
      }
      const html = injectOgMetaTags(indexHtmlTemplate, req, db);
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(html);
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(
      `BRAINPRINT listening on http://0.0.0.0:${port} (env=${isProd ? 'production' : 'development'}, db=${getDbPath()}, seeded=${seeded.packs} packs/${seeded.questions} questions)`
    );
  });
}

// Start server only when executed directly (not when imported by Vitest)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.mjs'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start BRAINPRINT server:', err);
    process.exit(1);
  });
}
