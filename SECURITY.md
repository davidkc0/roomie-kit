# Security Policy

## Supported Versions

This starter tracks the current `main` branch. Security fixes should target `main` first.

## Reporting A Vulnerability

Do not open a public issue for secrets, auth bypasses, data exposure, or payment bugs. Email `support@roomiekit.io`, email the maintainer listed for your fork, or use GitHub private vulnerability reporting if enabled.

## Secret Handling

- Never commit `.env`, Supabase `.temp`, service-role keys, Agora certificates, OneSignal REST keys, RevenueCat webhook secrets, Apple credentials, or OAuth client secrets.
- Browser-exposed `VITE_*` values must be treated as public.
- Rotate credentials before publishing any fork that was based on a private prototype history.
