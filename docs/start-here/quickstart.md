# Quickstart

Clone with Git LFS enabled so bundled starter assets are downloaded correctly:

```bash
git lfs install
git clone <your-roomie-kit-repo-url>
cd roomie-kit
git lfs pull
```

Install dependencies:

```bash
npm install
npm --prefix web install
```

Create environment files:

```bash
cp web/.env.example web/.env
cp .env.example .env
```

Start the app:

```bash
npm run dev
```

The web app runs at `http://localhost:5173`.

Next steps:

- Configure Supabase: [Supabase setup](../supabase.md)
- Configure Agora media: [Media and streaming](../media.md)
- Customize branding and assets: [Customization](../customization.md)
