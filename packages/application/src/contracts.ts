import type {
  BurmeseOrthographyValidationResult,
  BurmeseSyllableSegment,
  MyanmarConversionEncoding,
  MyanmarEncodingConversionResult,
  MyanmarEncodingDetectionResult,
  MyanmarTransliterationResult,
  MyanmarTransliterationScheme,
  NormalizationResult,
  TextTokenizationResult,
} from '@myanlex/types';

export interface TextRequest {
  readonly text: string;
}

export interface ConvertTextRequest extends TextRequest {
  readonly from: MyanmarConversionEncoding;
  readonly to: MyanmarConversionEncoding;
}

export interface TransliterateTextRequest extends TextRequest {
  readonly scheme: MyanmarTransliterationScheme;
}

export interface SyllabificationResult {
  readonly input: string;
  readonly profile: 'burmese-orthographic-v1';
  readonly segments: readonly BurmeseSyllableSegment[];
}

export interface MyanLexApplication {
  detectText(request: TextRequest): MyanmarEncodingDetectionResult;
  normalizeText(request: TextRequest): NormalizationResult;
  convertText(request: ConvertTextRequest): MyanmarEncodingConversionResult;
  syllabifyText(request: TextRequest): SyllabificationResult;
  validateOrthography(request: TextRequest): BurmeseOrthographyValidationResult;
  transliterateText(
    request: TransliterateTextRequest,
  ): MyanmarTransliterationResult;
  tokenizeText(request: TextRequest): TextTokenizationResult;
}

export type ApplicationInputErrorCode = 'invalid_unicode' | 'text_too_long';

export interface ApplicationInputErrorDetails {
  readonly actualCodePoints?: number;
  readonly maximumCodePoints?: number;
}
