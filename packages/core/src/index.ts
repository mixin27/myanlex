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

export type { CharacterClass, CodePointOffset, TextSpan } from '@myanlex/types';
