import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  segmentBurmeseSyllables,
  SYLLABIFICATION_PROFILE,
  type BurmeseSyllableSegment,
} from '../src/index.js';

interface SyllabificationCase {
  readonly id: string;
  readonly input: string;
  readonly expected: readonly BurmeseSyllableSegment[];
  readonly basis: string;
}

interface SyllabificationCorpus {
  readonly profile: string;
  readonly unicode_version: string;
  readonly cases: readonly SyllabificationCase[];
}

const corpusUrl = new URL(
  '../../../corpus/syllabification/burmese-orthographic-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(
  readFileSync(corpusUrl, 'utf8'),
) as SyllabificationCorpus;

describe('segmentBurmeseSyllables', () => {
  it('uses the corpus profile', () => {
    expect(corpus.profile).toBe(SYLLABIFICATION_PROFILE);
    expect(corpus.unicode_version).toBe('17.0.0');
  });

  it.each(corpus.cases)('$id', ({ input, expected }) => {
    const segments = segmentBurmeseSyllables(input);

    expect(segments).toEqual(expected);
    expect(segments.map(({ text }) => text).join('')).toBe(input);
  });

  it('does not normalize or mutate canonically reordered input', () => {
    const input = 'က့်';

    expect(
      segmentBurmeseSyllables(input)
        .map(({ text }) => text)
        .join(''),
    ).toBe(input);
  });
});
