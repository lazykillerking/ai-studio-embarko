import 'dotenv/config';
import { getDbPath, openDatabase } from '../src/server/db';
import { getScoreTitle } from '../src/shared/scoring';

const db = openDatabase();
const rows = db
  .prepare(
    `SELECT total_points, pack_id, scoring_version
     FROM solo_runs
     WHERE completed_at IS NOT NULL
     ORDER BY total_points ASC`
  )
  .all() as { total_points: number; pack_id: string; scoring_version: number }[];

db.close();

console.log(`BRAINPRINT Score Distribution (${getDbPath()})`);
console.log(`Completed solo runs: ${rows.length}\n`);

if (rows.length === 0) {
  console.log('No completed solo runs recorded yet.');
  process.exit(0);
}

const bands: { label: string; min: number; max: number; count: number }[] = [
  { label: '0–95    (The Familiar Mind)', min: 0, max: 95, count: 0 },
  { label: '96–165  (The Steady Signal)', min: 96, max: 165, count: 0 },
  { label: '166–245 (The Unconventional)', min: 166, max: 245, count: 0 },
  { label: '246–335 (The Maverick)', min: 246, max: 335, count: 0 },
  { label: '336+    (The Wildcard Mind)', min: 336, max: 9999, count: 0 },
];

for (const row of rows) {
  const b = bands.find((x) => row.total_points >= x.min && row.total_points <= x.max);
  if (b) b.count++;
}

for (const b of bands) {
  const pct = ((b.count / rows.length) * 100).toFixed(1).padStart(5);
  const barLen = Math.round((b.count / rows.length) * 30);
  console.log(`${b.label.padEnd(32)} | ${String(b.count).padStart(4)} (${pct}%) ${'#'.repeat(barLen)}`);
}

const points = rows.map((r) => r.total_points);
const p = (q: number) => points[Math.min(points.length - 1, Math.floor(q * points.length))];
console.log(
  `\nPercentiles: p10=${p(0.1)} | p25=${p(0.25)} | median=${p(0.5)} (${getScoreTitle(p(0.5))}) | p75=${p(0.75)} | p90=${p(0.9)}`
);
