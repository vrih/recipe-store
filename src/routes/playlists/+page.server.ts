import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { listPlaylists } from '$lib/server/playlists';

export const load: PageServerLoad = () => ({ playlists: listPlaylists(db) });
