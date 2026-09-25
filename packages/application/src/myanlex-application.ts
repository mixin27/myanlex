import {
  convertMyanmarEncoding,
  detectMyanmarEncoding,
  normalizeUnicode,
  segmentBurmeseSyllables,
  SYLLABIFICATION_PROFILE,
  tokenizeText,
  transliterateMyanmar,
  validateBurmeseOrthography,
} from '@myanlex/core';
import type {
  BurmeseOrthographyValidationResult,
  MyanmarEncodingConversionResult,
  MyanmarEncodingDetectionResult,
  MyanmarTransliterationResult,
  NormalizationResult,
  TextTokenizationResult,
} from '@myanlex/types';

import type {
  BatchItemResult,
  BatchResult,
  BatchSyllabifyRequest,
  BatchTransliterateRequest,
  ConvertTextRequest,
  MyanLexApplication,
  SyllabificationResult,
  TextRequest,
  TransliterateTextRequest,
} from './contracts.js';
import {
  ApplicationInputError,
  assertValidBatchInput,
  assertValidTextInput,
  DEFAULT_MAX_BATCH_ITEMS,
  DEFAULT_MAX_BATCH_UTF8_BYTES,
  DEFAULT_MAX_TEXT_CODE_POINTS,
} from './input-validation.js';
import { validateConversionSource } from './validate-conversion-source.js';

export interface MyanLexApplicationOptions {
  readonly maximumBatchItems?: number;
  readonly maximumBatchUtf8Bytes?: number;
  readonly maximumTextCodePoints?: number;
}

export class DefaultMyanLexApplication implements MyanLexApplication {
  readonly #maximumBatchItems: number;
  readonly #maximumBatchUtf8Bytes: number;
  readonly #maximumTextCodePoints: number;

  constructor(options: MyanLexApplicationOptions = {}) {
    const maximumTextCodePoints =
      options.maximumTextCodePoints ?? DEFAULT_MAX_TEXT_CODE_POINTS;
    const maximumBatchItems =
      options.maximumBatchItems ?? DEFAULT_MAX_BATCH_ITEMS;
    const maximumBatchUtf8Bytes =
      options.maximumBatchUtf8Bytes ?? DEFAULT_MAX_BATCH_UTF8_BYTES;

    this.#assertNonNegativeSafeInteger(
      maximumTextCodePoints,
      'maximumTextCodePoints',
    );
    this.#assertNonNegativeSafeInteger(maximumBatchItems, 'maximumBatchItems');
    this.#assertNonNegativeSafeInteger(
      maximumBatchUtf8Bytes,
      'maximumBatchUtf8Bytes',
    );

    this.#maximumTextCodePoints = maximumTextCodePoints;
    this.#maximumBatchItems = maximumBatchItems;
    this.#maximumBatchUtf8Bytes = maximumBatchUtf8Bytes;
  }

  detectText({ text }: TextRequest): MyanmarEncodingDetectionResult {
    this.#assertText(text);
    return detectMyanmarEncoding(text);
  }

  normalizeText({ text }: TextRequest): NormalizationResult {
    this.#assertText(text);
    return normalizeUnicode(text);
  }

  convertText({
    text,
    from,
    to,
    validateSource = false,
  }: ConvertTextRequest): MyanmarEncodingConversionResult {
    this.#assertText(text);
    if (validateSource && from !== to) validateConversionSource(text, from);
    return convertMyanmarEncoding(text, { from, to });
  }

  syllabifyText({ text }: TextRequest): SyllabificationResult {
    this.#assertText(text);
    return {
      input: text,
      profile: SYLLABIFICATION_PROFILE,
      segments: segmentBurmeseSyllables(text),
    };
  }

  validateOrthography({
    text,
  }: TextRequest): BurmeseOrthographyValidationResult {
    this.#assertText(text);
    return validateBurmeseOrthography(text);
  }

  transliterateText({
    text,
    scheme,
  }: TransliterateTextRequest): MyanmarTransliterationResult {
    this.#assertText(text);
    return transliterateMyanmar(text, { scheme });
  }

  tokenizeText({ text }: TextRequest): TextTokenizationResult {
    this.#assertText(text);
    return tokenizeText(text);
  }

  batchSyllabify({
    items,
  }: BatchSyllabifyRequest): BatchResult<SyllabificationResult> {
    this.#assertBatch(items);
    return {
      results: items.map(({ id, text }) =>
        this.#executeBatchItem(id, () => this.syllabifyText({ text })),
      ),
    };
  }

  batchTransliterate({
    items,
    scheme,
  }: BatchTransliterateRequest): BatchResult<MyanmarTransliterationResult> {
    this.#assertBatch(items);
    return {
      results: items.map(({ id, text }) =>
        this.#executeBatchItem(id, () =>
          this.transliterateText({ text, scheme }),
        ),
      ),
    };
  }

  #assertText(text: string): void {
    assertValidTextInput(text, this.#maximumTextCodePoints);
  }

  #assertBatch(items: BatchSyllabifyRequest['items']): void {
    assertValidBatchInput(
      items,
      this.#maximumBatchItems,
      this.#maximumBatchUtf8Bytes,
    );
  }

  #assertNonNegativeSafeInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }

  #executeBatchItem<Result>(
    id: string,
    operation: () => Result,
  ): BatchItemResult<Result> {
    try {
      return { id, success: true, result: operation() };
    } catch (error) {
      if (!(error instanceof ApplicationInputError)) throw error;

      return {
        id,
        success: false,
        error: { code: error.code, message: error.message },
      };
    }
  }
}

export function createMyanLexApplication(
  options?: MyanLexApplicationOptions,
): MyanLexApplication {
  return new DefaultMyanLexApplication(options);
}
