import type {
  MyanmarEncoding,
  MyanmarEncodingDetectionResult,
  MyanmarEncodingSegment,
  MyanmarEncodingSegmentEncoding,
} from '@myanlex/types';

import { getGoogleZawgyiProbability } from './google-zawgyi-model.js';
import {
  scanCodePoints,
  type ScannedCodePoint,
} from '../unicode/code-points.js';

export const ENCODING_DETECTION_PROFILE = 'zawgyi-unicode-v1' as const;
export const UNICODE_MAX_PROBABILITY = 0.05;
export const ZAWGYI_MIN_PROBABILITY = 0.95;

function isMyanmarCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1000 && codePoint <= 0x109f) ||
    (codePoint >= 0xa9e0 && codePoint <= 0xa9ff) ||
    (codePoint >= 0xaa60 && codePoint <= 0xaa7f) ||
    (codePoint >= 0x116d0 && codePoint <= 0x116ff)
  );
}

function encodingFromProbability(
  probability: number,
): MyanmarEncodingSegmentEncoding {
  if (!Number.isFinite(probability)) return 'unknown';
  if (probability <= UNICODE_MAX_PROBABILITY) return 'unicode';
  if (probability >= ZAWGYI_MIN_PROBABILITY) return 'zawgyi';
  return 'unknown';
}

function createSegment(
  codePoints: readonly ScannedCodePoint[],
  startIndex: number,
  endIndex: number,
): MyanmarEncodingSegment {
  const text = codePoints
    .slice(startIndex, endIndex)
    .map(({ value }) => value)
    .join('');
  const probability = getGoogleZawgyiProbability(text);

  return {
    text,
    encoding: encodingFromProbability(probability),
    zawgyiProbability: Number.isFinite(probability) ? probability : null,
    start: codePoints[startIndex]!.start,
    end: codePoints[endIndex - 1]!.end,
  };
}

function resultEncoding(
  segments: readonly MyanmarEncodingSegment[],
): MyanmarEncoding {
  if (segments.length === 0) return 'non_myanmar';

  const hasUnicode = segments.some(({ encoding }) => encoding === 'unicode');
  const hasZawgyi = segments.some(({ encoding }) => encoding === 'zawgyi');

  if (hasUnicode && hasZawgyi) return 'mixed';
  if (hasUnicode) return 'unicode';
  if (hasZawgyi) return 'zawgyi';
  return 'unknown';
}

function resultConfidence(
  encoding: MyanmarEncoding,
  segments: readonly MyanmarEncodingSegment[],
): number | null {
  const probabilities = segments.flatMap(
    ({ encoding: segmentEncoding, zawgyiProbability }) =>
      zawgyiProbability === null
        ? []
        : [{ encoding: segmentEncoding, probability: zawgyiProbability }],
  );

  const strongestUnicode = Math.max(
    ...probabilities
      .filter(({ encoding: segmentEncoding }) => segmentEncoding === 'unicode')
      .map(({ probability }) => 1 - probability),
    Number.NEGATIVE_INFINITY,
  );
  const strongestZawgyi = Math.max(
    ...probabilities
      .filter(({ encoding: segmentEncoding }) => segmentEncoding === 'zawgyi')
      .map(({ probability }) => probability),
    Number.NEGATIVE_INFINITY,
  );

  if (encoding === 'unicode') return strongestUnicode;
  if (encoding === 'zawgyi') return strongestZawgyi;
  if (encoding === 'mixed') return Math.min(strongestUnicode, strongestZawgyi);
  return null;
}

/**
 * Detects standard Unicode versus Zawgyi using conservative probability
 * thresholds. Ambiguous Myanmar runs remain unknown.
 */
export function detectMyanmarEncoding(
  text: string,
): MyanmarEncodingDetectionResult {
  const codePoints = scanCodePoints(text);
  const segments: MyanmarEncodingSegment[] = [];

  for (let index = 0; index < codePoints.length;) {
    if (!isMyanmarCodePoint(codePoints[index]!.codePoint)) {
      index += 1;
      continue;
    }

    let endIndex = index + 1;
    while (
      endIndex < codePoints.length &&
      isMyanmarCodePoint(codePoints[endIndex]!.codePoint)
    ) {
      endIndex += 1;
    }

    segments.push(createSegment(codePoints, index, endIndex));
    index = endIndex;
  }

  const encoding = resultEncoding(segments);
  return {
    input: text,
    encoding,
    confidence: resultConfidence(encoding, segments),
    profile: ENCODING_DETECTION_PROFILE,
    segments,
  };
}
