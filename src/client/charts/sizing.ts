export const COMMENT_BUBBLE_SIZE = 10;
export const COMMENT_GROUP_EMPHASIZED_BUBBLE_SIZE = 26;

const BUBBLE_MIN_SIZE = 10;
const BUBBLE_MAX_SIZE = 72;

export function getContributorBubbleSize(
  contributionCount: number,
  maxContributionCount: number
): number {
  const count = Math.max(0, contributionCount);

  if (maxContributionCount <= 0) {
    return BUBBLE_MIN_SIZE;
  }

  return getScaledBubbleSize(count / maxContributionCount);
}

export function getPostBubbleSize(
  commentCount: number,
  maxCommentCount: number
): number {
  const count = Math.max(0, commentCount);

  if (maxCommentCount <= 0) {
    return BUBBLE_MIN_SIZE;
  }

  return getScaledBubbleSize(Math.sqrt(count / maxCommentCount));
}

export function getScaledBubbleSize(ratio: number): number {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);

  return BUBBLE_MIN_SIZE + clampedRatio * (BUBBLE_MAX_SIZE - BUBBLE_MIN_SIZE);
}
