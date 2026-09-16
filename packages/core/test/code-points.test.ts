import { describe, expect, it } from 'vitest';

import {
  codePointLength,
  scanCodePoints,
  sliceByCodePoints,
  toCodePoints,
} from '../src/index.js';

describe('Unicode code-point utilities', () => {
  it('does not split supplementary characters', () => {
    const text = 'က😀ခ';

    expect(text.length).toBe(4);
    expect(codePointLength(text)).toBe(3);
    expect(toCodePoints(text)).toEqual(['က', '😀', 'ခ']);
  });

  it('slices using code-point offsets', () => {
    expect(sliceByCodePoints('က😀ခ', 1, 2)).toBe('😀');
  });

  it('returns half-open code-point spans', () => {
    expect(scanCodePoints('က😀')).toEqual([
      { value: 'က', codePoint: 0x1000, start: 0, end: 1 },
      { value: '😀', codePoint: 0x1f600, start: 1, end: 2 },
    ]);
  });

  it('handles empty text', () => {
    expect(scanCodePoints('')).toEqual([]);
    expect(codePointLength('')).toBe(0);
  });
});
