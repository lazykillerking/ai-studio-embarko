import { openDatabase } from '../src/server/db';
import { getVoteCounts } from '../src/server/solo';

const db = openDatabase();
const totalQuestions = (db.prepare('SELECT COUNT(*) as cnt FROM questions').get() as any).cnt;
const totalBaseRows = (db.prepare('SELECT COUNT(*) as cnt FROM question_base_stats').get() as any).cnt;
const minMax = db.prepare('SELECT MIN(total_base_votes) as minV, MAX(total_base_votes) as maxV, AVG(total_base_votes) as avgV FROM question_base_stats').get() as any;
const totalBaseVotes = (db.prepare('SELECT SUM(total_base_votes) as sumV FROM question_base_stats').get() as any).sumV;
const totalRealVotes = (db.prepare('SELECT COUNT(*) as cnt FROM population_votes').get() as any).cnt;

console.log('--- BASELINE VERIFICATION ---');
console.log('Total Questions:', totalQuestions);
console.log('Total question_base_stats entries:', totalBaseRows);
console.log('Min total_base_votes (should be > 55):', minMax.minV);
console.log('Max total_base_votes:', minMax.maxV);
console.log('Average total_base_votes:', Math.round(minMax.avgV));
console.log('Total Base Votes across all questions:', totalBaseVotes);
console.log('Total Real Player Votes in population_votes:', totalRealVotes);

if (minMax.minV <= 55) {
  console.error('ERROR: min total_base_votes is not above 55!');
  process.exit(1);
}
if (totalBaseRows !== totalQuestions) {
  console.error(`ERROR: mismatch between questions (${totalQuestions}) and base stats (${totalBaseRows})`);
  process.exit(1);
}

// Check sample questions
console.log('\n--- SAMPLE QUESTION CHECK ---');
const sampleQ = db.prepare('SELECT id, prompt FROM questions LIMIT 5').all() as any[];
for (const q of sampleQ) {
  const combined = getVoteCounts(db, q.id);
  const organic = getVoteCounts(db, q.id, { organicOnly: true });
  const totalCombined = combined[0] + combined[1] + combined[2] + combined[3];
  const pcts = combined.map(v => Math.round((v / totalCombined) * 100));
  console.log(`Q [${q.id}]: "${q.prompt.slice(0, 45)}..."`);
  console.log(`  Combined (${totalCombined} players): [${combined.join(', ')}] -> [${pcts.map(p => p + '%').join(', ')}]`);
  console.log(`  Real player votes only: [${organic.join(', ')}] (sum: ${organic.reduce((a, b) => a + b, 0)})`);
}

db.close();
console.log('\nALL CHECKS PASSED SUCCESSFULLY!');
