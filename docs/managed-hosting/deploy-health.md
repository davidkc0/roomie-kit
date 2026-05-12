# Deploy And Health Checks

The managed deploy flow prepares the app and deploys customer-owned infrastructure.

Deploy command:

```bash
npx roomie-kit-host deploy --execute --resume
```

Deploy steps:

1. Write local web environment values.
2. Apply Supabase migrations.
3. Set Supabase Edge Function secrets.
4. Deploy core Supabase functions.
5. Link or create the Vercel project.
6. Set Vercel production environment variables.
7. Deploy Vercel production.
8. Save the production URL.
9. Print Supabase Auth redirect URLs to confirm.

Health command:

```bash
npx roomie-kit-host health
```

Health checks should confirm:

- Deployed web URL responds.
- Supabase project is reachable.
- Agora token function works.
- Asset CDN/base URL responds.

If a deploy fails, rerun with `--resume`.
