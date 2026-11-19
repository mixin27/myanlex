import { describe, expect, it } from 'vitest';
import {
  enforcedLimits,
  freeTermsDefaults,
  priceUsage,
  storeCharges,
  type PlanTerms,
} from '../src/common/billing/pricing.js';

const pro: PlanTerms = {
  name: 'Pro',
  slug: 'pro',
  monthlyRequestLimit: 100_000n,
  monthlyCharacterLimit: 10_000_000n,
  currency: 'USD',
  baseFeeMinor: 2_900n,
  overageMode: 'allow',
  requestBlock: 1_000n,
  requestBlockPriceMinor: 150n,
  characterBlock: 100_000n,
  characterBlockPriceMinor: 40n,
  requestCeiling: 200_000n,
  characterCeiling: null,
};
const free: PlanTerms = {
  ...freeTermsDefaults,
  name: 'Free',
  slug: 'free',
  monthlyRequestLimit: 10_000n,
  monthlyCharacterLimit: 1_000_000n,
};

describe('enforced limits', () => {
  it('stops block plans at the allowance', () => {
    expect(enforcedLimits(free)).toEqual({
      requests: 10_000n,
      characters: 1_000_000n,
    });
  });
  it('stops overage plans at the ceiling, or never without one', () => {
    expect(enforcedLimits(pro)).toEqual({
      requests: 200_000n,
      characters: null,
    });
  });
  it('treats an unlimited allowance as unlimited in both modes', () => {
    expect(
      enforcedLimits({
        ...pro,
        monthlyRequestLimit: null,
        requestCeiling: null,
      }),
    ).toEqual({ requests: null, characters: null });
    expect(
      enforcedLimits({ ...free, monthlyRequestLimit: null }).requests,
    ).toBeNull();
  });
});

describe('charges', () => {
  it('charges only the base fee within the allowance', () => {
    const charges = priceUsage(pro, {
      requests: 100_000n,
      characters: 10_000_000n,
    });
    expect(charges.requests).toMatchObject({ units: 0n, blocks: 0n });
    expect(charges.characters.amountMinor).toBe(0n);
    expect(charges.totalMinor).toBe(2_900n);
  });
  it('charges every started block above the allowance', () => {
    const one = priceUsage(pro, { requests: 100_001n, characters: 0n });
    expect(one.requests).toEqual({
      units: 1n,
      blocks: 1n,
      blockSize: 1_000n,
      blockPriceMinor: 150n,
      amountMinor: 150n,
    });
    const exact = priceUsage(pro, { requests: 102_000n, characters: 0n });
    expect(exact.requests.blocks).toBe(2n);
    const next = priceUsage(pro, {
      requests: 102_001n,
      characters: 10_250_000n,
    });
    expect(next.requests.blocks).toBe(3n);
    expect(next.characters).toMatchObject({
      units: 250_000n,
      blocks: 3n,
      amountMinor: 120n,
    });
    expect(next.totalMinor).toBe(2_900n + 450n + 120n);
  });
  it('never bills overage on block plans', () => {
    // Possible when usage was admitted while enforcement was off.
    const charges = priceUsage(
      { ...free, requestBlockPriceMinor: 99n },
      { requests: 50_000n, characters: 0n },
    );
    expect(charges.requests.amountMinor).toBe(0n);
    expect(charges.totalMinor).toBe(0n);
  });
  it('stays exact for large values and zero-priced dimensions', () => {
    const charges = priceUsage(
      {
        ...pro,
        characterBlockPriceMinor: 0n,
        requestBlockPriceMinor: 9_007_199_254_740_993n,
      },
      { requests: 100_000n + 2n * 1_000n, characters: 99_999_999_999n },
    );
    expect(charges.requests.amountMinor).toBe(18_014_398_509_481_986n);
    expect(charges.characters.amountMinor).toBe(0n);
    expect(storeCharges(charges).totalMinor).toBe('18014398509484886');
  });
  it('rejects negative usage', () => {
    expect(() => priceUsage(pro, { requests: -1n, characters: 0n })).toThrow();
  });
});
