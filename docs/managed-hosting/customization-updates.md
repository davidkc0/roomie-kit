# Customization And Updates

Roomie Kit customization is driven by:

- `web/roomie.config.json`
- `web/public/roomie-local`

Run:

```bash
npx roomie-kit-host customize
```

Examples:

```bash
npx roomie-kit-host customize --brand-template stream-dark --app-name "Acme Live"
npx roomie-kit-host customize --advanced --brand-primary '#2563EB' --brand-secondary '#06B6D4' --brand-accent '#F97316'
```

Supported templates:

- `roomie-neon`
- `stream-dark`
- `startup-blue`
- `creator-pink`
- `minimal-dark`

Files placed in `web/public/roomie-local` win over managed/starter assets. Missing files still fall back to `VITE_ASSET_BASE_URL`.

The `update` command is reserved for guided Roomie Kit version updates.
