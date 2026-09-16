export const MYANMAR_NGA = 0x1004;
export const MYANMAR_DOT_BELOW = 0x1037;
export const MYANMAR_VISARGA = 0x1038;
export const MYANMAR_VIRAMA = 0x1039;
export const MYANMAR_ASAT = 0x103a;
export const MYANMAR_GREAT_SA = 0x103f;

export function isBurmeseConsonant(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0x1000 && codePoint <= 0x1021;
}

export function isBurmeseIndependentBase(
  codePoint: number | undefined,
): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1023 && codePoint <= 0x1027) ||
      codePoint === 0x1029 ||
      codePoint === 0x102a ||
      codePoint === 0x104e)
  );
}

export function isBurmeseBase(codePoint: number | undefined): boolean {
  return isBurmeseConsonant(codePoint) || isBurmeseIndependentBase(codePoint);
}

export function isBurmeseStandalone(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1040 && codePoint <= 0x1049) ||
      codePoint === 0x104c ||
      codePoint === 0x104d ||
      codePoint === 0x104f)
  );
}

export function isBurmeseContinuation(codePoint: number | undefined): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x102b && codePoint <= 0x1038) ||
      (codePoint >= 0x103a && codePoint <= 0x103e))
  );
}

/** The modern Burmese subscript-consonant set in Unicode 17 Table 16-4. */
export function isSupportedSubjoinedConsonant(
  codePoint: number | undefined,
): boolean {
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x1000 && codePoint <= 0x1008) ||
      (codePoint >= 0x100a && codePoint <= 0x1019) ||
      codePoint === 0x101b ||
      codePoint === 0x101c ||
      codePoint === 0x101e ||
      codePoint === 0x1020 ||
      codePoint === 0x1021)
  );
}
