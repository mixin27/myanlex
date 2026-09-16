import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  scanMyanmarSequences,
  type MyanmarSequenceToken,
} from '../src/index.js';

interface ExpectedToken {
  readonly kind: MyanmarSequenceToken['kind'];
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface SequenceCase {
  readonly id: string;
  readonly input: string;
  readonly expected: readonly ExpectedToken[];
  readonly basis: string;
}

interface SequenceCorpus {
  readonly unicode_version: string;
  readonly cases: readonly SequenceCase[];
}

const corpusUrl = new URL(
  '../../../corpus/sequence-recognition/burmese-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as SequenceCorpus;

function compactToken(token: MyanmarSequenceToken): ExpectedToken {
  return {
    kind: token.kind,
    text: token.text,
    start: token.start,
    end: token.end,
  };
}

describe('scanMyanmarSequences', () => {
  it.each(corpus.cases)('$id', ({ input, expected }) => {
    const tokens = scanMyanmarSequences(input);

    expect(tokens.map(compactToken)).toEqual(expected);
    expect(tokens.map(({ text }) => text).join('')).toBe(input);
  });

  it('returns detailed scalar and sequence metadata', () => {
    expect(scanMyanmarSequences('ကင်္ခ')).toEqual([
      {
        kind: 'scalar',
        text: 'က',
        codePoint: 0x1000,
        characterClass: 'myanmar_letter',
        start: 0,
        end: 1,
      },
      {
        kind: 'kinzi',
        text: 'င်္',
        codePoints: [0x1004, 0x103a, 0x1039],
        start: 1,
        end: 4,
      },
      {
        kind: 'scalar',
        text: 'ခ',
        codePoint: 0x1001,
        characterClass: 'myanmar_letter',
        start: 4,
        end: 5,
      },
    ]);
  });
});
