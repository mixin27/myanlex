import type {
  KinziToken,
  MyanmarSequenceToken,
  ScalarToken,
  StackToken,
} from '@myanlex/types';

import { classifyCodePoint } from '../classification/classify-code-point.js';
import { scanCodePoints } from '../unicode/code-points.js';

const MYANMAR_NGA = 0x1004;
const MYANMAR_DOT_BELOW = 0x1037;
const MYANMAR_VIRAMA = 0x1039;
const MYANMAR_ASAT = 0x103a;

function isBurmeseBaseConsonant(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0x1000 && codePoint <= 0x1021;
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

function hasBurmeseBaseBeforeVirama(
  codePoints: ReturnType<typeof scanCodePoints>,
  viramaIndex: number,
): boolean {
  const previous = codePoints[viramaIndex - 1]?.codePoint;

  if (isBurmeseBaseConsonant(previous)) return true;

  return (
    previous === MYANMAR_DOT_BELOW &&
    isBurmeseBaseConsonant(codePoints[viramaIndex - 2]?.codePoint)
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
      isBurmeseBaseConsonant(kinziBase?.codePoint)
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
