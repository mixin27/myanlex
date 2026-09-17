/** A zero-based offset measured in Unicode code points. */
export type CodePointOffset = number;

/** A zero-based, half-open text span: `[start, end)`. */
export interface TextSpan {
  readonly start: CodePointOffset;
  readonly end: CodePointOffset;
}

/** A deterministic scalar category pinned to the project's Unicode data version. */
export type CharacterClass =
  | 'myanmar_letter'
  | 'myanmar_vowel_sign'
  | 'myanmar_medial'
  | 'myanmar_tone_mark'
  | 'myanmar_asat'
  | 'myanmar_virama'
  | 'myanmar_mark'
  | 'myanmar_digit'
  | 'myanmar_punctuation'
  | 'myanmar_symbol'
  | 'ascii_latin_letter'
  | 'ascii_digit'
  | 'ascii_punctuation'
  | 'whitespace'
  | 'other';

export interface ScalarToken extends TextSpan {
  readonly kind: 'scalar';
  readonly text: string;
  readonly codePoint: number;
  readonly characterClass: CharacterClass;
}

export interface KinziToken extends TextSpan {
  readonly kind: 'kinzi';
  readonly text: string;
  readonly codePoints: readonly [0x1004, 0x103a, 0x1039];
}

export interface StackToken extends TextSpan {
  readonly kind: 'stack';
  readonly text: string;
  readonly codePoints: readonly [0x1039, number];
}

/** A lossless token emitted by the Myanmar sequence recognizer. */
export type MyanmarSequenceToken = ScalarToken | KinziToken | StackToken;

export interface NormalizationResult {
  readonly input: string;
  readonly output: string;
  readonly changed: boolean;
  readonly profile: 'unicode-nfc';
}

export type BurmeseSyllableSegmentKind =
  'burmese_syllable' | 'separator' | 'non_myanmar' | 'unsupported_myanmar';

/** A lossless segment emitted by the Burmese orthographic syllabifier. */
export interface BurmeseSyllableSegment extends TextSpan {
  readonly kind: BurmeseSyllableSegmentKind;
  readonly text: string;
}

export type BurmeseOrthographyDiagnosticCode =
  | 'component_order'
  | 'dangling_virama'
  | 'duplicate_component'
  | 'invalid_syllable_start'
  | 'orphan_mark'
  | 'unsupported_myanmar'
  | 'unsupported_stack_target';

export interface BurmeseOrthographyDiagnostic extends TextSpan {
  readonly code: BurmeseOrthographyDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
}

export interface BurmeseOrthographyValidationResult {
  readonly input: string;
  readonly valid: boolean;
  readonly profile: 'burmese-orthography-v1';
  readonly diagnostics: readonly BurmeseOrthographyDiagnostic[];
}

export type MyanmarEncoding =
  'unicode' | 'zawgyi' | 'mixed' | 'unknown' | 'non_myanmar';

export type MyanmarEncodingSegmentEncoding = 'unicode' | 'zawgyi' | 'unknown';

export interface MyanmarEncodingSegment extends TextSpan {
  readonly text: string;
  readonly encoding: MyanmarEncodingSegmentEncoding;
  readonly zawgyiProbability: number | null;
}

export interface MyanmarEncodingDetectionResult {
  readonly input: string;
  readonly encoding: MyanmarEncoding;
  readonly confidence: number | null;
  readonly profile: 'zawgyi-unicode-v1';
  readonly segments: readonly MyanmarEncodingSegment[];
}

/** An encoding accepted by the explicit Unicode/Zawgyi converter. */
export type MyanmarConversionEncoding = 'unicode' | 'zawgyi';

export interface MyanmarEncodingConversionOptions {
  readonly from: MyanmarConversionEncoding;
  readonly to: MyanmarConversionEncoding;
}

export interface MyanmarEncodingConversionResult extends MyanmarEncodingConversionOptions {
  readonly input: string;
  readonly output: string;
  readonly changed: boolean;
  readonly profile: 'cldr-zawgyi-v1';
}

export type MyanmarTransliterationScheme = 'ala-lc-2011';

export interface MyanmarTransliterationOptions {
  readonly scheme: MyanmarTransliterationScheme;
}

export type MyanmarTransliterationSegmentKind =
  'transliterated' | 'preserved' | 'unsupported';

export interface MyanmarTransliterationSegment extends TextSpan {
  readonly kind: MyanmarTransliterationSegmentKind;
  readonly input: string;
  readonly output: string;
}

export interface MyanmarTransliterationResult {
  readonly input: string;
  readonly output: string;
  readonly scheme: MyanmarTransliterationScheme;
  readonly profile: 'ala-lc-2011-mapping-v1';
  readonly complete: boolean;
  readonly segments: readonly MyanmarTransliterationSegment[];
}

export type TextTokenKind =
  | 'burmese_syllable'
  | 'latin_word'
  | 'number'
  | 'punctuation'
  | 'whitespace'
  | 'emoji'
  | 'unsupported_myanmar'
  | 'other';

export type TextTokenScript = 'myanmar' | 'latin' | 'common' | 'unknown';

/** A lossless lexical/script token with Unicode code-point offsets. */
export interface TextToken extends TextSpan {
  readonly kind: TextTokenKind;
  readonly text: string;
  readonly script: TextTokenScript;
}

export type DetectedTextScript = 'myanmar' | 'latin';

export interface TextTokenizationResult {
  readonly input: string;
  readonly profile: 'myanmar-script-tokens-v1';
  readonly tokens: readonly TextToken[];
  readonly scripts: readonly DetectedTextScript[];
  readonly mixedScript: boolean;
}
