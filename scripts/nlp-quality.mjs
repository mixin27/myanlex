import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { log, error } from 'node:console';
import {
  analyzeQuality,
  corpusRegistry,
  hash,
  renderMarkdown,
} from './nlp-quality-lib.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
if (args.length && (args.length !== 2 || args[0] !== '--baseline'))
  throw new Error('Usage: pnpm quality:report [--baseline /path/report.json]');
const baseline = args.length
  ? JSON.parse(readFileSync(resolve(args[1]), 'utf8'))
  : null;
if (
  baseline &&
  (baseline.schemaVersion !== 1 ||
    !Array.isArray(baseline.cases) ||
    baseline.cases.some(
      (item) =>
        typeof item.key !== 'string' ||
        typeof item.sha256 !== 'string' ||
        !['passed', 'failed', 'unverified'].includes(item.status),
    ) ||
    new Set(baseline.cases.map((item) => item.key)).size !==
      baseline.cases.length)
)
  throw new Error('Invalid baseline report');

const outputRoot = resolve(root, '.cache/nlp-quality');
mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(`${outputRoot}/run-`);
const resultPath = resolve(output, 'vitest.json');
const run = spawnSync(
  'pnpm',
  [
    '--filter',
    '@myanlex/core',
    'exec',
    'vitest',
    'run',
    '--reporter=json',
    `--outputFile=${resultPath}`,
  ],
  { cwd: root, stdio: 'inherit', timeout: 120_000 },
);
let results = {};
const inventoryIssues = [];
try {
  results = JSON.parse(readFileSync(resultPath, 'utf8'));
} catch {
  inventoryIssues.push('Test runner did not produce a readable JSON report.');
}
if (run.error) inventoryIssues.push(`Runner error: ${run.error.message}`);

const registered = new Set(corpusRegistry.map((item) => item.path));
const discovered = readdirSync(resolve(root, 'corpus'), { recursive: true })
  .filter((path) => path.endsWith('.json') && !path.startsWith('schema/'))
  .map((path) => `corpus/${path}`);
for (const path of discovered)
  if (!registered.has(path))
    inventoryIssues.push(`Unregistered corpus: ${path}`);
const datasets = [];
for (const entry of corpusRegistry) {
  try {
    const raw = readFileSync(resolve(root, entry.path), 'utf8');
    const data = JSON.parse(raw);
    if (
      !Array.isArray(data.cases) ||
      data.cases.some((item) => !item || typeof item !== 'object')
    )
      throw new Error('Invalid cases array');
    datasets.push({ ...entry, data, sha256: hash(raw) });
  } catch (cause) {
    inventoryIssues.push(`${entry.path}: ${cause.message}`);
  }
}
const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const report = {
  ...analyzeQuality({
    datasets,
    results,
    runnerPassed: run.status === 0,
    baseline,
    inventoryIssues,
  }),
  revision: git('rev-parse', 'HEAD'),
  dirty: git('status', '--porcelain').length > 0,
  generatedAt: new Date().toISOString(),
  toolchain: {
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    vitest: JSON.parse(
      readFileSync(resolve(root, 'node_modules/vitest/package.json'), 'utf8'),
    ).version,
  },
  baselineRevision: baseline?.revision ?? null,
};
writeFileSync(
  resolve(output, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
writeFileSync(
  resolve(output, 'review-queue.json'),
  `${JSON.stringify(report.reviewQueue, null, 2)}\n`,
);
writeFileSync(resolve(output, 'report.md'), renderMarkdown(report));
log(`NLP quality report: ${output}`);
log(
  `Corpus: ${JSON.stringify(report.totals)}; independent review pending: ${report.reviewQueue.length}`,
);
if (!report.automatedGatePassed) {
  error(
    'Automated NLP quality gate failed; inspect report.json and vitest.json.',
  );
  process.exitCode = 1;
}
