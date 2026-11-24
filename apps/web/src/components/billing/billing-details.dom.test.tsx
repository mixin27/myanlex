// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));
import { BillingDetailsCard } from './billing-details';
import { ConfirmBillingEmailButton } from './confirm-billing-email';
import type { BillingProfile } from '@/lib/platform-types';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
afterEach(() => {
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const email = (
  id: string,
  address: string,
  status: 'confirmed' | 'pending' | 'expired',
) => ({
  id,
  email: address,
  status,
  sentAt: '2026-11-24T00:00:00.000Z',
  confirmedAt: status === 'confirmed' ? '2026-11-24T00:01:00.000Z' : null,
});

const empty: BillingProfile = {
  legalName: null,
  address: null,
  taxId: null,
  invoiceNote: null,
  emails: [],
};

async function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  return container;
}

const buttons = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].map((b) => b.textContent);

it('falls back to the workspace name and explains who gets invoices', async () => {
  const root = await render(
    <BillingDetailsCard
      organizationId="org"
      organizationName="Lotus Media"
      profile={empty}
      canManage
    />,
  );
  expect(root.querySelector('address')?.textContent).toBe('Lotus Media');
  expect(root.textContent).toContain(
    'Until an address is confirmed, invoices go to members who can manage billing.',
  );
  expect(root.querySelector('input[type=email]')).not.toBeNull();
  expect(buttons(root)).toEqual(['Edit details', 'Add']);
});

it('shows details, statuses and actions, and the limit', async () => {
  const root = await render(
    <BillingDetailsCard
      organizationId="org"
      organizationName="Lotus Media"
      profile={{
        legalName: 'Lotus Media Co., Ltd.',
        address: 'No. 1, Pyay Road\nYangon',
        taxId: '123456789',
        invoiceNote: 'PO 42',
        emails: [
          email('1', 'ap@lotus.test', 'confirmed'),
          email('2', 'cfo@lotus.test', 'pending'),
          email('3', 'old@lotus.test', 'expired'),
        ],
      }}
      canManage
    />,
  );
  const text = root.textContent!;
  for (const part of [
    'Lotus Media Co., Ltd.',
    'Tax ID: 123456789',
    'Reference: PO 42',
    'ap@lotus.testConfirmed',
    'cfo@lotus.testWaiting for confirmation',
    'old@lotus.testLink expired',
    'Invoices, reminders and receipts go to the confirmed addresses.',
    'A workspace can have 3 billing emails.',
  ])
    expect(text).toContain(part);
  // Confirmed addresses can be removed but not re-sent.
  expect(buttons(root).filter((b) => b === 'Resend')).toHaveLength(2);
  expect(buttons(root).filter((b) => b === 'Remove')).toHaveLength(3);
  expect(root.querySelector('input[type=email]')).toBeNull();
});

it('is read-only without billing.manage', async () => {
  const root = await render(
    <BillingDetailsCard
      organizationId="org"
      organizationName="Lotus Media"
      profile={{ ...empty, emails: [email('2', 'cfo@lotus.test', 'pending')] }}
      canManage={false}
    />,
  );
  expect(buttons(root)).toEqual([]);
  expect(root.querySelector('input')).toBeNull();
  expect(root.textContent).toContain('cfo@lotus.test');
});

it('adds an address and reports when the email could not be sent', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ email: 'ap@lotus.test', delivery: 'failed' }),
        { status: 201 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const { toast } = await import('sonner');
  const root = await render(
    <BillingDetailsCard
      organizationId="org"
      organizationName="Lotus Media"
      profile={empty}
      canManage
    />,
  );
  const input = root.querySelector<HTMLInputElement>('input[type=email]')!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, 'ap@lotus.test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => root.querySelector('form')!.requestSubmit());
  expect(fetch).toHaveBeenCalledWith(
    '/v1/platform/organizations/org/billing/emails',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'ap@lotus.test' }),
    }),
  );
  expect(toast.warning).toHaveBeenCalledWith(
    expect.stringContaining('could not be sent'),
  );
});

it('confirms only when the button is pressed, and shows errors', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail:
            'This confirmation link has already been used or has expired.',
        }),
        { status: 400 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ workspace: 'Lotus Media', email: 'ap@lotus.test' }),
        { status: 200 },
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const root = await render(
    <ConfirmBillingEmailButton token={'A'.repeat(43)} />,
  );
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => root.querySelector('button')!.click());
  expect(root.querySelector('[role=alert]')?.textContent).toContain(
    'already been used or has expired',
  );
  await act(async () => root.querySelector('button')!.click());
  expect(root.querySelector('[role=status]')?.textContent).toContain(
    'Invoices and receipts for Lotus Media will be sent to ap@lotus.test',
  );
});
