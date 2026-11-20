import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Logo } from '@myanlex/brand/logo';
import { appName, consoleUrl, repositoryUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: <Logo height={22} title={appName} /> },
    githubUrl: repositoryUrl,
    links: [
      { text: 'Developer console', url: consoleUrl, external: true },
      { text: 'Playground', url: `${consoleUrl}/playground`, external: true },
    ],
  };
}
