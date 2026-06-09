import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { runMigrations } from './migrate.js';

const DATA_DIR = process.env.DATA_DIR ?? './data';

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'recipes.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

runMigrations(db);

export default db;
