import type { Charges, OverageLine } from '@/lib/platform-types';
import { formatMoney } from '@/lib/money';
import { formatUsageCount } from '@/lib/usage-range';

function overageText(line: OverageLine, unit: string, currency: string) {
  return `${formatUsageCount(line.units)} ${unit} over the allowance · ${formatUsageCount(line.blocks)} × ${formatMoney(line.blockPriceMinor, currency)} per ${formatUsageCount(line.blockSize)}`;
}

/** Line items and total of a priced month. */
export function ChargesTable({ charges }: { charges: Charges }) {
  const money = (minor: string) => formatMoney(minor, charges.currency);
  const rows: [string, string | null, string][] = [
    ['Base fee', null, charges.baseFeeMinor],
  ];
  if (charges.requests.units !== '0')
    rows.push([
      'Request overage',
      overageText(charges.requests, 'requests', charges.currency),
      charges.requests.amountMinor,
    ]);
  if (charges.characters.units !== '0')
    rows.push([
      'Character overage',
      overageText(charges.characters, 'characters', charges.currency),
      charges.characters.amountMinor,
    ]);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">
        {charges.estimated ? 'Estimated charges' : 'Charges'} in{' '}
        {charges.currency}
      </caption>
      <tbody>
        {rows.map(([label, detail, amount]) => (
          <tr key={label} className="border-b">
            <th scope="row" className="py-2 text-left font-normal">
              {label}
              {detail && (
                <span className="block text-xs text-muted-foreground">
                  {detail}
                </span>
              )}
            </th>
            <td className="py-2 text-right tabular-nums">{money(amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className="pt-3 text-left font-semibold">
            {charges.estimated ? 'Estimated total' : 'Total'}
          </th>
          <td className="pt-3 text-right text-lg font-semibold tabular-nums">
            {money(charges.totalMinor)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
