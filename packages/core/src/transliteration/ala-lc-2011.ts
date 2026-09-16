import {
  MYANMAR_ASAT,
  MYANMAR_DOT_BELOW,
  MYANMAR_GREAT_SA,
  MYANMAR_NGA,
  MYANMAR_VIRAMA,
  MYANMAR_VISARGA,
} from '../burmese/code-points.js';
import { scanCodePoints } from '../unicode/code-points.js';

const CONSONANT_ROOTS = new Map<number, string>([
  [0x1000, 'k'],
  [0x1001, 'kh'],
  [0x1002, 'g'],
  [0x1003, 'gh'],
  [0x1004, 'ṅ'],
  [0x1005, 'c'],
  [0x1006, 'ch'],
  [0x1007, 'j'],
  [0x1008, 'jh'],
  [0x1009, 'ñ'],
  [0x100a, 'ññ'],
  [0x100b, 'ṭ'],
  [0x100c, 'ṭh'],
  [0x100d, 'ḍ'],
  [0x100e, 'ḍh'],
  [0x100f, 'ṇ'],
  [0x1010, 't'],
  [0x1011, 'th'],
  [0x1012, 'd'],
  [0x1013, 'dh'],
  [0x1014, 'n'],
  [0x1015, 'p'],
  [0x1016, 'ph'],
  [0x1017, 'b'],
  [0x1018, 'bh'],
  [0x1019, 'm'],
  [0x101a, 'y'],
  [0x101b, 'r'],
  [0x101c, 'l'],
  [0x101d, 'v'],
  [0x101e, 's'],
  [0x101f, 'h'],
  [0x1020, 'ḷ'],
  [0x1021, 'ʼ'],
]);

const INDEPENDENT_VOWELS = new Map<number, string>([
  [0x1023, 'i'],
  [0x1024, 'ī'],
  [0x1025, 'u'],
  [0x1026, 'ū'],
  [0x1027, 'e'],
  [0x1029, 'o'],
  [0x102a, 'oʻ'],
]);

const MEDIALS = new Map<number, string>([
  [0x103b, 'y'],
  [0x103c, 'r'],
  [0x103d, 'v'],
  [0x103e, 'h'],
]);

const STANDALONE = new Map<number, string>([
  [0x1040, '0'],
  [0x1041, '1'],
  [0x1042, '2'],
  [0x1043, '3'],
  [0x1044, '4'],
  [0x1045, '5'],
  [0x1046, '6'],
  [0x1047, '7'],
  [0x1048, '8'],
  [0x1049, '9'],
  [0x104a, ','],
  [0x104b, '.'],
  [0x104c, 'n*'],
  [0x104d, 'r*'],
  [0x104e, 'l*'],
  [0x104f, 'e*'],
]);

interface ConsonantUnit {
  readonly root: string;
  readonly medials: string[];
  readonly vowelSigns: string[];
  vowelSuppressed: boolean;
  hasAnusvara: boolean;
  hasAsat: boolean;
  tone?: 'ʹ' | 'ʺ';
}

type OutputUnit = ConsonantUnit | string;

function isConsonantUnit(unit: OutputUnit | undefined): unit is ConsonantUnit {
  return typeof unit === 'object';
}

function vowelSign(codePoint: number): string | undefined {
  switch (codePoint) {
    case 0x102b:
    case 0x102c:
      return 'aa';
    case 0x102d:
      return 'i';
    case 0x102e:
      return 'ii';
    case 0x102f:
      return 'u';
    case 0x1030:
      return 'uu';
    case 0x1031:
      return 'e';
    case 0x1032:
      return 'ai';
    default:
      return undefined;
  }
}

function resolveVowel(signs: readonly string[]): string | undefined {
  if (signs.length === 0) return 'a';

  const signature = [...signs].sort().join('+');
  switch (signature) {
    case 'aa':
      return 'ā';
    case 'i':
      return 'i';
    case 'ii':
      return 'ī';
    case 'u':
      return 'u';
    case 'uu':
      return 'ū';
    case 'ai':
      return 'ai';
    case 'e':
      return 'e';
    case 'aa+e':
      return 'o';
    case 'i+u':
      return 'ui';
    default:
      return undefined;
  }
}

function renderUnit(unit: OutputUnit): string | undefined {
  if (typeof unit === 'string') return unit;

  const vowel = resolveVowel(unit.vowelSigns);
  if (vowel === undefined) return undefined;

  return (
    unit.root +
    unit.medials.join('') +
    (unit.vowelSuppressed ? '' : vowel) +
    (unit.hasAnusvara ? 'ṃ' : '') +
    (unit.hasAsat ? 'ʻ' : '') +
    (unit.tone ?? '')
  );
}

function isKinziAt(codePoints: readonly number[], index: number): boolean {
  return (
    codePoints[index] === MYANMAR_NGA &&
    codePoints[index + 1] === MYANMAR_ASAT &&
    codePoints[index + 2] === MYANMAR_VIRAMA &&
    CONSONANT_ROOTS.has(codePoints[index + 3] ?? -1)
  );
}

/** Returns `undefined` when a syllable is outside the mechanical ALA-LC map. */
export function transliterateAlaLcSyllable(input: string): string | undefined {
  const codePoints = scanCodePoints(input).map(({ codePoint }) => codePoint);
  const units: OutputUnit[] = [];

  for (let index = 0; index < codePoints.length; index += 1) {
    const codePoint = codePoints[index]!;

    if (isKinziAt(codePoints, index)) {
      units.push('ṅ');
      index += 2;
      continue;
    }

    const root = CONSONANT_ROOTS.get(codePoint);
    if (root !== undefined || codePoint === MYANMAR_GREAT_SA) {
      units.push({
        root: root ?? 'ss',
        medials: [],
        vowelSigns: [],
        vowelSuppressed: false,
        hasAnusvara: false,
        hasAsat: false,
      });
      continue;
    }

    const independentVowel = INDEPENDENT_VOWELS.get(codePoint);
    if (independentVowel !== undefined) {
      units.push(independentVowel);
      continue;
    }

    const standalone = STANDALONE.get(codePoint);
    if (standalone !== undefined) {
      units.push(standalone);
      continue;
    }

    const current = units.at(-1);
    if (!isConsonantUnit(current)) return undefined;

    const medial = MEDIALS.get(codePoint);
    if (medial !== undefined) {
      const hasYaOrRa = current.medials.some(
        (existing) => existing === 'y' || existing === 'r',
      );
      if (
        current.medials.includes(medial) ||
        ((medial === 'y' || medial === 'r') && hasYaOrRa)
      ) {
        return undefined;
      }
      current.medials.push(medial);
      continue;
    }

    const sign = vowelSign(codePoint);
    if (sign !== undefined) {
      if (current.vowelSuppressed || current.vowelSigns.includes(sign)) {
        return undefined;
      }
      current.vowelSigns.push(sign);
      continue;
    }

    if (codePoint === MYANMAR_VIRAMA) {
      if (current.vowelSuppressed || current.vowelSigns.length > 0) {
        return undefined;
      }
      current.vowelSuppressed = true;
      continue;
    }

    if (codePoint === MYANMAR_ASAT) {
      if (current.vowelSuppressed || current.hasAsat) {
        return undefined;
      }
      if (current.vowelSigns.length === 0) current.vowelSuppressed = true;
      current.hasAsat = true;
      continue;
    }

    if (codePoint === 0x1036) {
      if (current.hasAnusvara) return undefined;
      current.hasAnusvara = true;
      continue;
    }

    if (codePoint === MYANMAR_DOT_BELOW) {
      if (current.tone !== undefined) return undefined;
      current.tone = 'ʹ';
      continue;
    }

    if (codePoint === MYANMAR_VISARGA) {
      if (current.tone !== undefined) return undefined;
      current.tone = 'ʺ';
      continue;
    }

    return undefined;
  }

  const rendered = units.map(renderUnit);
  return rendered.every((unit): unit is string => unit !== undefined)
    ? rendered.join('')
    : undefined;
}
