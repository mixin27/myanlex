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
  it('describes plan changes by plan slug', () => {
    expect(
      describeAuditEvent(
        event('billing.plan_change_requested', {
          from: 'pro',
          to: 'team',
          timing: 'next_month',
        }),
      ),
    ).toBe(
      'olivia@example.com requested a move from pro to team from next month.',
    );
    expect(
      describeAuditEvent(
        event('billing.plan_changed', { from: 'free', to: 'pro' }),
      ),
    ).toBe('olivia@example.com changed the plan from free to pro.');
    expect(
      describeAuditEvent(event('billing.plan_change_rejected', { to: 'team' })),
    ).toBe('olivia@example.com rejected the move to team.');
    expect(
      describeAuditEvent(
        event('billing.suspended_for_nonpayment', {
          number: 'MLX-2026-000007',
          plan: 'pro',
        }),
      ),
    ).toBe(
      'olivia@example.com moved the workspace from pro to Free because invoice MLX-2026-000007 is overdue.',
    );
    expect(
      describeAuditEvent(
        event('billing.invoice_paid', { number: 'MLX-2026-000007' }),
      ),
    ).toBe('olivia@example.com recorded payment of invoice MLX-2026-000007.');
    expect(
      describeAuditEvent({
        ...event('billing.invoice_issued', { number: 'MLX-2026-000008' }),
        actor: { userId: null, email: 'billing-system@myanlex.invalid' },
      }),
    ).toBe('MyanLex billing issued invoice MLX-2026-000008.');
  });

  it('describes billing details and billing emails', () => {
    expect(
      describeAuditEvent(
        event('billing.profile_updated', {
          fields: ['legalName', 'taxId', 'unknown'],
        }),
      ),
    ).toBe(
      'olivia@example.com updated the billing details: legal name, tax ID.',
    );
    expect(
      describeAuditEvent(
        event('billing.email_added', { email: 'ap@lotus.test' }),
      ),
    ).toBe('olivia@example.com added ap@lotus.test as a billing email.');
    expect(
      describeAuditEvent({
        ...event('billing.email_confirmed', { email: 'ap@lotus.test' }),
        actor: { userId: null, email: 'ap@lotus.test' },
      }),
    ).toBe('ap@lotus.test confirmed ap@lotus.test as a billing email.');
    expect(
      describeAuditEvent(
        event('billing.email_removed', { email: 'ap@lotus.test' }),
      ),
    ).toBe('olivia@example.com removed ap@lotus.test as a billing email.');
  });

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
