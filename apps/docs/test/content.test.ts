import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openapi } from '../src/lib/openapi';
import { developerPreview, previewMessage } from '../src/lib/shared';
import {
  firstResponse,
  languageExamples,
} from '../../../examples/http/contract-cases';

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}
const root = 'content/docs';
const files = filesIn(root).filter((path) => path.endsWith('.mdx'));
const pages = files.map((path) => ({
  path,
  route:
    '/docs/' +
    relative(root, path)
      .replace(/\.mdx$/, '')
      .replace(/(^|\/)index$/, ''),
  text: readFileSync(path, 'utf8'),
}));
const routes = new Set(pages.map((p) => p.route.replace(/\/$/, '')));

describe('public MDX documentation', () => {
  it('has title/description metadata and resolves authored internal links', () => {
    expect(pages.length).toBeGreaterThanOrEqual(18);
    for (const page of pages) {
      expect(page.text, page.path).toMatch(
        /^---\ntitle: [^\n]+\ndescription:\s+\S[\s\S]*?\n---/,
      );
      for (const match of page.text.matchAll(
        /(?:\]\(|href=")([^\s")]+)[")]/g,
      )) {
        const target = match[1].split('#')[0];
        if (target.startsWith('/docs'))
          expect(
            routes.has(target.replace(/\/$/, '')),
            `${page.path} → ${target}`,
          ).toBe(true);
      }
    }
  });
  it('separates operators from API consumers and centralizes preview status', () => {
    const quickStart = pages.find((p) => p.route === '/docs/quick-start')!.text;
    expect(quickStart).not.toContain('docker compose');
    expect(quickStart).not.toContain('pnpm db:');
    expect(typeof developerPreview).toBe('boolean');
    expect(previewMessage).toContain('not yet publicly available');
    for (const sdk of ['typescript', 'dart']) {
      expect(
        pages.find((p) => p.route === `/docs/sdks/${sdk}`)!.text,
      ).toContain('<PreviewOnly>');
    }
  });
  it('keeps displayed JSON examples aligned with executable API cases', () => {
    const jsonBlocks = (route: string) =>
      [
        ...pages
          .find((p) => p.route === route)!
          .text.matchAll(/```json[^\n]*\n([\s\S]*?)```/g),
      ].map((match) => JSON.parse(match[1]));
    expect(jsonBlocks('/docs/quick-start')).toContainEqual(firstResponse);
    for (const [route, paths] of [
      ['/docs/language/encoding', ['/text/detect', '/text/convert']],
      ['/docs/language/normalization', ['/text/normalize']],
      ['/docs/language/syllabification', ['/syllabify']],
      ['/docs/language/orthography', ['/orthography/validate']],
      ['/docs/language/transliteration', ['/transliterate']],
      ['/docs/language/tokenization', ['/tokenize']],
      ['/docs/batch', ['/batch/syllabify']],
    ] as const) {
      for (const path of paths)
        expect(jsonBlocks(route)).toContainEqual(
          languageExamples.find((example) => example.path === path)!.body,
        );
    }
  });
  it('builds its reference directly from every OpenAPI operation', async () => {
    const { bundled } = await openapi.getSchema('myanlex');
    const generated = await openapi.staticSource({ baseDir: 'reference' });
    const operations = Object.values(bundled.paths ?? {}).reduce(
      (count, path) =>
        count +
        ['get', 'post', 'patch', 'put', 'delete', 'head', 'options'].filter(
          (method) => path && method in path,
        ).length,
      0,
    );
    expect(generated.files.filter((file) => file.type === 'page').length).toBe(
      operations,
    );
    expect(bundled.paths?.['/syllabify']).toBeDefined();
    expect(bundled.paths?.['/batch/transliterate']).toBeDefined();
  });
});
