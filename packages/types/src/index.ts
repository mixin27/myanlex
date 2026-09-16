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
