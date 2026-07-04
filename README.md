# Discogs Collection Manager

Discogs Collection Manager is a Next.js application for managing a vinyl collection locally using the Discogs API, a local SQLite database, and a UI optimized for browsing, filtering, syncing, and enrichment workflows.

This is WIP. Bugs and inconsistencies may be present :)

## High-level features

### Collection experience

- Table and card layouts for browsing your full Discogs collection
- Rich release presentation: artists, labels, styles, year, condition, pricing, and media links
- Discogs deep links from each release row/card
- Pagination controls with adjustable page size

### Search, filter, and sort

- Multi-field filtering for:
  - styles
  - artist
  - title
  - label
  - year range and exact year
  - date added range
- Column-based sorting in collection views (date, title, artist, styles, condition, price, etc.)
- Quick filter reset and stateful filtering UX

### Data sync and enrichment

- Local database sync workflows for:
  - release data refresh
  - collection updates from Discogs
  - metadata backfill jobs
- Price synchronization with stale-price refresh handling
- Video and tracklist enrichment pipelines
- Sync job progress/status feedback in the UI

### Analytics and insights

- Dedicated analytics page for collection trend exploration
- Year-based aggregation and monthly breakdowns
- Collection value summaries and metrics
- Loading/error handling for long-running analytics fetches

### Playlists and media workflows

- Playlist management integrated with collection releases
- Release-level playlist controls
- YouTube and Discogs video handling in release displays

### Invoice import pipeline

- Invoice import UI and API flow for deejay.de invoice ingestion
- Parsing and normalization utilities for invoice data
- Integration path into collection/database workflows

### Security and local-first design

- Local-request protection on API routes (designed for local/private usage)
- Environment-driven secrets (`.env.local`) with setup helper
- Security-oriented utility modules and hardened defaults

### Performance and reliability

- SQLite (`better-sqlite3`) for fast local reads/writes
- Database indexes and migration scripts for evolving schema/performance
- Caching and sync control utilities for heavy collection operations

## Quick start

```bash
npm install
npm run setup   # or configure .env.local manually — see Setup below
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Setup

The app needs Discogs API credentials before it can sync your collection or call Discogs on your behalf. Credentials live in `.env.local` in the project root (gitignored).

You can configure them in either of two ways.

### Option 1: Interactive setup (recommended)

```bash
npm run setup
```

This runs `scripts/setup.cjs`, a small terminal wizard that:

1. Checks whether `.env.local` already exists (and asks before overwriting)
2. Prompts for your **Discogs API token**, **username**, and optional **app URL**
3. Writes `.env.local` with the values you entered

After it finishes, restart the dev server if it is already running:

```bash
npm run dev
```

Create a personal access token at [Discogs developer settings](https://www.discogs.com/settings/developers). Use the same Discogs username you sign in with.

### Option 2: Manual setup

Copy the template and edit it yourself:

```bash
cp env.example .env.local
```

Then set these values in `.env.local`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCOGS_API_TOKEN` | Yes, for sync | Personal access token from Discogs |
| `DISCOGS_USERNAME` | Yes, for sync | Your Discogs username |
| `NEXT_PUBLIC_APP_URL` | No | App base URL (defaults to `http://localhost:3000`) |
| `ADMIN_TOKEN` | No | Protects `/api/performance` in non-dev deployments |

See [`env.example`](env.example) for the full template and comments.

### What works without credentials?

The app **starts without** `.env.local`. You are not blocked at install time.

| With credentials | Without credentials |
| --- | --- |
| Browse your local SQLite collection | Browse your local SQLite collection (if already synced) |
| Update collection from Discogs | Setup guidance shown in the UI |
| Sync release data, prices, videos | Sync buttons disabled |
| Invoice import against Discogs | Invoice import blocked until configured |

If credentials are missing, the UI shows a setup card with steps. API routes that talk to Discogs return a structured `SETUP_REQUIRED` response instead of crashing the server.

### Verify setup

1. Run `npm run dev`
2. Open the collection page — the setup banner should be gone
3. Use **Update Collection** or **Get Release Data** — they should be enabled and reach Discogs

If something still fails, check the terminal for warnings about missing `DISCOGS_API_TOKEN` or `DISCOGS_USERNAME`.

## Scripts


| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| `npm run dev`            | Start development server                |
| `npm run build`          | Build production artifacts              |
| `npm run start`          | Run production server                   |
| `npm run lint`           | Run ESLint                              |
| `npm run setup`          | Interactive `.env.local` setup          |
| `npm run security:audit` | Run production dependency audit         |
| `npm run security:fix`   | Apply production dependency audit fixes |
| `npm run security:check` | Check outdated packages and audit       |


## Tech stack

- Next.js (App Router)
- React + TypeScript
- Tailwind CSS + UI components
- SQLite (`better-sqlite3`)
- Discogs REST API integration

## Release notes

See [`CHANGELOG.md`](CHANGELOG.md) for release history and unreleased changes.

## Discogs API compliance notes

- Intended usage is local/personal collection management.
- Requests identify the app with a dedicated `User-Agent` and handle `429` rate-limit responses.
- The UI displays Discogs attribution and non-affiliation notice.
- The app stores local sync/cache data only to provide the service; do not redistribute Discogs-derived datasets.

## Repository notes

- Keep all credentials in `.env.local`; never commit secrets.

## License

MIT — see [`LICENSE`](LICENSE).