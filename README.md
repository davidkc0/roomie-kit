# Roomie Starter

Roomie is an open-source starter for avatar-based virtual rooms with realtime presence, Supabase auth/data, Babylon.js rooms, Capacitor mobile shells, and Agora-backed voice/video/streaming.

The starter intentionally ships only the app, backend, and mobile wrappers. The copied marketing site and upstream AvatarCreator package are not part of this repo.

## Quickstart

```bash
npm install
npm --prefix web install
cp web/.env.example web/.env
cp .env.example .env
npm run dev
```

For the backend:

```bash
npm run supabase:start
npm run supabase:reset
npm run functions:serve
```

Fill `web/.env` with your Supabase URL/anon key, Agora App ID, asset host, redirect URLs, and optional module settings. Fill root `.env` with Supabase Edge Function secrets before deploying or serving functions that need server-side credentials.

## What Ships

- `web/`: Vite React app with virtual rooms, auth, profiles, rooms, games, voice/video, and Capacitor config.
- `supabase/`: database migrations, local config, and Edge Functions.
- `docs/`: setup notes for Supabase, backend modules, media, mobile, assets, GitHub publishing, and release hygiene.
- `web/public/`: local starter assets. See `docs/assets.md` for the folder contract.

## Open Source Defaults

- License: MIT for Roomie-owned code.
- Media: Agora default, wrapped by the `MediaProvider` surface in `web/src/media`.
- Auth callbacks: handled inside the app at `/confirm-email` and `/reset-password`.
- Optional modules: push, payments, waitlist, invite rewards, and cron jobs are feature/config gated.
- Asset host: defaults to `web/public` via `VITE_ASSET_BASE_URL=/`; switch to an R2/CDN URL when desired.

## Useful Commands

```bash
npm run typecheck
npm run lint
npm run build
npm run release:verify
npm --prefix web run cap:copy
```

## Optional Modules

The starter defaults to the plug-and-play rooms path. Enable product modules in `web/.env` only when you have the matching Supabase migrations, webhooks, and provider credentials wired. See `docs/backend-modules.md` for the core/optional split.

- `VITE_ENABLE_WAITLIST`
- `VITE_ENABLE_INVITES`
- `VITE_ENABLE_ECONOMY`
- `VITE_ENABLE_GIFTS`
- `VITE_ENABLE_DAILY_REWARDS`
- `VITE_ENABLE_PUSH`
- `VITE_ENABLE_PAYMENTS`

## Release Checklist

- Rotate any credentials that ever lived in the private source history.
- Publish from this sanitized clone or a fresh repository, not the old dirty history.
- Move bundled binary assets to Git LFS or a documented release asset bundle.
- Confirm `git status` contains no `.env`, `.temp`, `.pnpm-store`, build output, Pods, or generated Capacitor web assets.
- Complete `ASSET_LICENSES.md` before distributing bundled art, audio, GLB, Rive, MediaPipe, or hosted assets.

See `docs/github-publish.md` for the fresh GitHub repository steps.
