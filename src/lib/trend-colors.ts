/**
 * 20-color palette optimized for colorblind accessibility.
 * Based on Tableau 20 with improved contrast for both light and dark themes.
 */
export const TREND_PALETTE = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#5fa2ce', '#fc7d0b', '#c85200', '#1170aa', '#57606c',
  '#a3acb9', '#7b848f', '#f0c75e', '#8cd17d', '#86bcb6',
] as const;

export function getSeriesColor(index: number): string {
  return TREND_PALETTE[index % TREND_PALETTE.length];
}
