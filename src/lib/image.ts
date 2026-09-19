// Creator photo resizing, via Next's own /_next/image optimizer.
//
// Every card image used to be built as an images.weserv.nl URL. weserv policy-blocked
// every *.onlyfans.com host (adult-category filter, no allowlist process), so every
// creator photo on the site started returning HTTP 400 and the whole grid rendered
// broken. Photos now go through Next's optimizer instead: it fetches, resizes and
// re-encodes inside our own Vercel project, and only accepts hosts listed in
// next.config.ts `images.remotePatterns`. Same migration the sister sites already run.
//
// Callers render plain <img> with src/srcSet (this repo does not use next/image), so
// these are built as explicit /_next/image URLs. Every width used here MUST exist in
// deviceSizes or imageSizes in next.config.ts, or the optimizer rejects it with a 400.

// Must match `images.qualities` in next.config.ts. Changing it re-bills every cached photo.
const IMAGE_QUALITY = 75;

// Vercel bills one transformation per unique (source image, width, quality, format), so every
// width here is one more billed copy of every creator photo. 360 (1x) and 720 (2x / phones)
// cover a card slot that never renders wider than 360 CSS px (see `sizes` below).
const SRCSET_WIDTHS = [360, 720] as const;

// Must be one of SRCSET_WIDTHS, or it becomes an extra billed width for browsers that use `src`.
const DEFAULT_WIDTH = 360;

/**
 * Local paths and width-less calls pass through untouched; remote URLs are routed
 * through the optimizer at an explicit width.
 */
export function buildImageUrl(url: string, width?: number): string {
  if (!url || url.startsWith('/') || width === undefined) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=${IMAGE_QUALITY}`;
}

function proxyImg(url: string, w: number, h: number): string {
  void h; // Retained for call-site compatibility; Next preserves the source aspect ratio.
  return buildImageUrl(url, w);
}

export interface SrcsetData {
  src: string;
  srcSet: string;
  sizes: string;
}

export function buildSrcset(url: string | null | undefined): SrcsetData {
  if (!url) {
    return { src: '/no-image.png', srcSet: '', sizes: '' };
  }
  // A local asset has nothing to resize — emitting a srcSet of four identical URLs for it
  // just made the browser choose between four copies of the same file.
  if (url.startsWith('/')) {
    return { src: url, srcSet: '', sizes: '' };
  }
  const srcSet = SRCSET_WIDTHS
    .map((w) => `${proxyImg(url, w, Math.round((w * 4) / 3))} ${w}w`)
    .join(', ');
  const src = proxyImg(url, DEFAULT_WIDTH, Math.round((DEFAULT_WIDTH * 4) / 3));
  // Bare vw, never calc(): Next only recognises a viewport width via /(^|\s)(1?\d?\d)vw/,
  // which needs whitespace or start-of-string before the number. Wrapping it as
  // calc(50vw - 16px) hides it, and Next then emits a candidate for EVERY configured width.
  const sizes =
    '(max-width:480px) 50vw, (max-width:768px) 240px, (max-width:1200px) 320px, 360px';
  return { src, srcSet, sizes };
}
