import type {
  DetectedTextScript,
  TextToken,
  TextTokenKind,
  TextTokenizationResult,
  TextTokenScript,
} from '@myanlex/types';

import { classifyCodePoint } from '../classification/classify-code-point.js';
import { segmentBurmeseSyllables } from '../syllabification/segment-burmese-syllables.js';
import {
  scanCodePoints,
  type ScannedCodePoint,
} from '../unicode/code-points.js';
import {
  isEmojiModifier,
  isEmojiTag,
  isExtendedPictographic,
  isRegionalIndicator,
  isVariationSelector,
} from './unicode-emoji-17.js';

export const TEXT_TOKENIZATION_PROFILE = 'myanmar-script-tokens-v1' as const;

const ZERO_WIDTH_JOINER = 0x200d;
const COMBINING_ENCLOSING_KEYCAP = 0x20e3;
const CANCEL_TAG = 0xe007f;

function isKeycapBase(codePoint: number): boolean {
  return (
    codePoint === 0x23 ||
    codePoint === 0x2a ||
    (codePoint >= 0x30 && codePoint <= 0x39)
  );
}

function consumeEmojiSuffix(
  codePoints: readonly ScannedCodePoint[],
  start: number,
): number {
  let index = start;

  if (isVariationSelector(codePoints[index]?.codePoint ?? -1)) index += 1;
  if (isEmojiModifier(codePoints[index]?.codePoint ?? -1)) index += 1;

  while (isEmojiTag(codePoints[index]?.codePoint ?? -1)) index += 1;
  if (codePoints[index]?.codePoint === CANCEL_TAG) index += 1;

  return index;
}

function emojiLengthAt(
  codePoints: readonly ScannedCodePoint[],
  start: number,
): number {
  const codePoint = codePoints[start]?.codePoint;
  if (codePoint === undefined) return 0;

  if (isKeycapBase(codePoint)) {
    const afterVariation = codePoints[start + 1]?.codePoint === 0xfe0f ? 2 : 1;
    return codePoints[start + afterVariation]?.codePoint ===
      COMBINING_ENCLOSING_KEYCAP
      ? afterVariation + 1
      : 0;
  }

  if (isRegionalIndicator(codePoint)) {
    return isRegionalIndicator(codePoints[start + 1]?.codePoint ?? -1) ? 2 : 1;
  }

  if (!isExtendedPictographic(codePoint) && !isEmojiModifier(codePoint)) {
    return 0;
  }

  let index = consumeEmojiSuffix(codePoints, start + 1);

  while (
    codePoints[index]?.codePoint === ZERO_WIDTH_JOINER &&
    isExtendedPictographic(codePoints[index + 1]?.codePoint ?? -1)
  ) {
    index = consumeEmojiSuffix(codePoints, index + 2);
  }

  return index - start;
}

function canMerge(kind: TextTokenKind): boolean {
  return kind !== 'burmese_syllable' && kind !== 'emoji';
}

function appendToken(tokens: TextToken[], token: TextToken): void {
  const previous = tokens.at(-1);

  if (
    previous !== undefined &&
    canMerge(token.kind) &&
    previous.kind === token.kind &&
    previous.script === token.script &&
    previous.end === token.start
  ) {
    tokens[tokens.length - 1] = {
      ...previous,
      text: previous.text + token.text,
      end: token.end,
    };
    return;
  }

  tokens.push(token);
}

function createToken(
  codePoints: readonly ScannedCodePoint[],
  start: number,
  end: number,
  kind: TextTokenKind,
  script: TextTokenScript,
): TextToken {
  return {
    kind,
    text: codePoints
      .slice(start, end)
      .map(({ value }) => value)
      .join(''),
    script,
    start,
    end,
  };
}

/** Losslessly tokenizes mixed text without performing dictionary word breaks. */
export function tokenizeText(text: string): TextTokenizationResult {
  const codePoints = scanCodePoints(text);
  const segmentByStart = new Map(
    segmentBurmeseSyllables(text)
      .filter(
        ({ kind }) =>
          kind === 'burmese_syllable' || kind === 'unsupported_myanmar',
      )
      .map((segment) => [segment.start, segment] as const),
  );
  const tokens: TextToken[] = [];

  for (let index = 0; index < codePoints.length;) {
    const segment = segmentByStart.get(index);

    if (segment?.kind === 'burmese_syllable') {
      const characterClass = classifyCodePoint(codePoints[index]!.codePoint);
      appendToken(
        tokens,
        createToken(
          codePoints,
          index,
          segment.end,
          characterClass === 'myanmar_digit' ? 'number' : 'burmese_syllable',
          'myanmar',
        ),
      );
      index = segment.end;
      continue;
    }

    if (segment?.kind === 'unsupported_myanmar') {
      appendToken(
        tokens,
        createToken(
          codePoints,
          index,
          segment.end,
          'unsupported_myanmar',
          'myanmar',
        ),
      );
      index = segment.end;
      continue;
    }

    const emojiLength = emojiLengthAt(codePoints, index);
    if (emojiLength > 0) {
      appendToken(
        tokens,
        createToken(codePoints, index, index + emojiLength, 'emoji', 'common'),
      );
      index += emojiLength;
      continue;
    }

    const characterClass = classifyCodePoint(codePoints[index]!.codePoint);
    let kind: TextTokenKind = 'other';
    let script: TextTokenScript = 'unknown';

    if (characterClass === 'ascii_latin_letter') {
      kind = 'latin_word';
      script = 'latin';
    } else if (characterClass === 'ascii_digit') {
      kind = 'number';
      script = 'common';
    } else if (characterClass === 'ascii_punctuation') {
      kind = 'punctuation';
      script = 'common';
    } else if (characterClass === 'myanmar_punctuation') {
      kind = 'punctuation';
      script = 'myanmar';
    } else if (characterClass === 'whitespace') {
      kind = 'whitespace';
      script = 'common';
    } else if (characterClass.startsWith('myanmar_')) {
      kind = 'unsupported_myanmar';
      script = 'myanmar';
    }

    appendToken(
      tokens,
      createToken(codePoints, index, index + 1, kind, script),
    );
    index += 1;
  }

  const scripts: DetectedTextScript[] = [];
  for (const { script } of tokens) {
    if (
      (script === 'myanmar' || script === 'latin') &&
      !scripts.includes(script)
    ) {
      scripts.push(script);
    }
  }

  return {
    input: text,
    profile: TEXT_TOKENIZATION_PROFILE,
    tokens,
    scripts,
    mixedScript: scripts.length > 1,
  };
}
