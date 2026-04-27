# Discogs Collection Manager

Next.js app to browse and manage your Discogs vinyl collection with table/card browsing, analytics, playlists, and local sync tooling.

## Quick start

```bash
npm install
npm run setup
npm run dev
```

Copy [`env.example`](env.example) to `.env.local` if you prefer manual setup. You need a [Discogs API token](https://www.discogs.com/settings/developers) and your Discogs username.

## Features

- Collection browser with table and card views
- Style, artist, label, year, and date filtering
- Analytics dashboard and collection value summaries
- Playlist pages and release-level playlist controls
- Local SQLite-backed sync and metadata caching
- Local-only API routes guarded by request checks

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Development server       |
| `npm run build`   | Production build         |
| `npm run start`   | Run production server    |
| `npm run lint`    | ESLint                   |
| `npm run setup`   | Interactive env setup    |

## Releases

See [`CHANGELOG.md`](CHANGELOG.md). Tag format: `v1.0.0` (matches `package.json` `version`).

## Repository Notes

- `.cursor/` and `docs/` are intentionally local-only and ignored by git.
- Keep secrets in `.env.local` only; never commit credentials.

## License

MIT — see [`LICENSE`](LICENSE).
