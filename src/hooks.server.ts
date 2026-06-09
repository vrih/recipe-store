// Ensure the database is opened and migrations run before the first request,
// and schedule nightly online backups.
import db from '$lib/server/db';
import { scheduleNightlyBackups } from '$lib/server/backup';

// Marker so you can confirm in the container logs which build is running.
console.log('[recipe-store] started — streaming import enabled (build: stream-v2)');

scheduleNightlyBackups(db);
