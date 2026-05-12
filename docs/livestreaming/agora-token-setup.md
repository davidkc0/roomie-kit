# Agora Token Setup

Agora is the default media provider.

Create an Agora project and enable App Certificate if you are using token auth. Then configure:

```bash
# web/.env
VITE_AGORA_APP_ID=

# .env, used by Supabase Edge Functions
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
AGORA_TOKEN_TTL_SECONDS=3600
```

Deploy the token function for hosted Supabase:

```bash
npx supabase functions deploy agora-token
npx supabase secrets set --env-file .env
```

Production deployments should use token auth. Tokenless joins are only appropriate for local or temporary Agora test projects that allow them.
