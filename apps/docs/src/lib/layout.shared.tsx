import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, consoleUrl, repositoryUrl } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: { title: appName },
    githubUrl: repositoryUrl,
    links: [{ text: 'Developer console', url: consoleUrl, external: true }],
  };
}
