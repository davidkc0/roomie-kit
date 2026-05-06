# Backend Modules

Roomie should boot as a rooms/auth/media starter without requiring the commercial product systems from the original app. Keep these modules disabled by default unless the matching migrations, functions, and provider credentials are intentionally configured.

## Core Starter

Core functionality should work for a fresh self-hoster:

- Supabase Auth, profiles, rooms, presence, and room membership data.
- Local room assets in `web/public` or a compatible `VITE_ASSET_BASE_URL`.
- Agora media token signing through `supabase/functions/agora-token`.
- Account cleanup through `supabase/functions/delete-account` if the public app exposes deletion.

Core Edge Functions:

```bash
npx supabase functions deploy agora-token
npx supabase functions deploy delete-account
```

Required core secrets:

- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Optional Modules

Optional modules should never block base rooms, avatars, streaming, or video chat:

- Waitlist and invite rewards: gated by `VITE_ENABLE_WAITLIST` and `VITE_ENABLE_INVITES`.
- Economy, gifts, and daily rewards: gated by `VITE_ENABLE_ECONOMY`, `VITE_ENABLE_GIFTS`, and `VITE_ENABLE_DAILY_REWARDS`.
- Push notifications: gated by `VITE_ENABLE_PUSH`; deploy `send-notification` and `streak-reminder-cron` only with OneSignal secrets.
- Payments/subscriptions: gated by `VITE_ENABLE_PAYMENTS`; deploy `revenuecat-webhook` only with RevenueCat secrets and product IDs.
- Leaderboards and scheduled resets: deploy `close-weekly-leaderboards` only if the game/economy loop is part of your fork.

Optional Edge Functions:

```bash
npx supabase functions deploy send-notification
npx supabase functions deploy streak-reminder-cron
npx supabase functions deploy revenuecat-webhook
npx supabase functions deploy close-weekly-leaderboards
```

## Migration Policy

This cleanup keeps the existing migration history so the cloned app remains compatible with its current schema. For a stricter public starter, the next release pass should split migrations into `core`, `economy`, `push`, `payments`, and `cron` folders or publish separate SQL bundles. Until then, app feature flags keep optional systems non-blocking while the database can still include their tables.
