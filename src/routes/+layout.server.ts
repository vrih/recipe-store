import type { LayoutServerLoad } from './$types';
import db from '$lib/server/db';
import { activeCooks } from '$lib/server/progress';
import { parseInstructions } from '$lib/server/parse';

export const load: LayoutServerLoad = ({ url }) => {
	// Reading the pathname re-runs this on every navigation so the nav stays fresh.
	void url.pathname;
	const count = activeCooks(db, (i) => parseInstructions(i).filter((s) => s.type === 'step').length).length;
	return { cookingCount: count };
};
