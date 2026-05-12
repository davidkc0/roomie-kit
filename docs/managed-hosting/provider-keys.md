# Provider Keys

The CLI asks for customer-owned provider credentials. These secrets stay local and are not sent to the Roomie backend.

## Supabase

Create or open a project at `https://supabase.com/dashboard/projects`.

You need:

- Project URL
- Publishable key
- Project ref
- Access token
- Database password

Where to find them:

- Project URL and publishable key: Project Connect dialog or Settings -> API Keys.
- Project ref: Settings -> General -> Reference ID, or the subdomain in `https://<ref>.supabase.co`.
- Access token: `https://supabase.com/dashboard/account/tokens`.
- Database password: Project database settings; reset it if unknown.

## Agora

Open `https://console.agora.io/projects`.

You need:

- App ID
- Primary App Certificate

Use a secured token project for production deployments.

## Vercel

Open `https://vercel.com/dashboard`.

You need:

- Vercel personal access token
- Project name
- Optional team/scope if deploying under a Vercel team

Create tokens at `https://vercel.com/account/tokens`.
