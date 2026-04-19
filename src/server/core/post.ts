import { context, reddit } from '@devvit/web/server';
import {
  createPostData,
  normalizeTitle,
  parseFormDateRange,
} from './post-config';
import type { CreatePostFormValues } from './post-config';
import { canUseTestDataSource } from './subreddits';

export const createPost = async (values: CreatePostFormValues) => {
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
