import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));
import manifest from '../src/app/manifest';
import { AuthForm } from '../src/components/auth/auth-form';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

describe('portal branding', () => {
  it('lists installable icons that exist in public/', () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    expect(icons.at(-1)?.purpose).toBe('maskable');
    for (const icon of icons)
      expect(existsSync(`${publicDir}${icon.src}`), icon.src).toBe(true);
  });

  it('shows the logo above the sign-in form, linked home', () => {
    const html = renderToStaticMarkup(<AuthForm mode="login" />);
    expect(html).toContain('aria-label="MyanLex home"');
    expect(html).toContain('#EF9F27');
    expect(html.indexOf('MyanLex home')).toBeLessThan(
      html.indexOf('Sign in to MyanLex'),
    );
  });
});
