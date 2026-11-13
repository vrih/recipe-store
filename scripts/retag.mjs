#!/usr/bin/env node
// One-off sweep: re-tag every recipe from the curated taxonomy
// (src/lib/server/taxonomy.json) using Claude.
//
//   node scripts/retag.mjs                 # dry run: classify, write data/retag-plan.json, print a summary
//   node scripts/retag.mjs --apply         # back up the DB, then apply the saved plan
//
// Options:
//   --limit N       only classify the first N recipes (try it on a few first)
//   --fresh         ignore any previously saved plan results
//   --concurrency N parallel API calls (default 4)
//
// Needs ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL, DATA_DIR) in the
// environment — e.g. `node --env-file=.env scripts/retag.mjs`.
//
// Nothing is written to the database until --apply, and --apply never calls the
// API: it applies exactly the plan you reviewed. Recipes' own rows (version,
// updated_at) are not touched; only recipe_tags and orphaned tags change.
import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	SWEEP_SYSTEM_PROMPT,
	buildSweepSchema,
	normaliseTags,
	recipeDigest,
	taxonomyTags
} from '../src/lib/server/tagging.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dataDir = process.env.DATA_DIR ?? './data';
const dbPath = join(dataDir, 'recipes.db');
const planPath = join(dataDir, 'retag-plan.json');
const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5';
const allowed = taxonomyTags();

if (!existsSync(dbPath)) {
	console.error(`No database at ${dbPath}`);
	process.exit(1);
}

function openDb() {
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');
	return db;
}

const loadPlan = () => (existsSync(planPath) ? JSON.parse(readFileSync(planPath, 'utf8')) : null);
const savePlan = (plan) => writeFileSync(planPath, JSON.stringify(plan, null, '\t'));

function currentTags(db) {
	const map = new Map();
	for (const r of db
		.prepare(
			`SELECT rt.recipe_id AS id, t.name FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id ORDER BY t.name COLLATE NOCASE`
		)
		.all()) {
		if (!map.has(r.id)) map.set(r.id, []);
		map.get(r.id).push(r.name);
	}
	return map;
}

function tally(lists) {
	const counts = new Map();
	for (const tags of lists) for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function classify(client, recipe) {
	const response = await client.messages.create({
		model,
		max_tokens: 256,
		system: SWEEP_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: recipeDigest(recipe) }],
		output_config: { format: { type: 'json_schema', schema: buildSweepSchema() } }
	});
	const block = response.content.find((b) => b.type === 'text');
	const parsed = JSON.parse(block && 'text' in block ? block.text : '{}');
	return normaliseTags(Array.isArray(parsed.tags) ? parsed.tags : [], allowed);
}

async function dryRun() {
	if (!process.env.ANTHROPIC_API_KEY) {
		console.error('ANTHROPIC_API_KEY is not set.');
		process.exit(1);
	}
	const db = openDb();
	const before = currentTags(db);
	let recipes = db
		.prepare('SELECT id, title, text, ingredients, instructions FROM recipes ORDER BY title COLLATE NOCASE')
		.all();
	const limit = Number(opt('limit', 0));
	if (limit > 0) recipes = recipes.slice(0, limit);

	const prior = flag('fresh') ? null : loadPlan();
	const results = new Map((prior?.recipes ?? []).map((r) => [r.id, r]));
	const todo = recipes.filter((r) => !results.has(r.id));
	console.log(`${recipes.length} recipes, ${recipes.length - todo.length} already in plan, classifying ${todo.length} with ${model}…`);

	const client = new Anthropic();
	const concurrency = Math.max(1, Number(opt('concurrency', 4)));
	let next = 0;
	let done = 0;
	const failures = [];
	async function worker() {
		while (next < todo.length) {
			const recipe = todo[next++];
			try {
				const tags = await classify(client, recipe);
				results.set(recipe.id, { id: recipe.id, title: recipe.title, old: before.get(recipe.id) ?? [], new: tags });
			} catch (err) {
				failures.push(`${recipe.title}: ${err instanceof Error ? err.message : err}`);
			}
			if (++done % 25 === 0 || done === todo.length) {
				console.log(`  ${done}/${todo.length}`);
				// Save progress so an interrupted run can resume.
				savePlan({ createdAt: new Date().toISOString(), model, recipes: [...results.values()] });
			}
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));

	const plan = { createdAt: new Date().toISOString(), model, recipes: [...results.values()] };
	savePlan(plan);
	report(plan, db);
	if (failures.length) {
		console.log(`\n${failures.length} recipes failed (re-run to retry just those):`);
		for (const f of failures) console.log(`  - ${f}`);
	}
	db.close();
}

function report(plan, db) {
	const rows = plan.recipes;
	const oldCounts = tally(rows.map((r) => r.old));
	const newCounts = tally(rows.map((r) => r.new));
	console.log(`\nPlan: ${rows.length} recipes`);
	console.log(`Tags in use: ${oldCounts.length} → ${newCounts.length}`);
	console.log(`Untagged recipes: ${rows.filter((r) => !r.old.length).length} → ${rows.filter((r) => !r.new.length).length}`);
	console.log('\nNew tag distribution:');
	for (const [t, n] of newCounts) console.log(`  ${String(n).padStart(4)}  ${t}`);
	const unused = allowed.filter((t) => !newCounts.some(([n]) => n === t));
	if (unused.length) console.log(`\nTaxonomy tags used by no recipe: ${unused.join(', ')}`);
	const dropped = oldCounts.filter(([t]) => !allowed.some((a) => a.toLowerCase() === t.toLowerCase()));
	console.log('\nExisting tags that will disappear (not in taxonomy):');
	console.log('  ' + dropped.map(([t, n]) => `${t} (${n})`).join(', '));
	console.log(`\nFull per-recipe diff: ${planPath}`);
	console.log('Review it, adjust src/lib/server/taxonomy.json and re-run with --fresh if needed, then run with --apply.');
	void db;
}

function apply() {
	const plan = loadPlan();
	if (!plan) {
		console.error(`No plan at ${planPath}. Run without --apply first.`);
		process.exit(1);
	}
	const db = openDb();

	const backupDir = join(dataDir, 'backups');
	mkdirSync(backupDir, { recursive: true });
	// Not "recipes-*.db": the nightly backup pruner would eventually delete that.
	const backupPath = join(backupDir, `pre-retag-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);

	return db
		.backup(backupPath)
		.then(() => {
			console.log(`Backed up database to ${backupPath}`);
			const known = new Set(db.prepare('SELECT id FROM recipes').all().map((r) => r.id));
			const del = db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?');
			const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
			const tagId = db.prepare('SELECT id FROM tags WHERE name = ?');
			const link = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)');

			let changed = 0;
			let skipped = 0;
			db.transaction(() => {
				for (const r of plan.recipes) {
					if (!known.has(r.id)) {
						skipped++; // recipe deleted since the plan was made
						continue;
					}
					del.run(r.id);
					for (const name of normaliseTags(r.new, allowed)) {
						insertTag.run(name);
						link.run(r.id, tagId.get(name).id);
					}
					changed++;
				}
				// Drop tags nothing uses any more (the old messy ones).
				const removed = db
					.prepare('DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM recipe_tags)')
					.run().changes;
				console.log(`Re-tagged ${changed} recipes (${skipped} skipped), removed ${removed} unused tags.`);
			})();
			db.close();
			console.log(`To undo: stop the app and replace ${join(dataDir, 'recipes.db')} with the backup.`);
		});
}

if (flag('apply')) await apply();
else await dryRun();
