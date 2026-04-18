export type ChartHelpItemKind = 'x-axis' | 'y-axis' | 'size' | 'color';

export type ChartHelpItem = {
  kind: ChartHelpItemKind;
  label: string;
  description: string;
};

export type ChartHelpDetails = {
  items: ChartHelpItem[];
  totalBubbles: number;
  totalBubblesLabel: string;
};

export function createPostsChartHelpDetails(
  totalBubbles: number
): ChartHelpDetails {
  return createChartHelpDetails(totalBubbles, [
    {
      kind: 'x-axis',
      label: 'X axis',
      description: 'Post creation time',
    },
    {
      kind: 'y-axis',
      label: 'Y axis',
      description: 'Post upvotes',
    },
    {
      kind: 'size',
      label: 'Bubble size',
      description: 'Comments on the post',
    },
    {
      kind: 'color',
      label: 'Bubble color',
      description: 'Author subreddit karma bucket',
    },
  ]);
}

export function createCommentsChartHelpDetails(
  totalBubbles: number
): ChartHelpDetails {
  return createChartHelpDetails(totalBubbles, [
    {
      kind: 'x-axis',
      label: 'X axis',
      description: 'Comment creation time',
    },
    {
      kind: 'y-axis',
      label: 'Y axis',
      description: 'Comment upvotes',
    },
    {
      kind: 'color',
      label: 'Bubble color',
      description: 'Parent post',
    },
  ]);
}

export function createContributorsChartHelpDetails(
  totalBubbles: number
): ChartHelpDetails {
  return createChartHelpDetails(totalBubbles, [
    {
      kind: 'x-axis',
      label: 'X axis',
      description: 'Total comment upvotes',
    },
    {
      kind: 'y-axis',
      label: 'Y axis',
      description: 'Total post upvotes',
    },
    {
      kind: 'size',
      label: 'Bubble size',
      description: 'Posts and comments by contributor',
    },
    {
      kind: 'color',
      label: 'Bubble color',
      description: 'Contributor subreddit karma bucket',
    },
  ]);
}

function createChartHelpDetails(
  totalBubbles: number,
  items: ChartHelpItem[]
): ChartHelpDetails {
  return {
    items,
    totalBubbles,
    totalBubblesLabel: formatTotalBubbles(totalBubbles),
  };
}

function formatTotalBubbles(totalBubbles: number): string {
  const bubbleLabel = totalBubbles === 1 ? 'bubble' : 'bubbles';

  return `${totalBubbles.toLocaleString()} total ${bubbleLabel}`;
}
