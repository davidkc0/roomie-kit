# License Key And CLI Login

Managed commands require a Roomie Kit license key.

To get the key:

1. Open `https://roomiekit.io/login`.
2. Log in with the Stripe Checkout email.
3. Open the account dashboard.
4. Generate a CLI key.
5. Copy the login command.

```bash
npx roomie-kit-host login --token <license-key>
```

The full license key is shown once when generated or regenerated. Roomie Kit stores only a hash and prefix after that.

If you lose the key, regenerate it from the account dashboard and run the login command again.
