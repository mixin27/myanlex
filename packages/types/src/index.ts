/** A zero-based offset measured in Unicode code points. */
export type CodePointOffset = number;

/** A zero-based, half-open text span: `[start, end)`. */
export interface TextSpan {
  readonly start: CodePointOffset;
  readonly end: CodePointOffset;
}
