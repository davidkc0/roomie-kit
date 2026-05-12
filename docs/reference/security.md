# Security Policy

Report vulnerabilities to `support@roomiekit.io`.

Do not open public issues for security-sensitive problems.

Important defaults:

- Never commit `.env` files.
- Never commit `.roomie-host/`.
- Do not send provider secrets to Roomie support.
- Rotate credentials that have appeared in chat, logs, or private source history before public release.
- Keep Supabase service-role keys, database passwords, Vercel tokens, Agora certificates, Stripe keys, and Roomie license keys out of Git.

Run `npm run release:verify` before publishing a public starter release.
