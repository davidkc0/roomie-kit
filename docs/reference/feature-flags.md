# Feature Flags

Optional product systems are disabled by default.

```bash
VITE_ENABLE_WAITLIST=false
VITE_ENABLE_INVITES=false
VITE_ENABLE_ECONOMY=false
VITE_ENABLE_GIFTS=false
VITE_ENABLE_DAILY_REWARDS=false
VITE_ENABLE_PUSH=false
VITE_ENABLE_PAYMENTS=false
```

Core rooms, auth, avatars, streaming, and video chat should work without enabling these modules.

See [Backend modules](../backend-modules.md) for matching migrations and functions.
