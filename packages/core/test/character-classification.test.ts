import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  classifyCodePoint,
  MYANLEX_UNICODE_VERSION,
  type CharacterClass,
} from '../src/index.js';

interface CorpusCase {
  readonly id: string;
  readonly character: string;
  readonly code_point: string;
  readonly expected: CharacterClass;
  readonly basis: string;
}

interface ClassificationCorpus {
  readonly unicode_version: string;
  readonly cases: readonly CorpusCase[];
}

const corpusUrl = new URL(
  '../../../corpus/character-classification/unicode-17.json',
  import.meta.url,
);
const corpus = JSON.parse(
  readFileSync(corpusUrl, 'utf8'),
) as ClassificationCorpus;

describe('classifyCodePoint', () => {
  it('uses the same Unicode version as the corpus', () => {
    expect(MYANLEX_UNICODE_VERSION).toBe(corpus.unicode_version);
  });

  it.each(corpus.cases)('$id', ({ character, code_point, expected }) => {
    const characters = Array.from(character);
    expect(characters).toHaveLength(1);

    const codePoint = character.codePointAt(0);
    expect(codePoint).toBe(Number.parseInt(code_point.slice(2), 16));
    expect(classifyCodePoint(codePoint!)).toBe(expected);
  });

  it.each([-1, 0x110000, 0xd800, 1.5, Number.NaN])(
    'rejects invalid scalar %s',
    (codePoint) => {
      expect(() => classifyCodePoint(codePoint)).toThrow(RangeError);
    },
  );
});
