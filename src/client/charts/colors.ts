import type { SubredditKarmaBucket } from '../../shared/api';

const CHART_COLOR_PALETTE = [
  '#267c8c',
  '#d65a31',
  '#2f9e74',
  '#c8325e',
  '#6f58c9',
  '#d99a22',
  '#3487d4',
  '#6a9f35',
  '#c84f9b',
  '#60758a',
] as const;

const CHART_COLOR_FALLBACK = CHART_COLOR_PALETTE[0];
const CHART_UNKNOWN_BUCKET_COLOR = '#9aa6b2';
const bubbleFillColorCache = new Map<string, string>();

export function getKarmaBucketColor(
  bucket: SubredditKarmaBucket | null
): string {
  return bucket === null
    ? CHART_UNKNOWN_BUCKET_COLOR
    : getChartPaletteColor(bucket);
}

export function getCommentGroupColor(postId: string): string {
  return getChartPaletteColor(hashString(postId));
}

export function getBubbleFillColor(baseColor: string, alpha: number): string {
  const cacheKey = `${baseColor}:${alpha}`;
  const cachedColor = bubbleFillColorCache.get(cacheKey);
  if (cachedColor) {
    return cachedColor;
  }

  const rgb = hexToRgb(baseColor) ?? hexToRgb(CHART_COLOR_FALLBACK);
  const color = rgb ? toRgba(rgb, alpha) : `rgba(153, 204, 204, ${alpha})`;

  bubbleFillColorCache.set(cacheKey, color);
  return color;
}

export function getChartPaletteColor(index: number): string {
  return (
    CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length] ??
    CHART_COLOR_FALLBACK
  );
}

export function hexToRgb(
  color: string
): { red: number; green: number; blue: number } | null {
  const hex = color.startsWith('#') ? color.slice(1) : color;

  if (!/^[\da-f]{6}$/i.test(hex)) {
    return null;
  }

  const colorValue = Number.parseInt(hex, 16);
  return {
    red: (colorValue >> 16) & 255,
    green: (colorValue >> 8) & 255,
    blue: colorValue & 255,
  };
}

export function toRgba(
  { red, green, blue }: { red: number; green: number; blue: number },
  alpha: number
): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hashString(value: string): number {
  let hash = 0;

  for (const symbol of value) {
    hash = (hash * 31 + (symbol.codePointAt(0) ?? 0)) >>> 0;
  }

  return hash;
}
