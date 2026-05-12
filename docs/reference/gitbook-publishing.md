# GitBook Publishing

Roomie Kit docs are designed for GitBook GitHub Sync.

GitHub remains the source of truth. GitBook is the public docs UI.

## Setup

1. Create a GitBook space/site named `Roomie Kit Docs`.
2. Connect GitBook GitHub Sync to the public `roomie-kit` repo.
3. Sync from GitHub to GitBook first.
4. Use this repository's `.gitbook.yaml`:

```yaml
root: ./docs
structure:
  readme: README.md
  summary: SUMMARY.md
```

## Custom Domain

Canonical docs URL:

```text
https://docs.roomiekit.io
```

Configure the custom domain in GitBook site settings, then add the DNS record GitBook provides:

```text
Type: CNAME
Name: docs
Target: <GitBook-provided hostname>
```

If DNS is managed by Cloudflare, keep the CNAME record DNS-only, not proxied.

## CLI Decision

Do not add GitBook CLI to the normal docs workflow for v1.

Use plain Markdown, `.gitbook.yaml`, and `SUMMARY.md` so the docs stay readable in GitHub and portable outside GitBook. Revisit CLI/API automation only if scripted site creation, bulk redirects, or CI checks become necessary.
