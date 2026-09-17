import { describe, expect, it } from 'vitest';

import {
  ApplicationInputError,
  createMyanLexApplication,
  DEFAULT_MAX_BATCH_ITEMS,
  DEFAULT_MAX_BATCH_UTF8_BYTES,
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

  it('syllabifies batches in input order', () => {
    expect(
      application.batchSyllabify({
        items: [
          { id: 'first', text: 'မြန်မာ' },
          { id: 'second', text: 'က' },
        ],
      }),
    ).toMatchObject({
      results: [
        { id: 'first', success: true, result: { input: 'မြန်မာ' } },
        { id: 'second', success: true, result: { input: 'က' } },
      ],
    });
  });

  it('transliterates batches with one explicit scheme', () => {
    expect(
      application.batchTransliterate({
        items: [
          { id: 'one', text: 'က' },
          { id: 'two', text: 'ခ' },
        ],
        scheme: 'ala-lc-2011',
      }),
    ).toMatchObject({
      results: [
        { id: 'one', success: true, result: { output: 'ka' } },
        { id: 'two', success: true, result: { output: 'kha' } },
      ],
    });
  });

  it('isolates input failures to their batch item', () => {
    const limited = createMyanLexApplication({ maximumTextCodePoints: 1 });

    expect(
      limited.batchSyllabify({
        items: [
          { id: 'too-long', text: 'ကခ' },
          { id: 'valid', text: 'က' },
        ],
      }),
    ).toMatchObject({
      results: [
        {
          id: 'too-long',
          success: false,
          error: { code: 'text_too_long' },
        },
        { id: 'valid', success: true },
      ],
    });
  });

  it('rejects batch-wide item and UTF-8 byte limit violations', () => {
    const limited = createMyanLexApplication({
      maximumBatchItems: 1,
      maximumBatchUtf8Bytes: 3,
    });

    expect(() =>
      limited.batchSyllabify({
        items: [
          { id: 'one', text: 'က' },
          { id: 'two', text: 'ခ' },
        ],
      }),
    ).toThrowError(expect.objectContaining({ code: 'batch_too_many_items' }));

    expect(() =>
      limited.batchSyllabify({ items: [{ id: 'one', text: 'ကa' }] }),
    ).toThrowError(expect.objectContaining({ code: 'batch_too_large' }));
  });

  it('rejects empty batches', () => {
    expect(() => application.batchSyllabify({ items: [] })).toThrowError(
      expect.objectContaining({ code: 'batch_empty' }),
    );
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
    expect(DEFAULT_MAX_BATCH_ITEMS).toBe(1_000);
    expect(DEFAULT_MAX_BATCH_UTF8_BYTES).toBe(1_000_000);
  });
});
