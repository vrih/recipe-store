# Recipe Store — Product Requirements Document

**Status:** Draft for review
**Author:** Daniel Bowman
**Date:** 2026-06-09
**Document owner:** daniel@danielbowman.co.uk

---

## 1. Summary

Recipe Store is a self-hosted web application for managing a personal recipe
collection. It is a focused replacement for the [Mela](https://mela.recipes)
recipe manager, built to run on a Synology DiskStation and reached exclusively
over a private Tailscale network.

The product preserves the parts of Mela that matter to the user — importing the
existing Mela library, a browsable thumbnail index, full recipe metadata, in-app
editing, and a distraction-free cooking mode — while deliberately dropping
features the user does not want (meal calendar, grocery lists). It adds
first-class web-URL import and is designed for the latest Safari only.

---

## 2. Goals and non-goals

### 2.1 Goals

- Provide a fast, pleasant web UI for browsing, viewing, editing, and creating
  recipes.
- Import the user's existing Mela library via the `.melarecipe` and
  `.melarecipes` file formats with zero data loss.
- Import recipes from a web URL, both automatically (structured-data scraping)
  and via a Claude-assisted fallback for messy pages.
- Preserve and display all metadata that Mela shows for a recipe.
- Offer a cooking mode that keeps the screen awake, removes UI chrome, and lets
  the cook strike through completed ingredients and steps.
- Support favourites and tag-based search/filtering.
- Guarantee that concurrent users on the LAN/Tailnet cannot corrupt data.
- Be trivial to deploy and back up on a Synology NAS.

### 2.2 Non-goals (explicitly out of scope for v1)

- Meal planning / calendar.
- Grocery / shopping lists.
- User accounts, authentication, or authorization (access is gated by
  Tailscale; every Tailnet user is fully trusted).
- Multi-tenant or public/internet-facing hosting.
- Native mobile apps (the web app must work well in mobile Safari, but no app
  store presence).
- Support for browsers other than the latest Safari (no legacy/cross-browser
  shimming required).
- Nutritional calculation from ingredients (we store and display nutrition text
  only, matching Mela).

---

## 3. Users and access model

- **Who:** The household. A small number of trusted users (typically 1–4),
  some on macOS Safari, some on iOS/iPadOS Safari (e.g. a tablet in the
  kitchen).
- **Access:** The app binds to the DiskStation and is exposed only on the
  Tailnet. There is **no login screen**. Anyone who can reach the URL is
  authorized to do everything (view, edit, import, delete).
- **Trust boundary:** Tailscale is the entire security perimeter. The app does
  not implement auth, sessions, CSRF tokens for human users, or rate limiting
  for abuse. (Standard defensive coding against accidental corruption still
  applies — see §9.)

---

## 4. Technology stack and architecture

| Concern            | Choice                                                        |
| ------------------ | ------------------------------------------------------------- |
| Language / runtime | Node.js (LTS), TypeScript                                     |
| Framework          | SvelteKit (full-stack: SSR + API routes in one app)           |
| Database           | SQLite via `better-sqlite3` (synchronous, in-process)         |
| Image storage      | Files on disk under a data volume; DB stores relative paths   |
| URL scraping       | Server-side fetch + JSON-LD / schema.org Recipe parsing       |
| Claude fallback    | Anthropic API (`claude-haiku-4-5`) called server-side         |
| Image processing   | `sharp` for decode + thumbnail generation                     |
| Markdown rendering | Markdown-to-HTML with **HTML sanitization** (see §9.2)        |
| Styling            | Plain CSS / CSS modules (no need for cross-browser frameworks)|
| Packaging          | Docker image + `docker-compose.yml`                           |
| Deployment         | Synology Container Manager, data on a mounted volume           |

### 4.1 Why this stack

- **SvelteKit** gives one deployable unit (UI + API), small JS payloads, and
  excellent performance — ideal for a single-container NAS deployment and for
  snappy mobile Safari use.
- **`better-sqlite3`** is synchronous and fully transactional, which makes the
  concurrency/integrity guarantees (§9) simple and robust without an ORM or a
  separate DB server.
- **Docker on Container Manager** is the supported, portable way to run
  third-party apps on modern DSM; the SQLite file and recipe images live on a
  host-mounted volume so backups and snapshots are straightforward.

### 4.2 High-level architecture

```
                Tailnet only
  Safari (mac/iOS) ───────────► SvelteKit app (Node, in container)
                                   │
                                   ├── API routes (recipes, import, search)
                                   ├── better-sqlite3 ──► /data/recipes.db (WAL)
                                   └── image store      ──► /data/images/*
```

- Single process, single container.
- One SQLite database file in **WAL mode** on a mounted volume.
- Recipe images stored as files (not BLOBs) for cheap thumbnailing and backup;
  the DB holds metadata and file paths.

---

## 5. Data model

SQLite schema (illustrative; field names mirror the Mela format in §6 so import
is lossless).

```sql
CREATE TABLE recipes (
  id            TEXT PRIMARY KEY,        -- Mela id (URL-without-scheme) or UUID
  title         TEXT NOT NULL DEFAULT '',
  text          TEXT NOT NULL DEFAULT '', -- short overview (markdown links)
  yield         TEXT NOT NULL DEFAULT '',
  prep_time     TEXT NOT NULL DEFAULT '',
  cook_time     TEXT NOT NULL DEFAULT '',
  total_time    TEXT NOT NULL DEFAULT '',
  ingredients   TEXT NOT NULL DEFAULT '', -- line-separated; '#' = section header
  instructions  TEXT NOT NULL DEFAULT '', -- markdown
  notes         TEXT NOT NULL DEFAULT '', -- markdown
  nutrition     TEXT NOT NULL DEFAULT '', -- markdown
  link          TEXT NOT NULL DEFAULT '', -- source URL
  favorite      INTEGER NOT NULL DEFAULT 0,
  want_to_cook  INTEGER NOT NULL DEFAULT 0,
  date          REAL,                     -- original Mela timestamp if present
  created_at    INTEGER NOT NULL,         -- epoch ms
  updated_at    INTEGER NOT NULL,         -- epoch ms, used for optimistic locking
  version       INTEGER NOT NULL DEFAULT 1 -- bumped on every save (see §9)
);

CREATE TABLE recipe_images (
  recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,           -- 0 = primary / thumbnail source
  path        TEXT NOT NULL,              -- relative path under /data/images
  PRIMARY KEY (recipe_id, position)
);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE recipe_tags (
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

-- Full-text search over titles, ingredients, instructions, notes, tags.
CREATE VIRTUAL TABLE recipes_fts USING fts5(
  title, text, ingredients, instructions, notes, tags,
  content='', tokenize='unicode61'
);

-- Cooking-mode strike-through progress, persisted per recipe (§7.4).
-- 'kind' is 'ingredient' | 'step'; 'item_key' is the stable line key (§7.7).
CREATE TABLE cook_progress (
  recipe_id  TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  item_key   TEXT NOT NULL,
  done       INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, kind, item_key)
);
```

Notes:

- **Categories ↔ tags:** Mela "categories" map onto our `tags`. (Mela disallows
  commas in category names; we keep that constraint on import.)
- **Thumbnails** are derived from `recipe_images.position = 0`. `sharp`
  generates a resized thumbnail cached on disk on first import/save.
- **FTS5** is a contentless (`content=''`) index; the app keeps it in sync with
  `recipes`/`recipe_tags` via **triggers** (insert/update/delete) so search
  results never drift from the source rows. Tag filtering uses the relational
  tables.
- **`cook_progress`** is keyed by recipe only (no user dimension), consistent
  with the no-auth, fully-trusted access model — two cooks on the same recipe
  share progress. Acceptable for a household; revisit if it becomes annoying.

---

## 6. Mela file format and import

### 6.1 `.melarecipe` (single recipe, JSON)

| Field          | Type            | Meaning                                                            |
| -------------- | --------------- | ------------------------------------------------------------------ |
| `id`           | string          | URL-without-scheme for web imports, otherwise a UUID               |
| `title`        | string          | Recipe name                                                        |
| `text`         | string          | Short overview under the title (supports markdown links)           |
| `images`       | string[]        | Base64-encoded image data                                          |
| `categories`   | string[]        | Tags (no commas permitted)                                         |
| `yield`        | string          | Serving size / quantity                                            |
| `prepTime`     | string          | Prep duration                                                      |
| `cookTime`     | string          | Cook duration                                                      |
| `totalTime`    | string          | Total duration                                                     |
| `ingredients`  | string          | Line-separated; `#` prefix denotes a section header; markdown links|
| `instructions` | string          | Step-by-step; markdown                                             |
| `notes`        | string          | Markdown                                                           |
| `nutrition`    | string          | Markdown                                                           |
| `link`         | string          | Source URL                                                         |
| `favorite`     | boolean         | Favourited                                                         |
| `wantToCook`   | boolean         | "Want to cook" flag                                                |
| `date`         | double          | Seconds since 2001-01-01 UTC (Apple epoch)                         |

### 6.2 `.melarecipes` (collection)

- A **ZIP archive** containing many `.melarecipe` JSON files (one per recipe).
  May also nest further `.melarecipes` archives.
- Importer must recurse into nested archives.

### 6.3 Import requirements

- **FR-IMP-1:** Accept upload of one or more `.melarecipe` and/or
  `.melarecipes` files via the UI.
- **FR-IMP-2:** Parse every recipe, decode base64 images to files, generate
  thumbnails, and map categories → tags.
- **FR-IMP-3:** Convert Apple `date` to a stored timestamp; preserve `favorite`
  and `wantToCook`.
- **FR-IMP-4:** **De-duplication / upsert by `id`.** Re-importing the same
  library updates existing recipes rather than creating duplicates. On conflict,
  present a clear choice (skip / overwrite) or default to skip with a summary.
- **FR-IMP-5:** Import runs in a single DB transaction per recipe; a malformed
  recipe is reported and skipped without aborting the whole batch.
- **FR-IMP-6:** Show an import summary (added / updated / skipped / failed).
- **FR-IMP-7 (portability):** Data portability in v1 is provided by **backups**
  of the data volume (SQLite file + images), not by a Mela-format export.
  Round-trip `.melarecipe` / `.melarecipes` export is **out of scope for v1**
  (may be reconsidered later). See §10 for the backup approach.

---

## 7. Functional requirements

### 7.1 Recipe index

- **FR-IDX-1:** Grid/gallery of all recipes, each card showing the thumbnail and
  title.
- **FR-IDX-2:** Cards lazy-load images; the grid stays smooth with hundreds of
  recipes.
- **FR-IDX-3:** Visible indicators for favourite and "want to cook".
- **FR-IDX-4:** Sort options (recently added, recently updated, title A–Z).
- **FR-IDX-5:** Filters: favourites only, "want to cook" only, and by one or
  more tags.
- **FR-IDX-6:** Search box performing FTS across title/ingredients/instructions/
  notes/tags, combinable with tag filters.

### 7.2 Recipe view

- **FR-VIEW-1:** Display **all** Mela metadata: title, overview text, image(s),
  tags/categories, yield, prep/cook/total time, ingredients (with section
  headers), instructions, notes, nutrition, and source link.
- **FR-VIEW-2:** Render markdown in text/ingredients/instructions/notes/
  nutrition (links, headings, bold/italic) consistently with how Mela presents
  them.
- **FR-VIEW-3:** Image gallery when a recipe has multiple images.
- **FR-VIEW-4:** Quick actions: toggle favourite, enter cooking mode, edit,
  delete, open source link.

### 7.3 Recipe editing and creation

- **FR-EDIT-1:** Edit every field shown in the view, including adding/removing
  tags and images.
- **FR-EDIT-2:** Create a brand-new recipe from scratch.
- **FR-EDIT-3:** Image management: upload, reorder (set primary/thumbnail),
  delete.
- **FR-EDIT-4:** Markdown-aware editing for the markdown fields; ingredient
  editing respects line-per-item and `#` section headers.
- **FR-EDIT-5:** Saving is transactional and uses optimistic concurrency
  control (§9). Unsaved-changes warning on navigation away.
- **FR-EDIT-6:** Delete with confirmation; cascades to images and tag links.

### 7.4 Cooking mode

- **FR-COOK-1:** Distraction-free layout: hide global navigation/chrome; show
  only ingredients and instructions (and optionally times/yield).
- **FR-COOK-2:** Keep the screen awake using the **Screen Wake Lock API**
  (supported in modern Safari). Re-acquire the lock on `visibilitychange` (the
  lock is dropped when the tab is backgrounded); release it on exit. Show a
  clear on/off indicator and a graceful message if the lock is unavailable.
  **Caveat:** the Wake Lock only holds while the tab is foregrounded and visible
  — it cannot override an OS-level auto-lock once the device itself sleeps. This
  should be communicated in-product (e.g. a hint to disable auto-lock on a
  dedicated kitchen tablet).
- **FR-COOK-3:** Tap an ingredient or step to **strike it through** as done;
  tap again to undo. Strike-through state **persists per recipe** (stored in
  `cook_progress`, §5) so a cook can leave and return mid-recipe without losing
  progress. Provide a "reset progress" action to clear all strikes for the
  recipe.
- **FR-COOK-4:** Larger typography and generous tap targets for kitchen/tablet
  use. Yield/serving scaling is **out of scope for v1** (future/stretch — see
  §12).
- **FR-COOK-5:** Easy exit back to the recipe view.

### 7.5 URL import (hybrid)

- **FR-URL-1 (automatic):** Paste a recipe URL; the server fetches the page and
  extracts a recipe from **JSON-LD / schema.org `Recipe`** structured data
  (with microdata as a secondary path), mapping fields to the Mela model and
  downloading the lead image. Pre-fill the editor for review before saving.
- **FR-URL-2 (Claude fallback):** When structured data is missing or
  incomplete, offer a Claude-assisted conversion: the server sends the fetched
  page content (or the URL) to the Anthropic API (`claude-haiku-4-5`, chosen for
  low cost on routine extraction) and requests a strict `.melarecipe`-shaped
  JSON via a defined response schema, which then pre-fills the editor. The model
  is configurable via env var so it can be upgraded for hard pages if needed.
- **FR-URL-3:** Both paths land in the **same review-then-save** editor flow; no
  silent writes. The original URL is stored in `link`.
- **FR-URL-4:** Network/parse failures produce a clear, actionable error;
  Claude fallback is offered as the next step.
- **Config:** the Anthropic API key is provided via environment variable;
  Claude fallback is disabled gracefully if no key is configured. Outbound calls
  (to recipe sites and to the Anthropic API) require the DiskStation/container
  to have appropriate outbound network access.

### 7.6 Favourites, tags, and search

- **FR-TAG-1:** Toggle favourite from index, view, and cooking entry points.
- **FR-TAG-2:** Add/remove tags on a recipe; tag list autocompletes from
  existing tags.
- **FR-TAG-3:** Browse/filter by tag; combine tag filters with text search.
- **FR-TAG-4:** Tag management is implicit (tags with no recipes can be pruned);
  a dedicated tag admin screen is a stretch goal.

### 7.7 Ingredient and step parsing

Mela stores `ingredients` and `instructions` as **single strings**, but the
view, cooking mode, and strike-through need discrete items. The app derives
structured items deterministically:

- **FR-PARSE-1 (ingredients):** Split on newlines. A line beginning with `#` is
  a **section header** (rendered as a heading, not strikeable). Blank lines are
  separators. Each remaining line is one strikeable ingredient.
- **FR-PARSE-2 (instructions):** Split into steps on blank-line-separated
  paragraphs / newlines (markdown headings start a new labelled group). Each
  step is individually strikeable.
- **FR-PARSE-3 (stable keys):** Each item gets a stable `item_key` (e.g. a hash
  of `kind + normalized text`, with an index suffix to disambiguate duplicates)
  so `cook_progress` survives benign re-renders. Editing a recipe's text may
  invalidate keys; on save, orphaned `cook_progress` rows for that recipe are
  cleared.
- **FR-PARSE-4:** Parsing is presentation-layer only — the original Mela strings
  remain the source of truth in `recipes`, preserving lossless round-trip with
  the imported data.

---

## 8. Non-functional requirements

- **NFR-BROWSER:** Target the **latest Safari** (macOS and iOS/iPadOS) only.
  Use modern web APIs freely (Wake Lock, ES modules, modern CSS). No polyfills
  or legacy fallbacks required.
- **NFR-PERF:** Index and search feel instant for a library of up to a few
  thousand recipes; thumbnails are pre-generated and cached.
- **NFR-RESPONSIVE:** Usable on a phone, a kitchen tablet, and a desktop. Touch
  targets sized for in-kitchen use.
- **NFR-OFFLINE:** Not required for v1 (Tailnet assumed reachable). PWA/offline
  caching is a possible future enhancement.
- **NFR-BACKUP:** All durable state (SQLite file + images) lives under one
  mounted data directory so DSM snapshots/Hyper Backup cover it.
- **NFR-ACCESS:** No authentication by design; the app must never assume it is
  internet-exposed.
- **NFR-TEST:** Automated tests for the high-risk logic: Mela import (incl.
  nested `.melarecipes`, dedupe/upsert, base64 images), ingredient/step parsing
  (§7.7), optimistic-locking conflict behaviour, and the URL scraper's JSON-LD
  mapping. A SessionStart hook should let tests/linters run in web sessions.
- **NFR-SEC:** Even on a trusted Tailnet, treat **imported content as
  untrusted** (URL-imported pages and Mela files can contain hostile markup).
  Sanitize all rendered HTML (§9.2); validate/limit uploaded file sizes and
  decoded image types; never execute fetched content.

---

## 9. Concurrency, integrity, and content safety

### 9.1 Concurrency and integrity

This is a hard requirement: **concurrent users must not corrupt data.**

- **DB mode:** SQLite in **WAL** mode with `busy_timeout` set, allowing
  concurrent readers alongside a single writer without "database is locked"
  failures under normal household load.
- **Transactions:** All writes (save, import, delete, tag changes) execute
  inside `better-sqlite3` transactions. Multi-row operations (recipe + images +
  tags) are atomic — partial writes never persist.
- **Optimistic concurrency control:** Each recipe has a `version` (and
  `updated_at`). The editor loads the current version; on save the API requires
  the version to match. If another user saved in the meantime, the write is
  rejected with a **409 Conflict** and the UI prompts the user to reload/merge
  rather than silently clobbering changes (the classic lost-update problem).
- **Single-writer discipline:** Because `better-sqlite3` is synchronous and
  in-process, writes are naturally serialized within the one app process,
  removing a large class of race conditions.
- **Foreign keys:** `PRAGMA foreign_keys = ON`; deletes cascade cleanly.
- **Import safety:** Batch imports commit per-recipe so a failure mid-batch
  leaves a consistent database and a clear report.

### 9.2 Content safety (sanitization)

- Markdown fields (`text`, `instructions`, `notes`, `nutrition`) and ingredient
  lines are rendered through a markdown renderer with **HTML output
  sanitization** (allowlist of safe tags/attributes), so raw or embedded HTML
  from imported recipes cannot inject script or unexpected markup.
- URL-scraped and Claude-generated content is treated identically to file
  imports — it always lands in the review editor and is sanitized on render.
- Uploaded files and decoded images are size- and type-checked before being
  written to disk.

---

## 10. Deployment (Synology DiskStation)

- **Packaging:** A `Dockerfile` builds the SvelteKit app into a small Node
  runtime image; `docker-compose.yml` defines the service, ports, env, and the
  data volume.
- **Container Manager:** Imported and run via DSM Container Manager.
- **Volumes:** `/data` (containing `recipes.db`, WAL files, and `images/`) maps
  to a host folder for persistence and backup.
- **Configuration (env vars):**
  - `PORT` — listen port.
  - `DATA_DIR` — defaults to `/data`.
  - `ANTHROPIC_API_KEY` — optional; enables the Claude URL-import fallback.
  - `ANTHROPIC_MODEL` — optional; defaults to `claude-haiku-4-5`.
- **Networking:** Container reachable only over the Tailnet (via DSM's Tailscale
  package or host networking on a Tailscale-joined NAS). Outbound access is
  needed for URL scraping and the Anthropic API.
- **Backup:** Stop-free SQLite backups via the `.backup`/online-backup API on a
  schedule, plus DSM snapshots of the data volume.

---

## 11. Milestones (suggested build order)

1. **M0 — Skeleton & schema.** SvelteKit app, SQLite + WAL, migrations,
   Dockerfile/compose, runs on DSM with an empty DB.
2. **M1 — Mela import.** `.melarecipe` + `.melarecipes` import, image
   extraction, thumbnails, dedupe/upsert, summary.
3. **M2 — Browse & view.** Index grid with thumbnails, full metadata view,
   markdown rendering, favourite toggle.
4. **M3 — Edit & create.** Full editor with optimistic locking, image
   management, tag editing, delete.
5. **M4 — Search & tags.** FTS search (with sync triggers), tag filters, sorts.
6. **M5 — Cooking mode.** Distraction-free layout, Wake Lock, item parsing
   (§7.7), persisted strike-through.
7. **M6 — URL import (hybrid).** JSON-LD scraper, then Claude (Haiku) fallback,
   both into the review editor; content sanitization.
8. **M7 — Backups & polish.** Scheduled SQLite/online backups, responsive and
   kitchen-tablet refinements, test coverage for high-risk logic.

---

## 12. Decisions log and remaining questions

### 12.1 Resolved decisions

| Decision                        | Outcome                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| Stack                           | Node + SvelteKit + `better-sqlite3`                              |
| Deployment                      | Docker on Synology Container Manager                             |
| URL import                      | Hybrid: JSON-LD scraper first, Claude fallback for messy pages   |
| Claude model for fallback       | `claude-haiku-4-5` (configurable via `ANTHROPIC_MODEL`)          |
| Cooking-mode strike-through     | **Persist per recipe** (with a reset action)                    |
| Mela-format export (round-trip) | **Out of scope for v1**; portability via volume/SQLite backups   |
| Yield/serving scaling           | **Out of scope for v1** (future/stretch)                        |
| Want-to-cook flag               | Store on import; expose as a simple index filter, no own screen  |

### 12.2 Remaining questions

1. **Instruction step delimiter:** confirm splitting steps on blank lines /
   newlines (§7.7) matches how your Mela recipes are actually written — some
   recipes may use single newlines between every line. Worth checking against a
   sample of your real library during M1.
2. **Search scope:** is title + ingredients + instructions + notes + tags the
   right FTS surface, or should notes/nutrition be excluded from search?
3. **Backup cadence:** desired schedule/retention for the automated SQLite
   backups in M7 (e.g. nightly, keep 14)?

---

## 13. References

- [Mela file format documentation](https://mela.recipes/fileformat/index.html)
- [Mela help](https://mela.recipes/help/)
- [Mela on the App Store](https://apps.apple.com/us/app/mela-recipe-manager/id1548466041)
- [mela-decoder-js (reference decoder)](https://github.com/markmals/mela-decoder-js)
- [Crouton → Mela converter gist (format example)](https://gist.github.com/matiaskorhonen/40d46b122f061420787dde414b238260)
