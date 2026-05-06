# GitHub Publish Steps

Use these steps from the repo root when you are ready to create the public starter repo. The old cloned `.git` history has been removed.

## Fresh Repo With Git LFS

Install Git LFS first if needed:

```bash
brew install git-lfs
```

Then initialize and commit:

```bash
git init -b main
git lfs install
git add .gitattributes
git add .
git status --short
npm run release:verify
git commit -m "Initial Roomie open source starter"
git lfs ls-files
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

The order matters: run `git lfs install` before `git add .` so the 335 MB asset bundle is added as LFS objects instead of normal Git blobs. If files were added too early, clear the index with `git rm --cached -r .`, then run `git add .` again after LFS is installed.

## Before Making The Repo Public

- Confirm `ASSET_LICENSES.md` has owner sign-off for bundled assets.
- Confirm `npm run release:verify` passes after the fresh commit.
- Confirm `git lfs ls-files` includes GLB, PNG/JPG, Rive, WASM, and audio assets.
- Confirm no `.env`, generated `web/dist`, copied Capacitor web assets, Pods, `.pnpm-store`, or `.DS_Store` files appear in `git status --short`.
- Create the GitHub repo as private first, push, inspect the file list, then flip to public when satisfied.
