import type {
  BurmeseSyllableSegment,
  MyanmarConversionEncoding,
  MyanmarTransliterationScheme,
} from '@myanlex/types';

export interface TextRequest {
  readonly text: string;
}
export interface ConvertRequest extends TextRequest {
  readonly validateSource?: boolean;
  readonly from: MyanmarConversionEncoding;
  readonly to: MyanmarConversionEncoding;
}
export interface TransliterateRequest extends TextRequest {
  readonly scheme: MyanmarTransliterationScheme;
}
export interface BatchItem extends TextRequest {
  readonly id: string;
}
export interface BatchSyllabifyRequest {
  readonly items: readonly BatchItem[];
}
export interface BatchTransliterateRequest extends BatchSyllabifyRequest {
  readonly scheme: MyanmarTransliterationScheme;
}
export interface SyllabificationResult {
  readonly input: string;
  readonly profile: 'burmese-orthographic-v1';
  readonly segments: readonly BurmeseSyllableSegment[];
}
export type BatchItemResult<T> =
  | { readonly id: string; readonly success: true; readonly result: T }
  | {
      readonly id: string;
      readonly success: false;
      readonly error: { readonly code: string; readonly message: string };
    };
export interface BatchResult<T> {
  readonly results: readonly BatchItemResult<T>[];
}
export interface HealthResult {
  readonly status: 'ok';
  readonly version: string;
}

export interface RequestOptions {
  readonly signal?: AbortSignal;
}
export type FetchTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export interface MyanLexOptions {
  readonly apiKey: string;
  /** Versioned API root, e.g. http://localhost:3001/v1. */
  readonly baseUrl?: string;
  /** Deadline includes reading the response body. Default: 30 seconds. */
  readonly timeoutMs?: number;
  readonly fetch?: FetchTransport;
}

export interface ApiProblem {
  readonly type?: string;
  readonly title?: string;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly instance?: string;
  readonly requestId?: string;
}
