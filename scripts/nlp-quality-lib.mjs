import { createHash } from 'node:crypto';

export const corpusRegistry = [
  [
    'character-classification/unicode-17',
    'character-classification',
    'classifyCodePoint',
  ],
  [
    'sequence-recognition/burmese-v1',
    'sequence-recognition',
    'scanMyanmarSequences',
  ],
  ['normalization/unicode-nfc', 'normalization', 'normalizeUnicode'],
  [
    'syllabification/burmese-orthographic-v1',
    'syllabification',
    'segmentBurmeseSyllables',
  ],
  [
    'orthography-validation/burmese-v1',
    'orthography-validation',
    'validateBurmeseOrthography',
  ],
  ['encoding/detection-v1', 'encoding-detection', 'detectMyanmarEncoding'],
  ['encoding/conversion-v1', 'encoding-conversion', 'convertMyanmarEncoding'],
  ['transliteration/ala-lc-2011', 'transliteration', 'transliterateMyanmar'],
  ['tokenization/myanmar-script-tokens-v1', 'tokenization', 'tokenizeText'],
].map(([path, feature, suite]) => ({
  path: `corpus/${path}.json`,
  feature,
  testFile: `${feature}.test.ts`,
  suite,
}));

export const hash = (value) => createHash('sha256').update(value).digest('hex');
const nonempty = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const sourcesOf = (data) =>
  data.sources ?? (nonempty(data.source) ? [data.source] : []);

function metadataIssues(data) {
  const issues = [];
  for (const key of ['license', 'derivation']) {
    if (!nonempty(data[key])) issues.push(`Missing ${key}`);
  }
  if (
    !Array.isArray(sourcesOf(data)) ||
    !sourcesOf(data).length ||
    !sourcesOf(data).every(nonempty)
  )
    issues.push('Missing sources');
  if (
    !['draft', 'source_verified', 'linguistically_reviewed'].includes(
      data.review_status,
    )
  )
    issues.push('Invalid review status');
  if (!Array.isArray(data.cases) || !data.cases.length)
    issues.push('Missing cases');
  const ids = new Set();
  for (const sample of data.cases ?? []) {
    if (!nonempty(sample.id) || ids.has(sample.id))
      issues.push(`Invalid/duplicate case ID: ${sample.id}`);
    if (!nonempty(sample.basis)) issues.push(`Missing basis: ${sample.id}`);
    ids.add(sample.id);
  }
  return issues;
}

export function compareCases(current, previous) {
  if (previous === null) return null;
  const old = new Map(previous.map((item) => [item.key, item]));
  const keys = new Set(current.map((item) => item.key));
  return {
    regressions: current
      .filter(
        (item) =>
          old.get(item.key)?.status === 'passed' && item.status !== 'passed',
      )
      .map((item) => item.key),
    changed: current
      .filter(
        (item) => old.has(item.key) && old.get(item.key).sha256 !== item.sha256,
      )
      .map((item) => item.key),
    removed: previous
      .filter((item) => !keys.has(item.key))
      .map((item) => item.key),
    added: current.filter((item) => !old.has(item.key)).map((item) => item.key),
  };
}

export function analyzeQuality({
  datasets,
  results,
  runnerPassed,
  baseline = null,
  inventoryIssues = [],
}) {
  const suites = results.testResults ?? [];
  const cases = [];
  const reviewQueue = [];
  const summaries = datasets.map(
    ({ path, feature, testFile, suite, sha256, data }) => {
      const matches = suites.filter((result) =>
        result.name.replaceAll('\\', '/').endsWith(`/test/${testFile}`),
      );
      const assertions =
        matches.length === 1 ? matches[0].assertionResults : [];
      const issues = metadataIssues(data);
      if (matches.length !== 1)
        issues.push('Missing/duplicate test file results');
      const counts = { passed: 0, failed: 0, unverified: 0 };
      for (const sample of data.cases ?? []) {
        const matches = assertions.filter(
          (result) =>
            result.title === sample.id &&
            result.ancestorTitles.join(' ') === suite,
        );
        const status =
          matches.length !== 1
            ? 'unverified'
            : matches[0].status === 'passed'
              ? 'passed'
              : matches[0].status === 'failed'
                ? 'failed'
                : 'unverified';
        counts[status]++;
        const key = `${path}#${sample.id}`;
        cases.push({ key, status, sha256: hash(JSON.stringify(sample)) });
        if (data.review_status !== 'linguistically_reviewed') {
          reviewQueue.push({
            key,
            feature,
            reviewStatus: data.review_status,
            corpusSha256: sha256,
            license: data.license,
            sources: sourcesOf(data),
            caseSource: sample.source ?? null,
            case: sample,
          });
        }
      }
      return {
        path,
        feature,
        sha256,
        profile: data.profile ?? null,
        unicodeVersion: data.unicode_version ?? null,
        license: data.license,
        sources: sourcesOf(data),
        derivation: data.derivation,
        reviewStatus: data.review_status,
        counts,
        issues,
      };
    },
  );
  const totals = summaries.reduce(
    (sum, entry) => {
      for (const key of Object.keys(sum)) sum[key] += entry.counts[key];
      return sum;
    },
    { passed: 0, failed: 0, unverified: 0 },
  );
  const nonPassingTests = suites.flatMap((suite) =>
    (suite.assertionResults ?? [])
      .filter((item) => item.status !== 'passed')
      .map((item) => ({
        file: suite.name,
        title: item.fullName ?? item.title,
        status: item.status,
      })),
  );
  return {
    schemaVersion: 1,
    releaseApproved: false,
    automatedGatePassed:
      runnerPassed &&
      results.success === true &&
      datasets.length > 0 &&
      totals.passed > 0 &&
      totals.failed === 0 &&
      totals.unverified === 0 &&
      summaries.every((item) => !item.issues.length) &&
      !inventoryIssues.length &&
      !nonPassingTests.length,
    inventoryIssues,
    totals,
    datasets: summaries,
    cases,
    nonPassingTests,
    comparison: compareCases(cases, baseline?.cases ?? null),
    reviewQueue,
  };
}

export function renderMarkdown(report) {
  const lines = [
    '# NLP regression and review report',
    '',
    `Revision: ${report.revision}; dirty: ${report.dirty}.`,
    '',
    `Automated gate: ${report.automatedGatePassed ? 'PASS' : 'FAIL'}. Release approved: NO.`,
    '',
    'Passing regression cases do not establish linguistic accuracy or release readiness.',
    '',
    '| Feature | Passed | Failed | Unverified | Review status |',
    '| --- | ---: | ---: | ---: | --- |',
    ...report.datasets.map(
      (item) =>
        `| ${item.feature} | ${item.counts.passed} | ${item.counts.failed} | ${item.counts.unverified} | ${item.reviewStatus} |`,
    ),
    '',
    `Independent-review queue: ${report.reviewQueue.length} cases (dataset-level status).`,
    '',
    '## Provenance declarations',
    '',
    ...report.datasets.flatMap((item) => [
      `- ${item.path}: ${item.license}`,
      `  - Sources: ${item.sources?.join(', ')}`,
      `  - Derivation: ${item.derivation}`,
      `  - SHA-256: ${item.sha256}`,
    ]),
    '',
    '## Gate issues',
    '',
    ...report.inventoryIssues.map((issue) => `- ${issue}`),
    ...report.datasets.flatMap((item) =>
      item.issues.map((issue) => `- ${item.path}: ${issue}`),
    ),
    ...report.cases
      .filter((item) => item.status !== 'passed')
      .map((item) => `- ${item.key}: ${item.status}`),
    ...report.nonPassingTests.map((item) => `- ${item.title}: ${item.status}`),
    '',
    '## Baseline comparison',
    '',
  ];
  if (report.comparison) {
    for (const [kind, keys] of Object.entries(report.comparison))
      lines.push(
        `- ${kind}: ${keys.length}`,
        ...keys.map((key) => `  - ${key}`),
      );
  } else
    lines.push(
      'No baseline supplied; no claim about newly introduced regressions.',
    );
  return `${lines.join('\n')}\n`;
}
