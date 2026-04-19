const COMPACT_UPVOTE_FORMATTER = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCompactUpvoteCount(value: number): string {
  return COMPACT_UPVOTE_FORMATTER.format(value);
}
