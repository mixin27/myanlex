import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BURMESE_ORTHOGRAPHY_PROFILE,
  validateBurmeseOrthography,
  type BurmeseOrthographyDiagnostic,
} from '../src/index.js';

interface ExpectedDiagnostic {
  readonly code: BurmeseOrthographyDiagnostic['code'];
  readonly start: number;
  readonly end: number;
}

interface ValidationCase {
  readonly id: string;
  readonly input: string;
  readonly valid: boolean;
  readonly diagnostics: readonly ExpectedDiagnostic[];
  readonly basis: string;
}

interface ValidationCorpus {
  readonly profile: string;
  readonly unicode_version: string;
  readonly cases: readonly ValidationCase[];
}

const corpusUrl = new URL(
  '../../../corpus/orthography-validation/burmese-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as ValidationCorpus;

function compactDiagnostic(
  diagnostic: BurmeseOrthographyDiagnostic,
): ExpectedDiagnostic {
  return {
    code: diagnostic.code,
    start: diagnostic.start,
    end: diagnostic.end,
  };
}

describe('validateBurmeseOrthography', () => {
  it('uses the corpus profile', () => {
    expect(corpus.profile).toBe(BURMESE_ORTHOGRAPHY_PROFILE);
    expect(corpus.unicode_version).toBe('17.0.0');
  });

  it.each(corpus.cases)('$id', ({ input, valid, diagnostics }) => {
    const result = validateBurmeseOrthography(input);

    expect(result.input).toBe(input);
    expect(result.valid).toBe(valid);
    expect(result.diagnostics.map(compactDiagnostic)).toEqual(diagnostics);
    expect(result.diagnostics.every(({ message }) => message.length > 0)).toBe(
      true,
    );
    expect(
      result.diagnostics.every(({ severity }) => severity === 'error'),
    ).toBe(true);
  });
});
