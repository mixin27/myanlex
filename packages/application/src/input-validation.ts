import { codePointLength } from '@myanlex/core';

import type {
  ApplicationInputErrorCode,
  ApplicationInputErrorDetails,
  TextRequest,
} from './contracts.js';

export const DEFAULT_MAX_TEXT_CODE_POINTS = 100_000;
export const DEFAULT_MAX_BATCH_ITEMS = 1_000;
export const DEFAULT_MAX_BATCH_UTF8_BYTES = 1_000_000;

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

function utf8ByteLength(text: string): number {
  let length = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint <= 0x7f) length += 1;
    else if (codePoint <= 0x7ff) length += 2;
    else if (codePoint <= 0xffff) length += 3;
    else length += 4;
  }

  return length;
}

export function assertValidBatchInput(
  items: readonly TextRequest[],
  maximumItems: number,
  maximumUtf8Bytes: number,
): void {
  if (items.length === 0) {
    throw new ApplicationInputError(
      'batch_empty',
      'items must contain at least one batch item.',
      { actualItems: 0, maximumItems },
    );
  }

  if (items.length > maximumItems) {
    throw new ApplicationInputError(
      'batch_too_many_items',
      `items must contain at most ${maximumItems} batch items.`,
      { actualItems: items.length, maximumItems },
    );
  }

  let actualUtf8Bytes = 0;
  for (const item of items) {
    actualUtf8Bytes += utf8ByteLength(item.text);
    if (actualUtf8Bytes > maximumUtf8Bytes) break;
  }

  if (actualUtf8Bytes > maximumUtf8Bytes) {
    throw new ApplicationInputError(
      'batch_too_large',
      `batch text must contain at most ${maximumUtf8Bytes} UTF-8 bytes.`,
      { actualUtf8Bytes, maximumUtf8Bytes },
    );
  }
}
