import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DocumentationPage from '../src/app/(portal)/documentation/page';
import { documentationUrl } from '../src/lib/documentation';

describe('documentation entry point', () => {
  it('links to dedicated public guides and preserves same-origin platform testing', () => {
    const html = renderToStaticMarkup(<DocumentationPage />);
    expect(html).toContain(`href="${documentationUrl}/docs/quick-start"`);
    expect(html).toContain('href="/api-reference"');
    expect(html).not.toContain('Authorization: Bearer');
  });
});
