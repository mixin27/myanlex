import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { convertMyanmarEncoding } from '@myanlex/core';
import { createMyanLexApplication } from '../src/index.js';

// Reuse source-verified, provenance-recorded corpus material; no new text dataset.
const corpus = JSON.parse(
  readFileSync(
    new URL('../../../corpus/encoding/detection-v1.json', import.meta.url),
    'utf8',
  ),
) as {
  cases: {
    id: string;
    input: string;
    encoding: string;
    segments: { encoding: string }[];
  }[];
};
const app = createMyanLexApplication();
describe('opt-in encoding source validation', () => {
  for (const from of ['unicode', 'zawgyi'] as const) {
    const to: 'unicode' | 'zawgyi' = from === 'unicode' ? 'zawgyi' : 'unicode';
    it.each(corpus.cases)(`${from}: $id`, (sample) => {
      const request = { text: sample.input, from, to };
      const unchecked = convertMyanmarEncoding(sample.input, { from, to });
      expect(app.convertText(request)).toEqual(unchecked);
      expect(app.convertText({ ...request, validateSource: false })).toEqual(
        unchecked,
      );
      const code =
        sample.encoding === 'mixed'
          ? 'encoding_mixed'
          : sample.encoding === to
            ? 'encoding_mismatch'
            : sample.segments.some((segment) => segment.encoding === 'unknown')
              ? 'encoding_uncertain'
              : undefined;
      if (code) {
        expect(() =>
          app.convertText({ ...request, validateSource: true }),
        ).toThrowError(expect.objectContaining({ code }));
      } else {
        expect(app.convertText({ ...request, validateSource: true })).toEqual(
          unchecked,
        );
      }
      expect(
        app.convertText({ ...request, to: from, validateSource: true }).output,
      ).toBe(sample.input);
    });
  }
  it('does not overlook uncertain segments beside strong Unicode evidence', () => {
    const strong = corpus.cases.find(
      (sample) => sample.id === 'strong-unicode',
    )!;
    const ambiguous = corpus.cases.find(
      (sample) => sample.id === 'myanmar-punctuation-is-ambiguous',
    )!;
    expect(() =>
      app.convertText({
        text: `${strong.input} / ${ambiguous.input}`,
        from: 'unicode',
        to: 'zawgyi',
        validateSource: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'encoding_uncertain' }));
  });
  it('validates Unicode scalar input before detection', () => {
    expect(() =>
      app.convertText({
        text: '\ud800',
        from: 'unicode',
        to: 'zawgyi',
        validateSource: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'invalid_unicode' }));
  });
});
