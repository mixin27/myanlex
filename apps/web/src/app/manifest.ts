import type { MetadataRoute } from 'next';

/** Installable-app metadata; icons come from packages/brand (pnpm brand:assets). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyanLex developer console',
    short_name: 'MyanLex',
    description:
      'Myanmar language infrastructure: API keys, usage and playground.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#085f41',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/brand/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
