# Environment Variables

Common web values:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_AGORA_APP_ID=
VITE_ASSET_BASE_URL=/
VITE_APP_NAME=Roomie
VITE_CAPACITOR_APP_ID=
VITE_DEEP_LINK_SCHEME=roomie
```

Core Edge Function values:

```bash
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_TOKEN_TTL_SECONDS=3600
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional modules may require OneSignal, RevenueCat, push, payment, or cron secrets. Keep optional modules disabled unless those providers are intentionally configured.

For managed hosting, the CLI stores local deployment config under `.roomie-host/`, which must stay ignored by git.
