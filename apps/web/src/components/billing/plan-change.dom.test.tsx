// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RequestPlanButton } from './plan-change';
import type { ChangePreview } from '@/lib/platform-types';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
afterEach(() => {
  container?.remove();
  document.body.innerHTML = '';
});

async function openDialog(change: ChangePreview) {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <RequestPlanButton
        organizationId="org"
        plan={{ slug: 'scale', name: 'Scale' }}
        nextMonthStart="2026-12-01T00:00:00.000Z"
        change={change}
      />,
    ),
  );
  await act(async () => container.querySelector('button')!.click());
  return document.body.textContent!.replace(/ /g, ' ');
}

it('offers "when approved" with the proration preview only for upgrades', async () => {
  const upgrade = await openDialog({
    kind: 'upgrade',
    nowAllowed: true,
    prorationMinor: '35000',
    currency: 'MMK',
  });
  expect(upgrade).toContain('From 1 December 2026');
  expect(upgrade).toContain('When approved');
  expect(upgrade).toContain('about MMK 35,000 for the rest of this month');
  expect(upgrade).toContain('Base fees are billed in advance');
});

it('only offers the 1st of next month for downgrades and currency changes', async () => {
  const downgrade = await openDialog({
    kind: 'downgrade',
    nowAllowed: false,
    prorationMinor: null,
    currency: 'MMK',
  });
  expect(downgrade).toContain('From 1 December 2026');
  expect(downgrade).not.toContain('When approved');
  expect(downgrade).toContain('Downgrades and moves to Free start on the 1st');
  const currency = await openDialog({
    kind: 'currency',
    nowAllowed: false,
    prorationMinor: null,
    currency: 'USD',
  });
  expect(currency).toContain(
    'A change of currency starts on the 1st of a month.',
  );
});
