import { RootProvider } from 'fumadocs-ui/provider/next';
import Link from 'next/link';
import './global.css';
import { developerPreview, previewMessage } from '@/lib/shared';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'MyanLex Docs', template: '%s · MyanLex' },
  description:
    'Myanmar language processing: API guides, SDKs and self-hosting.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          {developerPreview && (
            <aside
              aria-label="Developer preview notice"
              className="border-b border-amber-300 bg-amber-50 px-5 py-3 text-center text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
            >
              {previewMessage}{' '}
              <Link className="font-medium underline" href="/docs/self-hosting">
                Self-hosting guide
              </Link>
              .
            </aside>
          )}
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
