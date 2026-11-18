import type { AuditActor } from '../src/modules/platform/audit.js';

/** The audit actor for a test user row (its id must exist for the FK). */
export function asActor(user: { id: string; email: string }): AuditActor {
  return { userId: user.id, email: user.email };
}
