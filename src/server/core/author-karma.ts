import { AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT } from '../../shared/api';
import type { AuthorSubredditKarmaBucket } from '../../shared/api';
import type { AuthorEntity } from '../data';

export const createAuthorKarmaBuckets = (
  authors: AuthorEntity[]
): Map<string, AuthorSubredditKarmaBucket> => {
  const knownAuthors = authors
    .flatMap((author) =>
      typeof author.subredditKarma === 'number' &&
      Number.isFinite(author.subredditKarma)
        ? [{ authorName: author.id, subredditKarma: author.subredditKarma }]
        : []
    )
    .sort(
      (a, b) =>
        a.subredditKarma - b.subredditKarma || a.authorName.localeCompare(b.authorName)
    );
  const authorKarmaBuckets = new Map<string, AuthorSubredditKarmaBucket>();
  const maxAuthorIndex = knownAuthors.length - 1;

  knownAuthors.forEach((author, index) => {
    const bucket =
      maxAuthorIndex === 0
        ? AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT - 1
        : Math.round(
            (index / maxAuthorIndex) * (AUTHOR_SUBREDDIT_KARMA_BUCKET_COUNT - 1)
          );

    authorKarmaBuckets.set(author.authorName, bucket as AuthorSubredditKarmaBucket);
  });

  return authorKarmaBuckets;
};
