import { context, reddit } from '@devvit/web/server';
import {
  createPostData,
  normalizeTitle,
  parseFormDateRange,
} from './timeframe';
import type { TimeframeFormValues } from './timeframe';
import { canUseTestDataSource } from './subreddits';

export const createBubbleStatsPost = async (values: TimeframeFormValues) => {
  const range = parseFormDateRange(values);
  const useTestDataSource =
    values.useTestDataSource === true &&
    canUseTestDataSource(context.subredditName);

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: normalizeTitle(values.title),
    entry: 'default',
    postData: createPostData(range, { useTestDataSource }),
  });
};
