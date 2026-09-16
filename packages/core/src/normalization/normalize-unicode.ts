import type { NormalizationResult } from '@myanlex/types';

export const SAFE_NORMALIZATION_PROFILE = 'unicode-nfc' as const;

/**
 * Applies canonical Unicode NFC without compatibility folding or linguistic
 * correction.
 */
export function normalizeUnicode(text: string): NormalizationResult {
  const output = text.normalize('NFC');

  return {
    input: text,
    output,
    changed: output !== text,
    profile: SAFE_NORMALIZATION_PROFILE,
  };
}

/** Returns whether text is already in the safe Unicode NFC profile. */
export function isNormalizedUnicode(text: string): boolean {
  return text.normalize('NFC') === text;
}
