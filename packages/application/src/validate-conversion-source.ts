import { detectMyanmarEncoding } from '@myanlex/core';
import type { MyanmarConversionEncoding } from '@myanlex/types';
import { ApplicationInputError } from './input-validation.js';

export function validateConversionSource(
  text: string,
  from: MyanmarConversionEncoding,
): void {
  const detection = detectMyanmarEncoding(text);
  if (detection.encoding === 'mixed') {
    throw new ApplicationInputError(
      'encoding_mixed',
      'Mixed Unicode and Zawgyi evidence detected. Review the original text using encoding detection before conversion.',
    );
  }
  if (
    (detection.encoding === 'unicode' || detection.encoding === 'zawgyi') &&
    detection.encoding !== from
  ) {
    throw new ApplicationInputError(
      'encoding_mismatch',
      'Detected encoding evidence conflicts with the declared source. Review the original text using encoding detection before conversion.',
    );
  }
  if (detection.segments.some((segment) => segment.encoding === 'unknown')) {
    throw new ApplicationInputError(
      'encoding_uncertain',
      'Some Myanmar text has uncertain encoding. Review the original text using encoding detection before conversion.',
    );
  }
}
