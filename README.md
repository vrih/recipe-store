# 🍳 Recipe Store

A cosy, self-hosted home for your recipes — built to replace [Mela](https://mela.recipes/) with something that lives on **your** server, holds **your** data, and never asks you to log in at the kitchen counter with flour on your hands.

Import your whole Mela library, browse it on the couch, search it from your phone, and cook from it on a tablet with the screen staying awake and a satisfying strike-through as you go.

---

## Why it exists

Mela is lovely, but your recipes shouldn't be trapped in one app. Recipe Store is a small SvelteKit app you run on your own box (it's happiest on a Synology NAS reachable over [Tailscale](https://tailscale.com/)). No accounts, no cloud, no subscription — just your recipes, on hardware you control, shared with everyone on your home network.

## What it does

🗂️ **Imports your Mela library** — drag in a `.melarecipe` or a whole `.melarecipes` archive (nested ones too). Images, tags, favourites, timings and all. Re-import any time; it dedupes instead of duplicating.

🔎 **Finds anything, fast** — full-text search across titles, ingredients, and methods, plus tag filters, favourites, and "want to cook" — all in the URL, so a search is shareable and the back button just works.

📖 **Shows recipes beautifully** — clean view with images, ingredients (section headers and all), and a step-by-step method. Markdown is rendered and **sanitised**, so a dodgy imported page can't sneak scripts onto your screen.

✏️ **Lets you edit and create** — a proper editor for every field, image upload/reorder/delete, and safe concurrent editing (two people, one recipe, no lost changes).

👩‍🍳 **Has a cooking mode** — distraction-free, big text, keeps the screen awake, and lets you tap ingredients and steps to strike them through. Your progress is saved per recipe, so you can wander off to answer the door and come back to exactly where you were.

⏱️ **Times your steps** — cooking mode spots durations in the method ("fry for 1–2 minutes", "bake 1 hour 30 minutes") and turns them into one-tap timers. Run several at once; they keep correct time even if the tab is backgrounded, survive a reload, and ping you with a notification (plus a beep and a buzz) when they're done. Ranges ring at the lower bound so you can check the food early.

📲 **Installs as an app** — it's a PWA, so you can add it to a phone or tablet home screen and run it full-screen, with the app shell cached for a quick launch. Timer notifications work best once installed (on iOS, adding to the Home Screen is required for notifications to fire).

🌐 **Imports from the web** — paste a recipe URL and it reads the page's structured data (with a Claude-powered fallback for messy pages). If a site blocks automated access, paste the page source and it'll read the recipe straight out of that.

💾 **Backs itself up** — nightly online SQLite backups (keeping the last 14), plus a "back up now" button, all inside the data volume your NAS snapshots already cover.

## Built with

[SvelteKit](https://svelte.dev/) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite in WAL mode + FTS5) · [sharp](https://sharp.pixelplumbing.com/) for thumbnails · the [Anthropic API](https://www.anthropic.com/) for web-import smarts · all wrapped in a single Node container.

---

## Running it

```sh
cp .env.example .env      # set ORIGIN to how you reach the app; add an
                          # ANTHROPIC_API_KEY if you want the Claude web-import
docker compose up -d --build
```

Then open it at your `ORIGIN` and head to **Import** to bring your library in.

> **Heads up:** `ORIGIN` must match the address you actually use (e.g. your Tailscale hostname) or uploads will be refused, and give the container a bit of memory headroom (the compose file requests 1 GB) — importing a big library decodes a lot of images.

### Developing

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # vitest
npm run check      # type-check
```

The data lives under `./data` (SQLite DB + images + backups) — gitignored, and the single thing worth backing up.

The PWA icons in `static/icons/` are generated from `src/lib/assets/favicon.svg`. If you change the logo, regenerate and commit them with `node scripts/gen-icons.mjs`. The service worker (`src/service-worker.ts`) only runs in a production build — test PWA install/offline behaviour with `npm run build && npm run preview`, not `npm run dev`.

## Status & design

Everything above is built and tested. The full product spec — data model, Mela file format notes, concurrency strategy, and the decisions behind it all — lives in [`docs/PRD.md`](docs/PRD.md) if you want the deep dive.

Made for a household that cooks. Enjoy! 🥘
