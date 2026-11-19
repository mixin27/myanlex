import { ServiceUnavailableException } from '@nestjs/common';
import type { UsageLedgerRepository } from '../../modules/platform/usage-ledger.js';

function unavailable(): never {
  throw new ServiceUnavailableException(
    'Platform persistence is not configured.',
  );
}
export const disabledUsageLedgerRepository: UsageLedgerRepository = {
  currentMonth: unavailable,
  statement: unavailable,
  events: unavailable,
  closeFinishedMonths: unavailable,
  cleanup: unavailable,
  billing: unavailable,
};
