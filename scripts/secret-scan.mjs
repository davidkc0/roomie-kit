import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
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
  'web/android/app/src/main/assets/public/',
  'web/dist/',
  'web/ios/App/App/public/',
  'web/ios/App/DerivedData/',
  'web/ios/App/Pods/',
  'web/ios/App/build/',
];

const patterns = [
  { name: 'private key', regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: 'GitHub token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/ },
  { name: 'GitHub fine-grained token', regex: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/ },
  { name: 'AWS or R2 access key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'Google API key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token', regex: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/ },
  { name: 'Stripe secret key', regex: /\bsk_(?:live|test)_[0-9A-Za-z]{20,}\b/ },
  { name: 'Supabase or JWT secret', regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  {
    name: 'quoted secret assignment',
    regex: /\b(?:secret|api[_-]?key|access[_-]?key|service[_-]?role|app[_-]?certificate|password|token)\b\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/i,
  },
  {
    name: 'env secret assignment',
    regex: /^\s*[A-Z0-9_]*(?:SECRET|API_KEY|ACCESS_KEY|SERVICE_ROLE|APP_CERTIFICATE|PASSWORD|TOKEN)[A-Z0-9_]*=([^\s#]{12,})/,
  },
];

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

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isSkipped(filePath) {
  return skippedDirs.some((dir) => filePath.startsWith(dir));
}

function isTextCandidate(filePath) {
  const base = path.basename(filePath);
  if (base === '.gitignore' || base === 'LICENSE' || base.endsWith('.example')) return true;
  if (base === 'package-lock.json') return false;
  return textExtensions.has(path.extname(filePath));
}

function isAllowedMatch(filePath, line, match) {
  const lowerLine = line.toLowerCase();
  const lowerMatch = match.toLowerCase();

  if (filePath.endsWith('.env.example') && /=\s*$/.test(line)) return true;
  if (lowerMatch.includes('example') || lowerMatch.includes('placeholder') || lowerMatch.includes('your_')) return true;
  if (lowerLine.includes('import.meta.env') || lowerLine.includes('process.env') || lowerLine.includes('env.')) return true;
  if (lowerLine.includes('missing ') || lowerLine.includes('required env')) return true;
  if (lowerLine.includes('secret:scan') || lowerLine.includes('secret assignment')) return true;
  return false;
}

function redact(value) {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

const tracked = new Set(gitList(['ls-files', '-z']).map(normalizePath));
const deleted = new Set(gitList(['ls-files', '--deleted', '-z']).map(normalizePath));
const filesystemFiles = walkFiles().map(normalizePath);
const candidates = [
  ...new Set([
    ...([ ...tracked ].length ? [...tracked].filter((filePath) => !deleted.has(filePath)) : filesystemFiles),
    ...gitList(['ls-files', '--others', '--exclude-standard', '-z']).map(normalizePath),
  ]),
].filter((filePath) => !isSkipped(filePath) && isTextCandidate(filePath));

const findings = [];

for (const filePath of candidates) {
  const fullPath = path.join(repoRoot, filePath);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) continue;

  const content = readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(line);
      if (!match) continue;

      const secretLikeValue = match[1] || match[0];
      if (isAllowedMatch(filePath, line, secretLikeValue)) continue;

      findings.push({
        filePath,
        line: index + 1,
        name: pattern.name,
        value: redact(secretLikeValue),
      });
    }
  });
}

if (findings.length) {
  console.error('Secret scan failed:');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} ${finding.name} (${finding.value})`);
  }
  process.exit(1);
}

console.log('Secret scan passed.');
