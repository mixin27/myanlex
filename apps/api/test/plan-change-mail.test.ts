import { describe, expect, it, vi } from 'vitest';
import {
  decisionEmail,
  sendDecision,
} from '../src/infrastructure/database/plan-change-mail.js';
import { smtpSenderFromEnv } from '../src/common/mail/smtp-transport.js';

const change = {
  requesterEmail: 'owner@example.test',
  organization: { name: 'Lotus Media' },
  plan: { name: 'Team' },
};

describe('plan change decision emails', () => {
  it('describes approvals, including a start moved to approval', () => {
    const late = decisionEmail(
      {
        kind: 'applied',
        startsAt: new Date('2026-12-03T10:00:00Z'),
        startedEarly: true,
      },
      change,
    );
    expect(late.to).toBe('owner@example.test');
    expect(late.subject).toBe('Lotus Media is moving to the Team plan');
    expect(late.text).toContain(
      'from 2026-12-03 (UTC), the day it was approved',
    );
    const onTime = decisionEmail(
      {
        kind: 'applied',
        startsAt: new Date('2026-12-01T00:00:00Z'),
        startedEarly: false,
      },
      change,
    );
    expect(onTime.text).not.toContain('the day it was approved');
  });

  it('gives the reason for a rejection', () => {
    const email = decisionEmail(
      { kind: 'rejected', reason: 'Annual agreement needed first' },
      change,
    );
    expect(email.subject).toBe(
      "Your plan change for Lotus Media wasn't approved",
    );
    expect(email.text).toContain('Reason: Annual agreement needed first');
  });

  it('reports sent, failed or skipped without throwing', async () => {
    const message = decisionEmail({ kind: 'rejected', reason: 'No' }, change);
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await sendDecision(send, message)).toBe('sent');
    expect(send).toHaveBeenCalledWith(message);
    expect(
      await sendDecision(vi.fn().mockRejectedValue(new Error('smtp')), message),
    ).toBe('failed');
    expect(await sendDecision(null, message)).toBe('skipped');
  });

  it('builds a sender only when SMTP is configured', () => {
    expect(smtpSenderFromEnv({})).toBeNull();
    expect(
      smtpSenderFromEnv({
        SMTP_HOST: 'mail',
        SMTP_FROM: 'a@b.test',
        SMTP_PORT: 'x',
      }),
    ).toBeNull();
    expect(
      typeof smtpSenderFromEnv({
        SMTP_HOST: 'mail',
        SMTP_FROM: 'a@b.test',
        SMTP_PORT: '1025',
      }),
    ).toBe('function');
  });
});
