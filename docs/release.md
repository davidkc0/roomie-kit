# Release Checklist

Run the public starter checks before publishing:

```bash
npm run release:verify
```

That command checks for generated/native clutter, removed service references, obvious committed secrets, TypeScript errors, lint errors, and a production web build.

Before creating a public repository, rotate any service credentials that may have existed in private development history, publish from clean history, and run a dependency/license review.

## Public Repo Prep

- Publish from a fresh repository or sanitized history so old `.env`, R2, Supabase, OneSignal, RevenueCat, and Agora values cannot be recovered from commits.
- Keep `.gitattributes` in the public repo and either migrate bundled binaries to Git LFS or ship them as a versioned release asset bundle.
- Verify `web/public` contains only assets you have redistribution rights for, then finish `ASSET_LICENSES.md` and `THIRD_PARTY_NOTICES.md`.
- Keep optional systems disabled by default and document any extra migrations, Edge Functions, webhooks, or provider keys needed to enable them.
- Confirm `git status --short` has no `.env`, `.temp`, `.pnpm-store`, generated web builds, Pods, or copied Capacitor web assets.

## Manual Release Checks

`npm run release:verify` covers local hygiene, secret patterns, typecheck, lint, and build. Before tagging, also run a dependency/license scan, inspect asset licenses, confirm clean history, and do at least one two-browser media smoke test for room voice, TV-head video, theater stream, personal-room video, and direct calls.
