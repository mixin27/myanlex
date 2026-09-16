import type {
  BurmeseOrthographyDiagnostic,
  BurmeseOrthographyDiagnosticCode,
  BurmeseOrthographyValidationResult,
  BurmeseSyllableSegment,
} from '@myanlex/types';

import {
  isBurmeseConsonant,
  isSupportedSubjoinedConsonant,
  MYANMAR_ASAT,
  MYANMAR_DOT_BELOW,
  MYANMAR_GREAT_SA,
  MYANMAR_NGA,
  MYANMAR_VIRAMA,
  MYANMAR_VISARGA,
} from '../burmese/code-points.js';
import { classifyCodePoint } from '../classification/classify-code-point.js';
import { segmentBurmeseSyllables } from '../syllabification/segment-burmese-syllables.js';
import {
  scanCodePoints,
  type ScannedCodePoint,
} from '../unicode/code-points.js';

export const BURMESE_ORTHOGRAPHY_PROFILE = 'burmese-orthography-v1' as const;

interface OrderedComponent {
  readonly name: string;
  readonly rank: number;
}

function isKinziAt(
  codePoints: readonly ScannedCodePoint[],
  index: number,
): boolean {
  return (
    codePoints[index]?.codePoint === MYANMAR_NGA &&
    codePoints[index + 1]?.codePoint === MYANMAR_ASAT &&
    codePoints[index + 2]?.codePoint === MYANMAR_VIRAMA &&
    isBurmeseConsonant(codePoints[index + 3]?.codePoint)
  );
}

function codaLengthAt(
  codePoints: readonly ScannedCodePoint[],
  index: number,
): number {
  if (!isBurmeseConsonant(codePoints[index]?.codePoint)) return 0;
  if (codePoints[index + 1]?.codePoint === MYANMAR_ASAT) return 2;

  return codePoints[index + 1]?.codePoint === MYANMAR_DOT_BELOW &&
    codePoints[index + 2]?.codePoint === MYANMAR_ASAT
    ? 3
    : 0;
}

function orderedComponent(codePoint: number): OrderedComponent | undefined {
  switch (codePoint) {
    case 0x103b:
      return { name: 'medial ya', rank: 10 };
    case 0x103c:
      return { name: 'medial ra', rank: 20 };
    case 0x103d:
      return { name: 'medial wa', rank: 30 };
    case 0x103e:
      return { name: 'medial ha', rank: 40 };
    case 0x1031:
      return { name: 'vowel e', rank: 50 };
    case 0x102d:
    case 0x102e:
    case 0x1032:
      return { name: 'upper vowel', rank: 60 };
    case 0x102f:
    case 0x1030:
      return { name: 'lower vowel', rank: 70 };
    case 0x102b:
    case 0x102c:
      return { name: 'vowel aa', rank: 80 };
    case 0x1036:
      return { name: 'anusvara', rank: 90 };
    case MYANMAR_DOT_BELOW:
      return { name: 'dot below', rank: 100 };
    case MYANMAR_VISARGA:
      return { name: 'visarga', rank: 110 };
    default:
      return undefined;
  }
}

function diagnostic(
  code: BurmeseOrthographyDiagnosticCode,
  start: number,
  message: string,
): BurmeseOrthographyDiagnostic {
  return { code, severity: 'error', message, start, end: start + 1 };
}

function validateSyllable(
  segment: BurmeseSyllableSegment,
): readonly BurmeseOrthographyDiagnostic[] {
  const codePoints = scanCodePoints(segment.text);
  const diagnostics: BurmeseOrthographyDiagnostic[] = [];
  let index = isKinziAt(codePoints, 0) ? 4 : 1;
  let lastRank = 0;
  let lastComponent: string | undefined;
  let seen = new Set<string>();
  let seenAsatAfter = new Set<string>();

  const resetComponentOrder = (): void => {
    lastRank = 0;
    lastComponent = undefined;
    seen = new Set<string>();
    seenAsatAfter = new Set<string>();
  };

  while (index < codePoints.length) {
    const current = codePoints[index]!;
    const next = codePoints[index + 1];
    const afterNext = codePoints[index + 2];

    if (isKinziAt(codePoints, index)) {
      index += 4;
      resetComponentOrder();
      continue;
    }

    if (
      current.codePoint === MYANMAR_VIRAMA &&
      isSupportedSubjoinedConsonant(next?.codePoint)
    ) {
      if (lastRank > 0) {
        diagnostics.push(
          diagnostic(
            'component_order',
            segment.start + current.start,
            'A subscript consonant must precede medials, vowels, and final signs.',
          ),
        );
      }
      index += 2;
      continue;
    }

    if (
      isBurmeseConsonant(current.codePoint) &&
      next?.codePoint === MYANMAR_VIRAMA &&
      isSupportedSubjoinedConsonant(afterNext?.codePoint)
    ) {
      index += 3;
      resetComponentOrder();
      continue;
    }

    const codaLength = codaLengthAt(codePoints, index);
    if (codaLength > 0) {
      index += codaLength;
      resetComponentOrder();
      continue;
    }

    if (current.codePoint === MYANMAR_GREAT_SA) {
      index += 1;
      resetComponentOrder();
      continue;
    }

    if (current.codePoint === MYANMAR_ASAT) {
      const attachment = lastComponent ?? 'base';
      const followsAllowedComponent =
        lastComponent === 'medial ya' ||
        lastComponent === 'vowel aa' ||
        lastComponent === 'dot below';

      if (seenAsatAfter.has(attachment)) {
        diagnostics.push(
          diagnostic(
            'duplicate_component',
            segment.start + current.start,
            `Asat occurs more than once after the ${attachment} component.`,
          ),
        );
      } else if (!followsAllowedComponent && lastRank > 0) {
        diagnostics.push(
          diagnostic(
            'component_order',
            segment.start + current.start,
            'Asat is not in a supported position in this syllable.',
          ),
        );
      }
      seenAsatAfter.add(attachment);
      index += 1;
      continue;
    }

    const component = orderedComponent(current.codePoint);
    if (component === undefined) {
      index += 1;
      continue;
    }

    if (seen.has(component.name)) {
      diagnostics.push(
        diagnostic(
          'duplicate_component',
          segment.start + current.start,
          `The ${component.name} component occurs more than once.`,
        ),
      );
    } else if (component.rank < lastRank) {
      diagnostics.push(
        diagnostic(
          'component_order',
          segment.start + current.start,
          `The ${component.name} component is out of order.`,
        ),
      );
    }

    seen.add(component.name);
    lastRank = Math.max(lastRank, component.rank);
    lastComponent = component.name;
    index += 1;
  }

  return diagnostics;
}

function unsupportedDiagnostic(
  segment: BurmeseSyllableSegment,
  allCodePoints: readonly ScannedCodePoint[],
): BurmeseOrthographyDiagnostic {
  const codePoint = allCodePoints[segment.start]!.codePoint;
  const characterClass = classifyCodePoint(codePoint);

  if (codePoint === MYANMAR_VIRAMA) {
    const next = allCodePoints[segment.start + 1]?.codePoint;
    if (isBurmeseConsonant(next)) {
      return diagnostic(
        'unsupported_stack_target',
        segment.start,
        'Virama is followed by a consonant without a supported subjoined form.',
      );
    }

    return diagnostic(
      'dangling_virama',
      segment.start,
      'Virama must be followed by a supported subjoined consonant.',
    );
  }

  if (codePoint === MYANMAR_GREAT_SA) {
    return diagnostic(
      'invalid_syllable_start',
      segment.start,
      'Great Sa cannot begin a Burmese syllable in this profile.',
    );
  }

  if (
    characterClass === 'myanmar_asat' ||
    characterClass === 'myanmar_mark' ||
    characterClass === 'myanmar_medial' ||
    characterClass === 'myanmar_vowel_sign'
  ) {
    return diagnostic(
      'orphan_mark',
      segment.start,
      'A dependent Myanmar mark must follow a supported syllable base.',
    );
  }

  return diagnostic(
    'unsupported_myanmar',
    segment.start,
    'This Myanmar character is outside the Burmese orthography v1 profile.',
  );
}

/** Validates supported structural and ordering rules without changing input. */
export function validateBurmeseOrthography(
  text: string,
): BurmeseOrthographyValidationResult {
  const codePoints = scanCodePoints(text);
  const diagnostics: BurmeseOrthographyDiagnostic[] = [];

  for (const segment of segmentBurmeseSyllables(text)) {
    if (segment.kind === 'burmese_syllable') {
      diagnostics.push(...validateSyllable(segment));
    } else if (segment.kind === 'unsupported_myanmar') {
      diagnostics.push(unsupportedDiagnostic(segment, codePoints));
    }
  }

  return {
    input: text,
    valid: diagnostics.length === 0,
    profile: BURMESE_ORTHOGRAPHY_PROFILE,
    diagnostics,
  };
}
