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
  ConvertTextRequest,
  MyanLexApplication,
  SyllabificationResult,
  TextRequest,
  TransliterateTextRequest,
} from './contracts.js';
import {
  assertValidTextInput,
  DEFAULT_MAX_TEXT_CODE_POINTS,
} from './input-validation.js';

export interface MyanLexApplicationOptions {
  readonly maximumTextCodePoints?: number;
}

export class DefaultMyanLexApplication implements MyanLexApplication {
  readonly #maximumTextCodePoints: number;

  constructor(options: MyanLexApplicationOptions = {}) {
    const maximumTextCodePoints =
      options.maximumTextCodePoints ?? DEFAULT_MAX_TEXT_CODE_POINTS;

    if (
      !Number.isSafeInteger(maximumTextCodePoints) ||
      maximumTextCodePoints < 0
    ) {
      throw new RangeError(
        'maximumTextCodePoints must be a non-negative safe integer.',
      );
    }

    this.#maximumTextCodePoints = maximumTextCodePoints;
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
  }: ConvertTextRequest): MyanmarEncodingConversionResult {
    this.#assertText(text);
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

  #assertText(text: string): void {
    assertValidTextInput(text, this.#maximumTextCodePoints);
  }
}

export function createMyanLexApplication(
  options?: MyanLexApplicationOptions,
): MyanLexApplication {
  return new DefaultMyanLexApplication(options);
}
