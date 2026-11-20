/**
 * Plan terms and charge calculation. See docs/decisions/0024-plans-and-pricing.md.
 *
 * Every amount is an integer number of the plan currency's minor units, held
 * as a bigint; nothing here uses floating point.
 */
export type OverageMode = 'block' | 'allow';

export interface PlanTerms {
  readonly name: string;
  readonly slug: string;
  /** Allowance included in the base fee; null is unlimited. */
  readonly monthlyRequestLimit: bigint | null;
  readonly monthlyCharacterLimit: bigint | null;
  readonly currency: string;
  readonly baseFeeMinor: bigint;
  readonly overageMode: OverageMode;
  readonly requestBlock: bigint;
  readonly requestBlockPriceMinor: bigint;
  readonly characterBlock: bigint;
  readonly characterBlockPriceMinor: bigint;
  /** Hard stop for `allow` plans; null is no ceiling. Always null for `block`. */
  readonly requestCeiling: bigint | null;
  readonly characterCeiling: bigint | null;
}

/** Zero-fee, hard-limited terms for plans that only define limits. */
export const freeTermsDefaults = {
  currency: 'MMK',
  baseFeeMinor: 0n,
  overageMode: 'block',
  requestBlock: 1000n,
  requestBlockPriceMinor: 0n,
  characterBlock: 100_000n,
  characterBlockPriceMinor: 0n,
  requestCeiling: null,
  characterCeiling: null,
} as const satisfies Partial<PlanTerms>;

/** The counts at which admission stops: the allowance, or the overage ceiling. */
export function enforcedLimits(plan: PlanTerms): {
  requests: bigint | null;
  characters: bigint | null;
} {
  if (plan.overageMode === 'allow')
    return {
      requests: plan.monthlyRequestLimit === null ? null : plan.requestCeiling,
      characters:
        plan.monthlyCharacterLimit === null ? null : plan.characterCeiling,
    };
  return {
    requests: plan.monthlyRequestLimit,
    characters: plan.monthlyCharacterLimit,
  };
}

export interface OverageLine {
  /** Usage above the allowance. */
  readonly units: bigint;
  /** Started blocks charged: ceil(units / blockSize). */
  readonly blocks: bigint;
  readonly blockSize: bigint;
  readonly blockPriceMinor: bigint;
  readonly amountMinor: bigint;
}

export interface Charges {
  readonly currency: string;
  readonly baseFeeMinor: bigint;
  readonly requests: OverageLine;
  readonly characters: OverageLine;
  readonly totalMinor: bigint;
}

function overage(
  used: bigint,
  allowance: bigint | null,
  blockSize: bigint,
  blockPriceMinor: bigint,
): OverageLine {
  if (blockSize <= 0n) throw new Error('Invalid block size');
  const units = allowance === null || used <= allowance ? 0n : used - allowance;
  const blocks = (units + blockSize - 1n) / blockSize;
  return {
    units,
    blocks,
    blockSize,
    blockPriceMinor,
    amountMinor: blocks * blockPriceMinor,
  };
}

/** Prices one month of usage on the plan in effect at the end of the month. */
export function priceUsage(
  plan: PlanTerms,
  usage: { readonly requests: bigint; readonly characters: bigint },
): Charges {
  if (usage.requests < 0n || usage.characters < 0n)
    throw new Error('Invalid usage');
  // A block plan cannot exceed its allowance by admission, so overage only
  // arises on `allow` plans; usage counted before enforcement was enabled is
  // not billed as overage on a block plan either.
  const billable = plan.overageMode === 'allow';
  const requests = overage(
    billable ? usage.requests : 0n,
    plan.monthlyRequestLimit,
    plan.requestBlock,
    plan.requestBlockPriceMinor,
  );
  const characters = overage(
    billable ? usage.characters : 0n,
    plan.monthlyCharacterLimit,
    plan.characterBlock,
    plan.characterBlockPriceMinor,
  );
  return {
    currency: plan.currency,
    baseFeeMinor: plan.baseFeeMinor,
    requests,
    characters,
    totalMinor:
      plan.baseFeeMinor + requests.amountMinor + characters.amountMinor,
  };
}

type Stored<T> = { [K in keyof T]: T[K] extends bigint ? string : T[K] };
export type StoredOverageLine = Stored<OverageLine>;
export interface StoredCharges {
  readonly currency: string;
  readonly baseFeeMinor: string;
  readonly requests: StoredOverageLine;
  readonly characters: StoredOverageLine;
  readonly totalMinor: string;
}

const storeLine = (line: OverageLine): StoredOverageLine => ({
  units: line.units.toString(),
  blocks: line.blocks.toString(),
  blockSize: line.blockSize.toString(),
  blockPriceMinor: line.blockPriceMinor.toString(),
  amountMinor: line.amountMinor.toString(),
});

/** JSON form (decimal strings) used in statements and API responses. */
export const storeCharges = (charges: Charges): StoredCharges => ({
  currency: charges.currency,
  baseFeeMinor: charges.baseFeeMinor.toString(),
  requests: storeLine(charges.requests),
  characters: storeLine(charges.characters),
  totalMinor: charges.totalMinor.toString(),
});

/** JSON form of plan terms for statement snapshots and API responses. */
export const storeTerms = (plan: PlanTerms) => ({
  name: plan.name,
  slug: plan.slug,
  monthlyRequestLimit: plan.monthlyRequestLimit?.toString() ?? null,
  monthlyCharacterLimit: plan.monthlyCharacterLimit?.toString() ?? null,
  currency: plan.currency,
  baseFeeMinor: plan.baseFeeMinor.toString(),
  overageMode: plan.overageMode,
  requestBlock: plan.requestBlock.toString(),
  requestBlockPriceMinor: plan.requestBlockPriceMinor.toString(),
  characterBlock: plan.characterBlock.toString(),
  characterBlockPriceMinor: plan.characterBlockPriceMinor.toString(),
  requestCeiling: plan.requestCeiling?.toString() ?? null,
  characterCeiling: plan.characterCeiling?.toString() ?? null,
});
export type StoredTerms = ReturnType<typeof storeTerms>;
