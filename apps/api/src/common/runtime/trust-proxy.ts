import { isIP } from 'node:net';

/**
 * MYANLEX_TRUST_PROXY: which forwarding proxies may set the client address
 * (X-Forwarded-For) for rate limiting, auth limits and logs. `false`
 * (default) trusts none; otherwise a comma-separated list of addresses or
 * CIDR ranges, such as the Docker network Traefik runs on plus Cloudflare's
 * published ranges (docs/dokploy-runbook.md). Trusting every proxy (`true`)
 * and hop counts are refused: Fastify ignores hop counts, and both would let
 * a client choose its own address.
 */
export type TrustProxy = false | string;

function validRange(entry: string) {
  const [address, prefix, extra] = entry.split('/');
  if (extra !== undefined || !address) return false;
  const family = isIP(address);
  if (!family) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

export function parseTrustProxy(value: string | undefined): TrustProxy {
  const setting = value?.trim() ?? '';
  if (setting === '' || setting === 'false') return false;
  const entries = setting.split(',').map((entry) => entry.trim());
  if (!entries.every(validRange))
    throw new Error(
      'MYANLEX_TRUST_PROXY must be false or a comma-separated list of proxy addresses or CIDR ranges.',
    );
  return entries.join(',');
}
