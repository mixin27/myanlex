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

export type {
  CharacterClass,
  CodePointOffset,
  KinziToken,
  MyanmarSequenceToken,
  NormalizationResult,
  ScalarToken,
  StackToken,
  TextSpan,
} from '@myanlex/types';
