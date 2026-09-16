import type { TextSpan } from '@myanlex/types';

export interface ScannedCodePoint extends TextSpan {
  readonly value: string;
  readonly codePoint: number;
}

/** Converts text into Unicode code points without splitting surrogate pairs. */
export function toCodePoints(text: string): readonly string[] {
  return Array.from(text);
}

/** Returns the number of Unicode code points in text. */
export function codePointLength(text: string): number {
  return toCodePoints(text).length;
}

/** Returns a slice using zero-based, half-open Unicode code-point offsets. */
export function sliceByCodePoints(
  text: string,
  start: number,
  end?: number,
): string {
  return toCodePoints(text).slice(start, end).join('');
}

/** Scans text into individual Unicode code points and their public offsets. */
export function scanCodePoints(text: string): readonly ScannedCodePoint[] {
  return toCodePoints(text).map((value, start) => {
    const codePoint = value.codePointAt(0);

    if (codePoint === undefined) {
      throw new Error('A scanned code point cannot be empty.');
    }

    return {
      value,
      codePoint,
      start,
      end: start + 1,
    };
  });
}
