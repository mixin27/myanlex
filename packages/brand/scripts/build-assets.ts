/**
 * Builds the MyanLex brand files from the mark SVGs in src/svg:
 * - outlines the "myanlex" wordmark (Geist Medium) to a path, so it renders
 *   the same everywhere (PNGs, emails, READMEs, apps without Geist);
 * - writes the wordmark and lockup SVGs and src/paths.ts (for the React Logo);
 * - rasterises icons and images for web, mobile and the brand kit into
 *   assets/, and copies the ones frameworks expect into the apps.
 *
 * Run: pnpm brand:assets   (outputs are committed; see docs/brand.md)
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '../..');
const svgDir = resolve(root, 'src/svg');
const out = resolve(root, 'assets');

export const EMERALD = '#085F41';
export const EMERALD_DARK = '#34B98A';
export const GOLD = '#EF9F27';
export const INK = '#10221C';
const PAPER = '#F4F8F5';
const NIGHT = '#0B1A15';
const TILE = '#FFFFFF';
const TAGLINE = 'Myanmar language infrastructure';

// ── Wordmark ──────────────────────────────────────────────

const require = createRequire(import.meta.url);
function loadFont(weight: 400 | 500) {
  const file = readFileSync(
    require.resolve(
      `@fontsource/geist-sans/files/geist-sans-latin-${weight}-normal.woff`,
    ),
  );
  return opentype.parse(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
}
const font = loadFont(500);
const textFont = loadFont(400);
const SIZE = 100;

/**
 * Lays text out glyph by glyph with kerning, as a path. The wordmark and
 * taglines are outlined so images don't depend on installed fonts.
 */
function layout(
  text: string,
  x0: number,
  y0: number,
  face = font,
  size = SIZE,
) {
  const scale = size / face.unitsPerEm;
  const path = new opentype.Path();
  let x = x0;
  let previous: opentype.Glyph | null = null;
  for (const character of text) {
    const glyph = face.charToGlyph(character);
    if (previous) x += face.getKerningValue(previous, glyph) * scale;
    path.extend(glyph.getPath(x, y0, size));
    x += (glyph.advanceWidth ?? 0) * scale;
    previous = glyph;
  }
  return path;
}
const box = layout('myanlex', 0, 0).getBoundingBox();
const wordPath = layout('myanlex', -box.x1, -box.y1).toPathData(2);
const wordW = Math.ceil(box.x2 - box.x1);
const wordH = Math.ceil(box.y2 - box.y1);
/** Baseline-relative x-height band, used to centre the mark on the letters. */
const xHeight = ((font.tables.os2?.sxHeight ?? 500) * SIZE) / font.unitsPerEm;
const baseline = -box.y1;

const read = (name: string) => readFileSync(resolve(svgDir, name), 'utf8');
const viewBoxOf = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1]!;
const bodyOf = (svg: string) =>
  svg
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>.*?<\/title>/, '');
const recolor = (svg: string, emerald: string, gold = GOLD) =>
  svg.replaceAll(EMERALD, emerald).replaceAll(GOLD, gold);

/** Places an SVG (keeping its own viewBox) inside a box in another SVG. */
const place = (
  svg: string,
  x: number,
  y: number,
  width: number,
  height = width,
  viewBox = viewBoxOf(svg),
) =>
  `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}">${bodyOf(svg)}</svg>`;

const mark = read('mark.svg').trim();
const markSmall = read('mark-small.svg').trim();
const markMono = read('mark-mono.svg').trim();
/** The bars' bounding box inside mark.svg, for lockups. */
const MARK_CROP = { x: 6, y: 22, w: 84, h: 52 };
const cropBox = `${MARK_CROP.x} ${MARK_CROP.y} ${MARK_CROP.w} ${MARK_CROP.h}`;

const svgFile = (w: number, h: number, inner: string, title = 'myanlex') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><title>${title}</title>${inner}</svg>\n`;

/** Mark height relative to the wordmark: a little taller than its x-height. */
const lockupMarkH = Math.round(xHeight * 1.3);
const lockupMarkW = Math.round((lockupMarkH * MARK_CROP.w) / MARK_CROP.h);
const lockupGap = Math.round(wordH * 0.3);

/** Horizontal lockup: the mark centred on the wordmark's x-height band. */
function lockup(markSvg: string, ink: string) {
  const w = lockupMarkW + lockupGap + wordW;
  const h = wordH;
  const markY = Math.round(baseline - xHeight / 2 - lockupMarkH / 2);
  return svgFile(
    w,
    h,
    `${place(markSvg, 0, markY, lockupMarkW, lockupMarkH, cropBox)}<path transform="translate(${lockupMarkW + lockupGap} 0)" d="${wordPath}" fill="${ink}"/>`,
  );
}

/** Stacked lockup: the mark above the wordmark, centred. */
function stacked(markSvg: string, ink: string) {
  const markW = Math.round(wordW * 0.42);
  const markH = Math.round((markW * MARK_CROP.h) / MARK_CROP.w);
  const gap = Math.round(wordH * 0.45);
  const w = wordW;
  const h = markH + gap + wordH;
  return svgFile(
    w,
    h,
    `${place(markSvg, Math.round((w - markW) / 2), 0, markW, markH, cropBox)}<path transform="translate(0 ${markH + gap})" d="${wordPath}" fill="${ink}"/>`,
  );
}

function writeSources() {
  writeFileSync(
    resolve(svgDir, 'wordmark.svg'),
    svgFile(wordW, wordH, `<path d="${wordPath}" fill="currentColor"/>`),
  );
  writeFileSync(resolve(svgDir, 'lockup.svg'), lockup(mark, INK));
  writeFileSync(
    resolve(svgDir, 'lockup-dark.svg'),
    lockup(recolor(mark, EMERALD_DARK), '#FFFFFF'),
  );
  writeFileSync(
    resolve(svgDir, 'lockup-mono.svg'),
    lockup(markMono, 'currentColor'),
  );
  writeFileSync(resolve(svgDir, 'lockup-stacked.svg'), stacked(mark, INK));
  writeFileSync(
    resolve(svgDir, 'lockup-stacked-dark.svg'),
    stacked(recolor(mark, EMERALD_DARK), '#FFFFFF'),
  );
  writeFileSync(
    resolve(root, 'src/paths.ts'),
    `// Generated by scripts/build-assets.ts — do not edit.
export const WORDMARK = {
  d: ${JSON.stringify(wordPath)},
  width: ${wordW},
  height: ${wordH},
} as const;

/** Lockup geometry in wordmark units (see lockup.svg). */
export const LOCKUP = {
  markWidth: ${lockupMarkW},
  markHeight: ${lockupMarkH},
  markY: ${Math.round(baseline - xHeight / 2 - lockupMarkH / 2)},
  gap: ${lockupGap},
} as const;
`,
  );
}

// ── Raster assets ─────────────────────────────────────────

const doc = (w: number, h: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

const png = (svg: string, w: number, h = w, opaque = false) => {
  const image = sharp(Buffer.from(svg), { density: 300 }).resize(w, h);
  return (opaque ? image.flatten({ background: TILE }) : image)
    .png({ compressionLevel: 9 })
    .toBuffer();
};

/** The mark alone on transparent, `scale` of the canvas wide. */
const bare = (size: number, small = false, scale = 1, source?: string) => {
  const s = size * scale;
  const o = (size - s) / 2;
  return doc(size, size, place(source ?? (small ? markSmall : mark), o, o, s));
};

/** The mark on a square tile; `scale` is the mark's share of the tile. */
const tile = (
  size: number,
  scale: number,
  radius: number,
  bg = TILE,
  source = mark,
) =>
  doc(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>${place(source, (size * (1 - scale)) / 2, (size * (1 - scale)) / 2, size * scale)}`,
  );

/** Every drawn pixel set to `color`, keeping only the shape's alpha. */
async function silhouette(svg: string, size: number, color = '#FFFFFF') {
  const alpha = await sharp(await png(svg, size))
    .ensureAlpha()
    .extractChannel('alpha')
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 3, background: color },
  })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico holding PNG images (supported by every current browser and OS). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + directory.length;
  images.forEach((image, index) => {
    const o = index * 16;
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, o);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, o + 1);
    directory.writeUInt16LE(1, o + 4);
    directory.writeUInt16LE(32, o + 6);
    directory.writeUInt32LE(image.data.length, o + 8);
    directory.writeUInt32LE(offset, o + 12);
    offset += image.data.length;
  });
  return Buffer.concat([header, directory, ...images.map((i) => i.data)]);
}

async function write(name: string, data: Buffer | string | Promise<Buffer>) {
  const path = resolve(out, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await data);
}

const dims = (svg: string) =>
  viewBoxOf(svg).split(' ').map(Number) as [number, number, number, number];

/** Centred, outlined tagline text with its baseline at `y`. */
function taglinePath(
  text: string,
  cx: number,
  y: number,
  size: number,
  ink: string,
) {
  const measured = layout(text, 0, 0, textFont, size).getBoundingBox();
  const width = measured.x2 - measured.x1;
  const d = layout(
    text,
    cx - width / 2 - measured.x1,
    y,
    textFont,
    size,
  ).toPathData(2);
  return `<path d="${d}" fill="${ink}" fill-opacity="0.72"/>`;
}

/** A banner: the lockup centred, an optional tagline below. */
function banner(
  w: number,
  h: number,
  lockupSvg: string,
  lockupWidth: number,
  bg: string,
  ink: string,
  tagline?: string,
  taglineSize = 30,
) {
  const [, , lw0, lh0] = dims(lockupSvg);
  const lw = lockupWidth;
  const lh = Math.round((lh0 / lw0) * lw);
  const shift = tagline ? Math.round(taglineSize * 1.2) : 0;
  const y = Math.round((h - lh) / 2) - shift;
  return doc(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${bg}"/>${place(lockupSvg, (w - lw) / 2, y, lw, lh)}${
      tagline
        ? taglinePath(
            tagline,
            w / 2,
            y + lh + Math.round(taglineSize * 2.2),
            taglineSize,
            ink,
          )
        : ''
    }`,
  );
}

async function web() {
  writeFileSync(resolve(out, 'icon.svg'), markSmall + '\n');
  await write(
    'favicon.ico',
    Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await png(bare(size, true), size),
      })),
    ).then(ico),
  );
  await write('apple-touch-icon.png', png(tile(180, 0.74, 0), 180, 180, true));
  await write('icon-192.png', png(tile(192, 0.74, 42), 192));
  await write('icon-512.png', png(tile(512, 0.74, 112), 512));
  await write('maskable-512.png', png(tile(512, 0.58, 0), 512, 512, true));

  const lock = read('lockup.svg');
  const og = png(
    banner(1200, 630, lock, 640, PAPER, INK, TAGLINE),
    1200,
    630,
    true,
  );
  await write('og-image.png', og);
  await write('twitter-image.png', og);
  const [, , lw, lh] = dims(lock);
  await write('email-logo.png', png(lock, 320, Math.round((lh / lw) * 320)));
}

async function mobile() {
  // iOS (Xcode 14+ single-size asset catalog, with iOS 18 dark and tinted).
  const ios = 'mobile/ios/AppIcon.appiconset';
  await write(
    `${ios}/icon-1024.png`,
    png(tile(1024, 0.7, 0), 1024, 1024, true),
  );
  await write(
    `${ios}/icon-1024-dark.png`,
    png(bare(1024, false, 0.7, recolor(mark, EMERALD_DARK)), 1024),
  );
  await write(
    `${ios}/icon-1024-tinted.png`,
    png(
      doc(
        1024,
        1024,
        `<rect width="1024" height="1024" fill="#000000"/>${place(
          recolor(mark, '#FFFFFF', '#B3B3B3'),
          154,
          154,
          716,
        )}`,
      ),
      1024,
      1024,
      true,
    ),
  );
  const image = (filename: string, appearance?: string) => ({
    ...(appearance
      ? { appearances: [{ appearance: 'luminosity', value: appearance }] }
      : {}),
    filename,
    idiom: 'universal',
    platform: 'ios',
    size: '1024x1024',
  });
  await write(
    `${ios}/Contents.json`,
    JSON.stringify(
      {
        images: [
          image('icon-1024.png'),
          image('icon-1024-dark.png', 'dark'),
          image('icon-1024-tinted.png', 'tinted'),
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    ) + '\n',
  );

  // Android: adaptive icon (108 dp canvas; the mark stays inside the 66 dp
  // safe zone), themed monochrome layer, legacy icons, notification icon.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const markShare = 60 / 108;
  for (const [density, factor] of Object.entries(densities)) {
    const adaptive = Math.round(108 * factor);
    const legacy = Math.round(48 * factor);
    const dir = `mobile/android/res/mipmap-${density}`;
    await write(
      `${dir}/ic_launcher_foreground.png`,
      png(bare(adaptive, false, markShare), adaptive),
    );
    await write(
      `${dir}/ic_launcher_monochrome.png`,
      silhouette(bare(adaptive, false, markShare, markMono), adaptive),
    );
    await write(
      `${dir}/ic_launcher.png`,
      png(tile(legacy, 0.72, Math.round(legacy * 0.22)), legacy),
    );
  }
  await write(
    'mobile/android/res/mipmap-anydpi-v26/ic_launcher.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
  );
  await write(
    'mobile/android/res/values/ic_launcher_background.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${TILE}</color>
</resources>
`,
  );
  await write(
    'mobile/android/notification-icon-96.png',
    silhouette(bare(96, true), 96),
  );

  // Cross-platform sources (Flutter, Expo and similar tools).
  await write(
    'mobile/app-icon-1024.png',
    png(tile(1024, 0.7, 0), 1024, 1024, true),
  );
  await write(
    'mobile/adaptive-foreground-1024.png',
    png(bare(1024, false, markShare), 1024),
  );
  await write(
    'mobile/adaptive-monochrome-1024.png',
    silhouette(bare(1024, false, markShare, markMono), 1024),
  );
  await write('mobile/splash-icon.png', png(bare(512, false, 0.8), 512));
  await write(
    'mobile/flutter_launcher_icons.yaml',
    `# Example configuration for the flutter_launcher_icons package. Copy the
# images from packages/brand/assets/mobile into the app (here assets/brand/).
flutter_launcher_icons:
  image_path: "assets/brand/app-icon-1024.png"
  android: "ic_launcher"
  ios: true
  remove_alpha_ios: true
  adaptive_icon_background: "${TILE}"
  adaptive_icon_foreground: "assets/brand/adaptive-foreground-1024.png"
  adaptive_icon_monochrome: "assets/brand/adaptive-monochrome-1024.png"
`,
  );
}

async function kit() {
  const lock = read('lockup.svg');
  const lockDark = read('lockup-dark.svg');
  await write(
    'kit/github-social-preview.png',
    png(banner(1280, 640, lock, 700, PAPER, INK, TAGLINE, 32), 1280, 640, true),
  );
  await write(
    'kit/readme-banner.png',
    png(banner(1600, 400, lock, 620, PAPER, INK), 1600, 400, true),
  );
  await write(
    'kit/readme-banner-dark.png',
    png(banner(1600, 400, lockDark, 620, NIGHT, '#FFFFFF'), 1600, 400, true),
  );
  for (const [name, source] of [
    ['lockup', lock],
    ['lockup-dark', lockDark],
    ['lockup-stacked', read('lockup-stacked.svg')],
    ['lockup-stacked-dark', read('lockup-stacked-dark.svg')],
  ] as const) {
    const [, , w, h] = dims(source);
    await write(
      `kit/${name}.png`,
      png(source, 1200, Math.round((h / w) * 1200)),
    );
  }
  await write('kit/mark-512.png', png(bare(512), 512));
  await write(
    'kit/mark-dark-512.png',
    png(bare(512, false, 1, recolor(mark, EMERALD_DARK)), 512),
  );
  await write(
    'kit/mark-mono-512.png',
    silhouette(bare(512, false, 1, markMono), 512, INK),
  );
}

/** Copies files to where the frameworks expect them (Next file-based metadata). */
export const copies: readonly (readonly [string, string])[] = [
  ['icon.svg', 'apps/web/src/app/icon.svg'],
  ['favicon.ico', 'apps/web/src/app/favicon.ico'],
  ['apple-touch-icon.png', 'apps/web/src/app/apple-icon.png'],
  ['og-image.png', 'apps/web/src/app/opengraph-image.png'],
  ['twitter-image.png', 'apps/web/src/app/twitter-image.png'],
  ['icon-192.png', 'apps/web/public/brand/icon-192.png'],
  ['icon-512.png', 'apps/web/public/brand/icon-512.png'],
  ['maskable-512.png', 'apps/web/public/brand/maskable-512.png'],
  ['email-logo.png', 'apps/web/public/brand/email-logo.png'],
  ['icon.svg', 'apps/docs/src/app/icon.svg'],
  ['favicon.ico', 'apps/docs/src/app/favicon.ico'],
  ['apple-touch-icon.png', 'apps/docs/src/app/apple-icon.png'],
  ['og-image.png', 'apps/docs/src/app/opengraph-image.png'],
  ['twitter-image.png', 'apps/docs/src/app/twitter-image.png'],
];

function sync() {
  for (const [from, to] of copies) {
    const destination = resolve(repo, to);
    if (!existsSync(resolve(repo, to.split('/').slice(0, 2).join('/'))))
      continue;
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(out, from), destination);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(out, { recursive: true });
  writeSources();
  await web();
  await mobile();
  await kit();
  sync();
  console.log(`Brand assets written to ${out} and copied to the apps.`);
}
