import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const forbiddenPaths = [
  '.DS_Store',
  '.env',
  'AvatarCreator',
  'scripts/sync-r2-assets.mjs',
  'supabase/.temp',
  'web/.DS_Store',
  'web/.env',
  'web/.pnpm-store',
  'web/android/app/src/main/assets/capacitor.config.json',
  'web/android/app/src/main/assets/public',
  'web/dist',
  'web/ios/App/App/capacitor.config.json',
  'web/ios/App/App/public',
  'web/ios/App/Pods',
  'web/public/assets-manifest.json',
  'website',
];

const forbiddenText = [
  'joinroomieapp.com',
  'readyplayerme',
  'Ready Player Me',
  'rpm-token',
  'VITE_AGORA_TEMP_TOKEN',
];

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.md',
  '.mjs',
  '.plist',
  '.properties',
  '.sql',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const skippedDirs = [
  '.git/',
  'node_modules/',
  'web/node_modules/',
  'web/public/',
  'web/android/app/build/',
  'web/ios/App/DerivedData/',
  'web/ios/App/build/',
];

function walkFiles(dir = repoRoot, prefix = '') {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      if (isSkipped(`${relativePath}/`)) continue;
      files.push(...walkFiles(path.join(dir, entry.name), relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function gitList(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isUnder(candidate, forbidden) {
  return candidate === forbidden || candidate.startsWith(`${forbidden}/`);
}

function isSkipped(filePath) {
  return skippedDirs.some((dir) => filePath.startsWith(dir));
}

function isScannableText(filePath) {
  const base = path.basename(filePath);
  if (base === '.gitignore' || base === 'LICENSE') return true;
  if (base === 'package-lock.json') return false;
  return textExtensions.has(path.extname(filePath));
}

const tracked = new Set(gitList(['ls-files', '-z']).map(normalizePath));
const deleted = new Set(gitList(['ls-files', '--deleted', '-z']).map(normalizePath));
const activeTracked = [...tracked].filter((filePath) => !deleted.has(filePath));
const failures = [];
const filesystemFiles = walkFiles().map(normalizePath);

for (const forbidden of forbiddenPaths) {
  const fullPath = path.join(repoRoot, forbidden);
  if (existsSync(fullPath)) {
    const type = statSync(fullPath).isDirectory() ? 'directory' : 'file';
    failures.push(`${forbidden} exists as a ${type}`);
  }

  const trackedMatches = activeTracked.filter((filePath) => isUnder(filePath, forbidden));
  for (const match of trackedMatches.slice(0, 10)) {
    failures.push(`${match} is still tracked`);
  }
  if (trackedMatches.length > 10) {
    failures.push(`${trackedMatches.length - 10} more tracked paths under ${forbidden}`);
  }
}

const candidates = [
  ...new Set([
    ...(activeTracked.length ? activeTracked : filesystemFiles),
    ...gitList(['ls-files', '--others', '--exclude-standard', '-z']).map(normalizePath),
  ]),
].filter((filePath) => !isSkipped(filePath) && isScannableText(filePath));

for (const filePath of filesystemFiles) {
  if (!isSkipped(filePath) && path.basename(filePath) === '.DS_Store') {
    failures.push(`${filePath} exists`);
  }
}

for (const filePath of candidates) {
  if (filePath === 'scripts/check-release-hygiene.mjs') continue;

  const fullPath = path.join(repoRoot, filePath);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) continue;
  const text = execFileSync('sed', ['-n', '1,2000p', fullPath], { encoding: 'utf8' });

  for (const needle of forbiddenText) {
    if (!text.includes(needle)) continue;
    failures.push(`${filePath} still references "${needle}"`);
  }
}

if (failures.length) {
  console.error('Release hygiene check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Release hygiene check passed.');
