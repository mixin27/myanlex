import type * as React from 'react';
import { LOCKUP, WORDMARK } from './paths';

export const BRAND_EMERALD = '#085F41';
export const BRAND_EMERALD_DARK = '#34B98A';
export const BRAND_GOLD = '#EF9F27';
export const BRAND_INK = '#10221C';

type Bar = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  gold?: true,
];

/** The Segment mark: a whole line above the same line split into units. */
const REGULAR: readonly Bar[] = [
  [6, 22, 84, 18, 9],
  [6, 56, 24, 18, 9],
  [34, 56, 30, 18, 9, true],
  [68, 56, 22, 18, 9],
];
/** Bolder cut for 32 px and below: taller bars, wider gaps, squarer ends. */
const SMALL: readonly Bar[] = [
  [4, 20, 88, 22, 8],
  [4, 54, 22, 22, 8],
  [32, 54, 36, 22, 8, true],
  [74, 54, 18, 22, 8],
];

/**
 * Brighter emerald on dark backgrounds (`.dark` on any ancestor, as set by
 * the portal and Fumadocs). Inline so the component needs no CSS file.
 */
const DARK_STYLE = `.dark .mlx-emerald{fill:${BRAND_EMERALD_DARK}}`;

function bars(cut: readonly Bar[]) {
  return cut.map(([x, y, width, height, radius, gold]) => (
    <rect
      key={`${x}-${y}`}
      className={gold ? undefined : 'mlx-emerald'}
      x={x}
      y={y}
      width={width}
      height={height}
      rx={radius}
      fill={gold ? BRAND_GOLD : BRAND_EMERALD}
    />
  ));
}

type SvgProps = Omit<
  React.SVGProps<SVGSVGElement>,
  'width' | 'height' | 'viewBox'
>;

/** The mark on a transparent square. Sizes ≤ 32 px use the bolder cut. */
export function LogoMark({
  size = 32,
  title = 'myanlex',
  ...props
}: { size?: number; title?: string } & SvgProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      data-cut={size <= 32 ? 'small' : 'regular'}
      {...props}
    >
      <style>{DARK_STYLE}</style>
      {bars(size <= 32 ? SMALL : REGULAR)}
    </svg>
  );
}

/** The mark beside the wordmark. The wordmark uses `currentColor`. */
export function Logo({
  height = 28,
  title = 'myanlex',
  ...props
}: { height?: number; title?: string } & SvgProps) {
  const width = LOCKUP.markWidth + LOCKUP.gap + WORDMARK.width;
  return (
    <svg
      viewBox={`0 0 ${width} ${WORDMARK.height}`}
      height={height}
      width={(height * width) / WORDMARK.height}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      <style>{DARK_STYLE}</style>
      <svg
        x={0}
        y={LOCKUP.markY}
        width={LOCKUP.markWidth}
        height={LOCKUP.markHeight}
        viewBox="6 22 84 52"
      >
        {bars(REGULAR)}
      </svg>
      <path
        transform={`translate(${LOCKUP.markWidth + LOCKUP.gap} 0)`}
        d={WORDMARK.d}
        fill="currentColor"
      />
    </svg>
  );
}

/** The wordmark alone, in `currentColor`. */
export function Wordmark({
  height = 20,
  title = 'myanlex',
  ...props
}: { height?: number; title?: string } & SvgProps) {
  return (
    <svg
      viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`}
      height={height}
      width={(height * WORDMARK.width) / WORDMARK.height}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      <path d={WORDMARK.d} fill="currentColor" />
    </svg>
  );
}
