import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { copies } from '../scripts/build-assets.js';
import { WORDMARK } from '../src/paths.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const asset = (name: string) => resolve(root, 'assets', name);
const meta = (name: string) => sharp(asset(name)).metadata();

/** Every generated file (assets, SVG outputs, app copies) with its hash. */
function snapshot() {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(resolve(root, 'assets'));
  walk(resolve(root, 'src/svg'));
  files.push(resolve(root, 'src/paths.ts'));
  files.push(...copies.map(([, to]) => resolve(repo, to)));
  return new Map(
    files.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );
}

const build = () =>
  execFileSync('pnpm', ['exec', 'tsx', 'scripts/build-assets.ts'], {
    cwd: root,
    stdio: 'pipe',
  });
const isText = (file: string) => /\.(svg|ts|json|xml|yaml)$/.test(file);
const only = (files: Map<string, string>, keep: (file: string) => boolean) =>
  new Map([...files].filter(([file]) => keep(file)));

describe('generated brand assets', () => {
  let committed: Map<string, string>;
  let first: Map<string, string>;
  let second: Map<string, string>;
  beforeAll(() => {
    committed = snapshot();
    build();
    first = snapshot();
    build();
    second = snapshot();
  }, 180_000);

  it('keeps the committed SVG, code and config outputs in sync with the sources', () => {
    // Text outputs are platform-independent, so they must match exactly.
    expect(only(first, isText)).toEqual(only(committed, isText));
  });

  it('rebuilds to identical files', () => {
    // PNG bytes can differ between platforms' image libraries, so images are
    // compared between two builds on the same machine.
    expect(second).toEqual(first);
  });

  it('has the expected sizes and transparency', async () => {
    const expected: [string, number, number, boolean][] = [
      ['apple-touch-icon.png', 180, 180, false],
      ['icon-192.png', 192, 192, true],
      ['icon-512.png', 512, 512, true],
      ['maskable-512.png', 512, 512, false],
      ['og-image.png', 1200, 630, false],
      ['twitter-image.png', 1200, 630, false],
      ['email-logo.png', 320, 53, true],
      ['mobile/ios/AppIcon.appiconset/icon-1024.png', 1024, 1024, false],
      ['mobile/ios/AppIcon.appiconset/icon-1024-tinted.png', 1024, 1024, false],
      [
        'mobile/android/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
        432,
        432,
        true,
      ],
      [
        'mobile/android/res/mipmap-mdpi/ic_launcher_foreground.png',
        108,
        108,
        true,
      ],
      ['mobile/android/res/mipmap-xxxhdpi/ic_launcher.png', 192, 192, true],
      ['mobile/android/notification-icon-96.png', 96, 96, true],
      ['kit/github-social-preview.png', 1280, 640, false],
    ];
    for (const [name, width, height, alpha] of expected) {
      const info = await meta(name);
      expect([info.width, info.height], name).toEqual([width, height]);
      expect(info.hasAlpha, name).toBe(alpha);
    }
  });

  it('keeps the notification and monochrome icons white-only', async () => {
    for (const name of [
      'mobile/android/notification-icon-96.png',
      'mobile/android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png',
    ]) {
      const { data, info } = await sharp(asset(name))
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += info.channels)
        expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
    }
  });

  it('writes a favicon with 16, 32 and 48 px images', () => {
    const ico = readFileSync(asset('favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + i * 16))).toEqual([
      16, 32, 48,
    ]);
  });

  it('copies the framework files byte for byte', () => {
    for (const [from, to] of copies)
      expect(
        readFileSync(resolve(repo, to)).equals(readFileSync(asset(from))),
        to,
      ).toBe(true);
  });

  it('describes a valid iOS asset catalog and outlined wordmark', () => {
    const catalog = JSON.parse(
      readFileSync(
        asset('mobile/ios/AppIcon.appiconset/Contents.json'),
        'utf8',
      ),
    ) as { images: { filename: string; appearances?: { value: string }[] }[] };
    expect(
      catalog.images.map((image) => image.appearances?.[0]?.value ?? 'any'),
    ).toEqual(['any', 'dark', 'tinted']);
    expect(WORDMARK.d.length).toBeGreaterThan(500);
    expect(WORDMARK.width).toBeGreaterThan(WORDMARK.height);
  });
});
