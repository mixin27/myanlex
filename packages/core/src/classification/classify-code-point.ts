import type { CharacterClass } from '@myanlex/types';

export const MYANLEX_UNICODE_VERSION = '17.0.0' as const;

type CodePointRange = readonly [start: number, end: number];

const MYANMAR_LETTER_RANGES: readonly CodePointRange[] = [
  [0x1000, 0x102a],
  [0x103f, 0x103f],
  [0x1050, 0x1055],
  [0x105a, 0x105d],
  [0x1061, 0x1061],
  [0x1065, 0x1066],
  [0x106e, 0x1070],
  [0x1075, 0x1081],
  [0x108e, 0x108e],
  [0xa9e0, 0xa9e4],
  [0xa9e6, 0xa9ef],
  [0xa9fa, 0xa9fe],
  [0xaa60, 0xaa76],
  [0xaa7a, 0xaa7a],
  [0xaa7e, 0xaa7f],
];

const MYANMAR_VOWEL_SIGN_RANGES: readonly CodePointRange[] = [
  [0x102b, 0x1035],
  [0x1056, 0x1059],
  [0x1062, 0x1062],
  [0x1067, 0x1068],
  [0x1071, 0x1074],
  [0x1083, 0x1086],
  [0x109c, 0x109d],
];

const MYANMAR_MEDIAL_RANGES: readonly CodePointRange[] = [
  [0x103b, 0x103e],
  [0x105e, 0x1060],
  [0x1082, 0x1082],
];

const MYANMAR_TONE_MARK_RANGES: readonly CodePointRange[] = [
  [0x1063, 0x1064],
  [0x1069, 0x106d],
  [0x1087, 0x108d],
  [0x108f, 0x108f],
  [0x109a, 0x109b],
  [0xaa7b, 0xaa7d],
];

const MYANMAR_MARK_RANGES: readonly CodePointRange[] = [
  [0x1036, 0x1038],
  [0xa9e5, 0xa9e5],
];

const MYANMAR_DIGIT_RANGES: readonly CodePointRange[] = [
  [0x1040, 0x1049],
  [0x1090, 0x1099],
  [0xa9f0, 0xa9f9],
  [0x116d0, 0x116e3],
];

const MYANMAR_PUNCTUATION_RANGES: readonly CodePointRange[] = [
  [0x104a, 0x104f],
];

const MYANMAR_SYMBOL_RANGES: readonly CodePointRange[] = [
  [0x109e, 0x109f],
  [0xaa77, 0xaa79],
];

const WHITE_SPACE_RANGES: readonly CodePointRange[] = [
  [0x0009, 0x000d],
  [0x0020, 0x0020],
  [0x0085, 0x0085],
  [0x00a0, 0x00a0],
  [0x1680, 0x1680],
  [0x2000, 0x200a],
  [0x2028, 0x2029],
  [0x202f, 0x202f],
  [0x205f, 0x205f],
  [0x3000, 0x3000],
];

const ASCII_PUNCTUATION_RANGES: readonly CodePointRange[] = [
  [0x0021, 0x002f],
  [0x003a, 0x0040],
  [0x005b, 0x0060],
  [0x007b, 0x007e],
];

function isInRanges(
  codePoint: number,
  ranges: readonly CodePointRange[],
): boolean {
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function assertUnicodeScalar(codePoint: number): void {
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;

  if (
    !Number.isInteger(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    isSurrogate
  ) {
    throw new RangeError('codePoint must be a valid Unicode scalar value.');
  }
}

/** Classifies one Unicode scalar using the project's pinned Unicode data. */
export function classifyCodePoint(codePoint: number): CharacterClass {
  assertUnicodeScalar(codePoint);

  if (codePoint === 0x1039) return 'myanmar_virama';
  if (codePoint === 0x103a) return 'myanmar_asat';
  if (isInRanges(codePoint, MYANMAR_MEDIAL_RANGES)) return 'myanmar_medial';
  if (isInRanges(codePoint, MYANMAR_VOWEL_SIGN_RANGES)) {
    return 'myanmar_vowel_sign';
  }
  if (isInRanges(codePoint, MYANMAR_TONE_MARK_RANGES)) {
    return 'myanmar_tone_mark';
  }
  if (isInRanges(codePoint, MYANMAR_MARK_RANGES)) return 'myanmar_mark';
  if (isInRanges(codePoint, MYANMAR_LETTER_RANGES)) return 'myanmar_letter';
  if (isInRanges(codePoint, MYANMAR_DIGIT_RANGES)) return 'myanmar_digit';
  if (isInRanges(codePoint, MYANMAR_PUNCTUATION_RANGES)) {
    return 'myanmar_punctuation';
  }
  if (isInRanges(codePoint, MYANMAR_SYMBOL_RANGES)) return 'myanmar_symbol';
  if (isInRanges(codePoint, WHITE_SPACE_RANGES)) return 'whitespace';
  if (
    (codePoint >= 0x0041 && codePoint <= 0x005a) ||
    (codePoint >= 0x0061 && codePoint <= 0x007a)
  ) {
    return 'ascii_latin_letter';
  }
  if (codePoint >= 0x0030 && codePoint <= 0x0039) return 'ascii_digit';
  if (isInRanges(codePoint, ASCII_PUNCTUATION_RANGES)) {
    return 'ascii_punctuation';
  }

  return 'other';
}
