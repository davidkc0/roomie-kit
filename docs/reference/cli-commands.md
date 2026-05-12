# CLI Commands

Open-source starter:

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run release:verify
npm --prefix web run cap:copy
```

Managed Hosting:

```bash
npx roomie-kit-host keys
npx roomie-kit-host onboard
npx roomie-kit-host customize
npx roomie-kit-host login --token <license-key>
npx roomie-kit-host whoami
npx roomie-kit-host logout
npx roomie-kit-host init [app-folder]
npx roomie-kit-host doctor
npx roomie-kit-host deploy --execute --resume
npx roomie-kit-host health
npx roomie-kit-host update
```

Use `onboard` for the main customer path. Use lower-level commands for debugging, support, or reconfiguration.
