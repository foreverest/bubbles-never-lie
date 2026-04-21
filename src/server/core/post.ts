import { context, reddit } from '@devvit/web/server';
import {
  createPostData,
  normalizeTitle,
  parseFormDateRange,
} from './post-config';
import type { CreatePostFormValues } from './post-config';
import { canConfigurePostDataSource } from './subreddits';

export const createPost = async (values: CreatePostFormValues) => {
  const range = parseFormDateRange(values);
  const dataSourceSubredditName = canConfigurePostDataSource(
    context.subredditName
  )
    ? values.dataSourceSubredditName
    : undefined;

  return await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: normalizeTitle(values.title),
    entry: 'default',
    postData: createPostData(range, { dataSourceSubredditName }),
  });
};
