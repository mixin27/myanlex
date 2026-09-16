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
