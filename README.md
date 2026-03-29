# Discogs Collection Manager

Next.js app to browse and manage your Discogs vinyl collection (filtering, sorting, analytics, API sync).

**[Full documentation → `docs/README.md`](docs/README.md)**

## Quick start

```bash
npm install
npm run setup
npm run dev
```

Copy [`env.example`](env.example) to `.env.local` if you prefer manual setup. You need a [Discogs API token](https://www.discogs.com/settings/developers) and your Discogs username.

## Scripts

| Command           | Description              |
| ----------------- | ------------------------ |
| `npm run dev`     | Development server       |
| `npm run build`   | Production build         |
| `npm run start`   | Run production server    |
| `npm run lint`    | ESLint                   |

## Releases

See [`CHANGELOG.md`](CHANGELOG.md). Tag format: `v1.0.0` (matches `package.json` `version`).

## License

MIT — see [`LICENSE`](LICENSE).
