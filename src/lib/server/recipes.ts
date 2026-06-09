import type Database from 'better-sqlite3';
import { thumbPathFor } from './images.js';

export interface RecipeRow {
	id: string;
	title: string;
	text: string;
	yield: string;
	prep_time: string;
	cook_time: string;
	total_time: string;
	ingredients: string;
	instructions: string;
	notes: string;
	nutrition: string;
	link: string;
	favorite: number;
	want_to_cook: number;
	date: number | null;
	created_at: number;
	updated_at: number;
	version: number;
}

export interface RecipeCard {
	id: string;
	title: string;
	favorite: boolean;
	want_to_cook: boolean;
	thumb: string | null;
}

export type SortKey = 'created' | 'updated' | 'title';

const SORT_SQL: Record<SortKey, string> = {
	created: 'r.created_at DESC',
	updated: 'r.updated_at DESC',
	title: 'r.title COLLATE NOCASE ASC'
};

/** First image path for a recipe (position 0), used to derive the thumbnail. */
function firstImagePath(db: Database.Database, recipeId: string): string | null {
	const row = db
		.prepare('SELECT path FROM recipe_images WHERE recipe_id = ? ORDER BY position LIMIT 1')
		.get(recipeId) as { path: string } | undefined;
	return row?.path ?? null;
}

export interface SearchParams {
	q?: string;
	tags?: string[];
	favorite?: boolean;
	wantToCook?: boolean;
	sort?: SortKey;
}

type CardRow = Pick<RecipeRow, 'id' | 'title' | 'favorite' | 'want_to_cook'> & {
	img: string | null;
};

function toCards(rows: CardRow[]): RecipeCard[] {
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		favorite: !!r.favorite,
		want_to_cook: !!r.want_to_cook,
		thumb: r.img ? thumbPathFor(r.img) : null
	}));
}

/**
 * Turn free-text into a safe FTS5 prefix query: each token is quoted (so
 * punctuation can't break the syntax) and suffixed with `*` for prefix match;
 * tokens are implicitly ANDed. Returns null if there are no usable tokens.
 */
function toFtsQuery(q: string): string | null {
	const tokens = q.match(/[\p{L}\p{N}]+/gu);
	if (!tokens || tokens.length === 0) return null;
	return tokens.map((t) => `"${t}"*`).join(' ');
}

/** List recipes as cards for the index grid (no filters). */
export function listRecipeCards(db: Database.Database, sort: SortKey = 'created'): RecipeCard[] {
	return searchRecipeCards(db, { sort });
}

/**
 * Search/filter recipes for the index grid. Combines FTS (title/overview/
 * ingredients/instructions) OR tag-name match for the text query, AND-ed with
 * tag filters and the favourite / want-to-cook flags.
 */
export function searchRecipeCards(db: Database.Database, p: SearchParams): RecipeCard[] {
	const sort = p.sort ?? 'created';
	const where: string[] = [];
	const params: Record<string, unknown> = {};

	if (p.q && p.q.trim()) {
		const fts = toFtsQuery(p.q);
		const like = `%${p.q.trim()}%`;
		params.qlike = like;
		if (fts) {
			params.fts = fts;
			where.push(
				`(r.rowid IN (SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH @fts)
          OR EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
                     WHERE rt.recipe_id = r.id AND t.name LIKE @qlike))`
			);
		} else {
			// Query had no tokens (pure punctuation); fall back to tag-name LIKE only.
			where.push(
				`EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
                 WHERE rt.recipe_id = r.id AND t.name LIKE @qlike)`
			);
		}
	}

	(p.tags ?? []).forEach((tag, i) => {
		const key = `tag${i}`;
		params[key] = tag;
		where.push(
			`EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
               WHERE rt.recipe_id = r.id AND t.name = @${key} COLLATE NOCASE)`
		);
	});

	if (p.favorite) where.push('r.favorite = 1');
	if (p.wantToCook) where.push('r.want_to_cook = 1');

	const sql = `
    SELECT r.id, r.title, r.favorite, r.want_to_cook,
           (SELECT path FROM recipe_images WHERE recipe_id = r.id ORDER BY position LIMIT 1) AS img
    FROM recipes r
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${SORT_SQL[sort]}`;

	return toCards(db.prepare(sql).all(params) as CardRow[]);
}

/** All tag names with their recipe counts, for the filter UI. */
export function listTags(db: Database.Database): { name: string; count: number }[] {
	return db
		.prepare(
			`SELECT t.name AS name, COUNT(rt.recipe_id) AS count
       FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE`
		)
		.all() as { name: string; count: number }[];
}

/** Full recipe row by id, or null. */
export function getRecipe(db: Database.Database, id: string): RecipeRow | null {
	return (db.prepare('SELECT * FROM recipes WHERE id = ?').get(id) as RecipeRow | undefined) ?? null;
}

/** Ordered image paths for a recipe. */
export function getRecipeImages(db: Database.Database, id: string): string[] {
	const rows = db
		.prepare('SELECT path FROM recipe_images WHERE recipe_id = ? ORDER BY position')
		.all(id) as { path: string }[];
	return rows.map((r) => r.path);
}

/** Tag names for a recipe. */
export function getRecipeTags(db: Database.Database, id: string): string[] {
	const rows = db
		.prepare(
			`SELECT t.name FROM tags t
       JOIN recipe_tags rt ON rt.tag_id = t.id
       WHERE rt.recipe_id = ?
       ORDER BY t.name COLLATE NOCASE`
		)
		.all(id) as { name: string }[];
	return rows.map((r) => r.name);
}

/** Toggle/set a recipe's favorite flag; returns the new value, or null if missing. */
export function setFavorite(db: Database.Database, id: string, favorite: boolean): boolean | null {
	const result = db
		.prepare('UPDATE recipes SET favorite = ?, updated_at = ? WHERE id = ?')
		.run(favorite ? 1 : 0, Date.now(), id);
	return result.changes > 0 ? favorite : null;
}
