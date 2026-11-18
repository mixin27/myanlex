import { describe, expect, it } from 'vitest';
import { auditActionLabels, describeAuditEvent } from '../src/lib/audit-format';
import type { AuditAction, AuditEvent } from '../src/lib/platform-types';

const event = (
  action: AuditAction,
  metadata: Record<string, unknown>,
): AuditEvent => ({
  id: 'e1',
  action,
  actor: { userId: 'u1', email: 'olivia@example.com' },
  target: { type: 'member', id: 'u2' },
  metadata,
  requestId: null,
  createdAt: '2026-11-19T10:00:00.000Z',
});

describe('audit event sentences', () => {
  it('names the actor, target and change', () => {
    expect(
      describeAuditEvent(
        event('member.role_changed', {
          email: 'dana@example.com',
          from: { id: 'r1', name: 'Developer' },
          to: { id: 'r2', name: 'Owner' },
        }),
      ),
    ).toBe(
      "olivia@example.com changed dana@example.com's role from Developer to Owner.",
    );
    expect(
      describeAuditEvent(
        event('role.updated', {
          name: 'Developer',
          permissionsAdded: ['usage.read'],
          permissionsRemoved: ['project.read'],
        }),
      ),
    ).toBe(
      'olivia@example.com updated the role Developer: added usage.read; removed project.read.',
    );
    expect(
      describeAuditEvent(
        event('ownership.transferred', {
          email: 'dana@example.com',
          previousOwnerRole: { id: 'r1', name: 'Developer' },
        }),
      ),
    ).toBe(
      'olivia@example.com transferred ownership to dana@example.com and became Developer.',
    );
  });

  it('tolerates missing or malformed metadata', () => {
    for (const action of Object.keys(auditActionLabels) as AuditAction[]) {
      const sentence = describeAuditEvent(
        event(action, { name: 7, email: null, from: 'x', changes: 'y' }),
      );
      expect(sentence.startsWith('olivia@example.com ')).toBe(true);
      expect(sentence).not.toContain('undefined');
      expect(sentence).not.toContain('[object Object]');
    }
  });
});
