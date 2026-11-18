import { ServiceUnavailableException } from '@nestjs/common';
import type { AuditRepository } from '../../modules/platform/audit.js';

function unavailable(): never {
  throw new ServiceUnavailableException(
    'Platform persistence is not configured.',
  );
}
export const disabledAuditRepository: AuditRepository = {
  list: unavailable,
  cleanup: unavailable,
};
