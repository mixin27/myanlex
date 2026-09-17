import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MYANLEX_UNICODE_VERSION,
  TEXT_TOKENIZATION_PROFILE,
  tokenizeText,
  type DetectedTextScript,
  type TextToken,
} from '../src/index.js';

interface TokenizationCase {
  readonly id: string;
  readonly input: string;
  readonly basis: string;
  readonly expected: {
    readonly tokens: readonly TextToken[];
    readonly scripts: readonly DetectedTextScript[];
    readonly mixedScript: boolean;
  };
}

interface TokenizationCorpus {
  readonly profile: string;
  readonly unicode_version: string;
  readonly cases: readonly TokenizationCase[];
}

const corpusUrl = new URL(
  '../../../corpus/tokenization/myanmar-script-tokens-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(
  readFileSync(corpusUrl, 'utf8'),
) as TokenizationCorpus;

describe('tokenizeText', () => {
  it('uses the pinned corpus profile and Unicode version', () => {
    expect(corpus.profile).toBe(TEXT_TOKENIZATION_PROFILE);
    expect(corpus.unicode_version).toBe(MYANLEX_UNICODE_VERSION);
  });

  it.each(corpus.cases)('$id', ({ input, expected }) => {
    const result = tokenizeText(input);

    expect(result).toEqual({
      input,
      profile: TEXT_TOKENIZATION_PROFILE,
      ...expected,
    });
    expect(result.tokens.map(({ text }) => text).join('')).toBe(input);
  });
});
