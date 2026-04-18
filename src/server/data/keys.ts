import { normalizeSubredditName } from '../core/subreddits';

const DATA_KEY_PREFIX = 'data:v1';

export type DataKeys = {
  posts: string;
  postCreatedAtIndex: string;
  comments: string;
  commentCreatedAtIndex: string;
  commentRefreshPostQueue: string;
  commentRefreshCommentQueue: string;
  contributors: string;
};

export const getDataKeys = (subredditName: string): DataKeys => {
  const baseKey = `${DATA_KEY_PREFIX}:${normalizeSubredditName(subredditName)}`;

  return {
    posts: `${baseKey}:posts`,
    postCreatedAtIndex: `${baseKey}:posts:createdAt`,
    comments: `${baseKey}:comments`,
    commentCreatedAtIndex: `${baseKey}:comments:createdAt`,
    commentRefreshPostQueue: `${baseKey}:comments:refresh:posts`,
    commentRefreshCommentQueue: `${baseKey}:comments:refresh:comments`,
    contributors: `${baseKey}:contributors`,
  };
};
