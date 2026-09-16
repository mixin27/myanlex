import type {
  MyanmarTransliterationOptions,
  MyanmarTransliterationResult,
  MyanmarTransliterationSegment,
} from '@myanlex/types';

import { classifyCodePoint } from '../classification/classify-code-point.js';
import { segmentBurmeseSyllables } from '../syllabification/segment-burmese-syllables.js';
import { validateBurmeseOrthography } from '../validation/validate-burmese-orthography.js';
import { transliterateAlaLcSyllable } from './ala-lc-2011.js';

export const MYANMAR_TRANSLITERATION_PROFILE =
  'ala-lc-2011-mapping-v1' as const;

function transliterateSegment(
  input: string,
): Pick<MyanmarTransliterationSegment, 'kind' | 'output'> {
  const structurallyValid =
    input === 'ဿ' || validateBurmeseOrthography(input).valid;
  const output = structurallyValid
    ? transliterateAlaLcSyllable(input)
    : undefined;

  return output === undefined
    ? { kind: 'unsupported', output: input }
    : { kind: 'transliterated', output };
}

/**
 * Applies the explicit ALA-LC 2011 character mapping profile. Non-Myanmar and
 * unsupported input is preserved, and `complete` reports whether every Myanmar
 * segment was transliterated.
 */
export function transliterateMyanmar(
  input: string,
  options: MyanmarTransliterationOptions,
): MyanmarTransliterationResult {
  const segments: MyanmarTransliterationSegment[] = segmentBurmeseSyllables(
    input,
  ).map((segment) => {
    const firstCodePoint = segment.text.codePointAt(0);
    const isMyanmarPunctuation =
      firstCodePoint !== undefined &&
      classifyCodePoint(firstCodePoint) === 'myanmar_punctuation';
    const converted =
      segment.kind === 'burmese_syllable' ||
      segment.text === 'ဿ' ||
      isMyanmarPunctuation
        ? transliterateSegment(segment.text)
        : segment.kind === 'unsupported_myanmar'
          ? { kind: 'unsupported' as const, output: segment.text }
          : { kind: 'preserved' as const, output: segment.text };

    return {
      ...converted,
      input: segment.text,
      start: segment.start,
      end: segment.end,
    };
  });

  return {
    input,
    output: segments.map(({ output }) => output).join(''),
    scheme: options.scheme,
    profile: MYANMAR_TRANSLITERATION_PROFILE,
    complete: segments.every(({ kind }) => kind !== 'unsupported'),
    segments,
  };
}
