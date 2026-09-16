import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  convertMyanmarEncoding,
  ENCODING_CONVERSION_PROFILE,
  type MyanmarConversionEncoding,
} from '../src/index.js';

interface ConversionCase {
  readonly id: string;
  readonly input: string;
  readonly from: MyanmarConversionEncoding;
  readonly to: MyanmarConversionEncoding;
  readonly expected: string;
  readonly changed: boolean;
  readonly basis: string;
}

interface ConversionCorpus {
  readonly profile: string;
  readonly cases: readonly ConversionCase[];
}

const corpusUrl = new URL(
  '../../../corpus/encoding/conversion-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as ConversionCorpus;

describe('convertMyanmarEncoding', () => {
  it('uses the conversion profile documented by the corpus', () => {
    expect(ENCODING_CONVERSION_PROFILE).toBe(corpus.profile);
  });

  it.each(corpus.cases)('$id', ({ input, from, to, expected, changed }) => {
    expect(convertMyanmarEncoding(input, { from, to })).toEqual({
      input,
      output: expected,
      from,
      to,
      changed,
      profile: ENCODING_CONVERSION_PROFILE,
    });
  });

  it.each([
    'မင်္ဂလာပါ',
    'အပြည်ပြည်ဆိုင်ရာ လူ့အခွင့်အရေး ကြေညာစာတမ်း',
    'သီဟိုဠ်မှ ဉာဏ်ကြီးရှင်သည် အာယုဝဍ်ဎနဆေးညွှန်းစာကို ဖတ်ခဲ့သည်။',
  ])('round-trips representative Unicode text: %s', (input) => {
    const zawgyi = convertMyanmarEncoding(input, {
      from: 'unicode',
      to: 'zawgyi',
    }).output;
    const unicode = convertMyanmarEncoding(zawgyi, {
      from: 'zawgyi',
      to: 'unicode',
    }).output;

    expect(unicode).toBe(input);
  });

  it('requires callers to choose a direction instead of consulting detection', () => {
    const input = 'မဂၤလာပါ';

    expect(
      convertMyanmarEncoding(input, { from: 'zawgyi', to: 'zawgyi' }),
    ).toMatchObject({ output: input, changed: false });
    expect(
      convertMyanmarEncoding(input, { from: 'zawgyi', to: 'unicode' }),
    ).toMatchObject({ output: 'မင်္ဂလာပါ', changed: true });
  });
});
