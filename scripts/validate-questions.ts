import fs from 'fs';
import path from 'path';
import { ARCHETYPE_LIST, computePersonality } from '../src/shared/archetypes';
import { fisherYatesShuffle, mulberry32 } from '../src/shared/scoring';
import type { ArchetypeId, PackId, QuestionRecord } from '../src/shared/types';
import type { PackFileSchema, VerdictsFileSchema } from '../src/server/db';

const BANNED_TERMS = [
  'gta',
  'rockstar',
  'krillion',
  'jinxed',
  'wordle',
  'mission passed',
  'respect +',
  'wanted stars',
  '5-star',
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) {
    if (b.has(w)) inter++;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scanBanned(label: string, text: string, errors: string[]) {
  const lower = text.toLowerCase();
  for (const term of BANNED_TERMS) {
    if (lower.includes(term)) {
      errors.push(`${label}: contains banned term "${term}"`);
    }
  }
}

function main() {
  const root = process.cwd();
  const packsDir = path.resolve(root, 'data', 'packs');
  const files = fs
    .readdirSync(packsDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const errors: string[] = [];
  const seenIds = new Set<string>();
  const allPrompts: { id: string; prompt: string; tokens: Set<string> }[] = [];
  const packMap = new Map<PackId, QuestionRecord[]>();

  if (files.length < 3) {
    errors.push(`Expected at least 3 pack JSON files, found ${files.length}`);
  }

  for (const file of files) {
    const raw = fs.readFileSync(path.join(packsDir, file), 'utf8');
    const parsed = JSON.parse(raw) as PackFileSchema;
    const packId = parsed.pack.id;
    const questions = parsed.questions;
    packMap.set(packId, questions);

    if (questions.length < 15) {
      errors.push(`Pack ${packId}: expected at least 15 questions, got ${questions.length}`);
    }

    for (const q of questions) {
      if (seenIds.has(q.id)) {
        errors.push(`Duplicate question id: ${q.id}`);
      }
      seenIds.add(q.id);

      if (q.pack_id !== packId) {
        errors.push(`Question ${q.id}: pack_id "${q.pack_id}" != file pack "${packId}"`);
      }

      if (!q.prompt || q.prompt.length > 90) {
        errors.push(`Question ${q.id}: prompt length ${q.prompt?.length ?? 0} exceeds 90 chars`);
      }
      scanBanned(`Question ${q.id} prompt`, q.prompt, errors);

      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`Question ${q.id}: must have exactly 4 options`);
        continue;
      }

      const optionTexts = new Set<string>();
      q.options.forEach((opt, idx) => {
        if (!opt.text || opt.text.length > 40) {
          errors.push(
            `Question ${q.id} option ${idx}: length ${opt.text?.length ?? 0} exceeds 40 chars ("${opt.text}")`
          );
        }
        const normOpt = opt.text.trim().toLowerCase();
        if (optionTexts.has(normOpt)) {
          errors.push(`Question ${q.id}: duplicate option text "${opt.text}"`);
        }
        optionTexts.add(normOpt);
        scanBanned(`Question ${q.id} opt ${idx}`, opt.text, errors);

        if (!Array.isArray(opt.axes) || opt.axes.length !== 3) {
          errors.push(`Question ${q.id} opt ${idx}: axes must have length 3`);
        } else {
          for (const w of opt.axes) {
            if (!Number.isInteger(w) || w < -2 || w > 2) {
              errors.push(`Question ${q.id} opt ${idx}: invalid axis weight ${w} (must be int -2..2)`);
            }
          }
        }
      });

      allPrompts.push({ id: q.id, prompt: q.prompt, tokens: tokenize(q.prompt) });
    }
  }

  // Duplicate / near-duplicate prompt detection
  for (let i = 0; i < allPrompts.length; i++) {
    for (let j = i + 1; j < allPrompts.length; j++) {
      const sim = jaccard(allPrompts[i].tokens, allPrompts[j].tokens);
      if (sim >= 0.72) {
        errors.push(
          `Near-duplicate prompts (${(sim * 100).toFixed(0)}% overlap): ${allPrompts[i].id} & ${allPrompts[j].id}`
        );
      }
    }
  }

  // Validate verdicts.json
  const verdictsPath = path.resolve(root, 'data', 'verdicts.json');
  const verdicts = JSON.parse(fs.readFileSync(verdictsPath, 'utf8')) as VerdictsFileSchema;
  let soloVerdictCount = 0;
  for (const arch of ARCHETYPE_LIST) {
    for (const band of ['low', 'mid', 'high'] as const) {
      const entry = verdicts.soloVerdicts?.[arch.id]?.[band];
      if (!entry) {
        errors.push(`Missing solo verdict for ${arch.id}/${band}`);
      } else {
        soloVerdictCount++;
        if (!Number.isInteger(entry.heat) || entry.heat < 1 || entry.heat > 5) {
          errors.push(`Verdict ${arch.id}/${band}: heat must be integer 1..5`);
        }
        scanBanned(`Verdict ${arch.id}/${band}`, `${entry.headlineStamp} ${entry.compliment} ${entry.roast}`, errors);
      }
    }
    if (!verdicts.packLines?.neon_coast?.[arch.id]) {
      errors.push(`Missing neon_coast pack line for ${arch.id}`);
    } else {
      scanBanned(`neon_coast line ${arch.id}`, verdicts.packLines.neon_coast[arch.id], errors);
    }
    if (!verdicts.packLines?.campus_chaos?.[arch.id]) {
      errors.push(`Missing campus_chaos pack line for ${arch.id}`);
    } else {
      scanBanned(`campus_chaos line ${arch.id}`, verdicts.packLines.campus_chaos[arch.id], errors);
    }
  }
  if (soloVerdictCount !== 24) {
    errors.push(`Expected 24 solo verdicts, got ${soloVerdictCount}`);
  }
  if (verdicts.packLines?.the_mix && Object.keys(verdicts.packLines.the_mix).length > 0) {
    errors.push(`the_mix must have no packLines`);
  }

  // Monte Carlo check: 20,000 random daily sets with random answers per pack
  const TRIALS = 20_000;
  const MIN_PCT = 1.5;
  console.log(`\nMonte Carlo archetype balance check (${TRIALS.toLocaleString()} random runs per pack):`);

  for (const [packId, questions] of packMap.entries()) {
    const published = questions.filter((q) => q.status === 'published');
    const rng = mulberry32(packId.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 1337));
    const counts: Record<ArchetypeId, number> = {
      the_architect: 0,
      the_lone_oracle: 0,
      the_dispatcher: 0,
      the_anchor: 0,
      the_rogue_tactician: 0,
      the_free_agent: 0,
      the_plot_twister: 0,
      the_spark: 0,
    };

    for (let t = 0; t < TRIALS; t++) {
      const daily = fisherYatesShuffle(published, rng).slice(0, 7);
      const chosenAxes: [number, number, number][] = daily.map((q) => {
        const pick = Math.floor(rng() * 4);
        return q.options[pick].axes;
      });
      const res = computePersonality(chosenAxes);
      counts[res.archetypeId]++;
    }

    const summary = ARCHETYPE_LIST.map((a) => {
      const pct = (counts[a.id] / TRIALS) * 100;
      if (pct < MIN_PCT) {
        errors.push(`Pack ${packId}: archetype ${a.id} appeared only ${pct.toFixed(2)}% (< ${MIN_PCT}%)`);
      }
      return `${a.id.replace('the_', '')}=${pct.toFixed(1)}%`;
    }).join(', ');
    console.log(`  [${packId}] ${summary}`);
  }

  if (errors.length > 0) {
    console.error('\nValidation FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `\nValidation PASSED: ${seenIds.size} unique questions across ${packMap.size} packs, 24 verdicts, 16 pack lines, 0 banned terms, all 8 archetypes >= ${MIN_PCT}% per pack.\n`
  );
}

main();
