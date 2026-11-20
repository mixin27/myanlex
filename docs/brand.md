# Brand

The MyanLex mark is **Segment**: a whole line of text above the same line split
into units, with one unit in gold. It shows what MyanLex does (syllables,
tokens, normalisation) without leaning on a script or a cultural symbol. The
wordmark is lowercase **myanlex** in Geist Medium, the portal's typeface,
outlined to a path so it renders the same everywhere.

All sources and generated files live in [`packages/brand`](../packages/brand).

## Colours

| Token        | Hex       | Use                                                   |
| ------------ | --------- | ----------------------------------------------------- |
| Emerald      | `#085F41` | Mark bars, primary buttons (the portal's `--primary`) |
| Emerald dark | `#34B98A` | Mark bars on dark backgrounds                         |
| Gold         | `#EF9F27` | The highlighted unit only                             |
| Ink          | `#10221C` | Wordmark on light backgrounds                         |
| Paper        | `#F4F8F5` | Social and banner backgrounds                         |
| Night        | `#0B1A15` | Dark banner background                                |

- Gold is an accent. It has too little contrast with white for text or thin
  lines (about 2:1), so never use it for words or icons that must be read.
- On dark backgrounds the emerald becomes `#34B98A` and the wordmark white; gold
  stays the same. `LogoMark` and `Logo` switch automatically under `.dark`.

## Versions

| File (`packages/brand/src/svg`)                      | When                                                      |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `mark.svg`                                           | The mark, 33 px and up                                    |
| `mark-small.svg`                                     | 32 px and below: taller bars, wider gaps (favicons)       |
| `mark-mono.svg`                                      | One colour (`currentColor`): stamps, embossing, print     |
| `wordmark.svg`                                       | The word alone (`currentColor`)                           |
| `lockup.svg` / `lockup-dark.svg` / `lockup-mono.svg` | Mark + wordmark for light, dark, and one-colour use       |
| `lockup-stacked.svg` / `lockup-stacked-dark.svg`     | Mark above the wordmark, for square or centred placements |

In React use `@myanlex/brand/logo`:

- `<Logo height={28} />` is the lockup;
- `<LogoMark size={24} />` is the mark (it picks the small cut at 32 px and
  below);
- `<Wordmark height={18} />` is the word alone.

Pass `title=""` when nearby text already names MyanLex, so screen readers don't
hear it twice.

## Usage

- **Clear space:** at least half the mark's height on every side.
- **Minimum size:** mark 16 px; lockup 20 px tall on screen, 8 mm in print.
- **Lockup proportions:** the mark is 1.3 × the wordmark's x-height, centred on
  it; the gap is 0.3 × the wordmark's height. Use the files or `Logo` rather
  than spacing by hand.
- **Tiles:** installable icons (apple-touch, PWA, mobile apps) put the mark on a
  white tile. Browser favicons use the bare small cut.
- **The mono version** relies on the gaps alone to show the segments. Keep all
  four bars and their spacing.
- **Don't:**
  - move the gold to another unit, or add colours;
  - round the bars into circles, or change the gaps;
  - add outlines, shadows or gradients;
  - rotate or stretch the mark;
  - set the wordmark in another font, or capitalise it;
  - put the colour mark on a busy photo (use the mono version).

## Generated files

`pnpm brand:assets` regenerates everything from the SVG sources. Commit the
output.

| File (`packages/brand/assets`)                               | Used for                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `icon.svg`, `favicon.ico` (16/32/48)                         | Browser tabs (portal and docs)                                     |
| `apple-touch-icon.png` (180)                                 | iOS home screen                                                    |
| `icon-192.png`, `icon-512.png`, `maskable-512.png`           | Portal web app manifest (`apps/web/src/app/manifest.ts`)           |
| `og-image.png`, `twitter-image.png` (1200×630)               | Link previews (portal and docs)                                    |
| `email-logo.png` (320×53, shown at 160)                      | Email headers, served from the portal's `/brand/`                  |
| `mobile/ios/AppIcon.appiconset`                              | iOS app icon: light, dark and tinted (single-size, Xcode 14+)      |
| `mobile/android/res/…`                                       | Android adaptive icon with themed (monochrome) layer, legacy icons |
| `mobile/android/notification-icon-96.png`                    | Android status-bar icon (white silhouette)                         |
| `mobile/app-icon-1024.png`, `adaptive-*-1024.png`            | Sources for Flutter or Expo icon generators                        |
| `mobile/flutter_launcher_icons.yaml`                         | Example `flutter_launcher_icons` configuration                     |
| `kit/github-social-preview.png` (1280×640)                   | GitHub repository social preview                                   |
| `kit/readme-banner*.png`, `kit/lockup*.png`, `kit/mark*.png` | Slides, articles and third-party listings                          |

The script also copies the files Next.js expects into `apps/web/src/app`,
`apps/web/public/brand` and `apps/docs/src/app`.

- **GitHub social preview:** upload it in the repository's settings under Social
  preview; it isn't set from code.
- **Package READMEs:** the SDK READMEs load `kit/lockup.png` from the `main`
  branch on GitHub, so it shows on npm, PyPI and pub.dev.
