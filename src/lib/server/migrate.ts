import type Database from 'better-sqlite3';

const MIGRATIONS = [
	{
		name: '001_initial',
		up: `
      CREATE TABLE recipes (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL DEFAULT '',
        text          TEXT NOT NULL DEFAULT '',
        yield         TEXT NOT NULL DEFAULT '',
        prep_time     TEXT NOT NULL DEFAULT '',
        cook_time     TEXT NOT NULL DEFAULT '',
        total_time    TEXT NOT NULL DEFAULT '',
        ingredients   TEXT NOT NULL DEFAULT '',
        instructions  TEXT NOT NULL DEFAULT '',
        notes         TEXT NOT NULL DEFAULT '',
        nutrition     TEXT NOT NULL DEFAULT '',
        link          TEXT NOT NULL DEFAULT '',
        favorite      INTEGER NOT NULL DEFAULT 0,
        want_to_cook  INTEGER NOT NULL DEFAULT 0,
        date          REAL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        version       INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE recipe_images (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        position  INTEGER NOT NULL,
        path      TEXT NOT NULL,
        PRIMARY KEY (recipe_id, position)
      );

      CREATE TABLE tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
      );

      CREATE TABLE recipe_tags (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (recipe_id, tag_id)
      );

      -- Contentless FTS5 index over title, overview, ingredients, instructions.
      -- Notes and nutrition are excluded per product spec.
      -- Tags are searched via SQL join (see search query in routes).
      CREATE VIRTUAL TABLE recipes_fts USING fts5(
        title, text, ingredients, instructions,
        content='', tokenize='unicode61'
      );

      CREATE TABLE cook_progress (
        recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL CHECK (kind IN ('ingredient', 'step')),
        item_key   TEXT NOT NULL,
        done       INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, kind, item_key)
      );

      -- FTS sync triggers: keep the contentless index up to date.
      -- On delete, the original values must be passed to the 'delete' command.
      CREATE TRIGGER recipes_ai AFTER INSERT ON recipes BEGIN
        INSERT INTO recipes_fts(rowid, title, text, ingredients, instructions)
        VALUES (new.rowid, new.title, new.text, new.ingredients, new.instructions);
      END;

      CREATE TRIGGER recipes_au AFTER UPDATE OF title, text, ingredients, instructions ON recipes BEGIN
        INSERT INTO recipes_fts(recipes_fts, rowid, title, text, ingredients, instructions)
        VALUES ('delete', old.rowid, old.title, old.text, old.ingredients, old.instructions);
        INSERT INTO recipes_fts(rowid, title, text, ingredients, instructions)
        VALUES (new.rowid, new.title, new.text, new.ingredients, new.instructions);
      END;

      CREATE TRIGGER recipes_ad BEFORE DELETE ON recipes BEGIN
        INSERT INTO recipes_fts(recipes_fts, rowid, title, text, ingredients, instructions)
        VALUES ('delete', old.rowid, old.title, old.text, old.ingredients, old.instructions);
      END;
    `
	},
	{
		name: '002_timer_favorites',
		up: `
      -- Household-wide quick-start timer presets (e.g. Rice 14m, Pasta 9m).
      -- Not tied to a recipe; shared across every device.
      CREATE TABLE timer_favorites (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        label      TEXT NOT NULL,
        seconds    INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (label, seconds)
      );
    `
	}
] as const;

export function runMigrations(db: Database.Database): void {
	db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `);

	const applied = new Set(
		(db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
	);

	for (const migration of MIGRATIONS) {
		if (applied.has(migration.name)) continue;
		db.transaction(() => {
			db.exec(migration.up);
			db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
				migration.name,
				Date.now()
			);
		})();
	}
}
