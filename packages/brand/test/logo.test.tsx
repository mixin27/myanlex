import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Logo, LogoMark, Wordmark } from '../src/logo';

describe('logo components', () => {
  it('uses the bolder cut at 32 px and below', () => {
    expect(renderToStaticMarkup(<LogoMark size={16} />)).toContain(
      'data-cut="small"',
    );
    expect(renderToStaticMarkup(<LogoMark size={32} />)).toContain(
      'data-cut="small"',
    );
    expect(renderToStaticMarkup(<LogoMark size={48} />)).toContain(
      'data-cut="regular"',
    );
  });

  it('names the image, or hides it when the title is empty', () => {
    const named = renderToStaticMarkup(<Logo />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="myanlex"');
    const hidden = renderToStaticMarkup(<LogoMark title="" />);
    expect(hidden).toContain('aria-hidden="true"');
    expect(hidden).not.toContain('role=');
  });

  it('keeps the gold unit and a dark-mode emerald', () => {
    const html = renderToStaticMarkup(<LogoMark size={64} />);
    expect(html.match(/#EF9F27/g)).toHaveLength(1);
    expect(html).toContain('.dark .mlx-emerald{fill:#34B98A}');
  });

  it('scales the lockup and wordmark by height', () => {
    expect(renderToStaticMarkup(<Logo height={20} />)).toMatch(
      /height="20" width="\d+(\.\d+)?"/,
    );
    expect(renderToStaticMarkup(<Wordmark height={18} />)).toContain(
      'fill="currentColor"',
    );
  });
});
