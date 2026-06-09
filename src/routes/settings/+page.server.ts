import type { PageServerLoad } from './$types';
import { listBackups } from '$lib/server/backup';

export const load: PageServerLoad = () => {
	return {
		backups: listBackups().map((b) => ({
			name: b.name,
			bytes: b.bytes,
			createdAt: b.createdAt
		}))
	};
};
