import { describe, expect, it } from 'vitest';

import {
  ApplicationInputError,
  createMyanLexApplication,
  DEFAULT_MAX_TEXT_CODE_POINTS,
} from '../src/index.js';

describe('DefaultMyanLexApplication', () => {
  const application = createMyanLexApplication();

  it('exposes encoding detection', () => {
    expect(application.detectText({ text: 'မြန်မာ' }).encoding).toBe('unicode');
  });

  it('exposes safe normalization', () => {
    expect(application.normalizeText({ text: 'က့်' })).toMatchObject({
      output: 'က့်',
      changed: true,
      profile: 'unicode-nfc',
    });
  });

  it('exposes explicit encoding conversion', () => {
    expect(
      application.convertText({
        text: 'ျမန္မာ',
        from: 'zawgyi',
        to: 'unicode',
      }),
    ).toMatchObject({ output: 'မြန်မာ', profile: 'cldr-zawgyi-v1' });
  });

  it('wraps syllabification in a stable result contract', () => {
    expect(application.syllabifyText({ text: 'မြန်မာ' })).toEqual({
      input: 'မြန်မာ',
      profile: 'burmese-orthographic-v1',
      segments: [
        { kind: 'burmese_syllable', text: 'မြန်', start: 0, end: 4 },
        { kind: 'burmese_syllable', text: 'မာ', start: 4, end: 6 },
      ],
    });
  });

  it('exposes orthography validation', () => {
    expect(application.validateOrthography({ text: 'က' }).valid).toBe(true);
  });

  it('requires an explicit transliteration scheme', () => {
    expect(
      application.transliterateText({ text: 'က', scheme: 'ala-lc-2011' }),
    ).toMatchObject({ output: 'ka', complete: true });
  });

  it('exposes lossless tokenization', () => {
    expect(application.tokenizeText({ text: 'Aက' })).toMatchObject({
      scripts: ['latin', 'myanmar'],
      mixedScript: true,
    });
  });

  it('accepts empty input consistently across core operations', () => {
    expect(application.tokenizeText({ text: '' }).tokens).toEqual([]);
  });

  it('measures limits in code points rather than UTF-16 code units', () => {
    const limited = createMyanLexApplication({ maximumTextCodePoints: 1 });

    expect(limited.tokenizeText({ text: '😀' }).tokens).toHaveLength(1);
  });

  it('rejects input beyond the configured code-point limit', () => {
    const limited = createMyanLexApplication({ maximumTextCodePoints: 1 });

    expect(() => limited.normalizeText({ text: 'ကခ' })).toThrowError(
      new ApplicationInputError(
        'text_too_long',
        'text must contain at most 1 Unicode code points.',
        { actualCodePoints: 2, maximumCodePoints: 1 },
      ),
    );
  });

  it('rejects unpaired UTF-16 surrogates at the application boundary', () => {
    expect(() => application.detectText({ text: '\ud800' })).toThrowError(
      expect.objectContaining({ code: 'invalid_unicode' }),
    );
  });

  it('validates custom limits when constructed', () => {
    expect(() =>
      createMyanLexApplication({ maximumTextCodePoints: -1 }),
    ).toThrow(RangeError);
  });

  it('uses the documented default limit', () => {
    expect(DEFAULT_MAX_TEXT_CODE_POINTS).toBe(100_000);
  });
});
