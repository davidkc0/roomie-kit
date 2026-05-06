# Contributing

Thanks for helping with Roomie.

## Local Setup

1. Install root and web dependencies.
2. Copy `.env.example` and `web/.env.example`.
3. Start Supabase locally before testing auth, database, or Edge Functions.
4. Run `npm run typecheck`, `npm run lint`, and `npm run build` before opening a PR.

## Guidelines

- Keep production credentials, generated outputs, local package stores, and native build artifacts out of git.
- Keep optional integrations feature-gated so a fresh clone can run without push notifications, payments, cron jobs, or production services.
- Prefer the shared media interfaces in `web/src/media` for new voice, video, or streaming work.
- Document new env vars in `web/.env.example`, `.env.example`, and the relevant docs file.
