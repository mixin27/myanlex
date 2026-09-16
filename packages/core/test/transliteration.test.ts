import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MYANMAR_TRANSLITERATION_PROFILE,
  transliterateMyanmar,
} from '../src/index.js';

interface TransliterationCase {
  readonly id: string;
  readonly input: string;
  readonly expected: string;
  readonly complete: boolean;
  readonly basis: string;
}

interface TransliterationCorpus {
  readonly scheme: 'ala-lc-2011';
  readonly profile: string;
  readonly cases: readonly TransliterationCase[];
}

const corpusUrl = new URL(
  '../../../corpus/transliteration/ala-lc-2011.json',
  import.meta.url,
);
const corpus = JSON.parse(
  readFileSync(corpusUrl, 'utf8'),
) as TransliterationCorpus;

describe('transliterateMyanmar', () => {
  it('uses the documented scheme and profile', () => {
    expect(corpus.profile).toBe(MYANMAR_TRANSLITERATION_PROFILE);
  });

  it.each(corpus.cases)('$id', ({ input, expected, complete }) => {
    const result = transliterateMyanmar(input, { scheme: corpus.scheme });

    expect(result).toMatchObject({
      input,
      output: expected,
      scheme: corpus.scheme,
      profile: MYANMAR_TRANSLITERATION_PROFILE,
      complete,
    });
    expect(result.segments.map(({ output }) => output).join('')).toBe(
      result.output,
    );
  });

  it('returns code-point spans and preserves mixed-script segments', () => {
    const result = transliterateMyanmar('A👋 မြန်မာ', {
      scheme: 'ala-lc-2011',
    });

    expect(result.segments).toEqual([
      { kind: 'preserved', input: 'A👋', output: 'A👋', start: 0, end: 2 },
      { kind: 'preserved', input: ' ', output: ' ', start: 2, end: 3 },
      {
        kind: 'transliterated',
        input: 'မြန်',
        output: 'mranʻ',
        start: 3,
        end: 7,
      },
      {
        kind: 'transliterated',
        input: 'မာ',
        output: 'mā',
        start: 7,
        end: 9,
      },
    ]);
  });

  it('does not silently discard malformed Myanmar input', () => {
    const result = transliterateMyanmar('္က', { scheme: 'ala-lc-2011' });

    expect(result).toMatchObject({ output: '္ka', complete: false });
    expect(result.segments[0]).toEqual({
      kind: 'unsupported',
      input: '္',
      output: '္',
      start: 0,
      end: 1,
    });
  });
});
