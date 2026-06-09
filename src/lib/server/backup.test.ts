import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runMigrations } from './migrate.js';
import { listBackups, pruneBackups, createBackup } from './backup.js';

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'rs-backup-'));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function makeBackupFiles(count: number) {
	for (let i = 0; i < count; i++) {
		// Zero-padded so lexical sort == chronological sort.
		const stamp = String(i).padStart(3, '0');
		writeFileSync(join(dir, `recipes-2026-01-01T00-00-${stamp}-000Z.db`), 'x');
	}
}

describe('listBackups', () => {
	it('returns empty for a missing directory', () => {
		expect(listBackups(join(dir, 'nope'))).toEqual([]);
	});

	it('lists only backup files, newest first', () => {
		makeBackupFiles(3);
		writeFileSync(join(dir, 'unrelated.txt'), 'x');
		const backups = listBackups(dir);
		expect(backups).toHaveLength(3);
		expect(backups[0].name > backups[1].name).toBe(true); // newest first
	});
});

describe('pruneBackups', () => {
	it('keeps only the newest N backups', () => {
		makeBackupFiles(20);
		const removed = pruneBackups(14, dir);
		expect(removed).toHaveLength(6);
		expect(listBackups(dir)).toHaveLength(14);
	});

	it('keeps the most recent ones (highest timestamps)', () => {
		makeBackupFiles(5);
		pruneBackups(2, dir);
		const remaining = listBackups(dir).map((b) => b.name);
		expect(remaining).toEqual([
			'recipes-2026-01-01T00-00-004-000Z.db',
			'recipes-2026-01-01T00-00-003-000Z.db'
		]);
	});

	it('does nothing when under the limit', () => {
		makeBackupFiles(3);
		expect(pruneBackups(14, dir)).toEqual([]);
		expect(listBackups(dir)).toHaveLength(3);
	});
});

describe('createBackup', () => {
	it('writes a usable online backup of the database', async () => {
		const db = new Database(':memory:');
		runMigrations(db);
		db.prepare(
			`INSERT INTO recipes (id, title, created_at, updated_at) VALUES ('r1', 'Soup', 0, 0)`
		).run();

		const name = await createBackup(db, dir);
		expect(name).toMatch(/^recipes-.*\.db$/);
		expect(existsSync(join(dir, name))).toBe(true);

		// The backup is a real SQLite DB containing the row.
		const restored = new Database(join(dir, name), { readonly: true });
		const row = restored.prepare('SELECT title FROM recipes WHERE id = ?').get('r1') as {
			title: string;
		};
		expect(row.title).toBe('Soup');
		restored.close();
	});

	it('prunes old backups as part of creating a new one', async () => {
		process.env.BACKUP_KEEP = '3';
		makeBackupFiles(5);
		const db = new Database(':memory:');
		runMigrations(db);
		await createBackup(db, dir);
		// 5 old + 1 new = 6, pruned down to 3
		expect(readdirSync(dir).filter((n) => n.endsWith('.db'))).toHaveLength(3);
		delete process.env.BACKUP_KEEP;
	});
});
