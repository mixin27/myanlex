import { codePointLength } from '@myanlex/core';

import type {
  ApplicationInputErrorCode,
  ApplicationInputErrorDetails,
} from './contracts.js';

export const DEFAULT_MAX_TEXT_CODE_POINTS = 100_000;

export class ApplicationInputError extends RangeError {
  override readonly name = 'ApplicationInputError';

  constructor(
    readonly code: ApplicationInputErrorCode,
    message: string,
    readonly details: ApplicationInputErrorDetails = {},
  ) {
    super(message);
  }
}

function isWellFormedUnicode(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= text.length) return false;
      const next = text.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }

  return true;
}

export function assertValidTextInput(
  text: string,
  maximumCodePoints: number,
): void {
  if (!isWellFormedUnicode(text)) {
    throw new ApplicationInputError(
      'invalid_unicode',
      'text must contain only well-formed Unicode scalar values.',
    );
  }

  const actualCodePoints = codePointLength(text);
  if (actualCodePoints > maximumCodePoints) {
    throw new ApplicationInputError(
      'text_too_long',
      `text must contain at most ${maximumCodePoints} Unicode code points.`,
      { actualCodePoints, maximumCodePoints },
    );
  }
}
