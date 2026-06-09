import type Database from 'better-sqlite3';
import { mkdirSync, readdirSync, statSync, rmSync } from 'fs';
import { join } from 'path';

const BACKUP_PREFIX = 'recipes-';
const BACKUP_SUFFIX = '.db';

function backupsDir(): string {
	return join(process.env.DATA_DIR ?? './data', 'backups');
}

/** Default number of backups to retain (overridable via BACKUP_KEEP). */
function keepCount(): number {
	const n = Number(process.env.BACKUP_KEEP);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 14;
}

/** Hour of day (0-23, local time) to run the nightly backup. */
function backupHour(): number {
	const n = Number(process.env.BACKUP_HOUR);
	return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 3;
}

export interface BackupInfo {
	name: string;
	bytes: number;
	createdAt: number;
}

/** List existing backups, newest first. */
export function listBackups(dir = backupsDir()): BackupInfo[] {
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return [];
	}
	return names
		.filter((n) => n.startsWith(BACKUP_PREFIX) && n.endsWith(BACKUP_SUFFIX))
		.map((name) => {
			const s = statSync(join(dir, name));
			return { name, bytes: s.size, createdAt: s.mtimeMs };
		})
		.sort((a, b) => b.name.localeCompare(a.name));
}

/** Delete all but the newest `keep` backups. Returns the names removed. */
export function pruneBackups(keep = keepCount(), dir = backupsDir()): string[] {
	const backups = listBackups(dir);
	const removed: string[] = [];
	for (const b of backups.slice(keep)) {
		rmSync(join(dir, b.name), { force: true });
		removed.push(b.name);
	}
	return removed;
}

/**
 * Create a stop-free online backup of the database via SQLite's backup API,
 * then prune old backups. Returns the new backup filename.
 */
export async function createBackup(db: Database.Database, dir = backupsDir()): Promise<string> {
	mkdirSync(dir, { recursive: true });
	// Sortable, filesystem-safe UTC timestamp: recipes-2026-06-09T03-00-00-000Z.db
	const stamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
	const name = `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
	await db.backup(join(dir, name));
	pruneBackups(keepCount(), dir);
	return name;
}

/** Milliseconds from now until the next occurrence of the given local hour. */
function msUntilNextRun(hour: number, now = new Date()): number {
	const next = new Date(now);
	next.setHours(hour, 0, 0, 0);
	if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
	return next.getTime() - now.getTime();
}

let scheduled = false;

/**
 * Schedule a nightly online backup. Idempotent (safe to call once at startup);
 * disabled when BACKUP_ENABLED=false. Timers are unref'd so they never keep the
 * process alive on their own.
 */
export function scheduleNightlyBackups(db: Database.Database): void {
	if (scheduled || process.env.BACKUP_ENABLED === 'false') return;
	scheduled = true;

	const run = async () => {
		try {
			await createBackup(db);
		} catch (err) {
			console.error('[backup] nightly backup failed:', err);
		}
		// Re-arm for the following day.
		setTimeout(run, msUntilNextRun(backupHour())).unref?.();
	};

	setTimeout(run, msUntilNextRun(backupHour())).unref?.();
}
