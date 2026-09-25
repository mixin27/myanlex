import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeQuality, compareCases } from './nlp-quality-lib.mjs';

const dataset = {
  path: 'corpus/example/v1.json',
  testFile: 'example.test.ts',
  suite: 'example',
  sha256: 'dataset-hash',
  data: {
    license: 'MIT',
    sources: ['project-authored'],
    derivation: 'Original regression example.',
    review_status: 'source_verified',
    cases: [{ id: 'one', input: '', expected: '', basis: 'Empty input.' }],
  },
};
const assertion = {
  title: 'one',
  ancestorTitles: ['example'],
  status: 'passed',
};
function analyze(assertions = [assertion], overrides = {}) {
  return analyzeQuality({
    datasets: [dataset],
    results: {
      success: true,
      testResults: [
        { name: '/repo/test/example.test.ts', assertionResults: assertions },
      ],
    },
    runnerPassed: true,
    ...overrides,
  });
}

test('passing regressions do not imply independent review or release approval', () => {
  const report = analyze();
  assert.equal(report.automatedGatePassed, true);
  assert.deepEqual(report.totals, { passed: 1, failed: 0, unverified: 0 });
  assert.equal(report.reviewQueue.length, 1);
  assert.equal(report.releaseApproved, false);
  assert.equal(report.datasets[0].license, 'MIT');
});

test('failed, skipped, absent and duplicate assertions cannot count as passed', () => {
  for (const assertions of [
    [{ ...assertion, status: 'failed' }],
    [{ ...assertion, status: 'pending' }],
    [],
    [assertion, assertion],
    [{ ...assertion, ancestorTitles: ['another suite'] }],
  ]) {
    const report = analyze(assertions);
    assert.equal(report.automatedGatePassed, false);
    assert.equal(report.totals.passed, 0);
  }
});

test('extra invariant failures and a crashed runner fail the automated gate', () => {
  assert.equal(
    analyze([assertion, { ...assertion, title: 'invariant', status: 'failed' }])
      .automatedGatePassed,
    false,
  );
  assert.equal(
    analyze([assertion], { runnerPassed: false }).automatedGatePassed,
    false,
  );
  assert.equal(
    analyze([assertion], { results: {} }).automatedGatePassed,
    false,
  );
});

test('missing provenance, invalid review status and duplicate IDs fail metadata checks', () => {
  for (const patch of [
    { license: '' },
    { sources: [] },
    { derivation: '' },
    { review_status: 'approved-by-tests' },
    { cases: [...dataset.data.cases, ...dataset.data.cases] },
    { cases: [{ id: 'one', basis: '' }] },
  ]) {
    assert.equal(
      analyze([assertion], {
        datasets: [{ ...dataset, data: { ...dataset.data, ...patch } }],
      }).automatedGatePassed,
      false,
    );
  }
});

test('comparison reports regressions, modified expectations and removed cases', () => {
  const previous = [
    { key: 'a', status: 'passed', sha256: 'old' },
    { key: 'b', status: 'passed', sha256: 'same' },
  ];
  const current = [{ key: 'a', status: 'failed', sha256: 'new' }];
  assert.deepEqual(compareCases(current, previous), {
    regressions: ['a'],
    changed: ['a'],
    removed: ['b'],
    added: [],
  });
  assert.equal(compareCases(current, null), null);
});

test('supports the classification schema singular source field', () => {
  const data = { ...dataset.data, source: 'https://example.org/source' };
  delete data.sources;
  const report = analyze([assertion], { datasets: [{ ...dataset, data }] });
  assert.equal(report.automatedGatePassed, true);
  assert.deepEqual(report.datasets[0].sources, [data.source]);
});

test('unregistered corpus files and a missing inventory fail the gate', () => {
  assert.equal(
    analyze([assertion], {
      inventoryIssues: ['Unregistered corpus: example.json'],
    }).automatedGatePassed,
    false,
  );
  assert.equal(
    analyze([assertion], { datasets: [] }).automatedGatePassed,
    false,
  );
});
