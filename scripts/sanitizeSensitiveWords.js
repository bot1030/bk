// JK Discord Bot - visible wording sanitizer
// Purpose: replace gambling/casino-sensitive Chinese wording in user-facing text.
// Run from the project root: node scripts/sanitizeSensitiveWords.js --apply
// Dry run: node scripts/sanitizeSensitiveWords.js

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.railway', '.vercel'
]);

const EXTENSIONS = new Set([
  '.js', '.ts', '.json', '.md', '.txt', '.prisma', '.env.example'
]);

// Keep these Chinese-only to avoid breaking internal JS imports such as casinoStatsSystem.js.
// Internal file/function names can stay English; players cannot see them.
const REPLACEMENTS = [
  ['休閒遊戲', '休閒遊戲'],
  ['休閒遊戲', '休閒遊戲'],
  ['休閒遊戲', '休閒遊戲'],
  ['遊戲中心', '遊戲中心'],
  ['遊戲局', '遊戲局'],
  ['投入金額', '投入金額'],
  ['遊戲本金', '遊戲本金'],
  ['投入金額', '投入金額'],
  ['投入成本', '投入成本'],
  ['投入紀錄', '投入紀錄'],
  ['投入', '投入'],
  ['投入', '投入'],
  ['結果', '結果'],
  ['遊戲傳說', '遊戲傳說'],
  ['玩家', '玩家'],
  ['幸運轉盤', '幸運轉盤'],
  ['幸運轉盤', '幸運轉盤'],
  ['遊戲', '遊戲'],
];

const REMAINING_TERMS = [
  '休閒遊戲', '休閒遊戲', '休閒遊戲', '遊戲中心', '遊戲局', '投入金額', '遊戲本金', '投入', '投入', '遊戲', '幸運轉盤', '幸運轉盤'
];

function shouldScan(filePath) {
  const base = path.basename(filePath);
  const ext = path.extname(filePath);
  if (EXTENSIONS.has(ext)) return true;
  if (EXTENSIONS.has(base)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, out);
    else if (item.isFile() && shouldScan(full)) out.push(full);
  }
  return out;
}

function replaceAll(text) {
  let result = text;
  for (const [from, to] of REPLACEMENTS) {
    result = result.split(from).join(to);
  }
  return result;
}

const files = walk(ROOT);
const changed = [];

for (const file of files) {
  let original;
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const updated = replaceAll(original);
  if (updated !== original) {
    changed.push(path.relative(ROOT, file));
    if (APPLY) fs.writeFileSync(file, updated, 'utf8');
  }
}

console.log(APPLY ? 'Applied sensitive-word cleanup.' : 'Dry run only. Add --apply to write changes.');
console.log(`Files ${APPLY ? 'changed' : 'that would change'}: ${changed.length}`);
for (const file of changed) console.log(`- ${file}`);

// Report remaining visible Chinese sensitive terms so you can manually check them.
const remaining = [];
for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const term of REMAINING_TERMS) {
    if (text.includes(term)) {
      remaining.push(`${path.relative(ROOT, file)} contains ${term}`);
      break;
    }
  }
}

if (remaining.length) {
  console.log('\nRemaining terms to manually inspect:');
  for (const line of remaining) console.log(`- ${line}`);
} else {
  console.log('\nNo remaining listed Chinese sensitive terms found.');
}
