// Ensure the database is opened and migrations run before the first request,
// and schedule nightly online backups.
import db from '$lib/server/db';
import { scheduleNightlyBackups } from '$lib/server/backup';

scheduleNightlyBackups(db);
