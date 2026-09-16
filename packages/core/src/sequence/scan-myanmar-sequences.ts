import type {
  KinziToken,
  MyanmarSequenceToken,
  ScalarToken,
  StackToken,
} from '@myanlex/types';

import {
  isBurmeseConsonant,
  isSupportedSubjoinedConsonant,
  MYANMAR_ASAT,
  MYANMAR_DOT_BELOW,
  MYANMAR_NGA,
  MYANMAR_VIRAMA,
} from '../burmese/code-points.js';
import { classifyCodePoint } from '../classification/classify-code-point.js';
import { scanCodePoints } from '../unicode/code-points.js';

function hasBurmeseBaseBeforeVirama(
  codePoints: ReturnType<typeof scanCodePoints>,
  viramaIndex: number,
): boolean {
  const previous = codePoints[viramaIndex - 1]?.codePoint;

  if (isBurmeseConsonant(previous)) return true;

  return (
    previous === MYANMAR_DOT_BELOW &&
    isBurmeseConsonant(codePoints[viramaIndex - 2]?.codePoint)
  );
}

function createScalarToken(
  value: string,
  codePoint: number,
  start: number,
): ScalarToken {
  return {
    kind: 'scalar',
    text: value,
    codePoint,
    characterClass: classifyCodePoint(codePoint),
    start,
    end: start + 1,
  };
}

function createKinziToken(text: string, start: number): KinziToken {
  return {
    kind: 'kinzi',
    text,
    codePoints: [MYANMAR_NGA, MYANMAR_ASAT, MYANMAR_VIRAMA],
    start,
    end: start + 3,
  };
}

function createStackToken(
  text: string,
  start: number,
  consonant: number,
): StackToken {
  return {
    kind: 'stack',
    text,
    codePoints: [MYANMAR_VIRAMA, consonant],
    start,
    end: start + 2,
  };
}

/**
 * Recognizes conservative Burmese kinzi and stack structures while preserving
 * every unsupported or malformed scalar unchanged.
 */
export function scanMyanmarSequences(
  text: string,
): readonly MyanmarSequenceToken[] {
  const codePoints = scanCodePoints(text);
  const tokens: MyanmarSequenceToken[] = [];

  for (let index = 0; index < codePoints.length;) {
    const current = codePoints[index]!;
    const next = codePoints[index + 1];
    const afterNext = codePoints[index + 2];
    const kinziBase = codePoints[index + 3];

    if (
      current.codePoint === MYANMAR_NGA &&
      next?.codePoint === MYANMAR_ASAT &&
      afterNext?.codePoint === MYANMAR_VIRAMA &&
      isBurmeseConsonant(kinziBase?.codePoint)
    ) {
      tokens.push(
        createKinziToken(
          current.value + next.value + afterNext.value,
          current.start,
        ),
      );
      index += 3;
      continue;
    }

    if (
      current.codePoint === MYANMAR_VIRAMA &&
      hasBurmeseBaseBeforeVirama(codePoints, index) &&
      isSupportedSubjoinedConsonant(next?.codePoint)
    ) {
      tokens.push(
        createStackToken(
          current.value + next!.value,
          current.start,
          next!.codePoint,
        ),
      );
      index += 2;
      continue;
    }

    tokens.push(
      createScalarToken(current.value, current.codePoint, current.start),
    );
    index += 1;
  }

  return tokens;
}
