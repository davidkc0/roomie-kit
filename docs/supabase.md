# Supabase Setup

## Local Development

The Supabase CLI local stack uses a containerized local database when you run `npm run supabase:start`. If you use a hosted Supabase project instead, you can skip the local stack and put that hosted project URL/key in `web/.env`.

```bash
npm run supabase:start
npm run supabase:reset
npm run functions:serve
```

Copy values from `supabase status` into `web/.env`.

## Edge Function Secrets

Set required secrets with:

```bash
npx supabase secrets set --env-file .env
```

Required for core media:

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`

Required for admin functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`
- `REVENUECAT_WEBHOOK_SECRET`

See `docs/backend-modules.md` for which functions and migrations are core versus optional starter modules.

## Auth Redirects

Configure these redirect URLs in Supabase Auth:

- `http://localhost:5173`
- `http://localhost:5173/confirm-email`
- `http://localhost:5173/reset-password`
- `roomie://login-callback`
- `roomie://confirm-email`
- `roomie://reset-password`

For production, replace the localhost URLs and deep link scheme with your fork's values.
