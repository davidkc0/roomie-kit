# CLI Onboarding

The white-glove customer path is:

```bash
npx roomie-kit-host onboard
```

QuickStart is the default:

- Logs in or verifies the license.
- Clones the public Roomie Kit starter if needed.
- Uses managed asset defaults.
- Prompts for app name and theme template.
- Collects Supabase, Agora, and Vercel values.
- Deploys to Supabase and Vercel.
- Saves the generated Vercel URL.
- Runs health checks.
- Prints the Supabase Auth redirect URLs to confirm.

Advanced mode:

```bash
npx roomie-kit-host onboard --advanced
```

Advanced mode asks for preset, optional modules, local assets, existing repo, Vercel scope, and custom domain metadata.

To see where to get provider keys:

```bash
npx roomie-kit-host keys
```
