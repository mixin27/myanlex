import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  isNormalizedUnicode,
  normalizeUnicode,
  SAFE_NORMALIZATION_PROFILE,
  scanMyanmarSequences,
} from '../src/index.js';

interface NormalizationCase {
  readonly id: string;
  readonly input: string;
  readonly expected: string;
  readonly changed: boolean;
  readonly basis: string;
}

interface NormalizationCorpus {
  readonly profile: string;
  readonly cases: readonly NormalizationCase[];
}

const corpusUrl = new URL(
  '../../../corpus/normalization/unicode-nfc.json',
  import.meta.url,
);
const corpus = JSON.parse(
  readFileSync(corpusUrl, 'utf8'),
) as NormalizationCorpus;

describe('normalizeUnicode', () => {
  it('uses the same profile as the corpus', () => {
    expect(SAFE_NORMALIZATION_PROFILE).toBe(corpus.profile);
  });

  it.each(corpus.cases)('$id', ({ input, expected, changed }) => {
    const result = normalizeUnicode(input);

    expect(result).toEqual({
      input,
      output: expected,
      changed,
      profile: 'unicode-nfc',
    });
    expect(isNormalizedUnicode(input)).toBe(!changed);
    expect(normalizeUnicode(result.output).output).toBe(result.output);
  });

  it('preserves an unpaired surrogate without throwing', () => {
    const malformed = '\ud800';

    expect(normalizeUnicode(malformed)).toEqual({
      input: malformed,
      output: malformed,
      changed: false,
      profile: 'unicode-nfc',
    });
  });

  it('keeps canonically reordered stacks recognizable', () => {
    const normalized = normalizeUnicode('က့္က').output;

    expect(
      scanMyanmarSequences(normalized).map(({ kind, text, start, end }) => ({
        kind,
        text,
        start,
        end,
      })),
    ).toEqual([
      { kind: 'scalar', text: 'က', start: 0, end: 1 },
      { kind: 'scalar', text: '့', start: 1, end: 2 },
      { kind: 'stack', text: '္က', start: 2, end: 4 },
    ]);
  });
});
