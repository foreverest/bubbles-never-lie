import { normalizeSubredditName } from '../core/subreddits';

const DATA_KEY_PREFIX = 'bubble-stats:data:v1';

export type DataKeys = {
  posts: string;
  postCreatedAtIndex: string;
  comments: string;
  commentCreatedAtIndex: string;
  contributors: string;
};

export const getDataKeys = (subredditName: string): DataKeys => {
  const baseKey = `${DATA_KEY_PREFIX}:${normalizeSubredditName(subredditName)}`;

  return {
    posts: `${baseKey}:posts`,
    postCreatedAtIndex: `${baseKey}:posts:createdAt`,
    comments: `${baseKey}:comments`,
    commentCreatedAtIndex: `${baseKey}:comments:createdAt`,
    contributors: `${baseKey}:contributors`,
  };
};
