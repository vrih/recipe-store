import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { runMigrations } from './migrate.js';

export const DATA_DIR = process.env.DATA_DIR ?? './data';

/**
 * Open a SQLite database at the given data directory, apply pragmas, and run
 * migrations. Exposed as a factory so tests can spin up isolated databases.
 */
export function createDb(dataDir: string): Database.Database {
	mkdirSync(dataDir, { recursive: true });
	const db = new Database(join(dataDir, 'recipes.db'));
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	db.pragma('synchronous = NORMAL');
	runMigrations(db);
	return db;
}

const db = createDb(DATA_DIR);

export default db;
