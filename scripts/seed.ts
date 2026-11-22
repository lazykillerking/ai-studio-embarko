import 'dotenv/config';
import { getDbPath, openDatabase, seedPacksAndQuestions } from '../src/server/db';

const db = openDatabase();
const result = seedPacksAndQuestions(db);
db.close();
console.log(
  `Seeded ${result.packs} packs and ${result.questions} questions into ${getDbPath()}`
);
