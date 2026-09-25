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
  readonly validateSource?: boolean;
  readonly from: MyanmarConversionEncoding;
  readonly to: MyanmarConversionEncoding;
}

export interface TransliterateTextRequest extends TextRequest {
  readonly scheme: MyanmarTransliterationScheme;
}

export interface BatchItem extends TextRequest {
  readonly id: string;
}

export interface BatchSyllabifyRequest {
  readonly items: readonly BatchItem[];
}

export interface BatchTransliterateRequest {
  readonly items: readonly BatchItem[];
  readonly scheme: MyanmarTransliterationScheme;
}

export interface SyllabificationResult {
  readonly input: string;
  readonly profile: 'burmese-orthographic-v1';
  readonly segments: readonly BurmeseSyllableSegment[];
}

export interface BatchItemError {
  readonly code: ApplicationInputErrorCode;
  readonly message: string;
}

export interface BatchItemSuccess<Result> {
  readonly id: string;
  readonly success: true;
  readonly result: Result;
}

export interface BatchItemFailure {
  readonly id: string;
  readonly success: false;
  readonly error: BatchItemError;
}

export type BatchItemResult<Result> =
  BatchItemSuccess<Result> | BatchItemFailure;

export interface BatchResult<Result> {
  readonly results: readonly BatchItemResult<Result>[];
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
  batchSyllabify(
    request: BatchSyllabifyRequest,
  ): BatchResult<SyllabificationResult>;
  batchTransliterate(
    request: BatchTransliterateRequest,
  ): BatchResult<MyanmarTransliterationResult>;
}

export type ApplicationInputErrorCode =
  | 'encoding_mixed'
  | 'encoding_mismatch'
  | 'encoding_uncertain'
  | 'batch_empty'
  | 'batch_too_large'
  | 'batch_too_many_items'
  | 'invalid_unicode'
  | 'text_too_long';

export interface ApplicationInputErrorDetails {
  readonly actualCodePoints?: number;
  readonly actualItems?: number;
  readonly actualUtf8Bytes?: number;
  readonly maximumCodePoints?: number;
  readonly maximumItems?: number;
  readonly maximumUtf8Bytes?: number;
}
