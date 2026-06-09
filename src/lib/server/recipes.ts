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

/** List recipes as cards for the index grid. */
export function listRecipeCards(db: Database.Database, sort: SortKey = 'created'): RecipeCard[] {
	const rows = db
		.prepare(
			`SELECT r.id, r.title, r.favorite, r.want_to_cook,
              (SELECT path FROM recipe_images WHERE recipe_id = r.id ORDER BY position LIMIT 1) AS img
       FROM recipes r
       ORDER BY ${SORT_SQL[sort]}`
		)
		.all() as (Pick<RecipeRow, 'id' | 'title' | 'favorite' | 'want_to_cook'> & {
		img: string | null;
	})[];

	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		favorite: !!r.favorite,
		want_to_cook: !!r.want_to_cook,
		thumb: r.img ? thumbPathFor(r.img) : null
	}));
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
