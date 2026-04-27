# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Playlist page and playlist client flow for collection releases
- `usePlaylists` hook for playlist interactions

### Changed

- Collection page layout refactor with clearer sidebar sections and improved responsive behavior
- Style chip rendering unified and compacted in collection views
- Overflow style indicator (`+N more`) now remains visible by reserving space
- "Get Release Data" sync selection now includes stale marketplace prices for periodic refresh

### Maintenance

- Rewrote repository history to remove leaked credentials from tracked history
- `.cursor/` removed from git tracking and added to `.gitignore`
- `docs/` removed from git tracking and added to `.gitignore`

## [1.0.0] - 2026-03-28

### Added

- Discogs collection browser with table and card views, filtering, and sorting
- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4
- Discogs API routes: collection sync, database, details, jobs, and performance endpoints
- Local SQLite (`better-sqlite3`) for collection data and sync workflows
- Analytics page and collection controls (see app routes)
- Security-oriented helpers in application code

[1.0.0]: https://github.com/catsdj/Discogs-collection-manager/releases/tag/v1.0.0
