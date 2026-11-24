import { describe, expect, it, vi } from 'vitest';
import {
  billingEmailConfirmation,
  deliverDunning,
  invoiceReminder,
  invoiceIssued,
  money,
  paymentReceived,
  sendToAll,
  usageAlert,
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

describe('billing details in email', () => {
  const billed = {
    ...invoice,
    billTo: {
      name: 'Lotus Media Co., Ltd.',
      address: 'No. 1, Pyay Road\r\n\nYangon',
      taxId: '123456789',
      note: 'PO 42',
    },
  };

  it('prints the bill-to block and reference, skipping blank lines', () => {
    const text = invoiceIssued(billed, context).text;
    expect(text).toContain(
      [
        'Billed to:',
        '  Lotus Media Co., Ltd.',
        '  No. 1, Pyay Road',
        '  Yangon',
        '  Tax ID: 123456789',
        '  Reference: PO 42',
        '',
        '  Pro plan',
      ].join('\n'),
    );
    expect(invoiceReminder(billed, context).text).toContain('Reference: PO 42');
  });

  it('leaves the block out when the invoice has no snapshot or fields', () => {
    expect(invoiceIssued(invoice, context).text).not.toContain('Billed to');
    const minimal = invoiceIssued(
      {
        ...invoice,
        billTo: { name: 'Lotus Media', address: null, taxId: null, note: null },
      },
      context,
    ).text;
    expect(minimal).toContain('Billed to:\n  Lotus Media\n\n');
    expect(minimal).not.toContain('Tax ID');
    expect(invoiceReminder(invoice, context).text).not.toContain('Reference');
  });

  it('asks the address holder to confirm with a portal link', () => {
    const mail = billingEmailConfirmation(
      'Lotus Media',
      'tok_en-123',
      'https://console.myanlex.test',
    );
    expect(mail.subject).toBe(
      'Confirm billing email for Lotus Media on MyanLex',
    );
    expect(mail.text).toContain(
      'https://console.myanlex.test/billing-email/confirm?token=tok_en-123',
    );
    expect(mail.text).toContain('ignore this email');
  });
});

describe('usage alert email', () => {
  const plan = {
    name: 'Pro',
    overageMode: 'block' as const,
    currency: 'MMK',
    monthlyRequestLimit: 10_000n,
    monthlyCharacterLimit: 1_000_000n,
    requestBlock: 1_000n,
    requestBlockPriceMinor: 500n,
    characterBlock: 100_000n,
    characterBlockPriceMinor: 300n,
    requestCeiling: null,
    characterCeiling: null,
  };
  const base = {
    organizationId: invoice.organizationId,
    organizationName: 'Lotus Media',
    dimension: 'requests' as const,
    plan,
    resetsAt: new Date('2026-12-01T00:00:00Z'),
  };

  it('warns at 80% with what happens next, by plan mode', () => {
    const mail = usageAlert(
      { ...base, kind: 'allowance_80', used: 8_000n, limit: 10_000n },
      context,
    );
    expect(mail.subject).toBe(
      'Lotus Media has used 80% of its monthly requests',
    );
    expect(mail.text).toContain(
      'has used 8,000 of 10,000 requests included in the Pro plan',
    );
    expect(mail.text).toContain(
      'refused until it resets on 1 December 2026 (UTC)',
    );
    expect(mail.text).toContain(
      'https://console.myanlex.test/billing?organization=3a450187',
    );
    const overage = usageAlert(
      {
        ...base,
        plan: { ...plan, overageMode: 'allow' },
        kind: 'allowance_80',
        used: 8_000n,
        limit: 10_000n,
      },
      context,
    );
    expect(overage.text).toContain(
      'billed as overage: MMK 500 per 1,000 requests',
    );
  });

  it('explains reaching the allowance and the ceiling', () => {
    expect(
      usageAlert(
        { ...base, kind: 'allowance_100', used: 10_000n, limit: 10_000n },
        context,
      ),
    ).toMatchObject({
      subject: 'Lotus Media has reached its monthly request allowance',
      text: expect.stringContaining('API requests are now refused'),
    });
    const billed = usageAlert(
      {
        ...base,
        dimension: 'characters',
        plan: { ...plan, overageMode: 'allow', characterCeiling: 2_000_000n },
        kind: 'allowance_100',
        used: 1_000_000n,
        limit: 1_000_000n,
      },
      {},
    );
    expect(billed.subject).toBe('Lotus Media is now using overage');
    expect(billed.text).toContain('MMK 300 per 100,000 characters');
    expect(billed.text).toContain('ceiling of 2,000,000 characters');
    expect(billed.text).not.toContain('Billing page:');
    expect(
      usageAlert(
        {
          ...base,
          plan: { ...plan, overageMode: 'allow', requestCeiling: 20_000n },
          kind: 'ceiling_90',
          used: 18_000n,
          limit: 20_000n,
        },
        context,
      ),
    ).toMatchObject({
      subject: 'Lotus Media is close to its overage ceiling',
      text: expect.stringContaining(
        'refused at the ceiling of 20,000 requests',
      ),
    });
  });
});
