import { describe, expect, it, vi } from 'vitest';
import {
  deliverDunning,
  invoiceIssued,
  money,
  paymentReceived,
  sendToAll,
  workspaceSuspended,
} from '../src/infrastructure/database/billing-mail.js';

const invoice = {
  number: 'MLX-2026-000007',
  organizationId: '3a450187-fa8b-464f-9564-cb5cae9fcd94',
  organization: { name: 'Lotus Media' },
  currency: 'MMK',
  totalMinor: 55_000n,
  dueAt: new Date('2026-11-08T02:00:00Z'),
  lines: [
    { description: 'Pro plan, November 2026', amountMinor: 50_000n },
    { description: '60 requests over the allowance', amountMinor: 5_000n },
  ],
};
const context = {
  portalUrl: 'https://console.myanlex.test',
  paymentInstructions: 'KBZ Bank 123-456, MyanLex Co.',
};

describe('invoice email', () => {
  it('formats money exactly in each currency’s digits', () => {
    expect(money(55_000n, 'MMK')).toBe('MMK 55,000');
    expect(money(4_900n, 'USD')).toBe('$49.00');
    expect(money(900719925474099312n, 'USD')).toBe('$9,007,199,254,740,993.12');
  });

  it('lists lines, the due date, how to pay and a portal link', () => {
    const mail = invoiceIssued(invoice, context);
    expect(mail.subject).toBe(
      'Invoice MLX-2026-000007 for Lotus Media: MMK 55,000 due 2026-11-08',
    );
    for (const text of [
      'Pro plan, November 2026: MMK 50,000',
      'Total: MMK 55,000',
      'How to pay:',
      'KBZ Bank 123-456',
      'https://console.myanlex.test/billing/invoices/MLX-2026-000007?organization=3a450187',
    ])
      expect(mail.text).toContain(text);
    expect(invoiceIssued(invoice, {}).text).toContain('Reply to this email');
  });

  it('explains suspension and restoration', () => {
    expect(workspaceSuspended(invoice, 'pro', context).text).toContain(
      'has moved from the pro plan to Free',
    );
    expect(paymentReceived(invoice, 'pro', context).text).toContain(
      'The pro plan has been restored.',
    );
  });

  it('sends to every billing contact and reports failures without throwing', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    expect(
      await sendToAll(
        send,
        ['a@x.test', 'b@x.test'],
        invoiceIssued(invoice, {}),
      ),
    ).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      await sendToAll(
        vi.fn().mockRejectedValue(new Error('smtp')),
        ['a@x.test'],
        invoiceIssued(invoice, {}),
      ),
    ).toBe('failed');
    expect(
      await sendToAll(null, ['a@x.test'], invoiceIssued(invoice, {})),
    ).toBe('skipped');
    expect(await sendToAll(send, [], invoiceIssued(invoice, {}))).toBe(
      'skipped',
    );
  });

  it('picks the email for each dunning action', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const results = await deliverDunning(
      [
        { invoice, kind: 'reminder', reminder: 1 },
        { invoice, kind: 'reminder', reminder: 2 },
        { invoice, kind: 'suspended', suspendedPlan: 'pro' },
      ],
      async () => ['owner@x.test'],
      send,
      context,
    );
    expect(results.map((result) => result.what)).toEqual([
      'issued',
      'reminder 1',
      'moved to Free (was pro)',
    ]);
    expect(
      send.mock.calls.map(
        ([message]) => (message as { subject: string }).subject,
      ),
    ).toEqual([
      'Invoice MLX-2026-000007 for Lotus Media: MMK 55,000 due 2026-11-08',
      'Reminder: invoice MLX-2026-000007 is due 2026-11-08',
      'Lotus Media moved to the Free plan: invoice MLX-2026-000007 is overdue',
    ]);
  });
});
