import { context, reddit } from '@devvit/web/server';
import type { Post } from '@devvit/web/server';
import { Hono } from 'hono';
import type { ChartDataResponse, ChartPost, ErrorResponse } from '../../shared/api';
import { readTimeframePostData } from '../core/timeframe';

export const api = new Hono();

api.get('/posts', async (c) => {
  const timeframe = readTimeframePostData(context.postData);

  if (!timeframe) {
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'This post is missing a bubble stats date range.',
      },
      400
    );
  }

  const subredditName = context.subredditName;
  const startTime = timeframe.start.getTime();
  const endTime = timeframe.end.getTime();

  try {
    const posts = await reddit
      .getNewPosts({
        subredditName,
        limit: 1000,
        pageSize: 100,
      })
      .all();

    const filteredPosts = posts
      .filter((post) => post.id !== context.postId)
      .map(toPostCandidate)
      .filter((post) => {
        const createdTime = post.createdAt.getTime();
        return createdTime >= startTime && createdTime <= endTime;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const authorMetadata = await getAuthorMetadataByUsername(filteredPosts);
    const chartPosts: ChartPost[] = filteredPosts.map((post) => ({
      id: post.id,
      title: post.title,
      authorName: post.authorName,
      authorAvatarUrl: authorMetadata.get(post.authorName)?.avatarUrl ?? null,
      comments: post.numberOfComments,
      score: post.score,
      authorSubredditKarma: authorMetadata.get(post.authorName)?.subredditKarma ?? null,
      createdAt: post.createdAt.toISOString(),
      permalink: post.permalink,
    }));

    return c.json<ChartDataResponse>(
      {
        type: 'chart-data',
        subredditName,
        timeframe: timeframe.postData,
        generatedAt: new Date().toISOString(),
        sampledPostCount: posts.length,
        posts: chartPosts,
      },
      200
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load subreddit posts.';
    console.error(`Chart data error: ${message}`);

    return c.json<ErrorResponse>(
      {
        status: 'error',
        message,
      },
      500
    );
  }
});

type PostCandidate = {
  id: string;
  title: string;
  authorName: string;
  numberOfComments: number;
  score: number;
  createdAt: Date;
  permalink: string;
};

type AuthorMetadata = {
  subredditKarma: number | null;
  avatarUrl: string | null;
};

const toPostCandidate = (post: Post): PostCandidate => ({
  id: post.id,
  title: post.title,
  authorName: post.authorName,
  numberOfComments: post.numberOfComments,
  score: post.score,
  createdAt: post.createdAt,
  permalink: post.permalink,
});

const getAuthorMetadataByUsername = async (
  posts: PostCandidate[]
): Promise<Map<string, AuthorMetadata>> => {
  const usernames = Array.from(
    new Set(posts.map((post) => post.authorName).filter((username) => username !== '[deleted]'))
  );
  const results = await mapWithConcurrency(usernames, 6, async (username) =>
    [username, await getAuthorMetadata(username)] as const
  );

  return new Map(results);
};

const getAuthorMetadata = async (username: string): Promise<AuthorMetadata> => {
  const [subredditKarma, avatarUrl] = await Promise.all([
    getAuthorKarma(username),
    getAuthorAvatarUrl(username),
  ]);

  return {
    subredditKarma,
    avatarUrl,
  };
};

const getAuthorKarma = async (username: string): Promise<number | null> => {
  try {
    const karma = await reddit.getUserKarmaFromCurrentSubreddit(username);
    return sumKarma(karma);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Unable to load subreddit karma for u/${username}: ${message}`);
    return null;
  }
};

const getAuthorAvatarUrl = async (username: string): Promise<string | null> => {
  try {
    return (await reddit.getSnoovatarUrl(username)) ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Unable to load avatar for u/${username}: ${message}`);
    return null;
  }
};

const sumKarma = (karma: GetUserKarmaForSubredditResponse): number =>
  (karma.fromPosts ?? 0) + (karma.fromComments ?? 0);

type GetUserKarmaForSubredditResponse = {
  fromPosts?: number | undefined;
  fromComments?: number | undefined;
};

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  limit: number,
  mapper: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results = new Array<Output | undefined>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];

        if (item !== undefined) {
          results[index] = await mapper(item);
        }
      }
    })
  );

  return results.filter((result): result is Output => result !== undefined);
};
