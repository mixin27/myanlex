import type {
  BurmeseSyllableSegment,
  BurmeseSyllableSegmentKind,
} from '@myanlex/types';

import { classifyCodePoint } from '../classification/classify-code-point.js';
import {
  scanCodePoints,
  type ScannedCodePoint,
} from '../unicode/code-points.js';

export const SYLLABIFICATION_PROFILE = 'burmese-orthographic-v1' as const;

const MYANMAR_NGA = 0x1004;
const MYANMAR_GREAT_SA = 0x103f;
const MYANMAR_ASAT = 0x103a;
const MYANMAR_VIRAMA = 0x1039;
const MYANMAR_DOT_BELOW = 0x1037;

function isBurmeseConsonant(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0x1000 && codePoint <= 0x1021;
}

function isBurmeseIndependentBase(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1023 && codePoint <= 0x1027) ||
      codePoint === 0x1029 ||
      codePoint === 0x102a ||
      codePoint === 0x104e)
  );
}

function isBurmeseBase(codePoint: number | undefined): boolean {
  return isBurmeseConsonant(codePoint) || isBurmeseIndependentBase(codePoint);
}

function isBurmeseStandalone(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1040 && codePoint <= 0x1049) ||
      codePoint === 0x104c ||
      codePoint === 0x104d ||
      codePoint === 0x104f)
  );
}

function isBurmeseContinuation(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x102b && codePoint <= 0x1038) ||
      (codePoint >= 0x103a && codePoint <= 0x103e))
  );
}

function isSupportedSubjoinedConsonant(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1000 && codePoint <= 0x1019) ||
      codePoint === 0x101c ||
      codePoint === 0x101e ||
      codePoint === 0x1020 ||
      codePoint === 0x1021)
  );
}

function isKinziAt(
  codePoints: readonly ScannedCodePoint[],
  index: number,
): boolean {
  return (
    codePoints[index]?.codePoint === MYANMAR_NGA &&
    codePoints[index + 1]?.codePoint === MYANMAR_ASAT &&
    codePoints[index + 2]?.codePoint === MYANMAR_VIRAMA &&
    isBurmeseBase(codePoints[index + 3]?.codePoint)
  );
}

function codaLengthAt(
  codePoints: readonly ScannedCodePoint[],
  index: number,
): number {
  if (!isBurmeseConsonant(codePoints[index]?.codePoint)) return 0;
  if (codePoints[index + 1]?.codePoint === MYANMAR_ASAT) return 2;

  // NFC may place dot below before asat. Both canonical orders belong to the
  // same written syllable and are preserved exactly as supplied.
  if (
    codePoints[index + 1]?.codePoint === MYANMAR_DOT_BELOW &&
    codePoints[index + 2]?.codePoint === MYANMAR_ASAT
  ) {
    return 3;
  }

  return 0;
}

function chainLengthAt(
  codePoints: readonly ScannedCodePoint[],
  index: number,
): number {
  return isBurmeseConsonant(codePoints[index]?.codePoint) &&
    codePoints[index + 1]?.codePoint === MYANMAR_VIRAMA &&
    isSupportedSubjoinedConsonant(codePoints[index + 2]?.codePoint)
    ? 3
    : 0;
}

function consumeBurmeseSyllable(
  codePoints: readonly ScannedCodePoint[],
  startIndex: number,
): number {
  let index = startIndex;
  let hasFinalAsat = false;

  if (isKinziAt(codePoints, index)) index += 3;

  if (!isBurmeseBase(codePoints[index]?.codePoint)) return startIndex;
  index += 1;

  while (index < codePoints.length) {
    const codePoint = codePoints[index]?.codePoint;

    if (isBurmeseContinuation(codePoint)) {
      if (codePoint === MYANMAR_ASAT) hasFinalAsat = true;
      index += 1;
      continue;
    }

    if (
      codePoint === MYANMAR_VIRAMA &&
      isSupportedSubjoinedConsonant(codePoints[index + 1]?.codePoint)
    ) {
      index += 2;
      continue;
    }

    if (codePoint === MYANMAR_GREAT_SA) {
      index += 1;
      continue;
    }

    const codaLength = hasFinalAsat ? 0 : codaLengthAt(codePoints, index);
    if (codaLength > 0) {
      index += codaLength;
      hasFinalAsat = true;
      continue;
    }

    const chainLength = hasFinalAsat ? 0 : chainLengthAt(codePoints, index);
    if (chainLength > 0) {
      index += chainLength;
      continue;
    }

    break;
  }

  return index;
}

function isMyanmarScalar(codePoint: number): boolean {
  return classifyCodePoint(codePoint).startsWith('myanmar_');
}

function isSeparator(codePoint: number): boolean {
  const characterClass = classifyCodePoint(codePoint);

  return (
    characterClass === 'whitespace' ||
    characterClass === 'ascii_punctuation' ||
    codePoint === 0x104a ||
    codePoint === 0x104b
  );
}

function createSegment(
  codePoints: readonly ScannedCodePoint[],
  startIndex: number,
  endIndex: number,
  kind: BurmeseSyllableSegmentKind,
): BurmeseSyllableSegment {
  const first = codePoints[startIndex]!;

  return {
    kind,
    text: codePoints
      .slice(startIndex, endIndex)
      .map(({ value }) => value)
      .join(''),
    start: first.start,
    end: codePoints[endIndex - 1]!.end,
  };
}

/**
 * Segments modern Burmese Unicode into written orthographic syllables.
 * Unsupported Myanmar patterns and non-Myanmar text remain lossless segments.
 */
export function segmentBurmeseSyllables(
  text: string,
): readonly BurmeseSyllableSegment[] {
  const codePoints = scanCodePoints(text);
  const segments: BurmeseSyllableSegment[] = [];

  for (let index = 0; index < codePoints.length;) {
    const codePoint = codePoints[index]!.codePoint;
    const syllableEnd = isBurmeseStandalone(codePoint)
      ? index + 1
      : consumeBurmeseSyllable(codePoints, index);

    if (syllableEnd > index) {
      segments.push(
        createSegment(codePoints, index, syllableEnd, 'burmese_syllable'),
      );
      index = syllableEnd;
      continue;
    }

    if (isSeparator(codePoint)) {
      segments.push(createSegment(codePoints, index, index + 1, 'separator'));
      index += 1;
      continue;
    }

    if (isMyanmarScalar(codePoint)) {
      segments.push(
        createSegment(codePoints, index, index + 1, 'unsupported_myanmar'),
      );
      index += 1;
      continue;
    }

    let endIndex = index + 1;
    while (
      endIndex < codePoints.length &&
      !isSeparator(codePoints[endIndex]!.codePoint) &&
      !isMyanmarScalar(codePoints[endIndex]!.codePoint)
    ) {
      endIndex += 1;
    }

    segments.push(createSegment(codePoints, index, endIndex, 'non_myanmar'));
    index = endIndex;
  }

  return segments;
}
