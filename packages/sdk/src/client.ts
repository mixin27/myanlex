import type {
  BurmeseOrthographyValidationResult,
  MyanmarEncodingConversionResult,
  MyanmarEncodingDetectionResult,
  MyanmarTransliterationResult,
  NormalizationResult,
  TextTokenizationResult,
} from '@myanlex/types';
import type {
  MyanLexOptions,
  RequestOptions,
  TextRequest,
  ConvertRequest,
  TransliterateRequest,
  SyllabificationResult,
  BatchSyllabifyRequest,
  BatchTransliterateRequest,
  BatchResult,
  HealthResult,
} from './contracts.js';
import { HttpTransport } from './transport.js';

export class MyanLex {
  readonly #http: HttpTransport;
  constructor(options: MyanLexOptions) {
    this.#http = new HttpTransport(options);
  }
  health(options?: RequestOptions) {
    return this.#http.request<HealthResult>('health', undefined, options);
  }
  detect(input: TextRequest, options?: RequestOptions) {
    return this.#http.request<MyanmarEncodingDetectionResult>(
      'text/detect',
      input,
      options,
    );
  }
  normalize(input: TextRequest, options?: RequestOptions) {
    return this.#http.request<NormalizationResult>(
      'text/normalize',
      input,
      options,
    );
  }
  convert(input: ConvertRequest, options?: RequestOptions) {
    return this.#http.request<MyanmarEncodingConversionResult>(
      'text/convert',
      input,
      options,
    );
  }
  syllabify(input: TextRequest, options?: RequestOptions) {
    return this.#http.request<SyllabificationResult>(
      'syllabify',
      input,
      options,
    );
  }
  validateOrthography(input: TextRequest, options?: RequestOptions) {
    return this.#http.request<BurmeseOrthographyValidationResult>(
      'orthography/validate',
      input,
      options,
    );
  }
  transliterate(input: TransliterateRequest, options?: RequestOptions) {
    return this.#http.request<MyanmarTransliterationResult>(
      'transliterate',
      input,
      options,
    );
  }
  tokenize(input: TextRequest, options?: RequestOptions) {
    return this.#http.request<TextTokenizationResult>(
      'tokenize',
      input,
      options,
    );
  }
  batchSyllabify(input: BatchSyllabifyRequest, options?: RequestOptions) {
    return this.#http.request<BatchResult<SyllabificationResult>>(
      'batch/syllabify',
      input,
      options,
    );
  }
  batchTransliterate(
    input: BatchTransliterateRequest,
    options?: RequestOptions,
  ) {
    return this.#http.request<BatchResult<MyanmarTransliterationResult>>(
      'batch/transliterate',
      input,
      options,
    );
  }
}
