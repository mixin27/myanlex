export {
  codePointLength,
  scanCodePoints,
  sliceByCodePoints,
  toCodePoints,
  type ScannedCodePoint,
} from './unicode/code-points.js';

export {
  classifyCodePoint,
  MYANLEX_UNICODE_VERSION,
} from './classification/classify-code-point.js';

export { scanMyanmarSequences } from './sequence/scan-myanmar-sequences.js';

export {
  isNormalizedUnicode,
  normalizeUnicode,
  SAFE_NORMALIZATION_PROFILE,
} from './normalization/normalize-unicode.js';

export {
  segmentBurmeseSyllables,
  SYLLABIFICATION_PROFILE,
} from './syllabification/segment-burmese-syllables.js';

export {
  BURMESE_ORTHOGRAPHY_PROFILE,
  validateBurmeseOrthography,
} from './validation/validate-burmese-orthography.js';

export {
  detectMyanmarEncoding,
  ENCODING_DETECTION_PROFILE,
  UNICODE_MAX_PROBABILITY,
  ZAWGYI_MIN_PROBABILITY,
} from './detection/detect-myanmar-encoding.js';

export type {
  BurmeseOrthographyDiagnostic,
  BurmeseOrthographyDiagnosticCode,
  BurmeseOrthographyValidationResult,
  BurmeseSyllableSegment,
  BurmeseSyllableSegmentKind,
  CharacterClass,
  CodePointOffset,
  KinziToken,
  MyanmarEncoding,
  MyanmarEncodingDetectionResult,
  MyanmarEncodingSegment,
  MyanmarEncodingSegmentEncoding,
  MyanmarSequenceToken,
  NormalizationResult,
  ScalarToken,
  StackToken,
  TextSpan,
} from '@myanlex/types';
