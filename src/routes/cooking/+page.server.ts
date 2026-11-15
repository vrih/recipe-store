import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { activeCooks } from '$lib/server/progress';
import { parseInstructions } from '$lib/server/parse';
import { encodeId } from '$lib/ids';

export const load: PageServerLoad = () => ({
	cooks: activeCooks(db, (i) => parseInstructions(i).filter((s) => s.type === 'step').length).map((c) => ({
		...c,
		eid: encodeId(c.id)
	}))
});
